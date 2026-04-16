from __future__ import annotations

from typing import Any, Dict

SUBSCRIPTION_FREE = "free"
SUBSCRIPTION_PREMIUM = "premium"

SUBSCRIPTION_FEATURES: dict[str, list[str]] = {
    SUBSCRIPTION_FREE: [
        "Portfolio tracking",
        "Market data and quote lookup",
        "Wellness scoring",
        "Retirement planning",
        "Income and CPF breakdowns",
        "Scenario lab preview",
        "Shared goals tracking",
        "Screenshot import",
    ],
    SUBSCRIPTION_PREMIUM: [
        "Everything in Free",
        "Premium market insights and decision briefs",
        "Deeper scenario lab with richer outcomes",
        "Priority guidance and next-best-action support",
        "Household planning depth and partner-aware guidance",
    ],
}

SUBSCRIPTION_LIMITS: dict[str, dict[str, Any]] = {
    SUBSCRIPTION_FREE: {
        "market_insights": False,
        "analysis_depth": "preview",
        "insight_preview_sections": 1,
        "scenario_lab_cases": 1,
        "shared_goal_limit": 2,
        "decision_support": "preview",
    },
    SUBSCRIPTION_PREMIUM: {
        "market_insights": True,
        "monthly_insights": "unlimited",
        "analysis_depth": "full",
        "insight_preview_sections": "full",
        "scenario_lab_cases": 4,
        "shared_goal_limit": 12,
        "decision_support": "full",
    },
}


def normalize_subscription_plan(value: Any) -> str:
    plan = str(value or "").strip().lower()
    if plan in {SUBSCRIPTION_PREMIUM, "pro", "plus", "paid", "gold"}:
        return SUBSCRIPTION_PREMIUM
    return SUBSCRIPTION_FREE


def is_premium_subscription(value: Any) -> bool:
    return normalize_subscription_plan(value) == SUBSCRIPTION_PREMIUM


def ensure_user_subscription(user: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(user, dict):
        return user
    normalized = dict(user)
    plan = normalize_subscription_plan(normalized.get("subscription_plan"))
    normalized["subscription_plan"] = plan
    normalized["subscription_status"] = "active" if plan == SUBSCRIPTION_PREMIUM else "free"
    normalized["subscription_label"] = "Premium" if plan == SUBSCRIPTION_PREMIUM else "Free"
    return normalized


def subscription_payload(user: Dict[str, Any] | None = None) -> Dict[str, Any]:
    plan = normalize_subscription_plan((user or {}).get("subscription_plan"))
    return {
        "plan": plan,
        "label": "Premium" if plan == SUBSCRIPTION_PREMIUM else "Free",
        "is_premium": plan == SUBSCRIPTION_PREMIUM,
        "features": SUBSCRIPTION_FEATURES[plan],
        "limits": SUBSCRIPTION_LIMITS[plan],
    }
