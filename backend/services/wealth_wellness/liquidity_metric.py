from typing import Dict, Any


def calculate_liquidity_metric(user: Dict[str, Any]) -> Dict[str, float]:
    cash_balance = float(user.get("cash_balance", 0))
    monthly_income = float(user.get("income", 0))
    if monthly_income <= 0:
        return {
            "liquidity_months": 0.0,
            "liquidity_score": 0.0,
        }
    liquidity_months = cash_balance / monthly_income
    # 6 months of cash buffer => full score.
    liquidity_score = max(0.0, min(100.0, (liquidity_months / 6.0) * 100.0))
    return {
        "liquidity_months": round(liquidity_months, 2),
        "liquidity_score": round(liquidity_score, 2),
    }
