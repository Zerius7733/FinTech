from typing import Any, Dict, List

from backend.services.portfolio_selector import iter_portfolio_positions


RISK_RETURN_ASSUMPTIONS = {
    "Low": 0.05,
    "Moderate": 0.07,
    "High": 0.09,
}


BASE_ALLOCATION = {
    "Low": {
        "equities": 0.35,
        "bonds": 0.45,
        "cash": 0.15,
        "commodities": 0.05,
    },
    "Moderate": {
        "equities": 0.60,
        "bonds": 0.25,
        "cash": 0.10,
        "commodities": 0.05,
    },
    "High": {
        "equities": 0.75,
        "bonds": 0.15,
        "cash": 0.05,
        "commodities": 0.05,
    },
}


def _normalize_profile(profile: Any) -> str:
    if isinstance(profile, (int, float)):
        value = max(0.0, min(100.0, float(profile)))
        if value <= 33.33:
            return "Low"
        if value <= 66.66:
            return "Moderate"
        return "High"

    text = str(profile or "").strip().lower()
    if text in {"low", "conservative"}:
        return "Low"
    if text in {"moderate", "medium", "balanced"}:
        return "Moderate"
    if text in {"high", "aggressive"}:
        return "High"

    try:
        return _normalize_profile(float(text))
    except ValueError:
        return "Moderate"


def _sum_portfolio_value(user: Dict[str, Any]) -> float:
    total = 0.0
    for position in iter_portfolio_positions(user):
        total += float(position.get("market_value", 0.0) or 0.0)
    return round(total, 2)


def _current_vehicle_mix(user: Dict[str, Any]) -> Dict[str, float]:
    mix = {"equities": 0.0, "bonds": 0.0, "cash": 0.0, "commodities": 0.0, "crypto": 0.0}
    for position in iter_portfolio_positions(user):
        symbol = str(position.get("symbol", "")).strip().upper()
        market_value = float(position.get("market_value", 0.0) or 0.0)
        if market_value <= 0:
            continue
        if symbol.endswith("-USD"):
            mix["crypto"] += market_value
        elif symbol.endswith("=F"):
            mix["commodities"] += market_value
        else:
            mix["equities"] += market_value
    mix["cash"] = float(user.get("cash_balance", 0.0) or 0.0)
    return {key: round(value, 2) for key, value in mix.items()}


def _expense_ratio(user: Dict[str, Any]) -> float:
    stress = float(user.get("financial_stress_index", 0.0) or 0.0)
    if stress >= 60:
        return 0.80
    if stress >= 40:
        return 0.75
    return 0.70


def _reserve_months(profile: str, stress: float) -> int:
    base = {"Low": 12, "Moderate": 9, "High": 6}.get(_normalize_profile(profile), 9)
    if stress >= 60:
        return base + 3
    if stress >= 40:
        return base + 1
    return base


def _recommended_allocation(profile: str, years_to_retirement: int) -> Dict[str, float]:
    allocation = dict(BASE_ALLOCATION[_normalize_profile(profile)])

    # Glide path: shift 1.5% from equities into bonds per year under 20 years to retirement.
    if years_to_retirement < 20:
        shift = min((20 - years_to_retirement) * 0.015, 0.30)
        allocation["equities"] = max(0.20, allocation["equities"] - shift)
        allocation["bonds"] = min(0.65, allocation["bonds"] + shift)

    total = sum(allocation.values())
    return {key: round(value / total, 4) for key, value in allocation.items()}


def _apply_cash_reserve_floor(
    allocation: Dict[str, float],
    *,
    investable_assets: float,
    reserve_target: float,
) -> Dict[str, float]:
    if investable_assets <= 0 or reserve_target <= 0:
        return allocation

    required_cash_weight = min(0.35, reserve_target / investable_assets)
    if required_cash_weight <= allocation.get("cash", 0.0):
        return allocation

    adjusted = dict(allocation)
    delta = required_cash_weight - adjusted.get("cash", 0.0)
    adjusted["cash"] = required_cash_weight

    equity_reduction = min(delta, adjusted.get("equities", 0.0) - 0.20)
    adjusted["equities"] -= max(0.0, equity_reduction)
    delta -= max(0.0, equity_reduction)
    if delta > 0:
        bond_reduction = min(delta, adjusted.get("bonds", 0.0) - 0.10)
        adjusted["bonds"] -= max(0.0, bond_reduction)
        delta -= max(0.0, bond_reduction)
    if delta > 0:
        commodity_reduction = min(delta, adjusted.get("commodities", 0.0))
        adjusted["commodities"] -= max(0.0, commodity_reduction)

    total = sum(adjusted.values())
    return {key: round(value / total, 4) for key, value in adjusted.items()}


def _future_value(principal: float, annual_contribution: float, rate: float, years: int) -> float:
    if years <= 0:
        return principal
    if rate <= 0:
        return principal + (annual_contribution * years)
    growth = (1 + rate) ** years
    contribution_growth = annual_contribution * ((growth - 1) / rate)
    return (principal * growth) + contribution_growth


def _required_annual_contribution(target_value: float, principal: float, rate: float, years: int) -> float:
    if years <= 0:
        return max(0.0, target_value - principal)
    if rate <= 0:
        return max(0.0, (target_value - principal) / years)

    growth = (1 + rate) ** years
    future_principal = principal * growth
    remaining_gap = max(0.0, target_value - future_principal)
    annuity_factor = (growth - 1) / rate
    if annuity_factor <= 0:
        return remaining_gap
    return remaining_gap / annuity_factor


def build_retirement_plan(
    user: Dict[str, Any],
    retirement_age: int,
    *,
    monthly_expenses: float,
    essential_monthly_expenses: float,
) -> Dict[str, Any]:
    current_age = user.get("age")
    if current_age is None:
        raise ValueError("user age is required before generating a retirement plan")

    current_age_value = int(current_age)
    if current_age_value < 18 or current_age_value > 100:
        raise ValueError("user age must be between 18 and 100")
    if retirement_age <= current_age_value:
        raise ValueError("retirement_age must be greater than current user age")
    if retirement_age > 100:
        raise ValueError("retirement_age must be <= 100")

    years_to_retirement = retirement_age - current_age_value
    profile = _normalize_profile(user.get("risk_profile", 50.0))
    annual_income = float(user.get("income", 0.0) or 0.0) * 12.0
    monthly_expenses = float(monthly_expenses or 0.0)
    essential_monthly_expenses = float(essential_monthly_expenses or 0.0)
    if essential_monthly_expenses > monthly_expenses:
        raise ValueError("essential_monthly_expenses cannot be greater than monthly_expenses")
    portfolio_value = _sum_portfolio_value(user)
    investable_assets = portfolio_value + float(user.get("cash_balance", 0.0) or 0.0)
    expected_return = RISK_RETURN_ASSUMPTIONS[profile]
    spending_ratio = _expense_ratio(user)
    expense_floor = max(monthly_expenses, essential_monthly_expenses * 1.15)
    if expense_floor > 0:
        target_annual_spend = expense_floor * 12.0
    else:
        target_annual_spend = annual_income * spending_ratio
    target_retirement_fund = target_annual_spend * 25.0
    stress = float(user.get("financial_stress_index", 0.0) or 0.0)
    reserve_target = essential_monthly_expenses * _reserve_months(profile, stress)
    required_annual_contribution = _required_annual_contribution(
        target_value=target_retirement_fund,
        principal=investable_assets,
        rate=expected_return,
        years=years_to_retirement,
    )
    projected_value = _future_value(
        principal=investable_assets,
        annual_contribution=required_annual_contribution,
        rate=expected_return,
        years=years_to_retirement,
    )

    allocation = _recommended_allocation(profile, years_to_retirement)
    allocation = _apply_cash_reserve_floor(
        allocation,
        investable_assets=investable_assets,
        reserve_target=reserve_target,
    )
    allocation_amounts: List[Dict[str, Any]] = []
    for vehicle, weight in allocation.items():
        allocation_amounts.append(
            {
                "vehicle": vehicle,
                "target_weight": round(weight * 100, 2),
                "target_amount_today": round(investable_assets * weight, 2),
                "target_amount_at_retirement": round(target_retirement_fund * weight, 2),
            }
        )

    current_mix = _current_vehicle_mix(user)
    current_total = sum(current_mix.values()) or 1.0
    current_breakdown = [
        {
            "vehicle": vehicle,
            "current_amount": round(amount, 2),
            "current_weight": round((amount / current_total) * 100, 2),
        }
        for vehicle, amount in current_mix.items()
        if amount > 0
    ]

    gap = max(0.0, target_retirement_fund - projected_value)
    return {
        "current_age": current_age_value,
        "retirement_age": retirement_age,
        "years_to_retirement": years_to_retirement,
        "risk_profile": profile,
        "financial_wellness_score": user.get("financial_wellness_score"),
        "financial_stress_index": user.get("financial_stress_index"),
        "annual_income": round(annual_income, 2),
        "monthly_expenses": round(monthly_expenses, 2),
        "essential_monthly_expenses": round(essential_monthly_expenses, 2),
        "current_portfolio_value": portfolio_value,
        "current_cash_balance": round(float(user.get("cash_balance", 0.0) or 0.0), 2),
        "current_investable_assets": round(investable_assets, 2),
        "essential_cash_reserve_target": round(reserve_target, 2),
        "target_annual_spend": round(target_annual_spend, 2),
        "target_retirement_fund": round(target_retirement_fund, 2),
        "expected_annual_return_assumption": round(expected_return * 100, 2),
        "required_annual_contribution": round(required_annual_contribution, 2),
        "required_monthly_contribution": round(required_annual_contribution / 12.0, 2),
        "projected_value_at_retirement": round(projected_value, 2),
        "projected_gap_at_retirement": round(gap, 2),
        "current_vehicle_mix": current_breakdown,
        "recommended_vehicle_mix": allocation_amounts,
        "assumptions": {
            "retirement_spend_ratio_of_current_income": round(spending_ratio * 100, 2),
            "retirement_multiple": 25,
            "essential_reserve_months": _reserve_months(profile, stress),
            "glide_path_note": "As retirement gets closer, the allocation shifts from equities toward bonds.",
        },
    }
