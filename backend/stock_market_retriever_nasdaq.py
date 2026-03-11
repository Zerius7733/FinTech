import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List

import requests
import yfinance as yf


NASDAQ_SCREENER_URL = "https://api.nasdaq.com/api/screener/stocks"
STOCK_CACHE_PATH = Path(__file__).resolve().parent / "data" / "json" / "stock_listings_cache.json"
NASDAQ_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://www.nasdaq.com",
    "Referer": "https://www.nasdaq.com/market-activity/stocks/screener",
    "User-Agent": "Mozilla/5.0",
}
NASDAQ_CHUNK_SIZE = 250
NASDAQ_MAX_RECORDS = 12000
MAX_PROVIDER_ATTEMPTS = 3
EXCLUDED_NAME_FRAGMENTS = (
    " ACQUISITION ",
    " ACQUISITION CORP",
    " ACQUISITION CORPORATION",
    " SPAC ",
    " WARRANT",
    " RIGHTS",
    " RIGHTS ",
    " UNIT",
    " UNITS",
    " TRUST",
    " ETF",
    " ETN",
    " FUND",
    " PREFERRED",
    " DEPOSITARY",
)
SUPPLEMENTAL_LARGE_CAP_SYMBOLS = [
    "LLY",
    "WMT",
    "XOM",
    "MA",
    "JNJ",
    "UNH",
    "ORCL",
    "PG",
    "HD",
    "COST",
    "NFLX",
    "ABBV",
    "KO",
    "BAC",
    "CVX",
    "MRK",
    "GE",
    "CRM",
    "TMUS",
    "MCD",
    "WFC",
    "LIN",
    "IBM",
    "PM",
    "ABT",
    "TMO",
    "RTX",
    "CAT",
    "PEP",
    "UNP",
    "NOW",
    "BKNG",
    "GS",
    "SCHW",
    "ISRG",
    "SPGI",
    "C",
    "PGR",
    "BLK",
    "LOW",
    "PLD",
]


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


def _is_common_stock(symbol: str, name: str) -> bool:
    normalized_name = f" {name.upper()} "
    for fragment in EXCLUDED_NAME_FRAGMENTS:
        if fragment in normalized_name:
            return False
    if symbol.endswith(("W", "WS", "R", "U")) and " ACQUISITION " in normalized_name:
        return False
    return True


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


def _request_nasdaq_rows(
    *,
    limit: int,
    offset: int,
    sort_column: str | None = None,
    sort_order: str | None = None,
    requests_module: Any,
) -> tuple[List[Dict[str, Any]], int | None]:
    last_exc: Exception | None = None
    for attempt in range(MAX_PROVIDER_ATTEMPTS):
        try:
            params = {
                "tableonly": "true",
                "limit": limit,
                "offset": offset,
                "download": "true",
            }
            if sort_column:
                params["sortColumn"] = sort_column
            if sort_order:
                params["sortOrder"] = sort_order
            response = requests_module.get(
                NASDAQ_SCREENER_URL,
                params=params,
                headers=NASDAQ_HEADERS,
                timeout=20,
            )
            response.raise_for_status()
            payload = response.json()
            data = payload.get("data", {})
            table = data.get("table", {})
            source_rows = table.get("rows", [])
            if not isinstance(source_rows, list):
                return [], None

            total_records = data.get("totalRecords")
            try:
                parsed_total = int(total_records) if total_records is not None else None
            except (TypeError, ValueError):
                parsed_total = None
            return source_rows, parsed_total
        except Exception as exc:
            last_exc = exc
            if attempt < MAX_PROVIDER_ATTEMPTS - 1:
                time.sleep(0.25 * (attempt + 1))
    if last_exc is not None:
        raise last_exc
    return [], None


def _normalize_nasdaq_rows(source_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized_rows: List[Dict[str, Any]] = []
    for row in source_rows:
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol", "")).upper().strip()
        if not symbol:
            continue
        name = str(row.get("name", symbol))
        if not _is_common_stock(symbol, name):
            continue

        current_price = _parse_compact_number(row.get("lastsale"))
        market_cap = _parse_compact_number(row.get("marketCap"))
        total_volume = _parse_compact_number(row.get("volume"))
        pct_24h = _parse_compact_number(row.get("pctchange"))

        normalized_rows.append(
            {
                "id": symbol.lower(),
                "name": name,
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
    return normalized_rows


def _fetch_all_nasdaq_rows(requests_module: Any) -> List[Dict[str, Any]]:
    seen_symbols: set[str] = set()
    aggregated_rows: List[Dict[str, Any]] = []
    offset = 0
    total_records: int | None = None

    while offset < NASDAQ_MAX_RECORDS:
        source_rows, total_records = _request_nasdaq_rows(
            limit=NASDAQ_CHUNK_SIZE,
            offset=offset,
            requests_module=requests_module,
        )
        if not source_rows:
            break

        normalized_batch = _normalize_nasdaq_rows(source_rows)
        added_in_batch = 0
        for row in normalized_batch:
            symbol = row["symbol"]
            if symbol in seen_symbols:
                continue
            seen_symbols.add(symbol)
            aggregated_rows.append(row)
            added_in_batch += 1

        if len(source_rows) < NASDAQ_CHUNK_SIZE:
            break
        if total_records is not None and len(aggregated_rows) >= total_records:
            break
        if added_in_batch == 0:
            break

        offset += NASDAQ_CHUNK_SIZE

    return aggregated_rows


def _fetch_top_nasdaq_rows(*, target_count: int, requests_module: Any) -> List[Dict[str, Any]]:
    rows_needed = max(target_count, NASDAQ_CHUNK_SIZE)
    source_rows, _ = _request_nasdaq_rows(
        limit=rows_needed,
        offset=0,
        sort_column="marketcap",
        sort_order="DESC",
        requests_module=requests_module,
    )
    return _normalize_nasdaq_rows(source_rows)


def _fetch_yfinance_row(symbol: str) -> Dict[str, Any] | None:
    last_exc: Exception | None = None
    for attempt in range(MAX_PROVIDER_ATTEMPTS):
        try:
            ticker = yf.Ticker(symbol)
            fast_info = getattr(ticker, "fast_info", {}) or {}
            info = ticker.info or {}

            price = fast_info.get("lastPrice") or fast_info.get("last_price")
            if price is None:
                price = info.get("regularMarketPrice") or info.get("currentPrice")

            market_cap = fast_info.get("marketCap")
            if market_cap is None:
                market_cap = info.get("marketCap")

            total_volume = (
                fast_info.get("lastVolume")
                or info.get("regularMarketVolume")
                or info.get("volume")
            )
            pct_24h = info.get("regularMarketChangePercent")
            ath = info.get("fiftyTwoWeekHigh")
            name = str(info.get("longName") or info.get("shortName") or symbol)

            market_cap_value = int(float(market_cap)) if market_cap is not None else None
            if market_cap_value is None:
                return None
            return {
                "id": symbol.lower(),
                "name": name,
                "symbol": symbol,
                "image": None,
                "market_cap_rank": None,
                "current_price": float(price) if price is not None else None,
                "market_cap": market_cap_value,
                "total_volume": int(float(total_volume)) if total_volume is not None else None,
                "price_change_percentage_24h": float(pct_24h) if pct_24h is not None else None,
                "price_change_percentage_7d": None,
                "circulating_supply": None,
                "ath": float(ath) if ath is not None else None,
                "ath_change_percentage": None,
            }
        except Exception as exc:
            last_exc = exc
            if attempt < MAX_PROVIDER_ATTEMPTS - 1:
                time.sleep(0.25 * (attempt + 1))
    if last_exc is not None:
        return None
    return None


def _supplement_missing_large_caps(
    ranked_rows: List[Dict[str, Any]],
    *,
    target_count: int,
) -> List[Dict[str, Any]]:
    if not ranked_rows:
        threshold = 0
    elif len(ranked_rows) >= target_count:
        threshold = ranked_rows[target_count - 1].get("market_cap") or 0
    else:
        threshold = ranked_rows[-1].get("market_cap") or 0

    existing_symbols = {row["symbol"] for row in ranked_rows}
    supplemental_rows: List[Dict[str, Any]] = []
    for symbol in SUPPLEMENTAL_LARGE_CAP_SYMBOLS:
        if symbol in existing_symbols:
            continue
        row = _fetch_yfinance_row(symbol)
        if row is None:
            continue
        if (row.get("market_cap") or 0) < threshold and len(ranked_rows) + len(supplemental_rows) >= target_count:
            continue
        supplemental_rows.append(row)

    if not supplemental_rows:
        return ranked_rows
    merged_by_symbol = {row["symbol"]: row for row in ranked_rows}
    for row in supplemental_rows:
        merged_by_symbol[row["symbol"]] = row
    return _rank_by_market_cap(list(merged_by_symbol.values()))


def _fill_missing_prices_with_yfinance(
    page_rows: List[Dict[str, Any]],
    raw_cache: Dict[str, Any] | None = None,
    *,
    max_passes: int = 3,
) -> bool:
    cache_changed = False
    for attempt in range(max_passes):
        missing_symbols = [row["symbol"] for row in page_rows if row.get("current_price") is None]
        if not missing_symbols:
            break
        for symbol in missing_symbols:
            try:
                ticker = yf.Ticker(symbol)
                fast_info = getattr(ticker, "fast_info", {}) or {}
                price = fast_info.get("lastPrice") or fast_info.get("last_price")
                if price is None:
                    info = ticker.info or {}
                    price = info.get("regularMarketPrice") or info.get("currentPrice")
                if price is None:
                    continue
                price_value = float(price)
            except Exception:
                continue

            for row in page_rows:
                if row["symbol"] == symbol:
                    row["current_price"] = price_value
                    break
            if raw_cache is not None:
                entry = raw_cache.get(symbol)
                if isinstance(entry, dict):
                    entry["current_price"] = price_value
                    cache_changed = True
        if attempt < max_passes - 1:
            time.sleep(0.1)
    return cache_changed


def _load_cached_ranked_rows(page: int, per_page: int) -> List[Dict[str, Any]]:
    if not STOCK_CACHE_PATH.exists():
        return []
    try:
        payload = json.loads(STOCK_CACHE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []

    raw = payload.get("symbols", {})
    if not isinstance(raw, dict):
        return []

    rows: List[Dict[str, Any]] = []
    for symbol, entry in raw.items():
        if not isinstance(entry, dict):
            continue
        normalized_symbol = str(symbol).strip().upper()
        if not normalized_symbol:
            continue
        rows.append(
            {
                "id": normalized_symbol.lower(),
                "name": str(entry.get("name", normalized_symbol)),
                "symbol": normalized_symbol,
                "image": None,
                "market_cap_rank": None,
                "current_price": entry.get("current_price"),
                "market_cap": entry.get("market_cap"),
                "total_volume": entry.get("total_volume"),
                "price_change_percentage_24h": entry.get("price_change_percentage_24h"),
                "price_change_percentage_7d": None,
                "circulating_supply": None,
                "ath": entry.get("ath"),
                "ath_change_percentage": entry.get("ath_change_percentage"),
            }
        )

    ranked = _rank_by_market_cap(rows)
    normalized_page = max(1, int(page))
    normalized_per_page = max(1, min(500, int(per_page)))
    start = (normalized_page - 1) * normalized_per_page
    end = start + normalized_per_page
    page_rows = ranked[start:end]
    cache_changed = _fill_missing_prices_with_yfinance(page_rows, raw)

    if cache_changed:
        try:
            STOCK_CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        except Exception:
            pass
    return page_rows


def rebuild_stock_listings_cache_from_nasdaq(
    path: str | None = None,
    requests_module: Any = requests,
) -> Dict[str, Any]:
    cache_path = Path(path) if path else STOCK_CACHE_PATH
    existing_symbols: Dict[str, Any] = {}
    if cache_path.exists():
        try:
            existing_payload = json.loads(cache_path.read_text(encoding="utf-8"))
            raw_existing = existing_payload.get("symbols", {})
            if isinstance(raw_existing, dict):
                existing_symbols = raw_existing
        except Exception:
            existing_symbols = {}

    rows = _fetch_all_nasdaq_rows(requests_module)
    if not rows:
        raise RuntimeError("Nasdaq screener returned no rows; cache rebuild aborted.")

    ranked = _rank_by_market_cap(rows)
    symbols_payload: Dict[str, Dict[str, Any]] = {}
    for row in ranked:
        symbol = row["symbol"]
        existing_entry = existing_symbols.get(symbol, {})
        if not isinstance(existing_entry, dict):
            existing_entry = {}

        entry = {
            "name": row.get("name") or existing_entry.get("name") or symbol,
            "current_price": row.get("current_price"),
            "market_cap": row.get("market_cap"),
            "total_volume": row.get("total_volume"),
            "price_change_percentage_24h": row.get("price_change_percentage_24h"),
            "ath": existing_entry.get("ath"),
            "ath_change_percentage": existing_entry.get("ath_change_percentage"),
            "market_cap_rank": row.get("market_cap_rank"),
            "source": "nasdaq",
        }
        symbols_payload[symbol] = entry

    payload = {
        "_meta": {
            "source": "nasdaq_screener",
            "symbol_count": len(symbols_payload),
            "rebuilt_at_epoch": int(time.time()),
        },
        "symbols": symbols_payload,
    }
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def fetch_stock_listings_from_nasdaq(
    page: int = 1,
    per_page: int = 100,
    all_listings: bool = False,
    requests_module: Any = requests,
) -> List[Dict[str, Any]]:
    normalized_page = max(1, int(page))
    normalized_per_page = max(1, min(500, int(per_page)))
    target_count = normalized_page * normalized_per_page
    if all_listings:
        normalized_rows = _fetch_top_nasdaq_rows(
            target_count=target_count,
            requests_module=requests_module,
        )
    else:
        source_rows, _ = _request_nasdaq_rows(
            limit=normalized_per_page,
            offset=(normalized_page - 1) * normalized_per_page,
            sort_column="marketcap",
            sort_order="DESC",
            requests_module=requests_module,
        )
        normalized_rows = _normalize_nasdaq_rows(source_rows)

    if not normalized_rows:
        raise RuntimeError("Nasdaq returned no usable stock rows.")

    ranked = _rank_by_market_cap(normalized_rows)
    ranked = _supplement_missing_large_caps(ranked, target_count=target_count)
    if len(ranked) < target_count:
        raise RuntimeError(
            f"Unable to assemble top {target_count} stocks from Nasdaq plus yfinance supplements."
        )
    if not all_listings:
        _fill_missing_prices_with_yfinance(ranked)
        return ranked
    start = (normalized_page - 1) * normalized_per_page
    end = start + normalized_per_page
    page_rows = ranked[start:end]
    _fill_missing_prices_with_yfinance(page_rows)
    return page_rows
