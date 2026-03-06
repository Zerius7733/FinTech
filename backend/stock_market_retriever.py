import csv
import json
import time
from pathlib import Path
from typing import Any, Dict, List

import yfinance as yf


DEFAULT_STOCK_SYMBOLS = [
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "GOOGL",
    "META",
    "TSLA",
    "BRK-B",
    "JPM",
    "V",
]
DEFAULT_SYMBOLS_TXT_PATH = (
    Path(__file__).resolve().parent / "knowledge_base" / "stocks_symbols" / "nasdaqlisted.txt"
)
STOCK_CACHE_PATH = Path(__file__).resolve().parent / "json_data" / "stock_listings_cache.json"
MAX_PROVIDER_ATTEMPTS = 3
YFINANCE_FETCH_MULTIPLIER = 4


def _log(msg: str) -> None:
    print(f"[stocks] {msg}")


def _load_cache() -> Dict[str, Dict[str, Any]]:
    try:
        if not STOCK_CACHE_PATH.exists():
            return {}
        with open(STOCK_CACHE_PATH, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            return {}
        raw = payload.get("symbols")
        if not isinstance(raw, dict):
            return {}
        cache: Dict[str, Dict[str, Any]] = {}
        for key, value in raw.items():
            if isinstance(key, str) and isinstance(value, dict):
                cache[key.upper()] = value
        return cache
    except Exception as exc:
        _log(f"cache load failed: {exc}")
        return {}


def _save_cache(cache: Dict[str, Dict[str, Any]]) -> None:
    try:
        STOCK_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(STOCK_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump({"symbols": cache}, f, indent=2)
    except Exception as exc:
        _log(f"cache save failed: {exc}")


def _pick(primary: Any, fallback: Any) -> Any:
    return primary if primary is not None else fallback


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _extract_price(info: Dict[str, Any], fast_info: Dict[str, Any]) -> float | None:
    for key in ("lastPrice", "last_price"):
        val = _safe_float(fast_info.get(key))
        if val is not None:
            return val
    for key in ("regularMarketPrice", "currentPrice"):
        val = _safe_float(info.get(key))
        if val is not None:
            return val
    return None


def _extract_market_cap(info: Dict[str, Any], fast_info: Dict[str, Any]) -> int | None:
    return _safe_int(fast_info.get("marketCap")) or _safe_int(info.get("marketCap"))


def _extract_volume(info: Dict[str, Any], fast_info: Dict[str, Any]) -> int | None:
    return (
        _safe_int(fast_info.get("lastVolume"))
        or _safe_int(info.get("regularMarketVolume"))
        or _safe_int(info.get("volume"))
    )


def _extract_change_percent(info: Dict[str, Any], price: float | None) -> float | None:
    val = _safe_float(info.get("regularMarketChangePercent"))
    if val is not None:
        return val
    previous_close = _safe_float(info.get("regularMarketPreviousClose")) or _safe_float(
        info.get("previousClose")
    )
    if price is None or previous_close in (None, 0):
        return None
    return ((price - previous_close) / previous_close) * 100


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


def _slice_symbols(symbols: List[str], page: int, per_page: int) -> List[str]:
    normalized_page = max(1, int(page))
    normalized_per_page = max(1, min(500, int(per_page)))
    start = (normalized_page - 1) * normalized_per_page
    end = start + normalized_per_page
    return symbols[start:end]


def _load_symbols_from_csv(symbols_csv_path: str) -> List[str]:
    symbols: List[str] = []
    with open(symbols_csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError("symbols csv is missing a header row")
        lowered = {name.lower(): name for name in reader.fieldnames}
        symbol_col = lowered.get("symbol") or lowered.get("ticker")
        if not symbol_col:
            raise ValueError("symbols csv must include a 'symbol' or 'ticker' column")
        for row in reader:
            value = str(row.get(symbol_col, "")).strip().upper()
            if value:
                symbols.append(value)
    return sorted(set(symbols))


def _load_symbols_from_txt(symbols_txt_path: str) -> List[str]:
    symbols: List[str] = []
    with open(symbols_txt_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="|")
        if not reader.fieldnames:
            raise ValueError("symbols txt is missing a header row")
        lowered = {name.lower(): name for name in reader.fieldnames}
        symbol_col = lowered.get("symbol") or lowered.get("ticker")
        if not symbol_col:
            raise ValueError("symbols txt must include a 'Symbol' or 'Ticker' column")
        for row in reader:
            value = str(row.get(symbol_col, "")).strip().upper()
            if value:
                symbols.append(value)
    return sorted(set(symbols))


def _load_symbols_from_file(symbols_file_path: str) -> List[str]:
    lower = symbols_file_path.lower()
    if lower.endswith(".csv"):
        return _load_symbols_from_csv(symbols_file_path)
    if lower.endswith(".txt"):
        return _load_symbols_from_txt(symbols_file_path)
    raise ValueError("symbols file must be .csv or .txt")


def _fetch_listings_from_yfinance(symbols: List[str]) -> List[Dict[str, Any]]:
    cache = _load_cache()
    cache_changed = False
    rows: List[Dict[str, Any]] = []
    for symbol in symbols:
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}
        fast_info = getattr(ticker, "fast_info", {}) or {}
        cached = cache.get(symbol, {})

        price = _extract_price(info, fast_info)
        market_cap = _extract_market_cap(info, fast_info)
        volume = _extract_volume(info, fast_info)
        change_24h = _extract_change_percent(info, price)
        ath = _safe_float(info.get("fiftyTwoWeekHigh"))
        name = str(info.get("longName") or info.get("shortName") or cached.get("name") or symbol)

        # Backfill from cache when upstream fields are missing (e.g. throttling).
        market_cap = _pick(market_cap, cached.get("market_cap"))
        volume = _pick(volume, cached.get("total_volume"))
        change_24h = _pick(change_24h, cached.get("price_change_percentage_24h"))
        ath = _pick(ath, cached.get("ath"))
        #image = info.get("logo_url")

        row = {
            "id": symbol.lower(),
            "name": name,
            "symbol": symbol,
            #"image": image,
            #"market_cap_rank": None,
            "current_price": price,
            "market_cap": market_cap,
            "total_volume": volume,
            "price_change_percentage_24h": change_24h,
            "ath": ath,
            "ath_change_percentage": None,
        }
        rows.append(row)

        successful = {}
        for key in ("name", "market_cap", "total_volume", "price_change_percentage_24h", "ath"):
            if row.get(key) is not None:
                successful[key] = row[key]
        if successful:
            merged = dict(cached)
            merged.update(successful)
            if merged != cached:
                cache[symbol] = merged
                cache_changed = True

    if cache_changed:
        _save_cache(cache)
    return _rank_by_market_cap(rows)


def _fetch_single_listing_with_retries(symbol: str, cache: Dict[str, Dict[str, Any]]) -> Dict[str, Any] | None:
    cached = cache.get(symbol, {})
    for attempt in range(MAX_PROVIDER_ATTEMPTS):
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info or {}
            fast_info = getattr(ticker, "fast_info", {}) or {}

            price = _extract_price(info, fast_info)
            market_cap = _extract_market_cap(info, fast_info)
            volume = _extract_volume(info, fast_info)
            change_24h = _extract_change_percent(info, price)
            ath = _safe_float(info.get("fiftyTwoWeekHigh"))
            name = str(info.get("longName") or info.get("shortName") or cached.get("name") or symbol)

            market_cap = _pick(market_cap, cached.get("market_cap"))
            volume = _pick(volume, cached.get("total_volume"))
            change_24h = _pick(change_24h, cached.get("price_change_percentage_24h"))
            ath = _pick(ath, cached.get("ath"))
            price = _pick(price, cached.get("current_price"))

            if market_cap is None:
                raise RuntimeError(f"{symbol} missing market cap")

            return {
                "id": symbol.lower(),
                "name": name,
                "symbol": symbol,
                "image": None,
                "market_cap_rank": None,
                "current_price": price,
                "market_cap": market_cap,
                "total_volume": volume,
                "price_change_percentage_24h": change_24h,
                "price_change_percentage_7d": None,
                "circulating_supply": None,
                "ath": ath,
                "ath_change_percentage": None,
            }
        except Exception:
            if attempt < MAX_PROVIDER_ATTEMPTS - 1:
                time.sleep(0.25 * (attempt + 1))
    return None


def fetch_top_stock_listings_from_yfinance(
    page: int = 1,
    per_page: int = 100,
    symbols_file_path: str | None = None,
) -> List[Dict[str, Any]]:
    normalized_page = max(1, int(page))
    normalized_per_page = max(1, min(500, int(per_page)))
    target_count = normalized_page * normalized_per_page
    fetch_count = max(target_count * YFINANCE_FETCH_MULTIPLIER, normalized_per_page)

    universe_path = symbols_file_path or str(DEFAULT_SYMBOLS_TXT_PATH)
    base_symbols = _load_symbols_from_file(universe_path)
    if not base_symbols:
        raise ValueError("stock symbol universe is empty")

    candidate_symbols = base_symbols[:fetch_count]
    cache = _load_cache()
    rows: List[Dict[str, Any]] = []
    cache_changed = False

    for symbol in candidate_symbols:
        row = _fetch_single_listing_with_retries(symbol, cache)
        if row is None:
            continue
        rows.append(row)

        successful = {}
        for key in ("name", "current_price", "market_cap", "total_volume", "price_change_percentage_24h", "ath"):
            if row.get(key) is not None:
                successful[key] = row[key]
        if successful:
            merged = dict(cache.get(symbol, {}))
            merged.update(successful)
            if merged != cache.get(symbol, {}):
                cache[symbol] = merged
                cache_changed = True

    if len(rows) < target_count:
        raise RuntimeError(f"Unable to assemble top {target_count} stocks from yfinance.")

    if cache_changed:
        _save_cache(cache)

    ranked = _rank_by_market_cap(rows)
    start = (normalized_page - 1) * normalized_per_page
    end = start + normalized_per_page
    page_rows = ranked[start:end]
    if len(page_rows) < normalized_per_page:
        raise RuntimeError(f"Unable to assemble top {target_count} stocks from yfinance.")
    return page_rows


def fetch_stock_listings(
    symbols: List[str] | None = None,
    page: int = 1,
    per_page: int = 100,
    all_listings: bool = False,
    symbols_file_path: str | None = None,
) -> List[Dict[str, Any]]:
    if symbols is not None:
        base_symbols = [s.strip().upper() for s in symbols if s and s.strip()]
        if not base_symbols:
            raise ValueError("symbols cannot be empty")
    elif symbols_file_path:
        base_symbols = _load_symbols_from_file(symbols_file_path)
        if not base_symbols:
            raise ValueError("symbols file produced no symbols")
    elif all_listings:
        if not DEFAULT_SYMBOLS_TXT_PATH.exists():
            raise ValueError("all_listings=true requires symbols_file_path when default symbols txt is missing")
        _log(f"Using default symbols file: {DEFAULT_SYMBOLS_TXT_PATH}")
        base_symbols = _load_symbols_from_txt(str(DEFAULT_SYMBOLS_TXT_PATH))
        if not base_symbols:
            raise ValueError("default symbols txt produced no symbols")
    else:
        _log("No symbol universe provided; using default symbols.")
        base_symbols = DEFAULT_STOCK_SYMBOLS

    paged = _slice_symbols(base_symbols, page=page, per_page=per_page)
    if not paged:
        return []
    return _fetch_listings_from_yfinance(paged)
