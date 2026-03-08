import json
from pathlib import Path
from typing import Any, Dict


USER_FIELD_ORDER = [
    "name",
    "age",
    "cash_balance",
    "liability",
    "liability_items",
    "portfolio",
    "manual_assets",
    "portfolio_value",
    "total_balance",
    "net_worth",
    "income",
    "income_streams",
    "mortgage",
    "estate",
    "wellness_metrics",
    "risk_profile",
    "financial_wellness_score",
    "financial_stress_index",
]


def _build_default_user_profile(name: str) -> Dict[str, Any]:
    return {
        "name": name,
        "age": None,
        "cash_balance": 0.0,
        "liability": 0.0,
        "liability_items": [],
        "portfolio": {"stocks": [], "cryptos": [], "commodities": []},
        "manual_assets": [],
        "portfolio_value": 0.0,
        "total_balance": 0.0,
        "net_worth": 0.0,
        "income": 0.0,
        "income_streams": [],
        "mortgage": 0.0,
        "estate": 0.0,
        "wellness_metrics": {
            "liquidity_months": 0.0,
            "liquidity_score": 0.0,
            "diversification_hhi": 0.0,
            "diversification_score": 0.0,
            "debt_income_ratio": 999.0,
            "debt_income_score": 0.0,
        },
        "risk_profile": "Moderate",
        "financial_wellness_score": 0.0,
        "financial_stress_index": 100.0,
    }


def normalize_user_profile(user: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(user)
    if "age" not in normalized:
        normalized["age"] = None
    normalized.setdefault("manual_assets", [])
    normalized.setdefault("liability_items", [])
    normalized.setdefault("income_streams", [])
    normalized.pop("monthly_expenses", None)
    normalized.pop("essential_monthly_expenses", None)
    return _reorder_user_fields(normalized)


def normalize_users_data(data: Dict[str, Any]) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {}
    for user_id, payload in data.items():
        if isinstance(payload, dict) and not user_id.startswith("_"):
            normalized[user_id] = normalize_user_profile(payload)
        else:
            normalized[user_id] = payload
    return normalized


def _reorder_user_fields(user: Dict[str, Any]) -> Dict[str, Any]:
    ordered: Dict[str, Any] = {}
    for key in USER_FIELD_ORDER:
        if key in user:
            ordered[key] = user[key]
    for key, value in user.items():
        if key not in ordered:
            ordered[key] = value
    return ordered


def rewrite_user_profiles_with_order(json_path: Path) -> None:
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    rewritten = normalize_users_data(data)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(rewritten, f, indent=2)


def add_default_user_profile(json_path: Path, user_id: str, name: str) -> None:
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if user_id not in data:
        data[user_id] = _build_default_user_profile(name)

    rewritten = normalize_users_data(data)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(rewritten, f, indent=2)
