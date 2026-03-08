from typing import Any, Dict


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _resolve_risk_profile_value(profile: Any) -> float:
    if isinstance(profile, (int, float)):
        return _clamp(float(profile))

    value = str(profile or "").strip().lower()
    if value in {"low", "conservative"}:
        return 0.0
    if value in {"moderate", "medium", "balanced"}:
        return 50.0
    if value in {"high", "aggressive"}:
        return 100.0

    try:
        return _clamp(float(value))
    except ValueError:
        return 50.0


def _weights_from_risk_profile(risk_profile: float) -> Dict[str, float]:
    debt_weight = 0.30
    diversification_weight = 0.70 * (risk_profile / 100.0)
    liquidity_weight = 0.70 - diversification_weight
    return {
        "liquidity_score": liquidity_weight,
        "diversification_score": diversification_weight,
        "debt_income_score": debt_weight,
    }


def calculate_financial_wellness_score(metrics: Dict[str, float], user: Dict[str, Any]) -> float:
    risk_profile = _resolve_risk_profile_value(user.get("risk_profile", 50.0))
    weights = _weights_from_risk_profile(risk_profile)
    score = (
        metrics.get("liquidity_score", 0.0) * weights["liquidity_score"]
        + metrics.get("diversification_score", 0.0) * weights["diversification_score"]
        + metrics.get("debt_income_score", 0.0) * weights["debt_income_score"]
    )
    return round(max(0.0, min(100.0, score)), 2)
