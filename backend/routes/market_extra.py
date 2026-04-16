from typing import Any

from fastapi import APIRouter, HTTPException, Query


def build_router(*, market: Any) -> APIRouter:
    router = APIRouter()

    @router.get("/api/market/bonds", tags=["Market"], summary="Get bond listings in normalized format")
    def get_bonds(
        page: int = Query(1, ge=1, description="Bond page number"),
        per_page: int = Query(50, ge=1, le=250, description="Items per page (max 250)"),
    ) -> list[dict[str, Any]]:
        try:
            return market.get_precomputed_bond_rankings(page=page, per_page=per_page)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"bond fetch failed: {exc}") from exc

    @router.get("/api/market/real-assets", tags=["Market"], summary="Get real asset listings in normalized format")
    def get_real_assets(
        page: int = Query(1, ge=1, description="Real asset page number"),
        per_page: int = Query(50, ge=1, le=250, description="Items per page (max 250)"),
    ) -> list[dict[str, Any]]:
        try:
            return market.get_precomputed_real_asset_rankings(page=page, per_page=per_page)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"real asset fetch failed: {exc}") from exc

    return router
