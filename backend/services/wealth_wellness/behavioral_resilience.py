from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple


LIQUIDITY_TARGET_MONTHS = 6.0
LIQUIDITY_CURVE_SHARPNESS = 2.4
EXPENSE_FALLBACK_RATIO = 0.60
PORTFOLIO_CONFLICT_TOLERANCE = 0.15
MAJOR_CONFLICT_TOLERANCE = 0.25

FINAL_PILLAR_WEIGHTS = {
    "liquidity_score": 0.30,
    "debt_score": 0.25,
    "housing_score": 0.15,
    "diversification_score": 0.20,
    "risk_alignment_score": 0.10,
}

STRESS_WEIGHTS = {
    "liquidity_score": 0.35,
    "non_mortgage_debt_stress": 0.25,
    "diversification_score": 0.15,
    "risk_alignment_score": 0.15,
    "housing_stress": 0.10,
}

RISK_PROFILE_LABELS = {
    "low": 20.0,
    "conservative": 20.0,
    "moderate": 50.0,
    "medium": 50.0,
    "balanced": 50.0,
    "high": 80.0,
    "aggressive": 80.0,
    "very aggressive": 90.0,
}


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _round(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def _to_float(value: Any, default: float = 0.0) -> float:
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        if not math.isfinite(float(value)):
            return default
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace(",", "").replace("_", "").strip()
        if not cleaned:
            return default
        try:
            numeric = float(cleaned)
        except ValueError:
            return default
        return numeric if math.isfinite(numeric) else default
    return default


def _as_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return numerator / denominator


def _relative_difference(left: float, right: float) -> float:
    baseline = max(abs(left), abs(right), 1.0)
    return abs(left - right) / baseline


def _resolve_risk_profile_value(profile: Any) -> float:
    if isinstance(profile, (int, float)):
        return _clamp(float(profile))

    value = str(profile or "").strip().lower()
    if value in RISK_PROFILE_LABELS:
        return RISK_PROFILE_LABELS[value]
    try:
        return _clamp(float(value))
    except ValueError:
        return 50.0


def _sum_income_streams(income_streams: Iterable[Any]) -> float:
    total = 0.0
    for item in income_streams:
        if not isinstance(item, Mapping):
            continue
        monthly_amount = _to_float(item.get("monthly_amount"))
        if monthly_amount > 0:
            total += monthly_amount
    return total


def _sum_manual_assets_by_category(manual_assets: Iterable[Any], category: str) -> float:
    total = 0.0
    for item in manual_assets:
        if not isinstance(item, Mapping):
            continue
        if str(item.get("category", "")).strip().lower() != category:
            continue
        total += max(0.0, _to_float(item.get("value")))
    return total


def _sum_liabilities(liability_items: Iterable[Any], mortgage_only: Optional[bool]) -> float:
    total = 0.0
    for item in liability_items:
        if not isinstance(item, Mapping):
            continue
        is_mortgage = bool(item.get("is_mortgage"))
        if mortgage_only is True and not is_mortgage:
            continue
        if mortgage_only is False and is_mortgage:
            continue
        total += max(0.0, _to_float(item.get("amount")))
    return total


def _position_value(position: Mapping[str, Any]) -> float:
    market_value = _to_float(position.get("market_value"))
    if market_value > 0:
        return market_value
    qty = _to_float(position.get("qty"))
    price = _to_float(position.get("current_price"))
    if price <= 0:
        price = _to_float(position.get("price"))
    if price <= 0:
        price = _to_float(position.get("avg_price"))
    return max(0.0, qty * price)


def _iter_portfolio_positions(user: Mapping[str, Any]) -> Iterable[Tuple[str, Mapping[str, Any]]]:
    portfolio = user.get("portfolio")
    if isinstance(portfolio, Mapping):
        bucket_map = {
            "stocks": "stocks",
            "cryptos": "crypto",
            "commodities": "commodity",
        }
        for bucket_name, normalized_bucket in bucket_map.items():
            for item in _as_list(portfolio.get(bucket_name)):
                if isinstance(item, Mapping):
                    yield normalized_bucket, item
        return

    if isinstance(portfolio, list):
        for item in portfolio:
            if not isinstance(item, Mapping):
                continue
            asset_class = str(item.get("asset_class") or item.get("type") or "").strip().lower()
            if "crypto" in asset_class:
                bucket = "crypto"
            elif "commod" in asset_class or asset_class in {"gold", "silver"}:
                bucket = "commodity"
            else:
                bucket = "stocks"
            yield bucket, item


def _portfolio_totals(user: Mapping[str, Any]) -> Dict[str, Any]:
    stock_total = 0.0
    crypto_total = 0.0
    commodity_total = 0.0
    position_values: List[float] = []

    for bucket, position in _iter_portfolio_positions(user):
        value = _position_value(position)
        if value <= 0:
            continue
        position_values.append(value)
        if bucket == "crypto":
            crypto_total += value
        elif bucket == "commodity":
            commodity_total += value
        else:
            stock_total += value

    computed_total = stock_total + crypto_total + commodity_total
    declared_total = max(0.0, _to_float(user.get("portfolio_value")))

    if computed_total > 0:
        reliable_total = computed_total
        source = "portfolio_positions"
    elif declared_total > 0:
        reliable_total = declared_total
        source = "portfolio_value_field"
    else:
        reliable_total = 0.0
        source = "none"

    asset_class_totals = [value for value in (stock_total, crypto_total, commodity_total) if value > 0]
    asset_class_hhi = 0.0
    if reliable_total > 0 and asset_class_totals:
        asset_class_hhi = sum((value / reliable_total) ** 2 for value in asset_class_totals)

    position_hhi = 0.0
    if computed_total > 0 and position_values:
        position_hhi = sum((value / computed_total) ** 2 for value in position_values)

    return {
        "stock_total": stock_total,
        "crypto_total": crypto_total,
        "commodity_total": commodity_total,
        "computed_portfolio_value": computed_total,
        "declared_portfolio_value": declared_total,
        "portfolio_value": reliable_total,
        "portfolio_value_source": source,
        "position_hhi": position_hhi,
        "asset_class_hhi": asset_class_hhi,
        "position_count": len(position_values),
    }


def _derive_financial_metrics(user: Mapping[str, Any]) -> Tuple[Dict[str, Any], List[str], List[str]]:
    issues: List[str] = []
    notes: List[str] = []

    raw_income = max(0.0, _to_float(user.get("income")))
    derived_income_from_streams = _sum_income_streams(_as_list(user.get("income_streams")))
    if derived_income_from_streams > 0:
        derived_income = derived_income_from_streams
        income_source = "income_streams"
    else:
        derived_income = raw_income
        income_source = "income_field"

    raw_expenses = _to_float(user.get("expenses"))
    expenses_estimated = False
    expenses_missing = False
    if raw_expenses > 0:
        derived_expenses = raw_expenses
        expense_source = "expenses_field"
    elif derived_income > 0:
        derived_expenses = derived_income * EXPENSE_FALLBACK_RATIO
        expense_source = "estimated_from_income"
        expenses_estimated = True
        issues.append("expenses_estimated")
    else:
        derived_expenses = 0.0
        expense_source = "missing"
        expenses_missing = True
        issues.append("expenses_missing")

    estate_field = max(0.0, _to_float(user.get("estate")))
    manual_estate = _sum_manual_assets_by_category(_as_list(user.get("manual_assets")), "real_estate")
    derived_estate = max(estate_field, manual_estate)

    cash_balance = max(0.0, _to_float(user.get("cash_balance")))
    manual_cash_like = _sum_manual_assets_by_category(_as_list(user.get("manual_assets")), "banks")
    derived_total_cash_buffer = cash_balance + manual_cash_like

    mortgage_field = max(0.0, _to_float(user.get("mortgage")))
    liability_field = max(0.0, _to_float(user.get("liability")))
    derived_mortgage_from_items = _sum_liabilities(_as_list(user.get("liability_items")), True)
    derived_non_mortgage_liability = _sum_liabilities(_as_list(user.get("liability_items")), False)
    derived_mortgage = max(mortgage_field, derived_mortgage_from_items)
    derived_total_liability = max(liability_field, derived_mortgage + derived_non_mortgage_liability)

    portfolio_metrics = _portfolio_totals(user)
    liquidity_months = _safe_ratio(derived_total_cash_buffer, derived_expenses)
    annual_income = derived_income * 12.0
    debt_to_annual_income = (
        derived_total_liability / annual_income if annual_income > 0 else 0.0
    )
    non_mortgage_debt_to_annual_income = (
        derived_non_mortgage_liability / annual_income if annual_income > 0 else 0.0
    )
    mortgage_to_annual_income = (
        derived_mortgage / annual_income if annual_income > 0 else 0.0
    )
    housing_cushion = derived_estate / derived_mortgage if derived_mortgage > 0 else 0.0
    crypto_exposure_ratio = (
        portfolio_metrics["crypto_total"] / portfolio_metrics["portfolio_value"]
        if portfolio_metrics["portfolio_value"] > 0
        else 0.0
    )

    if raw_income > 0 and derived_income_from_streams > 0:
        if _relative_difference(raw_income, derived_income_from_streams) > MAJOR_CONFLICT_TOLERANCE:
            issues.append("income_conflict")
    elif raw_income == 0 and derived_income_from_streams > 0:
        issues.append("income_field_missing")

    if estate_field > 0 and manual_estate > 0 and _relative_difference(estate_field, manual_estate) > MAJOR_CONFLICT_TOLERANCE:
        issues.append("estate_conflict")

    liability_items_total = derived_mortgage_from_items + derived_non_mortgage_liability
    if liability_field > 0 and liability_items_total > 0 and _relative_difference(liability_field, liability_items_total) > MAJOR_CONFLICT_TOLERANCE:
        issues.append("liability_conflict")

    if mortgage_field > 0 and derived_mortgage_from_items > 0 and _relative_difference(mortgage_field, derived_mortgage_from_items) > MAJOR_CONFLICT_TOLERANCE:
        issues.append("mortgage_conflict")

    if (
        portfolio_metrics["declared_portfolio_value"] > 0
        and portfolio_metrics["computed_portfolio_value"] > 0
        and _relative_difference(
            portfolio_metrics["declared_portfolio_value"],
            portfolio_metrics["computed_portfolio_value"],
        ) > PORTFOLIO_CONFLICT_TOLERANCE
    ):
        issues.append("portfolio_conflict")

    if derived_income <= 0:
        issues.append("income_missing")
    if portfolio_metrics["portfolio_value"] <= 0:
        notes.append("portfolio_missing")

    derived_metrics = {
        "derived_income": _round(derived_income),
        "derived_income_source": income_source,
        "derived_expenses": _round(derived_expenses),
        "derived_expenses_source": expense_source,
        "derived_estate": _round(derived_estate),
        "derived_cash_like_manual_assets": _round(manual_cash_like),
        "derived_mortgage": _round(derived_mortgage),
        "derived_non_mortgage_liability": _round(derived_non_mortgage_liability),
        "derived_total_liability": _round(derived_total_liability),
        "derived_total_cash_buffer": _round(derived_total_cash_buffer),
        "liquidity_months": _round(liquidity_months),
        "debt_to_annual_income": _round(debt_to_annual_income, 4),
        "non_mortgage_debt_to_annual_income": _round(non_mortgage_debt_to_annual_income, 4),
        "mortgage_to_annual_income": _round(mortgage_to_annual_income, 4),
        "housing_cushion": _round(housing_cushion, 4),
        "stock_total": _round(portfolio_metrics["stock_total"]),
        "crypto_total": _round(portfolio_metrics["crypto_total"]),
        "commodity_total": _round(portfolio_metrics["commodity_total"]),
        "computed_portfolio_value": _round(portfolio_metrics["computed_portfolio_value"]),
        "portfolio_value": _round(portfolio_metrics["portfolio_value"]),
        "portfolio_value_source": portfolio_metrics["portfolio_value_source"],
        "crypto_exposure_ratio": _round(crypto_exposure_ratio, 4),
        "diversification_hhi": _round(
            portfolio_metrics["position_hhi"] or portfolio_metrics["asset_class_hhi"], 4
        ),
        "asset_class_hhi": _round(portfolio_metrics["asset_class_hhi"], 4),
        "position_hhi": _round(portfolio_metrics["position_hhi"], 4),
        "position_count": portfolio_metrics["position_count"],
        "expenses_estimated": expenses_estimated,
        "expenses_missing": expenses_missing,
    }
    return derived_metrics, issues, notes


def _score_liquidity(liquidity_months: float) -> float:
    if liquidity_months <= 0:
        return 0.0
    if liquidity_months >= LIQUIDITY_TARGET_MONTHS:
        return 100.0
    max_base = 1.0 - math.exp(-LIQUIDITY_TARGET_MONTHS / LIQUIDITY_CURVE_SHARPNESS)
    base = 1.0 - math.exp(-liquidity_months / LIQUIDITY_CURVE_SHARPNESS)
    return _clamp((base / max_base) * 100.0)


def _score_debt(non_mortgage_ratio: float, mortgage_ratio: float, annual_income: float, total_liability: float) -> float:
    if annual_income <= 0:
        return 50.0 if total_liability <= 0 else 0.0
    non_mortgage_score = 100.0 * math.exp(-1.35 * max(0.0, non_mortgage_ratio))
    mortgage_score = 100.0 * math.exp(-0.45 * max(0.0, mortgage_ratio))
    return _clamp(0.65 * non_mortgage_score + 0.35 * mortgage_score)


def _score_housing(estate: float, mortgage: float) -> Optional[float]:
    if estate <= 0 and mortgage <= 0:
        return None
    if estate > 0 and mortgage <= 0:
        return 95.0
    if mortgage <= 0:
        return 50.0

    ratio = estate / mortgage
    anchors = [
        (0.0, 0.0),
        (1.0, 35.0),
        (1.5, 55.0),
        (3.0, 82.0),
        (5.0, 100.0),
    ]
    if ratio >= anchors[-1][0]:
        return anchors[-1][1]
    for (left_x, left_y), (right_x, right_y) in zip(anchors, anchors[1:]):
        if left_x <= ratio <= right_x:
            span = right_x - left_x
            if span <= 0:
                return right_y
            progress = (ratio - left_x) / span
            return left_y + (right_y - left_y) * progress
    return 0.0


def _score_diversification(derived_metrics: Mapping[str, Any], wellness_metrics: Mapping[str, Any]) -> float:
    reliable_hhi = _to_float(derived_metrics.get("position_hhi"))
    if reliable_hhi <= 0:
        reliable_hhi = _to_float(derived_metrics.get("asset_class_hhi"))
    stored_hhi = _to_float(wellness_metrics.get("diversification_hhi"))
    if reliable_hhi <= 0 and 0.0 < stored_hhi <= 1.0:
        reliable_hhi = stored_hhi

    portfolio_value = _to_float(derived_metrics.get("portfolio_value"))
    position_count = int(_to_float(derived_metrics.get("position_count")))
    if portfolio_value <= 0:
        return 50.0
    if position_count <= 1 and reliable_hhi == 0:
        reliable_hhi = 1.0
    if reliable_hhi <= 0:
        reliable_hhi = 1.0

    score = 100.0 * ((1.0 - reliable_hhi) ** 0.65)
    if _to_float(derived_metrics.get("crypto_exposure_ratio")) >= 0.75:
        score *= 0.75
    return _clamp(score)


def _score_risk_alignment(derived_metrics: Mapping[str, Any], risk_profile: float) -> float:
    portfolio_value = _to_float(derived_metrics.get("portfolio_value"))
    if portfolio_value <= 0:
        return 60.0

    crypto_exposure = _to_float(derived_metrics.get("crypto_exposure_ratio"))
    concentration_hhi = max(
        _to_float(derived_metrics.get("position_hhi")),
        _to_float(derived_metrics.get("asset_class_hhi")),
    )
    actual_aggressiveness = 0.75 * crypto_exposure + 0.25 * concentration_hhi
    target_aggressiveness = 0.20 + 0.55 * (risk_profile / 100.0)
    overshoot = max(0.0, actual_aggressiveness - target_aggressiveness)
    undershoot = max(0.0, target_aggressiveness - actual_aggressiveness)
    penalty = 140.0 * overshoot + 25.0 * undershoot
    return _clamp(100.0 - penalty)


def _combine_weighted_scores(scores: Mapping[str, Optional[float]]) -> float:
    active_weights: Dict[str, float] = {}
    for key, base_weight in FINAL_PILLAR_WEIGHTS.items():
        if scores.get(key) is not None:
            active_weights[key] = base_weight
    total_weight = sum(active_weights.values())
    if total_weight <= 0:
        return 0.0

    normalized = {key: weight / total_weight for key, weight in active_weights.items()}
    combined = sum(float(scores[key]) * normalized[key] for key in normalized)
    return _clamp(combined)


def _compute_stress_index(
    scores: Mapping[str, Optional[float]],
    derived_metrics: Mapping[str, Any],
    total_score: float,
) -> float:
    liquidity_stress = 100.0 - float(scores.get("liquidity_score") or 0.0)
    diversification_stress = 100.0 - float(scores.get("diversification_score") or 0.0)
    risk_alignment_stress = 100.0 - float(scores.get("risk_alignment_score") or 0.0)
    housing_stress = 50.0 if scores.get("housing_score") is None else 100.0 - float(scores["housing_score"])

    non_mortgage_ratio = _to_float(derived_metrics.get("non_mortgage_debt_to_annual_income"))
    non_mortgage_debt_stress = _clamp(100.0 * (1.0 - math.exp(-1.8 * max(0.0, non_mortgage_ratio))))

    weighted = (
        STRESS_WEIGHTS["liquidity_score"] * liquidity_stress
        + STRESS_WEIGHTS["non_mortgage_debt_stress"] * non_mortgage_debt_stress
        + STRESS_WEIGHTS["diversification_score"] * diversification_stress
        + STRESS_WEIGHTS["risk_alignment_score"] * risk_alignment_stress
        + STRESS_WEIGHTS["housing_stress"] * housing_stress
    )
    regime_adjustment = 0.15 * max(0.0, 60.0 - total_score)
    return _clamp(weighted + regime_adjustment)


def _derive_confidence(issues: Iterable[str], derived_metrics: Mapping[str, Any]) -> str:
    score = 1.0
    penalties = {
        "income_missing": 0.28,
        "expenses_missing": 0.22,
        "expenses_estimated": 0.12,
        "income_conflict": 0.18,
        "income_field_missing": 0.08,
        "estate_conflict": 0.12,
        "liability_conflict": 0.12,
        "mortgage_conflict": 0.08,
        "portfolio_conflict": 0.08,
    }
    for issue in issues:
        score -= penalties.get(issue, 0.0)

    if _to_float(derived_metrics.get("portfolio_value")) <= 0:
        score -= 0.05
    if _to_float(derived_metrics.get("derived_total_cash_buffer")) <= 0:
        score -= 0.05

    if score >= 0.72:
        return "High"
    if score >= 0.42:
        return "Medium"
    return "Low"


def _build_action_insights(scores: Mapping[str, Optional[float]], derived_metrics: Mapping[str, Any]) -> List[str]:
    insights: List[str] = []
    if float(scores.get("liquidity_score") or 0.0) < 60.0:
        insights.append("Build emergency savings toward 3 to 6 months of expenses.")
    if float(scores.get("debt_score") or 0.0) < 60.0:
        insights.append("Lower unsecured liabilities to improve shock absorption and monthly flexibility.")
    if float(scores.get("diversification_score") or 0.0) < 60.0 or _to_float(derived_metrics.get("crypto_exposure_ratio")) > 0.35:
        insights.append("Reduce concentration in a single volatile asset class and broaden diversification.")
    if float(scores.get("risk_alignment_score") or 0.0) < 60.0:
        insights.append("Realign portfolio risk with stated tolerance so market swings are easier to absorb.")
    if scores.get("housing_score") is not None and float(scores.get("housing_score") or 0.0) < 60.0:
        insights.append("Improve housing cushion by paying down mortgage faster or increasing equity.")
    if not insights:
        insights.append("Maintain current buffers and rebalance periodically to preserve resilience.")
    return insights[:3]


def _build_summary(
    total_score: float,
    scores: Mapping[str, Optional[float]],
    derived_metrics: Mapping[str, Any],
) -> str:
    if total_score >= 80.0:
        prefix = "Highly resilient"
    elif total_score >= 60.0:
        prefix = "Moderately resilient"
    elif total_score >= 40.0:
        prefix = "Vulnerable"
    else:
        prefix = "Financially fragile"

    strengths: List[str] = []
    weaknesses: List[str] = []

    if float(scores.get("liquidity_score") or 0.0) >= 70.0:
        strengths.append("a solid liquidity buffer")
    elif float(scores.get("liquidity_score") or 0.0) < 50.0:
        weaknesses.append("limited liquid reserves")

    if float(scores.get("debt_score") or 0.0) >= 70.0:
        strengths.append("manageable debt pressure")
    elif float(scores.get("debt_score") or 0.0) < 50.0:
        weaknesses.append("heavy debt pressure")

    if float(scores.get("diversification_score") or 0.0) >= 70.0:
        strengths.append("diversified investments")
    elif float(scores.get("diversification_score") or 0.0) < 50.0:
        weaknesses.append("portfolio concentration")

    if _to_float(derived_metrics.get("crypto_exposure_ratio")) >= 0.45:
        weaknesses.append("elevated crypto concentration")

    if float(scores.get("risk_alignment_score") or 0.0) < 55.0:
        weaknesses.append("risk exposure above stated tolerance")

    if not strengths:
        strengths.append("some baseline financial capacity")
    if not weaknesses:
        weaknesses.append("only limited visible weaknesses")

    return f"{prefix}: {strengths[0].capitalize()} supports stability, but {weaknesses[0]} could amplify stress during shocks."


def calculate_behavioral_resilience(user: Mapping[str, Any]) -> Dict[str, Any]:
    wellness_metrics = user.get("wellness_metrics")
    existing_wellness = wellness_metrics if isinstance(wellness_metrics, Mapping) else {}
    derived_metrics, issues, _notes = _derive_financial_metrics(user)

    annual_income = _to_float(derived_metrics.get("derived_income")) * 12.0
    scores: Dict[str, Optional[float]] = {
        "liquidity_score": _round(_score_liquidity(_to_float(derived_metrics.get("liquidity_months")))),
        "debt_score": _round(
            _score_debt(
                _to_float(derived_metrics.get("non_mortgage_debt_to_annual_income")),
                _to_float(derived_metrics.get("mortgage_to_annual_income")),
                annual_income,
                _to_float(derived_metrics.get("derived_total_liability")),
            )
        ),
        "housing_score": None,
        "diversification_score": _round(_score_diversification(derived_metrics, existing_wellness)),
        "risk_alignment_score": _round(
            _score_risk_alignment(derived_metrics, _resolve_risk_profile_value(user.get("risk_profile", 50.0)))
        ),
    }

    housing_score = _score_housing(
        _to_float(derived_metrics.get("derived_estate")),
        _to_float(derived_metrics.get("derived_mortgage")),
    )
    scores["housing_score"] = None if housing_score is None else _round(housing_score)

    total_score = _round(_combine_weighted_scores(scores))
    stress_index = _round(_compute_stress_index(scores, derived_metrics, total_score))
    confidence = _derive_confidence(issues, derived_metrics)
    action_insights = _build_action_insights(scores, derived_metrics)
    summary = _build_summary(total_score, scores, derived_metrics)

    resilience_breakdown = {
        "liquidity_score": scores["liquidity_score"],
        "debt_score": scores["debt_score"],
        "housing_score": scores["housing_score"],
        "diversification_score": scores["diversification_score"],
        "risk_alignment_score": scores["risk_alignment_score"],
    }

    compatibility_metrics = dict(existing_wellness)
    compatibility_metrics.update(
        {
            "liquidity_months": derived_metrics["liquidity_months"],
            "liquidity_score": scores["liquidity_score"],
            "diversification_hhi": derived_metrics["diversification_hhi"],
            "diversification_score": scores["diversification_score"],
            "debt_income_ratio": derived_metrics["debt_to_annual_income"],
            "debt_income_score": scores["debt_score"],
            "housing_score": scores["housing_score"],
            "risk_alignment_score": scores["risk_alignment_score"],
            "behavioral_resilience_score": total_score,
            "financial_resilience_score": total_score,
            "financial_stress_index": stress_index,
            "confidence": confidence,
            "derived_metrics": derived_metrics,
            "resilience_breakdown": resilience_breakdown,
            "resilience_summary": summary,
            "action_insights": action_insights,
        }
    )

    return {
        "behavioral_resilience_score": total_score,
        "financial_resilience_score": total_score,
        "financial_wellness_score": total_score,
        "financial_stress_index": stress_index,
        "confidence": confidence,
        "derived_metrics": derived_metrics,
        "resilience_breakdown": resilience_breakdown,
        "resilience_summary": summary,
        "action_insights": action_insights,
        "wellness_metrics": compatibility_metrics,
    }
