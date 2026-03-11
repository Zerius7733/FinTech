import asyncio
from typing import Any, Dict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend import config, constants, market_helpers, portfolio_helpers, runtime
import backend.services.api_deps as services
import backend.services.user_sync_service as user_sync_service
import backend.stores.user_csv_store as user_csv_store
import backend.stores.user_json_store as user_json_store
from backend.routes import auth, health, imports, market, portfolio, recommendations, retirement, updates, users

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

ALLOWED_ORIGINS = config.parse_csv_env(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://localhost:8080,http://127.0.0.1:5173",
)
ALLOWED_ORIGIN_REGEX = config.build_allowed_origin_regex()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.build_router(youtube_url=constants.YOUTUBE_HELP_VIDEO_URL, embed_url=constants.YOUTUBE_HELP_EMBED_URL))

services.rewrite_user_profiles_with_order(constants.USER_JSON_PATH)
services.bootstrap_login_csv_from_assets_csv(constants.LOGIN_CSV_PATH, constants.ASSETS_CSV_PATH)
services.ensure_login_csv_schema(constants.LOGIN_CSV_PATH)


@app.on_event("startup")
async def startup_stock_market_refresh() -> None:
    app.state.stock_market_refresh_task = asyncio.create_task(runtime.market_refresh_loop())


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


app.include_router(
    auth.build_router(
        login_csv_path=constants.LOGIN_CSV_PATH,
        user_json_path=constants.USER_JSON_PATH,
        assets_csv_path=constants.ASSETS_CSV_PATH,
        next_available_user_id=user_json_store.next_available_user_id,
    )
)


app.include_router(
    market.build_router(
        enforce_insights_rate_limit=config.enforce_insights_rate_limit,
        fetch_market_quote=market_helpers.get_market_quote,
    )
)
app.include_router(
    recommendations.build_router(
        read_users_data=user_json_store.read_users_data,
    )
)
app.include_router(
    updates.build_router(
        safe_summary=_safe_summary,
    )
)
app.include_router(
    users.build_router(
        login_csv_path=constants.LOGIN_CSV_PATH,
        read_users_data=user_json_store.read_users_data,
        write_users_data=user_json_store.write_users_data,
        update_user_csv_profile=user_csv_store.update_user_csv_profile,
        read_user_csv_profile=user_csv_store.read_user_csv_profile,
        age_to_group=user_json_store.age_to_group,
        normalize_risk_profile=portfolio_helpers.normalize_risk_profile,
        ensure_financial_collections=portfolio_helpers.ensure_financial_collections,
        enrich_portfolio_with_ath=portfolio_helpers.enrich_portfolio_with_ath,
    )
)

app.include_router(
    retirement.build_router(
        read_users_data=user_json_store.read_users_data,
        read_user_csv_profile=user_csv_store.read_user_csv_profile,
    )
)


app.include_router(
    portfolio.build_router(
        read_users_data=user_json_store.read_users_data,
        write_users_data=user_json_store.write_users_data,
        ensure_financial_collections=portfolio_helpers.ensure_financial_collections,
        recalculate_user_financials=portfolio_helpers.recalculate_user_financials,
        normalize_manual_asset_category=portfolio_helpers.normalize_manual_asset_category,
        load_users_csv=user_csv_store.load_users_csv,
        write_users_csv=user_csv_store.write_users_csv,
        read_synced_account_balance_from_csv_row=user_csv_store.read_synced_account_balance_from_csv_row,
        apply_synced_csv_profile_to_user=user_sync_service.apply_synced_csv_profile_to_user,
        sync_user_to_assets_csv=user_csv_store.sync_user_to_assets_csv,
        fetch_market_quote=market_helpers.get_market_quote,
        read_user_portfolio_history=portfolio_helpers.read_user_portfolio_history,
        enrich_portfolio_with_ath=portfolio_helpers.enrich_portfolio_with_ath,
        user_portfolio_dir=constants.USER_PORTFOLIO_DIR,
        synced_account_balance_field=constants.SYNCED_ACCOUNT_BALANCE_FIELD,
        synced_balance_reload_count_field=constants.SYNCED_BALANCE_RELOAD_COUNT_FIELD,
    )
)

app.include_router(
    imports.build_router(
        read_users_data=user_json_store.read_users_data,
        write_users_data=user_json_store.write_users_data,
        recalculate_user_financials=portfolio_helpers.recalculate_user_financials,
        sync_user_to_assets_csv=user_csv_store.sync_user_to_assets_csv,
    )
)
