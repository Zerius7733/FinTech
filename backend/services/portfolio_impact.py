from typing import Any, Dict, List

from backend.services.portfolio_selector import iter_portfolio_positions


ASSET_RETURN_ASSUMPTIONS = {
    "equities": 0.08,
    "bonds": 0.04,
    "cash": 0.02,
    "commodities": 0.05,
    "crypto": 0.12,
}

BASE_RECOMMENDED_ALLOCATION = {
    "Low": {"equities": 0.30, "bonds": 0.50, "cash": 0.18, "commodities": 0.02, "crypto": 0.00},
    "Moderate": {"equities": 0.50, "bonds": 0.25, "cash": 0.15, "commodities": 0.05, "crypto": 0.05},
    "High": {"equities": 0.55, "bonds": 0.10, "cash": 0.10, "commodities": 0.05, "crypto": 0.20},
}


def _normalize_profile(profile: str) -> str:
    normalized = (profile or "").strip().title()
    return normalized if normalized in BASE_RECOMMENDED_ALLOCATION else "Moderate"


def _classify_position(position: Dict[str, Any]) -> str:
    symbol = str(position.get("symbol", "")).strip().upper()
    if symbol.endswith("-USD"):
        return "crypto"
    if symbol.endswith("=F"):
        return "commodities"
    return "equities"


def _position_value(position: Dict[str, Any]) -> float:
    return float(position.get("market_value", 0.0) or 0.0)


def _current_mix(user: Dict[str, Any]) -> Dict[str, float]:
    mix = {"equities": 0.0, "bonds": 0.0, "cash": 0.0, "commodities": 0.0, "crypto": 0.0}
    for position in iter_portfolio_positions(user):
        value = _position_value(position)
        if value <= 0:
            continue
        mix[_classify_position(position)] += value
    mix["cash"] += float(user.get("cash_balance", 0.0) or 0.0)
    return mix


def _sum_current_market_value(user: Dict[str, Any]) -> float:
    total = 0.0
    for position in iter_portfolio_positions(user):
        total += _position_value(position)
    return round(total, 2)


def _apply_stress_guardrails(allocation: Dict[str, float], stress: float) -> Dict[str, float]:
    adjusted = dict(allocation)
    if stress >= 60:
        adjusted["cash"] += 0.10
        adjusted["equities"] = max(0.20, adjusted["equities"] - 0.05)
        adjusted["crypto"] = max(0.00, adjusted["crypto"] - 0.05)
    elif stress >= 40:
        adjusted["cash"] += 0.05
        adjusted["equities"] = max(0.25, adjusted["equities"] - 0.03)
        adjusted["crypto"] = max(0.00, adjusted["crypto"] - 0.02)

    total = sum(adjusted.values())
    return {key: value / total for key, value in adjusted.items()}


def _weights_from_amounts(amounts: Dict[str, float]) -> Dict[str, float]:
    total = sum(amounts.values())
    if total <= 0:
        return {key: 0.0 for key in amounts}
    return {key: value / total for key, value in amounts.items()}


def _expected_return(weights: Dict[str, float]) -> float:
    return sum(weights.get(asset, 0.0) * ASSET_RETURN_ASSUMPTIONS[asset] for asset in ASSET_RETURN_ASSUMPTIONS)


def _future_value(principal: float, annual_return: float, years: int) -> float:
    if years <= 0:
        return principal
    return principal * ((1 + annual_return) ** years)


def _format_mix_breakdown(amounts: Dict[str, float]) -> List[Dict[str, Any]]:
    weights = _weights_from_amounts(amounts)
    return [
        {
            "vehicle": vehicle,
            "amount": round(amount, 2),
            "weight": round(weights.get(vehicle, 0.0) * 100, 2),
        }
        for vehicle, amount in amounts.items()
        if amount > 0
    ]


def build_portfolio_impact(user: Dict[str, Any], *, horizon_years: int = 5) -> Dict[str, Any]:
    if horizon_years < 1 or horizon_years > 10:
        raise ValueError("horizon_years must be between 1 and 10")

    profile = _normalize_profile(str(user.get("risk_profile", "Moderate")))
    stress = float(user.get("financial_stress_index", 0.0) or 0.0)

    current_portfolio_value = _sum_current_market_value(user)
    current_cash_balance = round(float(user.get("cash_balance", 0.0) or 0.0), 2)
    current_investable_assets = round(current_portfolio_value + current_cash_balance, 2)

    current_mix_amounts = _current_mix(user)
    current_mix_weights = _weights_from_amounts(current_mix_amounts)
    recommended_weights = _apply_stress_guardrails(BASE_RECOMMENDED_ALLOCATION[profile], stress)
    recommended_mix_amounts = {
        vehicle: round(current_investable_assets * weight, 2) for vehicle, weight in recommended_weights.items()
    }

    current_expected_return = _expected_return(current_mix_weights)
    recommended_expected_return = _expected_return(recommended_weights)
    projected_value_current_mix = round(
        _future_value(current_investable_assets, current_expected_return, horizon_years), 2
    )
    projected_value_recommended_mix = round(
        _future_value(current_investable_assets, recommended_expected_return, horizon_years), 2
    )
    estimated_missed_out = round(
        max(0.0, projected_value_recommended_mix - projected_value_current_mix),
        2,
    )
    if estimated_missed_out > 0:
        headline = (
            f"Detected ${estimated_missed_out:,.2f} in latent growth potential over {horizon_years} years."
        )
        summary = (
            f"Your current mix is projected to trail the app's profile-aligned mix by about "
            f"${estimated_missed_out:,.2f} over {horizon_years} years."
        )
    else:
        headline = (
            "No material latent growth gap detected for your current allocation."
        )
        summary = "Your current allocation is broadly aligned with the app's profile-based mix."

    return {
        "headline": headline,
        "summary": summary,
        "impact_cards": [
            {
                "label": "Latent Growth Potential",
                "amount": estimated_missed_out,
                "direction": "neutral" if estimated_missed_out == 0 else "positive",
                "message": (
                    f"Estimated additional value your portfolio could capture over {horizon_years} years if it "
                    "moved closer to the app's profile-aligned allocation."
                ),
            },
        ],
        "current_positioning": _format_mix_breakdown(current_mix_amounts),
        "recommended_positioning": [
            {
                "vehicle": vehicle,
                "amount": round(amount, 2),
                "weight": round(recommended_weights.get(vehicle, 0.0) * 100, 2),
            }
            for vehicle, amount in recommended_mix_amounts.items()
        ],
    }
