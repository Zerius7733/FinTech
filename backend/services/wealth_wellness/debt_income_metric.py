from typing import Dict, Any
import pathlib
import json


def calculate_debt_income_metric(user: Dict[str, Any]) -> Dict[str, float]:
    liability = float(user.get("liability", 0))
    annual_income = float(user.get("income", 0)) * 12 
    if annual_income <= 0:
        return {"debt_income_ratio": 999.0, "debt_income_score": 0.0}

    ratio = liability / annual_income
    # Ratio <= 1.0 is strong, >= 5.0 is poor, linear in-between.
    if ratio <= 1.0:
        score = 100.0
    elif ratio >= 5.0:
        score = 0.0
    else:
        score = (5.0 - ratio) / 4.0 * 100.0
    return {"debt_income_ratio": round(ratio, 4), "debt_income_score": round(score, 2)}

if __name__ == "__main__":
    json_path = pathlib.Path(__file__).parent.parent.parent / "json_data" / "user.json"
    with open(json_path, "r") as f:
        users = json.load(f)
    print(calculate_debt_income_metric(users["u001"]))
