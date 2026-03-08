import json
from pathlib import Path
from typing import Any, Dict, List, Tuple


KB_DIR = Path(__file__).resolve().parents[2] / "knowledge_base" / "docs"


def _load_kb_docs() -> List[Dict[str, Any]]:
    docs: List[Dict[str, Any]] = []
    for path in sorted(KB_DIR.glob("*.json")):
        with open(path, "r", encoding="utf-8") as f:
            doc = json.load(f)
        doc["_path"] = str(path)
        docs.append(doc)
    return docs


def _metric_value(metric_name: str, user: Dict[str, Any]) -> float:
    if metric_name in {"financial_wellness_score", "financial_stress_index"}:
        return float(user.get(metric_name, 0.0))
    metrics = user.get("wellness_metrics", {}) or {}
    return float(metrics.get(metric_name, 0.0))


def _risk_profile_bucket(value: Any) -> str:
    if isinstance(value, (int, float)):
        numeric = max(0.0, min(100.0, float(value)))
        if numeric <= 33.33:
            return "Low"
        if numeric <= 66.66:
            return "Moderate"
        return "High"

    normalized = str(value or "").strip().lower()
    if normalized in {"low", "conservative"}:
        return "Low"
    if normalized in {"moderate", "medium", "balanced"}:
        return "Moderate"
    if normalized in {"high", "aggressive"}:
        return "High"

    try:
        return _risk_profile_bucket(float(normalized))
    except ValueError:
        return "Moderate"


def _conditions_match(conditions: Dict[str, Any], user: Dict[str, Any]) -> bool:
    for metric, threshold in (conditions.get("metric_lt") or {}).items():
        if _metric_value(metric, user) >= float(threshold):
            return False

    for metric, threshold in (conditions.get("metric_lte") or {}).items():
        if _metric_value(metric, user) > float(threshold):
            return False

    for metric, threshold in (conditions.get("metric_gt") or {}).items():
        if _metric_value(metric, user) <= float(threshold):
            return False

    for metric, threshold in (conditions.get("metric_gte") or {}).items():
        if _metric_value(metric, user) < float(threshold):
            return False

    allowed_risk_profiles = conditions.get("risk_profile_in") or []
    if allowed_risk_profiles:
        risk_profile = _risk_profile_bucket(user.get("risk_profile", 50.0))
        normalized_allowed = {_risk_profile_bucket(v) for v in allowed_risk_profiles}
        if risk_profile not in normalized_allowed:
            return False

    return True


def _build_triggers(doc: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, float]:
    triggers: Dict[str, float] = {}
    conditions = doc.get("conditions", {}) or {}
    for key in ("metric_lt", "metric_lte", "metric_gt", "metric_gte"):
        for metric_name in (conditions.get(key) or {}).keys():
            triggers[metric_name] = round(_metric_value(metric_name, user), 4)
    return triggers


def generate_user_recommendations(user: Dict[str, Any], limit: int = 3) -> Dict[str, Any]:
    docs = _load_kb_docs()
    matched: List[Tuple[int, Dict[str, Any]]] = []

    for doc in docs:
        if _conditions_match(doc.get("conditions", {}) or {}, user):
            matched.append((int(doc.get("priority", 0)), doc))

    matched.sort(key=lambda item: item[0], reverse=True)

    recommendations: List[Dict[str, Any]] = []
    for _, doc in matched[: max(1, limit)]:
        recommendations.append(
            {
                "id": doc.get("id"),
                "title": doc.get("title"),
                "category": doc.get("category"),
                "actions": doc.get("actions", []),
                "rationale": doc.get("rationale"),
                "priority": doc.get("priority", 0),
                "triggers": _build_triggers(doc, user),
                "citation": {
                    "source": doc.get("source", "Internal KB"),
                    "source_url": doc.get("source_url"),
                    "file": doc.get("_path"),
                },
            }
        )

    if not recommendations:
        recommendations.append(
            {
                "id": "fallback_general",
                "title": "General financial hygiene",
                "category": "general",
                "actions": [
                    "Maintain consistent monthly savings contributions.",
                    "Review diversification and debt levels quarterly.",
                    "Keep emergency cash reserves aligned with your risk profile.",
                ],
                "rationale": "No specialized rule was triggered; baseline financial discipline applies.",
                "priority": 0,
                "triggers": {},
                "citation": {
                    "source": "Internal Wealth Wellness Playbook",
                    "source_url": None,
                    "file": "knowledge_base/fallback",
                },
            }
        )

    return {
        "risk_profile": user.get("risk_profile"),
        "financial_wellness_score": user.get("financial_wellness_score"),
        "financial_stress_index": user.get("financial_stress_index"),
        "recommendations": recommendations,
    }
