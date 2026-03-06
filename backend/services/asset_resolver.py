import asyncio
import time
from typing import Any, Dict, Optional

import requests
import yfinance as yf


COMMODITIES = {
    "XAU": "Gold",
    "GOLD": "Gold",
    "XAG": "Silver",
    "SILVER": "Silver",
    "CL": "Crude Oil",
    "BRENT": "Brent Oil",
    "NG": "Natural Gas",
}


class TTLCache:
    def __init__(self, ttl_seconds: int = 300) -> None:
        self.ttl_seconds = ttl_seconds
        self._store: Dict[str, tuple[float, Dict[str, Any]]] = {}

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        payload = self._store.get(key)
        if not payload:
            return None
        expires_at, value = payload
        if time.time() >= expires_at:
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Dict[str, Any]) -> None:
        self._store[key] = (time.time() + self.ttl_seconds, value)


asset_resolver_cache = TTLCache(ttl_seconds=300)


def _resolve_commodity(symbol: str) -> Optional[Dict[str, Any]]:
    name = COMMODITIES.get(symbol)
    if not name:
        return None
    return {
        "symbol": symbol,
        "name": name,
        "category": "commodity",
        "source": "local_mapping",
    }


def _resolve_crypto_coingecko(symbol: str) -> Optional[Dict[str, Any]]:
    response = requests.get(
        "https://api.coingecko.com/api/v3/search",
        params={"query": symbol.lower()},
        timeout=4,
    )
    response.raise_for_status()
    payload = response.json()
    coins = payload.get("coins", [])
    if not isinstance(coins, list):
        return None

    exact = None
    for coin in coins:
        coin_symbol = str(coin.get("symbol", "")).upper()
        if coin_symbol == symbol:
            exact = coin
            break

    if not exact:
        return None

    return {
        "symbol": str(exact.get("symbol", symbol)).upper(),
        "name": str(exact.get("name", "")) or symbol,
        "category": "crypto",
        "source": "coingecko",
    }


def _resolve_stock_yfinance(symbol: str) -> Optional[Dict[str, Any]]:
    ticker = yf.Ticker(symbol)
    info = ticker.info or {}
    short_name = info.get("shortName") or info.get("longName") or info.get("displayName")
    quote_type = str(info.get("quoteType", "")).lower()
    if short_name and quote_type in {"equity", "etf", "mutualfund", "index"}:
        return {
            "symbol": symbol,
            "name": str(short_name),
            "category": "stock",
            "source": "yfinance",
        }
    return None


async def resolve_asset(query: str) -> Dict[str, Any]:
    symbol = (query or "").strip().upper()
    if not symbol:
        return {
            "query": query,
            "symbol": "",
            "name": "",
            "category": "unknown",
            "source": "none",
        }

    cached = asset_resolver_cache.get(symbol)
    if cached:
        return {"query": symbol, **cached}

    # Commodity first to avoid false positives for aliases like GOLD/CL.
    commodity = _resolve_commodity(symbol)
    if commodity:
        asset_resolver_cache.set(symbol, commodity)
        return {"query": symbol, **commodity}

    try:
        crypto = await asyncio.to_thread(_resolve_crypto_coingecko, symbol)
    except Exception:
        crypto = None
    if crypto:
        asset_resolver_cache.set(symbol, crypto)
        return {"query": symbol, **crypto}

    try:
        stock = await asyncio.to_thread(_resolve_stock_yfinance, symbol)
    except Exception:
        stock = None
    if stock:
        asset_resolver_cache.set(symbol, stock)
        return {"query": symbol, **stock}

    unknown = {
        "symbol": symbol,
        "name": symbol,
        "category": "unknown",
        "source": "none",
    }
    asset_resolver_cache.set(symbol, unknown)
    return {"query": symbol, **unknown}
