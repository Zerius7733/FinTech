from typing import Dict


def calculate_financial_stress_index(metrics: Dict[str, float]) -> float:
    liquidity_stress = 100.0 - float(metrics.get("liquidity_score", 0.0))
    diversification_stress = 100.0 - float(metrics.get("diversification_score", 0.0))
    debt_stress = 100.0 - float(metrics.get("debt_income_score", 0.0))

    # Higher value means more financial stress.
    stress = 0.40 * liquidity_stress + 0.20 * diversification_stress + 0.40 * debt_stress
    return round(max(0.0, min(100.0, stress)), 2)
