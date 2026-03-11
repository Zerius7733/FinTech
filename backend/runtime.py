import asyncio
from typing import Any

import backend.settings.constants as const
import backend.services.api_deps as services


async def run_stock_market_refresh() -> None:
    try:
        result = await asyncio.to_thread(services.refresh_stock_market_data)
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


async def run_commodity_market_refresh() -> None:
    try:
        result = await asyncio.to_thread(services.refresh_commodity_market_data)
        meta = result.get("_meta", {}) if isinstance(result, dict) else {}
        print(
            "[api] commodity market refresh complete:",
            {
                "source": meta.get("source"),
                "ranked_count": meta.get("ranked_count"),
                "failed_count": meta.get("failed_count"),
            },
        )
    except Exception as exc:
        print(f"[api] commodity market refresh failed: {exc}")


async def run_crypto_market_refresh() -> None:
    try:
        refreshed: list[dict[str, Any]] = []
        for page, per_page in const.CRYPTO_MARKET_REFRESH_TARGETS:
            rows = await asyncio.to_thread(
                services.refresh_coingecko_coin_listings,
                page,
                per_page,
            )
            refreshed.append({"page": page, "per_page": per_page, "count": len(rows)})
        print("[api] crypto market refresh complete:", refreshed)
    except Exception as exc:
        print(f"[api] crypto market refresh failed: {exc}")


async def market_refresh_loop() -> None:
    while True:
        await asyncio.sleep(const.STOCK_MARKET_REFRESH_INTERVAL_SECONDS)
        await run_stock_market_refresh()
        await run_commodity_market_refresh()
        await run_crypto_market_refresh()
