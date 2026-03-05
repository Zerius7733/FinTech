from typing import Dict


WEIGHTS = {
    "liquidity_score": 0.35,
    "diversification_score": 0.30,
    "debt_income_score": 0.35,
}


def calculate_financial_wellness_score(metrics: Dict[str, float]) -> float:
    score = (
        metrics.get("liquidity_score", 0.0) * WEIGHTS["liquidity_score"]
        + metrics.get("diversification_score", 0.0) * WEIGHTS["diversification_score"]
        + metrics.get("debt_income_score", 0.0) * WEIGHTS["debt_income_score"]
    )
    return round(max(0.0, min(100.0, score)), 2)
