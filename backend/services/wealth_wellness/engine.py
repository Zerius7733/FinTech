import json
from typing import Any, Dict

from backend.services.wealth_wellness.debt_income_metric import calculate_debt_income_metric
from backend.services.wealth_wellness.diversification_metric import calculate_diversification_metric
from backend.services.wealth_wellness.liquidity_metric import calculate_liquidity_metric
from backend.services.wealth_wellness.score import calculate_financial_wellness_score


def calculate_user_wellness(user: Dict[str, Any]) -> Dict[str, Any]:
    liquidity = calculate_liquidity_metric(user)
    diversification = calculate_diversification_metric(user)
    debt_income = calculate_debt_income_metric(user)

    metrics = {**liquidity, **diversification, **debt_income}
    score = calculate_financial_wellness_score(metrics)
    return {
        "wellness_metrics": metrics,
        "financial_wellness_score": score,
    }


def update_wellness_file(json_path: str = "json_data/user.json") -> Dict[str, Any]:
    print(f"[wellness] calculating metrics from {json_path}")
    with open(json_path, "r", encoding="utf-8") as f:
        users = json.load(f)

    updated = json.loads(json.dumps(users))
    results: Dict[str, Any] = {}
    for user_id, user in updated.items():
        if user_id.startswith("_") or not isinstance(user, dict):
            continue
        result = calculate_user_wellness(user)
        user["wellness_metrics"] = result["wellness_metrics"]
        user["financial_wellness_score"] = result["financial_wellness_score"]
        results[user_id] = result

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(updated, f, indent=2)
    print(f"[wellness] calculated and saved for {len(results)} users")
    return updated


if __name__ == "__main__":
    update_wellness_file()
