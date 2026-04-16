from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

import backend.api_models as models


def build_router(
    *,
    config: Any,
    market: Any,
    insights: Any,
    coingecko: Any,
    user_store: Any | None = None,
    subscriptions: Any | None = None,
) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/api/assets/resolve",
        tags=["Market"],
        summary="Resolve a symbol to stock, crypto, commodity, or unknown",
        response_model=models.AssetResolveResponse,
    )
    async def resolve_asset_category(
        q: str = Query(..., description="Symbol or alias to resolve, e.g. AAPL, BTC, XAU"),
    ) -> models.AssetResolveResponse:
        result = await market.resolve_asset(q)
        return models.AssetResolveResponse(**result)

    @router.get(
        "/api/insights",
        tags=["Market"],
        summary="Get historical analytics + grounded narrative for a symbol",
        response_model=models.InsightsResponse,
    )
    async def get_asset_insights(
        request: Request,
        type: str = Query(..., description="One of: stock, crypto, commodity"),
        symbol: str = Query(..., description="Ticker/symbol to analyze"),
        months: int = Query(3, ge=1, le=24, description="Historical window in months"),
        user_id: str | None = Query(None, description="Optional user id for rate limiting"),
    ) -> models.InsightsResponse:
        try:
            rate_subject = f"user:{user_id}" if user_id else f"ip:{getattr(request.client, 'host', 'unknown')}"
            config.enforce_insights_rate_limit(rate_subject)
            if user_id and user_store is not None and subscriptions is not None:
                user = user_store.read_users_data().get(user_id)
                if not isinstance(user, dict):
                    raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
                if not subscriptions.is_premium_subscription(user.get("subscription_plan")):
                    raise HTTPException(
                        status_code=402,
                        detail={
                            "message": "Market insights are available on Premium.",
                            "upgrade_url": "/pricing",
                            "required_plan": "premium",
                        },
                    )
            result = await insights.build_insights(asset_type=type, symbol=symbol, months=months)
            return models.InsightsResponse(**result)
        except insights.InsightError as exc:
            detail = str(exc)
            if detail == "price data not found":
                detail = (
                    f"price data not found for type='{type}', symbol='{symbol}', months={months}. "
                    "Check the type/symbol pair, e.g. stock:AAPL, crypto:BTC, commodity:GOLD."
                )
            raise HTTPException(status_code=exc.status_code, detail=detail) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"insights failed: {exc}") from exc

    @router.get(
        "/api/market/cryptos",
        tags=["Market"],
        summary="Get CoinGecko crypto listings in normalized format",
        response_model=list[models.StockListingResponse],
    )
    def get_crypto_listings(
        page: int = Query(1, ge=1, description="CoinGecko page number"),
        per_page: int = Query(50, ge=1, le=250, description="Items per page (max 250)"),
    ) -> list[models.StockListingResponse]:
        try:
            cached = coingecko.load_cached_coingecko_coin_listings(page=page, per_page=per_page)
            if cached is not None:
                return [models.StockListingResponse(**row) for row in cached]
            rows = coingecko.fetch_coingecko_coin_listings(page=page, per_page=per_page)
            return [models.StockListingResponse(**row) for row in rows]
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"coingecko fetch failed: {exc}") from exc

    @router.get(
        "/api/market/stocks",
        tags=["Market"],
        summary="Get stock listings in normalized format",
        response_model=list[models.StockListingResponse],
    )
    def get_stock_listings(
        page: int = Query(1, ge=1, description="Stock page number"),
        per_page: int = Query(50, ge=1, le=250, description="Items per page (max 250)"),
    ) -> list[models.StockListingResponse]:
        try:
            rows = market.get_precomputed_stock_rankings(
                page=page,
                per_page=per_page,
            )
            return [models.StockListingResponse(**row) for row in rows]
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            print(f"[api] stock fetch failed: {exc}")
            raise HTTPException(status_code=502, detail=f"stock fetch failed: {exc}") from exc

    @router.get(
        "/api/market/commodities",
        tags=["Market"],
        summary="Get commodity listings in normalized format",
        response_model=list[models.CoinListingResponse],
    )
    def get_commodity_listings(
        page: int = Query(1, ge=1, description="Commodity page number"),
        per_page: int = Query(50, ge=1, le=250, description="Items per page (max 250)"),
    ) -> list[models.CoinListingResponse]:
        try:
            rows = market.get_precomputed_commodity_rankings(
                page=page,
                per_page=per_page,
            )
            return [models.CoinListingResponse(**row) for row in rows]
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            print(f"[api] commodity fetch failed: {exc}")
            raise HTTPException(status_code=502, detail=f"commodity fetch failed: {exc}") from exc

    @router.get(
        "/market/quote",
        tags=["Market"],
        summary="Get quote for STOCK, CRYPTO, or COMMODITY",
    )
    def get_market_quote(
        query: str = Query(
            ...,
            description="Format: STOCK, SPY or CRYPTO, BTC or COMMODITY, GOLD",
        ),
    ) -> dict[str, Any]:
        try:
            return market.get_market_quote(query)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"quote retrieval failed: {exc}") from exc

    @router.post(
        "/api/market/refresh-symbol",
        tags=["Market"],
        summary="Refresh one cached market symbol and persist it to JSON cache",
    )
    def refresh_market_symbol(
        type: str = Query(..., description="One of: stock, crypto, commodity"),
        symbol: str = Query(..., description="Ticker/symbol to refresh"),
    ) -> dict[str, Any]:
        normalized_type = str(type or "").strip().lower()
        normalized_symbol = str(symbol or "").strip()
        if normalized_type not in {"stock", "crypto", "commodity"}:
            raise HTTPException(status_code=400, detail="type must be one of: stock, crypto, commodity")
        if not normalized_symbol:
            raise HTTPException(status_code=400, detail="symbol cannot be empty")

        try:
            if normalized_type == "stock":
                item = market.refresh_stock_market_symbol(normalized_symbol)
            elif normalized_type == "commodity":
                item = market.refresh_commodity_market_symbol(normalized_symbol)
            else:
                item = market.refresh_cached_coingecko_symbol(normalized_symbol)
            return {"status": "ok", "type": normalized_type, "symbol": normalized_symbol, "item": item}
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"symbol refresh failed: {exc}") from exc

    return router
