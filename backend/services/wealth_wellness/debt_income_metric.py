from typing import Dict, Any


def calculate_debt_income_metric(user: Dict[str, Any]) -> Dict[str, float]:
    # Consumer / non-housing debt
    liability = float(user.get("liability", 0))

    # Housing loan
    mortgage = float(user.get("mortgage", 0))

    # Property value
    estate = float(user.get("estate", 0))

    annual_income = float(user.get("income", 0)) * 12
    if annual_income <= 0:
        return {"debt_income_ratio": 999.0, "debt_income_score": 0.0}

    # Only count the portion of mortgage that is NOT backed by the house value
    net_mortgage = max(mortgage - estate, 0.0)

    # Effective debt pressure = consumer debt + uncovered mortgage
    effective_debt = liability + net_mortgage

    ratio = effective_debt / annual_income

    # Ratio <= 1.0 is strong, >= 8.0 is poor, linear in-between.
    if ratio <= 1.0:
        score = 100.0
    elif ratio >= 8.0:
        score = 0.0
    else:
        score = (8.0 - ratio) / 7.0 * 100.0

    return {
        "debt_income_ratio": round(ratio, 4),
        "debt_income_score": round(score, 2),
    }