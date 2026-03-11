from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, HTTPException

import backend.constants as const
import backend.services.api_deps as api


def build_router(*, safe_summary: Callable[[dict[str, Any]], dict[str, Any]]) -> APIRouter:
    router = APIRouter()

    @router.get("/update/assets", tags=["Updates"], summary="Update users' assets")
    def update_assets() -> dict[str, Any]:
        try:
            print("[api] /update/assets called")
            result = api.update_assets_file(str(const.USER_JSON_PATH), str(const.CSV_PATH))
            return safe_summary(result)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"assets update failed: {exc}") from exc

    @router.get("/update/prices", tags=["Updates"], summary="Update stock prices")
    def update_prices() -> dict[str, Any]:
        try:
            print("[api] /update/prices called")
            result = api.update_stock_prices_file(str(const.USER_JSON_PATH))
            return safe_summary(result)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"price update failed: {exc}") from exc

    @router.get("/update/prices/portfolio", tags=["Updates"], summary="Update portfolio stock prices")
    def update_portfolio_prices() -> dict[str, Any]:
        try:
            print("[api] /update/prices/portfolio called")
            result = api.update_stock_prices_file(str(const.USER_JSON_PATH))
            return safe_summary(result)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"portfolio price update failed: {exc}") from exc

    @router.get("/update/prices/listings", tags=["Updates"], summary="Update stock listings cache prices")
    def update_listing_cache_prices() -> dict[str, Any]:
        try:
            print("[api] /update/prices/listings called")
            result = api.update_stock_listings_cache_prices_file(str(const.STOCK_LISTINGS_CACHE_PATH))
            symbols = result.get("symbols", {}) if isinstance(result, dict) else {}
            count = len(symbols) if isinstance(symbols, dict) else 0
            return {"status": "ok", "updated_symbols": count}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"listing cache price update failed: {exc}") from exc

    @router.get(
        "/update/market/stocks",
        tags=["Updates"],
        summary="Ingest stock market snapshot and rebuild precomputed stock rankings",
    )
    def refresh_stock_market_rankings() -> dict[str, Any]:
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

    @router.get(
        "/update/market/commodities",
        tags=["Updates"],
        summary="Ingest commodity market snapshot and rebuild precomputed commodity rankings",
    )
    def refresh_commodity_market_rankings() -> dict[str, Any]:
        try:
            print("[api] /update/market/commodities called")
            result = api.refresh_commodity_market_data()
            meta = result.get("_meta", {}) if isinstance(result, dict) else {}
            return {
                "status": "ok",
                "source": meta.get("source"),
                "built_at_epoch": meta.get("built_at_epoch"),
                "ranked_count": meta.get("ranked_count"),
                "failed_count": meta.get("failed_count"),
            }
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"commodity market refresh failed: {exc}") from exc

    @router.get(
        "/update/cache/listings/rebuild",
        tags=["Updates"],
        summary="Rebuild stock listings cache from Nasdaq screener universe",
    )
    def rebuild_listing_cache() -> dict[str, Any]:
        try:
            print("[api] /update/cache/listings/rebuild called")
            result = api.rebuild_stock_listings_cache_from_nasdaq(str(const.STOCK_LISTINGS_CACHE_PATH))
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

    @router.get("/update/wellness", tags=["Updates"], summary="Update wellness metrics")
    def update_wellness() -> dict[str, Any]:
        try:
            print("[api] /update/wellness called")
            result = api.update_wellness_file(str(const.USER_JSON_PATH))
            return safe_summary(result)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"wellness update failed: {exc}") from exc

    @router.get("/update/all", tags=["Updates"], summary="Run full update pipeline")
    def update_all() -> dict[str, Any]:
        try:
            print("[api] /update/all called")
            api.update_assets_file(str(const.USER_JSON_PATH), str(const.CSV_PATH))
            api.update_stock_prices_file(str(const.USER_JSON_PATH))
            result = api.update_wellness_file(str(const.USER_JSON_PATH))
            print("[api] /update/all completed")
            summary = safe_summary(result)
            summary["pipeline"] = ["assets", "prices", "wellness"]
            return summary
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"full update failed: {exc}") from exc

    return router
