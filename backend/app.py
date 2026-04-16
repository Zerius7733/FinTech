from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import routes, settings
import backend.services.api_deps as api
import backend.services.auth as auth_services
import backend.services.compatibility as compatibility_services
import backend.services.imports as import_services
import backend.services.market as market_services
import backend.services.portfolio as portfolio_services
import backend.services.recommendation as recommendation_services
import backend.services.retirement as retirement_services
import backend.services.users as user_services
import backend.services.wealth_wellness as wellness_services
from backend.stores import user_csv_store, user_json_store


def _safe_summary(result: dict[str, Any]) -> dict[str, Any]:
    return {"status": "ok", "user_count": len([k for k in result.keys() if not k.startswith("_")])}


def _build_cors_options() -> dict[str, Any]:
    return {
        "allow_origins": settings.config.parse_csv_env(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://localhost:3000,http://localhost:8080,http://127.0.0.1:5173",
        ),
        "allow_origin_regex": settings.config.build_allowed_origin_regex(),
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }


def _prepare_persistence() -> None:
    if settings.constants.USER_JSON_PATH.exists():
        api.rewrite_user_profiles_with_order(settings.constants.USER_JSON_PATH)
    if settings.constants.LOGIN_CSV_PATH != settings.constants.ASSETS_CSV_PATH:
        api.bootstrap_login_csv_from_assets_csv(settings.constants.LOGIN_CSV_PATH, settings.constants.ASSETS_CSV_PATH)
    api.ensure_login_csv_schema(settings.constants.LOGIN_CSV_PATH)


def _register_lifecycle(app: FastAPI) -> None:
    @app.on_event("startup")
    async def startup_event() -> None:
        await api.runtime.start(app) if hasattr(api, "runtime") else None

    @app.on_event("shutdown")
    async def shutdown_event() -> None:
        await api.runtime.stop(app) if hasattr(api, "runtime") else None


def _include_router_modules(app: FastAPI) -> None:
    app.include_router(routes.health.build_router(youtube_url=settings.constants.YOUTUBE_HELP_VIDEO_URL, embed_url=settings.constants.YOUTUBE_HELP_EMBED_URL))
    app.include_router(routes.auth_extended.build_router(user_store=user_json_store, auth=api, constants=settings.constants))
    app.include_router(routes.market.build_router(config=settings.config, market=market_services, insights=api, coingecko=market_services, user_store=user_json_store, subscriptions=api))
    app.include_router(routes.market_extra.build_router(market=api))
    app.include_router(routes.users.build_router(user_store=user_json_store, csv_store=user_csv_store, auth=auth_services, portfolio=portfolio_services, market=market_services, compatibility=compatibility_services, wellness=wellness_services, constants=settings.constants))
    app.include_router(routes.account.build_router(user_store=user_json_store, auth=api))
    app.include_router(routes.portfolio.build_router(user_store=user_json_store, csv_store=user_csv_store, portfolio=portfolio_services, users=user_services, market=market_services, constants=settings.constants))
    app.include_router(routes.planning.build_router(user_store=user_json_store, planning=api))
    app.include_router(routes.recommendations.build_router(user_store=user_json_store, recommendation=recommendation_services))
    app.include_router(routes.retirement.build_router(user_store=user_json_store, csv_store=user_csv_store, retirement=retirement_services))
    app.include_router(routes.imports.build_router(user_store=user_json_store, csv_store=user_csv_store, portfolio=portfolio_services, imports=import_services))
    app.include_router(routes.updates.build_router(safe_summary=_safe_summary))


def create_app() -> FastAPI:
    _prepare_persistence()
    application = FastAPI(
        title="FinTech Wellness API",
        version="1.0.0",
        openapi_tags=settings.constants.OPENAPI_TAGS,
        description="API for FinTech Wellness app.",
    )
    application.add_middleware(CORSMiddleware, **_build_cors_options())
    _register_lifecycle(application)
    _include_router_modules(application)
    return application


app = create_app()
