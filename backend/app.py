from typing import Any, Dict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend import routes , services , settings , stores

services.users.rewrite_user_profiles_with_order(settings.constants.USER_JSON_PATH)
if settings.constants.LOGIN_CSV_PATH != settings.constants.ASSETS_CSV_PATH:
    services.auth.bootstrap_login_csv_from_assets_csv(settings.constants.LOGIN_CSV_PATH, settings.constants.ASSETS_CSV_PATH)
services.auth.ensure_login_csv_schema(settings.constants.LOGIN_CSV_PATH)

ALLOWED_ORIGINS = settings.config.parse_csv_env("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://localhost:8080,http://127.0.0.1:5173")
ALLOWED_ORIGIN_REGEX = settings.config.build_allowed_origin_regex()

app = FastAPI( title="FinTech Wellness API", version="1.0.0", openapi_tags=settings.constants.OPENAPI_TAGS, description="API for FinTech Wellness app, providing market data, portfolio management, insights.")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_origin_regex=ALLOWED_ORIGIN_REGEX, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(routes.health.build_router(youtube_url=settings.constants.YOUTUBE_HELP_VIDEO_URL, embed_url=settings.constants.YOUTUBE_HELP_EMBED_URL))

def _safe_summary(result: Dict[str, Any]) -> Dict[str, Any]:
    user_count = len([k for k in result.keys() if not k.startswith("_")])
    return {
        "status": "ok",
        "user_count": user_count,
    }

@app.on_event("startup")
async def startup_stock_market_refresh() -> None:
    await services.runtime.start(app)

@app.on_event("shutdown")
async def shutdown_stock_market_refresh() -> None:
    await services.runtime.stop(app)

app.include_router(
    routes.updates.build_router(
        safe_summary=_safe_summary,
    )
)

app.include_router(
    routes.auth.build_router(
        user_store=stores.user_json_store,
        auth=services.auth,
        users=services.users,
        constants=settings.constants,
    )
)

app.include_router(
    routes.market.build_router(
        config=settings.config,
        market=services.market,
        insights=services.insights,
        coingecko=services.market,
    )
)
app.include_router(
    routes.recommendations.build_router(
        user_store=stores.user_json_store,
        recommendation=services.recommendation,
    )
)
app.include_router(
    routes.users.build_router(
        user_store=stores.user_json_store,
        csv_store=stores.user_csv_store,
        auth=services.auth,
        portfolio=services.portfolio,
        market=services.market,
        compatibility=services.compatibility,
        wellness=services.wealth_wellness,
        constants=settings.constants,
    )
)

app.include_router(
    routes.retirement.build_router(
        user_store=stores.user_json_store,
        csv_store=stores.user_csv_store,
        retirement=services.retirement,
    )
)

app.include_router(
    routes.portfolio.build_router(
        user_store=stores.user_json_store,
        csv_store=stores.user_csv_store,
        portfolio=services.portfolio,
        users=services.users,
        market=services.market,
        constants=settings.constants,
    )
)

app.include_router(
    routes.imports.build_router(
        user_store=stores.user_json_store,
        csv_store=stores.user_csv_store,
        portfolio=services.portfolio,
        imports=services.imports,
    )
)
