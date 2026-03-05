from typing import Any, Dict


RISK_PROFILE_WEIGHTS = {
    "Low": {
        "liquidity_score": 0.50,
        "diversification_score": 0.15,
        "debt_income_score": 0.35,
    },
    "Moderate": {
        "liquidity_score": 0.35,
        "diversification_score": 0.30,
        "debt_income_score": 0.35,
    },
    "High": {
        "liquidity_score": 0.20,
        "diversification_score": 0.50,
        "debt_income_score": 0.30,
    },
}


def _resolve_profile(profile: str) -> str:
    value = (profile or "").strip().title()
    return value if value in RISK_PROFILE_WEIGHTS else "Moderate"


def calculate_financial_wellness_score(metrics: Dict[str, float], user: Dict[str, Any]) -> float:
    profile = _resolve_profile(str(user.get("risk_profile", "Moderate")))
    weights = RISK_PROFILE_WEIGHTS[profile]
    score = (
        metrics.get("liquidity_score", 0.0) * weights["liquidity_score"]
        + metrics.get("diversification_score", 0.0) * weights["diversification_score"]
        + metrics.get("debt_income_score", 0.0) * weights["debt_income_score"]
    )
    return round(max(0.0, min(100.0, score)), 2)
