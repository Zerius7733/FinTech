import re
from typing import Any, Dict, List

import requests


NASDAQ_SCREENER_URL = "https://api.nasdaq.com/api/screener/stocks"
NASDAQ_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://www.nasdaq.com",
    "Referer": "https://www.nasdaq.com/market-activity/stocks/screener",
    "User-Agent": "Mozilla/5.0",
}


def _parse_compact_number(text: Any) -> float | None:
    if text is None:
        return None
    s = str(text).strip()
    if not s or s.lower() in {"n/a", "na", "--"}:
        return None
    s = s.replace("$", "").replace(",", "").replace("%", "").strip()
    match = re.fullmatch(r"([-+]?\d*\.?\d+)\s*([KMBTkmbt]?)", s)
    if not match:
        try:
            return float(s)
        except ValueError:
            return None
    value = float(match.group(1))
    suffix = match.group(2).upper()
    factor = {"": 1.0, "K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}[suffix]
    return value * factor


def _rank_by_market_cap(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ranked = sorted(rows, key=lambda x: x.get("market_cap") or 0, reverse=True)
    rank = 0
    for item in ranked:
        if item.get("market_cap") is None:
            item["market_cap_rank"] = None
            continue
        rank += 1
        item["market_cap_rank"] = rank
    return ranked


def fetch_stock_listings_from_nasdaq(
    page: int = 1,
    per_page: int = 100,
    all_listings: bool = False,
    requests_module: Any = requests,
) -> List[Dict[str, Any]]:
    normalized_page = max(1, int(page))
    normalized_per_page = max(1, min(500, int(per_page)))
    limit = 10000 if all_listings else normalized_per_page
    offset = 0 if all_listings else (normalized_page - 1) * normalized_per_page

    response = requests_module.get(
        NASDAQ_SCREENER_URL,
        params={
            "tableonly": "true",
            "limit": limit,
            "offset": offset,
            "download": "true",
        },
        headers=NASDAQ_HEADERS,
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()

    source_rows = payload.get("data", {}).get("table", {}).get("rows", [])
    if not isinstance(source_rows, list):
        raise RuntimeError("Unexpected NASDAQ screener response format")

    normalized_rows: List[Dict[str, Any]] = []
    for row in source_rows:
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol", "")).upper().strip()
        if not symbol:
            continue

        current_price = _parse_compact_number(row.get("lastsale"))
        market_cap = _parse_compact_number(row.get("marketCap"))
        total_volume = _parse_compact_number(row.get("volume"))
        pct_24h = _parse_compact_number(row.get("pctchange"))

        normalized_rows.append(
            {
                "id": symbol.lower(),
                "name": str(row.get("name", symbol)),
                "symbol": symbol,
                "image": None,
                "market_cap_rank": None,
                "current_price": current_price,
                "market_cap": int(market_cap) if market_cap is not None else None,
                "total_volume": int(total_volume) if total_volume is not None else None,
                "price_change_percentage_24h": pct_24h,
                "price_change_percentage_7d": None,
                "circulating_supply": None,
                "ath": None,
                "ath_change_percentage": None,
            }
        )

    return _rank_by_market_cap(normalized_rows)

