import json
from typing import Any, Dict

from backend.services.wealth_wellness.behavioral_resilience import calculate_behavioral_resilience


def calculate_user_wellness(user: Dict[str, Any]) -> Dict[str, Any]:
    return calculate_behavioral_resilience(user)


def update_wellness_file(json_path: str = "data/json/user.json") -> Dict[str, Any]:
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
        user["behavioral_resilience_score"] = result["behavioral_resilience_score"]
        user["financial_resilience_score"] = result["financial_resilience_score"]
        user["financial_wellness_score"] = result["financial_wellness_score"]
        user["financial_stress_index"] = result["financial_stress_index"]
        user["confidence"] = result["confidence"]
        user["resilience_summary"] = result["resilience_summary"]
        user["resilience_breakdown"] = result["resilience_breakdown"]
        user["action_insights"] = result["action_insights"]
        results[user_id] = result

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(updated, f, indent=2)
    print(f"[wellness] calculated and saved for {len(results)} users")
    return updated


if __name__ == "__main__":
    update_wellness_file()
