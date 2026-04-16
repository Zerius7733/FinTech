import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend import routes, settings
import backend.api_models as models
import backend.services.api_deps as api
from backend.services.income_profile import build_income_summary

USER_JSON_PATH = settings.constants.USER_JSON_PATH
LOGIN_CSV_PATH = settings.constants.LOGIN_CSV_PATH
ASSETS_CSV_PATH = settings.constants.ASSETS_CSV_PATH
AUTH_STATE_PATH = settings.constants.JSON_DATA_DIR / "auth_state.json"


def _normalize_user(user: dict[str, Any]) -> dict[str, Any]:
    normalized = api.normalize_users_data({"u": user}).get("u", user)
    if isinstance(normalized, dict):
        normalized = api.ensure_user_subscription(normalized)
    return normalized


def _read_users_data() -> dict[str, Any]:
    if not USER_JSON_PATH.exists():
        return {}
    with open(USER_JSON_PATH, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
    normalized = api.normalize_users_data(data if isinstance(data, dict) else {})
    return {key: api.ensure_user_subscription(value) if isinstance(value, dict) else value for key, value in normalized.items()}


def _write_users_data(data: dict[str, Any]) -> None:
    USER_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(USER_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(api.normalize_users_data(data), f, indent=2)


def _next_available_user_id() -> str:
    max_id = 0
    if LOGIN_CSV_PATH.exists():
        with open(LOGIN_CSV_PATH, "r", encoding="utf-8", newline="") as f:
            import csv
            for row in csv.DictReader(f):
                raw = str((row or {}).get("user_id", "")).strip().lower()
                if raw.startswith("u") and raw[1:].isdigit():
                    max_id = max(max_id, int(raw[1:]))
    for user_id in _read_users_data().keys():
        raw = str(user_id or "").strip().lower()
        if raw.startswith("u") and raw[1:].isdigit():
            max_id = max(max_id, int(raw[1:]))
    return f"u{max_id + 1:03d}"


def _safe_summary(result: dict[str, Any]) -> dict[str, Any]:
    return {"status": "ok", "user_count": len([k for k in result.keys() if not k.startswith("_")])}


def _enforce_insights_rate_limit(subject: str) -> None:
    settings.config.enforce_insights_rate_limit(subject)


class RegisterVerifyRequest(BaseModel):
    email: str
    otp_code: str


class RegisterResendRequest(BaseModel):
    email: str


class PasswordResetStartRequest(BaseModel):
    identifier: str


class PasswordResetVerifyRequest(BaseModel):
    email: str
    otp_code: str
    new_password: str


class SubscriptionUpdateRequest(BaseModel):
    plan: str


class PortfolioHoldingCreateRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)
    asset_class: str = Field(..., min_length=1, max_length=20)
    qty: float = Field(1.0, gt=0)
    avg_price: float | None = Field(default=None, ge=0)
    name: str | None = Field(default=None, max_length=80)


class HouseholdProfileRequest(BaseModel):
    mode: str = "personal"
    partner_name: str | None = None
    partner_monthly_contribution: float = 0
    partner_monthly_income: float = 0
    partner_fixed_expenses: float = 0
    shared_budget_monthly: float = 0
    contribution_style: str = "income_weighted"
    dependents_count: int = 0
    shared_cash_reserve_target: float = 0


class SharedGoalRequest(BaseModel):
    title: str
    target_amount: float
    current_saved: float = 0
    monthly_contribution: float = 0
    target_date: str | None = None
    priority: int = 3
    owners: list[str] = []


class AdvisorMatchRequest(BaseModel):
    institution_id: str
    institution_name: str
    product_id: str
    product_name: str
    notes: str | None = None


class PlanningScenarioRequest(BaseModel):
    cpf_age: int | None = None
    cpf_eligible_monthly_income: float | None = None
    cpf_ordinary_wage_ceiling: float = 8000
    tax_residency: str = "resident"
    annual_reliefs: float = 0
    household_members: list[dict[str, Any]] = []
    shared_goals: list[dict[str, Any]] = []
    retirement_age: int | None = None
    monthly_expenses: float | None = None
    essential_monthly_expenses: float | None = None
    horizon_years: int = 5


app = FastAPI(title="FinTech Wellness API", version="1.0.0", openapi_tags=settings.constants.OPENAPI_TAGS, description="API for FinTech Wellness app.")
app.add_middleware(CORSMiddleware, allow_origins=settings.config.parse_csv_env("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://localhost:8080,http://127.0.0.1:5173"), allow_origin_regex=settings.config.build_allowed_origin_regex(), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

if USER_JSON_PATH.exists():
    api.rewrite_user_profiles_with_order(USER_JSON_PATH)
if LOGIN_CSV_PATH != ASSETS_CSV_PATH:
    api.bootstrap_login_csv_from_assets_csv(LOGIN_CSV_PATH, ASSETS_CSV_PATH)
api.ensure_login_csv_schema(LOGIN_CSV_PATH)


@app.on_event("startup")
async def startup_event() -> None:
    await api.runtime.start(app) if hasattr(api, "runtime") else None


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await api.runtime.stop(app) if hasattr(api, "runtime") else None


app.include_router(routes.health.build_router(youtube_url=settings.constants.YOUTUBE_HELP_VIDEO_URL, embed_url=settings.constants.YOUTUBE_HELP_EMBED_URL))
app.include_router(routes.updates.build_router(safe_summary=_safe_summary))


@app.post("/auth/login", tags=["Users"])
def login(payload: models.LoginRequest) -> dict[str, Any]:
    try:
        result = api.authenticate_login_user(login_csv_path=LOGIN_CSV_PATH, username=payload.username, password=payload.password)
        user = _read_users_data().get(result["user_id"])
        subscription = api.subscription_payload(user if isinstance(user, dict) else None)
        return {"status": "ok", **result, "subscription": subscription, "subscription_plan": subscription["plan"]}
    except api.LoginValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except api.LoginAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except api.AccountStateError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@app.post("/auth/register/precheck", tags=["Users"])
def register_precheck(payload: models.RegisterPrecheckRequest) -> dict[str, Any]:
    validated = api.validate_registration_fields(login_csv_path=LOGIN_CSV_PATH, username=payload.username, password=payload.password, email=payload.email, exclude_user_id=payload.user_id, require_email=True)
    return {"status": "ok", "username": validated["username"], "email": validated["email"], "password_rules_passed": True}


@app.post("/auth/register", tags=["Users"])
def register(payload: models.RegisterRequest) -> dict[str, Any]:
    if payload.email:
        return api.start_registration(login_csv_path=LOGIN_CSV_PATH, auth_state_path=AUTH_STATE_PATH, username=payload.username, password=payload.password, email=payload.email, requested_user_id=_next_available_user_id())
    result = api.register_login_user(LOGIN_CSV_PATH, payload.username, payload.password, payload.email, _next_available_user_id())
    users = _read_users_data()
    users[result["user_id"]] = _normalize_user({"name": result["username"]})
    _write_users_data(users)
    return {"status": "ok", **result}


@app.post("/auth/register/verify", tags=["Users"])
def register_verify(payload: RegisterVerifyRequest) -> dict[str, Any]:
    result = api.verify_registration_otp(login_csv_path=LOGIN_CSV_PATH, auth_state_path=AUTH_STATE_PATH, email=payload.email, otp_code=payload.otp_code)
    users = _read_users_data()
    users[result["user_id"]] = _normalize_user({"name": result["username"]})
    _write_users_data(users)
    return result


@app.post("/auth/register/resend", tags=["Users"])
def register_resend(payload: RegisterResendRequest) -> dict[str, Any]:
    return api.resend_registration_otp(auth_state_path=AUTH_STATE_PATH, email=payload.email)


@app.post("/auth/password-reset", tags=["Users"])
def password_reset_start(payload: PasswordResetStartRequest) -> dict[str, Any]:
    return api.start_password_reset(login_csv_path=LOGIN_CSV_PATH, auth_state_path=AUTH_STATE_PATH, identifier=payload.identifier)


@app.post("/auth/password-reset/verify", tags=["Users"])
def password_reset_verify(payload: PasswordResetVerifyRequest) -> dict[str, Any]:
    return api.reset_password_with_otp(login_csv_path=LOGIN_CSV_PATH, auth_state_path=AUTH_STATE_PATH, email=payload.email, otp_code=payload.otp_code, new_password=payload.new_password)


@app.get("/users", tags=["Users"])
def get_users() -> dict[str, Any]:
    users = _read_users_data()
    return {"status": "ok", "count": len(users), "users": users}


@app.get("/users/{user_id}", tags=["Users"])
def get_user(user_id: str) -> dict[str, Any]:
    user = _read_users_data().get(user_id)
    if not isinstance(user, dict):
        raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
    user = _normalize_user(user)
    user = api.ensure_user_subscription(user)
    return {"status": "ok", "user_id": user_id, "user": user, "subscription": api.subscription_payload(user)}


@app.post("/users/{user_id}/subscription", tags=["Users"])
def update_subscription(user_id: str, payload: SubscriptionUpdateRequest) -> dict[str, Any]:
    users = _read_users_data()
    user = users.get(user_id)
    if not isinstance(user, dict):
        raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
    user["subscription_plan"] = api.normalize_subscription_plan(payload.plan)
    users[user_id] = _normalize_user(user)
    _write_users_data(users)
    return {"status": "ok", "user_id": user_id, "user": users[user_id], "subscription": api.subscription_payload(users[user_id])}


@app.get("/users/{user_id}/financials", tags=["Users"])
def get_financials(user_id: str) -> dict[str, Any]:
    user = _read_users_data().get(user_id)
    if not isinstance(user, dict):
        raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
    user = api.ensure_user_subscription(api.normalize_users_data({"u": user})["u"])
    summary = {
        "income": user.get("income", 0.0),
        "liability": user.get("liability", 0.0),
        "mortgage": user.get("mortgage", 0.0),
        "estate": user.get("estate", 0.0),
        "portfolio_value": user.get("portfolio_value", 0.0),
        "net_worth": user.get("net_worth", 0.0),
        "income_summary": build_income_summary(user),
    }
    return {"status": "ok", "user_id": user_id, "manual_assets": user.get("manual_assets", []), "liability_items": user.get("liability_items", []), "income_streams": user.get("income_streams", []), "summary": summary, "household_profile": user.get("household_profile", {}), "shared_goals": user.get("shared_goals", [])}


@app.post("/users/{user_id}/financials/portfolio", tags=["Users"])
def add_portfolio_holding(user_id: str, payload: PortfolioHoldingCreateRequest) -> dict[str, Any]:
    users = _read_users_data()
    user = users.get(user_id)
    if not isinstance(user, dict):
        raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
    user = _normalize_user(user)
    symbol = payload.symbol.strip().upper()
    requested = payload.asset_class.strip().lower()
    mapping = {"stock": ("stocks", "STOCK"), "stocks": ("stocks", "STOCK"), "bond": ("bonds", "BOND"), "bonds": ("bonds", "BOND"), "real_asset": ("real_assets", "REAL_ASSET"), "real_assets": ("real_assets", "REAL_ASSET"), "crypto": ("cryptos", "CRYPTO"), "cryptos": ("cryptos", "CRYPTO"), "commodity": ("commodities", "COMMODITY"), "commodities": ("commodities", "COMMODITY")}
    if requested not in mapping:
        raise HTTPException(status_code=400, detail="asset_class must be stock, bond, real_asset, crypto, or commodity")
    bucket, query_type = mapping[requested]
    if query_type in {"STOCK", "BOND", "REAL_ASSET"}:
        price = float(api.fetch_latest_prices([symbol])[symbol])
    elif query_type == "CRYPTO":
        price = float(api.fetch_crypto_price(symbol)["price"])
    else:
        price = float(api.fetch_commodity_price(symbol)["price"])
    item = {"symbol": symbol, "qty": round(float(payload.qty), 8), "avg_price": round(float(payload.avg_price if payload.avg_price is not None else price), 6), "current_price": round(price, 6), "market_value": round(float(payload.qty) * price, 2)}
    if payload.name:
        item["name"] = payload.name.strip()
    portfolio = user.get("portfolio", {"stocks": [], "bonds": [], "real_assets": [], "cryptos": [], "commodities": []})
    entries = portfolio.get(bucket, [])
    if not isinstance(entries, list):
        entries = []
    entries.append(item)
    portfolio[bucket] = entries
    user["portfolio"] = portfolio
    users[user_id] = api.normalize_users_data({"u": user})["u"]
    _write_users_data(users)
    return {"status": "ok", "user_id": user_id, "asset_class": bucket, "item": item, "user": users[user_id]}


@app.post("/users/{user_id}/household", tags=["Users"])
def update_household(user_id: str, payload: HouseholdProfileRequest) -> dict[str, Any]:
    users = _read_users_data()
    user = users.get(user_id)
    if not isinstance(user, dict):
        raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
    user["household_profile"] = payload.model_dump()
    users[user_id] = _normalize_user(user)
    _write_users_data(users)
    return {"status": "ok", "user_id": user_id, "household_profile": users[user_id]["household_profile"]}


@app.post("/users/{user_id}/shared-goals", tags=["Users"])
def add_shared_goal(user_id: str, payload: SharedGoalRequest) -> dict[str, Any]:
    users = _read_users_data()
    user = users.get(user_id)
    if not isinstance(user, dict):
        raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
    goals = user.get("shared_goals", [])
    if not isinstance(goals, list):
        goals = []
    goal = payload.model_dump()
    goals.append(goal)
    user["shared_goals"] = goals
    users[user_id] = _normalize_user(user)
    _write_users_data(users)
    return {"status": "ok", "user_id": user_id, "goal": goal}


@app.post("/users/{user_id}/advisor-match", tags=["Users"])
def create_advisor_match(user_id: str, payload: AdvisorMatchRequest) -> dict[str, Any]:
    users = _read_users_data()
    user = users.get(user_id)
    if not isinstance(user, dict):
        raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
    requests = user.get("advisor_match_requests", [])
    if not isinstance(requests, list):
        requests = []
    request_row = {**payload.model_dump(), "id": str(uuid.uuid4()), "status": "requested"}
    requests.append(request_row)
    user["advisor_match_requests"] = requests
    users[user_id] = _normalize_user(user)
    _write_users_data(users)
    return {"status": "ok", "user_id": user_id, "request": request_row}


@app.get("/users/{user_id}/planning/overview", tags=["Planning"])
def get_planning_overview(user_id: str) -> dict[str, Any]:
    user = _read_users_data().get(user_id)
    if not isinstance(user, dict):
        raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
    return {"status": "ok", "user_id": user_id, **api.build_financial_planning_overview(user)}


@app.post("/users/{user_id}/planning/scenario", tags=["Planning"])
def get_planning_scenario(user_id: str, payload: PlanningScenarioRequest) -> dict[str, Any]:
    user = _read_users_data().get(user_id)
    if not isinstance(user, dict):
        raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
    return {"status": "ok", "user_id": user_id, **api.build_financial_planning_scenario(user, **payload.model_dump())}


@app.get("/api/assets/resolve", tags=["Market"])
async def resolve_asset(q: str = Query(...)) -> dict[str, Any]:
    return await api.resolve_asset(q)


@app.get("/api/insights", tags=["Market"])
async def get_insights(request: Request, type: str = Query(...), symbol: str = Query(...), months: int = Query(3, ge=1, le=24), user_id: str | None = Query(None)) -> dict[str, Any]:
    _enforce_insights_rate_limit(f"user:{user_id}" if user_id else f"ip:{getattr(request.client, 'host', 'unknown')}")
    if user_id:
        user = _read_users_data().get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        if not api.is_premium_subscription(user.get("subscription_plan")):
            raise HTTPException(status_code=402, detail={"message": "Market insights are available on Premium.", "upgrade_url": "/pricing", "required_plan": "premium"})
    return await api.build_insights(asset_type=type, symbol=symbol, months=months)


@app.get("/api/market/stocks", tags=["Market"])
def get_stocks(page: int = 1, per_page: int = 50) -> list[dict[str, Any]]:
    return api.get_precomputed_stock_rankings(page=page, per_page=per_page)


@app.get("/api/market/commodities", tags=["Market"])
def get_commodities(page: int = 1, per_page: int = 50) -> list[dict[str, Any]]:
    return api.get_precomputed_commodity_rankings(page=page, per_page=per_page)


@app.get("/api/market/bonds", tags=["Market"])
def get_bonds(page: int = 1, per_page: int = 50) -> list[dict[str, Any]]:
    return api.get_precomputed_bond_rankings(page=page, per_page=per_page)


@app.get("/api/market/real-assets", tags=["Market"])
def get_real_assets(page: int = 1, per_page: int = 50) -> list[dict[str, Any]]:
    return api.get_precomputed_real_asset_rankings(page=page, per_page=per_page)


@app.get("/market/quote", tags=["Market"])
def market_quote(query: str = Query(...)) -> dict[str, Any]:
    return api.get_market_quote(query)
