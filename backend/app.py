import asyncio
import json
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Query, Request
from pydantic import AliasChoices, BaseModel, Field

import backend.services.api_deps as api
from backend.services.compatibility import evaluate_compatibility
from backend.services.compatibility import synthesize_compatibility_with_llm
from backend.services.screenshot_importer import create_pending_import
from backend.services.screenshot_importer import DEFAULT_VISION_MODEL
from backend.services.screenshot_importer import parse_screenshot_with_llm
from backend.services.screenshot_importer import confirm_import
from backend.services.insights_service import InsightError
from backend.services.insights_service import build_insights
from backend.services.retirement import build_retirement_plan
from backend.services.user_profile_registry import normalize_users_data
from backend.services.user_profile_registry import rewrite_user_profiles_with_order


BASE_DIR = Path(__file__).resolve().parent
USER_JSON_PATH = BASE_DIR / "json_data" / "user.json"
CSV_PATH = BASE_DIR / "csv_data" / "users_assets.csv"
LOGIN_CSV_PATH = BASE_DIR / "csv_data" / "users_login.csv"
ASSETS_CSV_PATH = BASE_DIR / "csv_data" / "users_assets.csv"
STOCK_LISTINGS_CACHE_PATH = BASE_DIR / "json_data" / "stock_listings_cache.json"
COMMON_COMMODITY_ETFS = {"GLD", "SLV", "IAU", "SIVR", "PPLT", "PALL"}
STOCK_MARKET_REFRESH_INTERVAL_SECONDS = 30 * 60

app = FastAPI(
    title="FinTech Wellness API",
    version="1.0.0",
    openapi_tags=[
        {"name": "Health", "description": "API health and readiness endpoints."},
        {"name": "Users", "description": "User retrieval endpoints."},
        {"name": "Recommendations", "description": "Personalized recommendation endpoints."},
        {"name": "Compatibility", "description": "User profile compatibility endpoints."},
        {"name": "Imports", "description": "Screenshot import and portfolio merge endpoints."},
        {"name": "Updates", "description": "Endpoints that run data update jobs."},
        {"name": "Market", "description": "Live market quote retrieval endpoints."},
        {"name": "Portfolio", "description": "User portfolio information endpoints."},
        {"name": "Retirement", "description": "Retirement planning and target allocation endpoints."},
    ],
)

rewrite_user_profiles_with_order(USER_JSON_PATH)


async def _run_stock_market_refresh() -> None:
    try:
        result = await asyncio.to_thread(api.refresh_stock_market_data)
        meta = result.get("_meta", {}) if isinstance(result, dict) else {}
        print(
            "[api] stock market refresh complete:",
            {
                "source": meta.get("source"),
                "ranked_count": meta.get("ranked_count"),
                "failed_count": meta.get("failed_count"),
            },
        )
    except Exception as exc:
        print(f"[api] stock market refresh failed: {exc}")


async def _stock_market_refresh_loop() -> None:
    await _run_stock_market_refresh()
    while True:
        await asyncio.sleep(STOCK_MARKET_REFRESH_INTERVAL_SECONDS)
        await _run_stock_market_refresh()


@app.on_event("startup")
async def startup_stock_market_refresh() -> None:
    app.state.stock_market_refresh_task = asyncio.create_task(_stock_market_refresh_loop())


@app.on_event("shutdown")
async def shutdown_stock_market_refresh() -> None:
    task = getattr(app.state, "stock_market_refresh_task", None)
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


def _safe_summary(result: Dict[str, Any]) -> Dict[str, Any]:
    user_count = len([k for k in result.keys() if not k.startswith("_")])
    return {
        "status": "ok",
        "user_count": user_count,
    }


def _read_users_data() -> Dict[str, Any]:
    with open(USER_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return normalize_users_data(data)


def _write_users_data(data: Dict[str, Any]) -> None:
    with open(USER_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(normalize_users_data(data), f, indent=2)


def _parse_market_query(query: str) -> Dict[str, str]:
    parts = [part.strip().upper() for part in query.split(",", maxsplit=1)]
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("query must be in format 'STOCK, SPY', 'CRYPTO, BTC', or 'COMMODITY, GOLD'")
    asset_type, ticker = parts
    if asset_type not in {"STOCK", "CRYPTO", "COMMODITY"}:
        raise ValueError("asset type must be STOCK, CRYPTO, or COMMODITY")
    return {"asset_type": asset_type, "ticker": ticker}


def _normalize_risk_profile(value: str) -> str:
    normalized = (value or "").strip().lower()
    mapping = {
        "low": "Low",
        "moderate": "Moderate",
        "medium": "Moderate",
        "high": "High",
    }
    if normalized not in mapping:
        raise ValueError("risk_appetite must be one of: Low, Moderate, High")
    return mapping[normalized]


class UserRiskUpdateRequest(BaseModel):
    user_id: str
    risk_profile: str = Field(
        validation_alias=AliasChoices("risk_profile", "risk_appetite", "risk_appetitie")
    )


class UserAgeUpdateRequest(BaseModel):
    user_id: str
    age: int = Field(..., ge=18, le=100)


class RetirementPlanRequest(BaseModel):
    retirement_age: int = Field(..., ge=19, le=100)
    monthly_expenses: float = Field(..., ge=0)
    essential_monthly_expenses: float = Field(..., ge=0)

class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class AssetResolveResponse(BaseModel):
    query: str
    symbol: str
    name: str
    category: str
    source: str


class InsightsResponse(BaseModel):
    type: str
    symbol: str
    name: str
    period: Dict[str, Any]
    metrics: Dict[str, Any]
    notable_moves: list[Dict[str, Any]]
    drivers: list[Dict[str, Any]]
    narrative: str
    tldr: list[str]
    conclusion: str
    disclaimer: str
    citations: list[Dict[str, Any]]
    warnings: list[str]

class CoinListingResponse(BaseModel):
    id: str
    name: str
    symbol: str
    image: str | None = None
    market_cap_rank: float | int | None = None
    current_price: float | int | None = None
    market_cap: float | int | None = None
    total_volume: float | int | None = None
    price_change_percentage_24h: float | int | None = None
    price_change_percentage_7d: float | int | None = None
    circulating_supply: float | int | None = None
    ath: float | int | None = None
    ath_change_percentage: float | int | None = None

class StockListingResponse(BaseModel):
    id: str
    name: str
    symbol: str
    current_price: float | int | None = None
    market_cap: float | int | None = None
    total_volume: float | int | None = None
    price_change_percentage_24h: float | int | None = None
    ath: float | int | None = None


class ScreenshotParseRequest(BaseModel):
    image_base64: str
    model: str = DEFAULT_VISION_MODEL
    page_text: str | None = None


class ScreenshotHolding(BaseModel):
    asset_class: str
    symbol: str
    qty: float | None = None
    avg_price: float | None = None
    current_price: float | None = None
    market_value: float | None = None
    name: str | None = None
    confidence: float | None = None


class ScreenshotConfirmRequest(BaseModel):
    import_id: str
    holdings: list[ScreenshotHolding]


class ScreenshotParseRequest(BaseModel):
    image_base64: str
    model: str = DEFAULT_VISION_MODEL
    page_text: str | None = None


class ScreenshotHolding(BaseModel):
    asset_class: str
    symbol: str
    qty: float | None = None
    avg_price: float | None = None
    current_price: float | None = None
    market_value: float | None = None
    name: str | None = None
    confidence: float | None = None


class ScreenshotConfirmRequest(BaseModel):
    import_id: str
    holdings: list[ScreenshotHolding]


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class AssetResolveResponse(BaseModel):
    query: str
    symbol: str
    name: str
    category: str
    source: str


class InsightsResponse(BaseModel):
    type: str
    symbol: str
    name: str
    period: Dict[str, Any]
    metrics: Dict[str, Any]
    notable_moves: list[Dict[str, Any]]
    drivers: list[Dict[str, Any]]
    narrative: str
    tldr: list[str]
    conclusion: str
    disclaimer: str
    citations: list[Dict[str, Any]]
    warnings: list[str]


@app.get("/health", tags=["Health"], summary="API health check")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get(
    "/api/assets/resolve",
    tags=["Market"],
    summary="Resolve a symbol to stock, crypto, commodity, or unknown",
    response_model=AssetResolveResponse,
)
async def resolve_asset_category(
    q: str = Query(..., description="Symbol or alias to resolve, e.g. AAPL, BTC, XAU"),
) -> AssetResolveResponse:
    result = await api.resolve_asset(q)
    return AssetResolveResponse(**result)


@app.get(
    "/api/insights",
    tags=["Market"],
    summary="Get historical analytics + grounded narrative for a symbol",
    response_model=InsightsResponse,
)
async def get_asset_insights(
    type: str = Query(..., description="One of: stock, crypto, commodity"),
    symbol: str = Query(..., description="Ticker/symbol to analyze"),
    months: int = Query(3, ge=1, le=24, description="Historical window in months"),
) -> InsightsResponse:
    try:
        result = await build_insights(asset_type=type, symbol=symbol, months=months)
        return InsightsResponse(**result)
    except InsightError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"insights failed: {exc}") from exc

@app.get(
    "/api/market/cryptos",
    tags=["Market"],
    summary="Get CoinGecko crypto listings in normalized format",
    response_model=list[StockListingResponse],
)
def get_crypto_listings(
    page: int = Query(1, ge=1, description="CoinGecko page number"),
    per_page: int = Query(50, ge=1, le=250, description="Items per page (max 250)"),
) -> list[StockListingResponse]:
    try:
        rows = api.fetch_coingecko_coin_listings(page=page, per_page=per_page)
        return [StockListingResponse(**row) for row in rows]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"coingecko fetch failed: {exc}") from exc

@app.get(
    "/api/market/stocks",
    tags=["Market"],
    summary="Get stock listings in normalized format",
    response_model=list[StockListingResponse],
)
def get_stock_listings(
    page: int = Query(1, ge=1, description="Stock page number"),
    per_page: int = Query(50, ge=1, le=250, description="Items per page (max 250)"),
) -> list[StockListingResponse]:
    try:
        rows = api.get_precomputed_stock_rankings(
            page=page,
            per_page=per_page,
        )
        return [StockListingResponse(**row) for row in rows]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        print(f"[api] stock fetch failed: {exc}")
        raise HTTPException(status_code=502, detail=f"stock fetch failed: {exc}") from exc


@app.post("/auth/register", tags=["Users"], summary="Register login user into users_login.csv")
def register_user(payload: RegisterRequest) -> Dict[str, Any]:
    try:
        result = api.register_login_user(
            login_csv_path=LOGIN_CSV_PATH,
            username=payload.username,
            password=payload.password,
        )
        api.add_default_user_profile(
            USER_JSON_PATH=USER_JSON_PATH,
            user_id=result["user_id"],
            name=result["username"],
        )
        api.add_default_assets_row(
            csv_path=ASSETS_CSV_PATH,
            user_id=result["user_id"],
            name=result["username"],
        )
        return {"status": "ok", "username": result["username"]}
    except api.RegisterValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except api.RegisterConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"register failed: {exc}") from exc


@app.post("/auth/login", tags=["Users"], summary="Authenticate a user")
def login(payload: LoginRequest) -> Dict[str, Any]:
    try:
        result = api.authenticate_login_user(
            login_csv_path=LOGIN_CSV_PATH,
            username=payload.username,
            password=payload.password,
        )
        return {"status": "ok", **result}
    except api.LoginValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except api.LoginNotFoundError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"login failed: {exc}") from exc


@app.get("/users", tags=["Users"], summary="Get all users")
def get_users() -> Dict[str, Any]:
    try:
        data = _read_users_data()
        users = {k: v for k, v in data.items() if not k.startswith("_")}
        return {"status": "ok", "count": len(users), "users": users}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read users failed: {exc}") from exc


@app.get("/users/{user_id}", tags=["Users"], summary="Get user by ID")
def get_user_by_id(user_id: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        return {"status": "ok", "user_id": user_id, "user": user}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read user failed: {exc}") from exc


@app.post(
    "/users/age",
    tags=["Users"],
    summary="Update user age",
)
def update_user_age(payload: UserAgeUpdateRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(payload.user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{payload.user_id}' not found")

        user["age"] = int(payload.age)
        users[payload.user_id] = user
        _write_users_data(users)
        return {
            "status": "ok",
            "user_id": payload.user_id,
            "age": user["age"],
            "user": user,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"age update failed: {exc}") from exc


@app.get(
    "/users/{user_id}/wellness",
    tags=["Users"],
    summary="Get wellness section by user ID",
)
def get_user_wellness_by_id(user_id: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        return {
            "status": "ok",
            "user_id": user_id,
            "wellness_metrics": user.get("wellness_metrics", {}),
            "risk_profile": user.get("risk_profile"),
            "financial_wellness_score": user.get("financial_wellness_score"),
            "financial_stress_index": user.get("financial_stress_index"),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read wellness failed: {exc}") from exc


@app.get(
    "/users/{user_id}/compatibility",
    tags=["Compatibility"],
    summary="Evaluate compatibility between user profile and target asset",
)
async def get_user_target_compatibility(
    user_id: str,
    target_type: str = Query(..., description="stock | crypto | commodity"),
    symbol: str = Query(..., description="Target symbol, e.g. SPY, BTC, GC=F"),
    model: str = Query("gpt-4.1-mini", description="OpenAI model for synthesis"),
) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        symbol_query = (symbol or "").strip().upper()
        resolve_query = symbol_query[:-4] if symbol_query.endswith("-USD") else symbol_query
        resolved = await api.resolve_asset(resolve_query)
        resolved_category = str(resolved.get("category", "unknown")).lower()

        result = evaluate_compatibility(
            user=user,
            target_type=target_type,
            symbol=symbol,
            resolved_category=resolved_category,
        )
        llm = synthesize_compatibility_with_llm(
            user_id=user_id,
            user=user,
            compatibility=result,
            model=model,
        )
        return {
            "status": "ok",
            "user_id": user_id,
            "risk_profile": user.get("risk_profile"),
            "financial_wellness_score": user.get("financial_wellness_score"),
            "financial_stress_index": user.get("financial_stress_index"),
            "resolved_asset": resolved,
            "llm_model": llm.get("model"),
            "llm_synthesis": llm.get("synthesis"),
            **result,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"compatibility synthesis failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"compatibility check failed: {exc}") from exc


@app.get(
    "/users/{user_id}/recommendations",
    tags=["Recommendations"],
    summary="Get rule-based recommendations by user ID",
)
def get_user_recommendations(
    user_id: str,
    limit: int = Query(3, ge=1, le=10, description="Maximum number of recommendation items"),
) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        result = api.generate_user_recommendations(user, limit=limit)
        return {"status": "ok", "user_id": user_id, **result}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read recommendations failed: {exc}") from exc


@app.get(
    "/users/{user_id}/recommendations/gpt",
    tags=["Recommendations"],
    summary="Get GPT-generated recommendations by user ID",
)
def get_user_recommendations_gpt(
    user_id: str,
    limit: int = Query(3, ge=1, le=10, description="Maximum number of recommendation items"),
    model: str = Query("gpt-4.1-mini", description="OpenAI model name"),
) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        rule_based = api.generate_user_recommendations(user, limit=limit)
        gpt_output = api.generate_gpt_recommendations(
            user_id=user_id,
            user=user,
            rule_based=rule_based,
            limit=limit,
            model=model,
        )
        return {
            "status": "ok",
            "user_id": user_id,
            "model": gpt_output["model"],
            "rule_based": rule_based,
            "gpt_recommendations": gpt_output["recommendations"],
        }
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"gpt recommendation failed: {exc}") from exc


@app.post(
    "/users/{user_id}/imports/screenshot/parse",
    tags=["Imports"],
    summary="Parse screenshot into holdings (stocks/cryptos/commodities)",
)
def parse_screenshot_import(user_id: str, payload: ScreenshotParseRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        if not isinstance(users.get(user_id), dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        parsed = parse_screenshot_with_llm(
            payload.image_base64,
            model=payload.model,
            page_text=payload.page_text,
        )
        pending = create_pending_import(user_id=user_id, parsed=parsed)
        return {
            "status": "ok",
            "user_id": user_id,
            "import_id": pending["import_id"],
            "parsed": pending["parsed"],
            "next_step": "Call /users/{user_id}/imports/screenshot/confirm with this import_id",
        }
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"screenshot parse failed: {exc}") from exc


@app.post(
    "/users/{user_id}/imports/screenshot/confirm",
    tags=["Imports"],
    summary="Confirm parsed screenshot holdings and merge into user portfolio",
)
async def confirm_screenshot_import(user_id: str, request: Request) -> Dict[str, Any]:
    try:
        body = await request.json()
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="request body must be a JSON object")

        import_id = body.get("import_id")
        holdings = body.get("holdings")
        if not isinstance(import_id, str) or not import_id.strip():
            raise HTTPException(status_code=400, detail="import_id is required")
        if not isinstance(holdings, list):
            raise HTTPException(status_code=400, detail="holdings must be an array")

        users = _read_users_data()
        if not isinstance(users.get(user_id), dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        override_holdings = holdings
        if len(override_holdings) == 0:
            raise HTTPException(
                status_code=400,
                detail="holdings array is empty; please provide at least one valid row",
            )
        result = confirm_import(
            import_id=import_id.strip(),
            user_id=user_id,
            users_data=users,
            override_holdings=override_holdings,
        )
        _write_users_data(users)
        diagnostics = {
            "received_holdings_count": len(override_holdings) if override_holdings is not None else None,
            "received_holdings_preview": (override_holdings or [])[:3],
            "raw_body_preview": {k: body.get(k) for k in ("import_id", "holdings")},
        }
        return {
            "status": "ok",
            "user_id": user_id,
            "import_id": result["import_id"],
            "import_status": result["status"],
            "merged_count": result["merged_count"],
            "skipped": result["skipped"],
            "portfolio_value": result["portfolio_value"],
            "total_balance": result["total_balance"],
            "net_worth": result["net_worth"],
            "portfolio": result["portfolio"],
            "diagnostics": diagnostics,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        preview = []
        if isinstance(locals().get("holdings"), list):
            preview = locals()["holdings"][:3]
        raise HTTPException(status_code=400, detail=f"{exc}; raw_holdings_preview={preview}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"screenshot confirm failed: {exc}") from exc


@app.post(
    "/users/risk",
    tags=["Users"],
    summary="Update user risk appetite and recalibrate scores",
)
def update_user_risk_and_recalibrate(payload: UserRiskUpdateRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(payload.user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{payload.user_id}' not found")

        user["risk_profile"] = _normalize_risk_profile(payload.risk_profile)
        wellness_result = api.calculate_user_wellness(user)
        user["wellness_metrics"] = wellness_result["wellness_metrics"]
        user["financial_wellness_score"] = wellness_result["financial_wellness_score"]
        user["financial_stress_index"] = wellness_result["financial_stress_index"]
        users[payload.user_id] = user
        _write_users_data(users)

        return {
            "status": "ok",
            "user_id": payload.user_id,
            "risk_profile": user["risk_profile"],
            "wellness_metrics": user["wellness_metrics"],
            "financial_wellness_score": user["financial_wellness_score"],
            "financial_stress_index": user["financial_stress_index"],
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"risk update failed: {exc}") from exc


@app.post(
    "/users/{user_id}/retirement",
    tags=["Retirement"],
    summary="Build a retirement plan using current profile, portfolio, and target retirement age",
)
def build_user_retirement_plan(user_id: str, payload: RetirementPlanRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        plan = build_retirement_plan(
            user=user,
            retirement_age=payload.retirement_age,
            monthly_expenses=payload.monthly_expenses,
            essential_monthly_expenses=payload.essential_monthly_expenses,
        )
        return {"status": "ok", "user_id": user_id, **plan}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"retirement plan failed: {exc}") from exc


@app.get(
    "/market/quote",
    tags=["Market"],
    summary="Get quote for STOCK, CRYPTO, or COMMODITY",
)
def get_market_quote(
    query: str = Query(
        ...,
        description="Format: STOCK, SPY or CRYPTO, BTC or COMMODITY, GOLD",
    ),
) -> Dict[str, Any]:
    try:
        parsed = _parse_market_query(query)
        asset_type = parsed["asset_type"]
        ticker = parsed["ticker"]

        if asset_type == "STOCK":
            price = api.fetch_latest_prices([ticker])[ticker]
            return {"status": "ok", "asset_type": asset_type, "symbol": ticker, "price": price}

        if asset_type == "CRYPTO":
            crypto_quote = api.fetch_crypto_price(ticker)
            return {
                "status": "ok",
                "asset_type": asset_type,
                "symbol": crypto_quote["symbol"],
                "price": crypto_quote["price"],
            }

        commodity_quote = api.fetch_commodity_price(ticker)
        return {
            "status": "ok",
            "asset_type": asset_type,
            "symbol": commodity_quote["symbol"],
            "price": commodity_quote["price"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"quote retrieval failed: {exc}") from exc


@app.get(
    "/portfolio/{user_id}",
    tags=["Portfolio"],
    summary="Get portfolio positions by user ID",
)
def get_portfolio_by_user_id(user_id: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        return {"status": "ok", "user_id": user_id, "portfolio": user.get("portfolio", [])}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read portfolio failed: {exc}") from exc


@app.get(
    "/portfolio/{user_id}/{asset_class}",
    tags=["Portfolio"],
    summary="Get portfolio positions by asset class (stocks, cryptos, commodities)",
)
def get_portfolio_by_asset_class(user_id: str, asset_class: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        bucket, positions = api.get_positions_by_asset_class(
            user=user,
            asset_class=asset_class,
            commodity_alias_symbols=api.COMMODITY_ALIAS_TO_SYMBOL.values(),
            common_commodity_etfs=COMMON_COMMODITY_ETFS,
        )

        return {
            "status": "ok",
            "user_id": user_id,
            "asset_class": bucket,
            "count": len(positions),
            "positions": positions,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read asset class failed: {exc}") from exc


@app.get("/update/assets", tags=["Updates"], summary="Update users' assets")
def update_assets() -> Dict[str, Any]:
    try:
        print("[api] /update/assets called")
        result = api.update_assets_file(str(USER_JSON_PATH), str(CSV_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"assets update failed: {exc}") from exc


@app.get("/update/prices", tags=["Updates"], summary="Update stock prices")
def update_prices() -> Dict[str, Any]:
    try:
        print("[api] /update/prices called")
        # Backward-compatible alias: portfolio prices only.
        result = api.update_stock_prices_file(str(USER_JSON_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"price update failed: {exc}") from exc


@app.get("/update/prices/portfolio", tags=["Updates"], summary="Update portfolio stock prices")
def update_portfolio_prices() -> Dict[str, Any]:
    try:
        print("[api] /update/prices/portfolio called")
        result = api.update_stock_prices_file(str(USER_JSON_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"portfolio price update failed: {exc}") from exc


@app.get("/update/prices/listings", tags=["Updates"], summary="Update stock listings cache prices")
def update_listing_cache_prices() -> Dict[str, Any]:
    try:
        print("[api] /update/prices/listings called")
        result = api.update_stock_listings_cache_prices_file(str(STOCK_LISTINGS_CACHE_PATH))
        symbols = result.get("symbols", {}) if isinstance(result, dict) else {}
        count = len(symbols) if isinstance(symbols, dict) else 0
        return {"status": "ok", "updated_symbols": count}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"listing cache price update failed: {exc}") from exc


@app.get(
    "/update/market/stocks",
    tags=["Updates"],
    summary="Ingest stock market snapshot and rebuild precomputed stock rankings",
)
def refresh_stock_market_rankings() -> Dict[str, Any]:
    try:
        print("[api] /update/market/stocks called")
        result = api.refresh_stock_market_data()
        meta = result.get("_meta", {}) if isinstance(result, dict) else {}
        return {
            "status": "ok",
            "source": meta.get("source"),
            "built_at_epoch": meta.get("built_at_epoch"),
            "ranked_count": meta.get("ranked_count"),
            "failed_count": meta.get("failed_count"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"stock market refresh failed: {exc}") from exc


@app.get(
    "/update/cache/listings/rebuild",
    tags=["Updates"],
    summary="Rebuild stock listings cache from Nasdaq screener universe",
)
def rebuild_listing_cache() -> Dict[str, Any]:
    try:
        print("[api] /update/cache/listings/rebuild called")
        result = api.rebuild_stock_listings_cache_from_nasdaq(str(STOCK_LISTINGS_CACHE_PATH))
        meta = result.get("_meta", {}) if isinstance(result, dict) else {}
        symbols = result.get("symbols", {}) if isinstance(result, dict) else {}
        count = len(symbols) if isinstance(symbols, dict) else 0
        return {
            "status": "ok",
            "rebuilt_symbols": count,
            "source": meta.get("source"),
            "rebuilt_at_epoch": meta.get("rebuilt_at_epoch"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"listing cache rebuild failed: {exc}") from exc


@app.get("/update/wellness", tags=["Updates"], summary="Update wellness metrics")
def update_wellness() -> Dict[str, Any]:
    try:
        print("[api] /update/wellness called")
        result = api.update_wellness_file(str(USER_JSON_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"wellness update failed: {exc}") from exc


@app.get("/update/all", tags=["Updates"], summary="Run full update pipeline")
def update_all() -> Dict[str, Any]:
    try:
        print("[api] /update/all called")
        api.update_assets_file(str(USER_JSON_PATH), str(CSV_PATH))
        api.update_stock_prices_file(str(USER_JSON_PATH))
        result = api.update_wellness_file(str(USER_JSON_PATH))
        print("[api] /update/all completed")
        summary = _safe_summary(result)
        summary["pipeline"] = ["assets", "prices", "wellness"]
        return summary
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"full update failed: {exc}") from exc
