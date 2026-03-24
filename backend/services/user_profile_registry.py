import json
from pathlib import Path
from typing import Any, Dict


USER_FIELD_ORDER = [
    "name",
    "age",
    "country",
    "subscription_plan",
    "cash_balance",
    "liability",
    "liability_items",
    "portfolio",
    "manual_assets",
    "portfolio_value",
    "total_balance",
    "net_worth",
    "income",
    "income_summary",
    "expenses",
    "income_streams",
    "household_profile",
    "shared_goals",
    "mortgage",
    "estate",
    "wellness_metrics",
    "risk_profile",
    "behavioral_resilience_score",
    "financial_resilience_score",
    "financial_wellness_score",
    "financial_stress_index",
    "confidence",
    "resilience_summary",
    "resilience_breakdown",
    "action_insights",
]


def _build_default_user_profile(name: str) -> Dict[str, Any]:
    return {
        "name": name,
        "age": None,
        "subscription_plan": "free",
        "country": "Singapore",
        "cash_balance": 0.0,
        "liability": 0.0,
        "liability_items": [],
        "portfolio": {"stocks": [], "bonds": [], "real_assets": [], "cryptos": [], "commodities": []},
        "manual_assets": [],
        "portfolio_value": 0.0,
        "total_balance": 0.0,
        "net_worth": 0.0,
        "income": 0.0,
        "income_summary": {
            "country": "SG",
            "monthly_gross": 0.0,
            "monthly_net": 0.0,
            "monthly_tax": 0.0,
            "annual_gross": 0.0,
            "annual_net": 0.0,
            "annual_tax": 0.0,
            "effective_tax_rate": 0.0,
            "streams": [],
            "cpf": {
                "employee_monthly": 0.0,
                "employer_monthly": 0.0,
                "total_monthly": 0.0,
                "employee_annual": 0.0,
                "employer_annual": 0.0,
                "total_annual": 0.0,
                "accounts_monthly": {"ordinary": 0.0, "special": 0.0, "medisave": 0.0},
                "accounts_annual": {"ordinary": 0.0, "special": 0.0, "medisave": 0.0},
            },
        },
        "expenses": 0.0,
        "income_streams": [],
        "household_profile": {
            "mode": "personal",
            "partner_name": "",
            "partner_monthly_contribution": 0.0,
            "partner_monthly_income": 0.0,
            "partner_fixed_expenses": 0.0,
            "shared_budget_monthly": 0.0,
            "contribution_style": "income_weighted",
            "dependents_count": 0,
            "shared_cash_reserve_target": 0.0,
        },
        "shared_goals": [],
        "mortgage": 0.0,
        "estate": 0.0,
        "wellness_metrics": {
            "liquidity_months": 0.0,
            "liquidity_score": 0.0,
            "diversification_hhi": 0.0,
            "diversification_score": 0.0,
            "debt_income_ratio": 999.0,
            "debt_income_score": 0.0,
            "housing_score": None,
            "risk_alignment_score": 50.0,
            "behavioral_resilience_score": 0.0,
            "financial_resilience_score": 0.0,
            "financial_stress_index": 100.0,
            "confidence": "Low",
            "derived_metrics": {},
            "resilience_breakdown": {},
            "resilience_summary": "",
            "action_insights": [],
        },
        "risk_profile": 50.0,
        "behavioral_resilience_score": 0.0,
        "financial_resilience_score": 0.0,
        "financial_wellness_score": 0.0,
        "financial_stress_index": 100.0,
        "confidence": "Low",
        "resilience_summary": "",
        "resilience_breakdown": {},
        "action_insights": [],
    }


def _normalize_risk_profile_value(value: Any) -> float:
    if isinstance(value, (int, float)):
        numeric = float(value)
    else:
        text = str(value or "").strip().lower()
        mapping = {
            "low": 0.0,
            "conservative": 0.0,
            "moderate": 50.0,
            "medium": 50.0,
            "balanced": 50.0,
            "high": 100.0,
            "aggressive": 100.0,
        }
        if text in mapping:
            numeric = mapping[text]
        else:
            try:
                numeric = float(text)
            except ValueError:
                numeric = 50.0
    return round(max(0.0, min(100.0, numeric)), 2)


def normalize_user_profile(user: Dict[str, Any]) -> Dict[str, Any]:
    default_profile = _build_default_user_profile(str(user.get("name", "")))
    normalized = dict(default_profile)
    normalized.update(user)

    normalized.setdefault("manual_assets", [])
    normalized.setdefault("liability_items", [])
    normalized.setdefault("income_streams", [])
    normalized.setdefault("shared_goals", [])
    normalized.setdefault("household_profile", default_profile["household_profile"])
    normalized.setdefault("income_summary", default_profile["income_summary"])
    if isinstance(normalized.get("household_profile"), dict):
        merged_household = dict(default_profile["household_profile"])
        merged_household.update(normalized["household_profile"])
        normalized["household_profile"] = merged_household

    portfolio = normalized.get("portfolio")
    if isinstance(portfolio, dict):
        for bucket in ("stocks", "bonds", "real_assets", "cryptos", "commodities"):
            if not isinstance(portfolio.get(bucket), list):
                portfolio[bucket] = []
    else:
        normalized["portfolio"] = {"stocks": [], "bonds": [], "real_assets": [], "cryptos": [], "commodities": []}

    wellness = normalized.get("wellness_metrics")
    if not isinstance(wellness, dict):
        wellness = {}
    default_wellness = default_profile["wellness_metrics"]
    merged_wellness = dict(default_wellness)
    merged_wellness.update(wellness)
    normalized["wellness_metrics"] = merged_wellness
    normalized["risk_profile"] = _normalize_risk_profile_value(normalized.get("risk_profile", 50.0))

    normalized.pop("created_at", None)
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
    with open(json_path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    rewritten = normalize_users_data(data)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(rewritten, f, indent=2)


def add_default_user_profile(json_path: Path, user_id: str, name: str) -> None:
    if not json_path.exists():
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump({}, f, indent=2)

    with open(json_path, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    if user_id not in data:
        data[user_id] = _build_default_user_profile(name)

    rewritten = normalize_users_data(data)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(rewritten, f, indent=2)
