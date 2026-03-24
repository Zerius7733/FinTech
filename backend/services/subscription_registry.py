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
        "Screenshot import",
    ],
    SUBSCRIPTION_PREMIUM: [
        "Everything in Free",
        "Premium market insights",
        "Deeper scenario analysis",
        "Priority guidance",
    ],
}

SUBSCRIPTION_LIMITS: dict[str, dict[str, Any]] = {
    SUBSCRIPTION_FREE: {
        "market_insights": False,
        "monthly_insights": 0,
        "analysis_depth": "lite",
    },
    SUBSCRIPTION_PREMIUM: {
        "market_insights": True,
        "monthly_insights": "unlimited",
        "analysis_depth": "full",
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
