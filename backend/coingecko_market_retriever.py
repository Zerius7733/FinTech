import json
import time
from pathlib import Path
from typing import Any, Dict, List

import requests
from requests import Response
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


COINGECKO_MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets"
_CACHE_PATH = Path(__file__).resolve().parent / "json_data" / "coingecko_markets_cache.json"
_DEFAULT_MAX_STALE_SECONDS = 24 * 60 * 60
_DEFAULT_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "FinTechWellnessAPI/1.0 (+https://localhost)",
}


def _build_session() -> requests.Session:
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        status=3,
        status_forcelist=(429, 500, 502, 503, 504),
        backoff_factor=0.5,
        allowed_methods=frozenset({"GET"}),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def _to_number(value: Any) -> float | int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def _cache_key(page: int, per_page: int) -> str:
    return f"{page}:{per_page}"


def _load_cached(page: int, per_page: int, max_stale_seconds: int) -> List[Dict[str, Any]] | None:
    try:
        if not _CACHE_PATH.exists():
            return None
        with open(_CACHE_PATH, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            return None
        entries = payload.get("entries")
        if not isinstance(entries, dict):
            return None
        entry = entries.get(_cache_key(page, per_page))
        if not isinstance(entry, dict):
            return None
        fetched_at = float(entry.get("fetched_at", 0))
        rows = entry.get("rows")
        if not isinstance(rows, list):
            return None
        if time.time() - fetched_at > max_stale_seconds:
            return None
        return rows
    except Exception:
        return None


def _save_cache(page: int, per_page: int, rows: List[Dict[str, Any]]) -> None:
    try:
        _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload: Dict[str, Any] = {"entries": {}}
        if _CACHE_PATH.exists():
            with open(_CACHE_PATH, "r", encoding="utf-8") as f:
                existing = json.load(f)
            if isinstance(existing, dict) and isinstance(existing.get("entries"), dict):
                payload = existing
        payload.setdefault("entries", {})
        payload["entries"][_cache_key(page, per_page)] = {
            "fetched_at": time.time(),
            "rows": rows,
        }
        with open(_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
    except Exception:
        # Best-effort cache writes; don't fail API responses for cache issues.
        return


def fetch_coingecko_coin_listings(
    page: int = 1,
    per_page: int = 50,
    requests_module: Any = requests,
    max_stale_seconds: int = _DEFAULT_MAX_STALE_SECONDS,
) -> List[Dict[str, Any]]:
    normalized_page = max(1, int(page))
    normalized_per_page = max(1, min(250, int(per_page)))

    params = {
        "vs_currency": "usd",
        "order": "market_cap_desc",
        "per_page": normalized_per_page,
        "page": normalized_page,
        "sparkline": "false",
        "price_change_percentage": "24h,7d",
    }
    response: Response | None = None
    last_error: Exception | None = None

    try:
        # requests_module is injectable for tests; use direct get if it is a mock/module.
        if requests_module is requests:
            session = _build_session()
            try:
                for attempt in range(1, 4):
                    try:
                        response = session.get(
                            COINGECKO_MARKETS_URL,
                            params=params,
                            headers=_DEFAULT_HEADERS,
                            timeout=12,
                        )
                        response.raise_for_status()
                        break
                    except requests.RequestException as exc:
                        last_error = exc
                        if attempt == 3:
                            raise
                        time.sleep(0.35 * attempt)
            finally:
                session.close()
        else:
            response = requests_module.get(
                COINGECKO_MARKETS_URL,
                params=params,
                timeout=12,
            )
            response.raise_for_status()
    except Exception as exc:
        cached = _load_cached(
            page=normalized_page,
            per_page=normalized_per_page,
            max_stale_seconds=max_stale_seconds,
        )
        if cached is not None:
            return cached
        raise RuntimeError(
            "CoinGecko request failed and no recent cached market list is available"
        ) from exc

    if response is None:
        if last_error is not None:
            raise RuntimeError(f"CoinGecko request failed after retries: {last_error}") from last_error
        raise RuntimeError("CoinGecko request failed before receiving a response")

    payload = response.json()
    if not isinstance(payload, list):
        raise RuntimeError("Unexpected CoinGecko response: expected a list")

    normalized: List[Dict[str, Any]] = []
    for coin in payload:
        if not isinstance(coin, dict):
            continue
        normalized.append(
            {
                "id": str(coin.get("id", "")),
                "name": str(coin.get("name", "")),
                "symbol": str(coin.get("symbol", "")),
                "image": coin.get("image"),
                "market_cap_rank": _to_number(coin.get("market_cap_rank")),
                "current_price": _to_number(coin.get("current_price")),
                "market_cap": _to_number(coin.get("market_cap")),
                "total_volume": _to_number(coin.get("total_volume")),
                "price_change_percentage_24h": _to_number(coin.get("price_change_percentage_24h")),
                "price_change_percentage_7d": _to_number(
                    coin.get("price_change_percentage_7d_in_currency")
                ),
                "circulating_supply": _to_number(coin.get("circulating_supply")),
                "ath": _to_number(coin.get("ath")),
                "ath_change_percentage": _to_number(coin.get("ath_change_percentage")),
            }
        )

    _save_cache(page=normalized_page, per_page=normalized_per_page, rows=normalized)
    return normalized
