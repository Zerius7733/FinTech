from typing import Any

import backend.services.api_deps as api


def parse_market_query(query: str) -> dict[str, str]:
    parts = [part.strip().upper() for part in query.split(",", maxsplit=1)]
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("query must be in format 'STOCK, SPY', 'CRYPTO, BTC', or 'COMMODITY, GOLD'")
    asset_type, ticker = parts
    if asset_type not in {"STOCK", "CRYPTO", "COMMODITY"}:
        raise ValueError("asset type must be STOCK, CRYPTO, or COMMODITY")
    return {"asset_type": asset_type, "ticker": ticker}


def get_market_quote(query: str) -> dict[str, Any]:
    parsed = parse_market_query(query)
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
