import csv
import json
import time
from typing import Any, Dict, Iterable
from backend.users_assets_update import update_assets_file
import yfinance as yf


def _extract_last_price(ticker_obj: Any) -> float:
    fast_info = getattr(ticker_obj, "fast_info", None)
    if fast_info:
        last_price = fast_info.get("lastPrice") or fast_info.get("last_price")
        if last_price is not None:
            return float(last_price)
    info = getattr(ticker_obj, "info", {}) or {}
    for key in ("regularMarketPrice", "currentPrice"):
        if info.get(key) is not None:
            return float(info[key])
    raise RuntimeError("No market price available for ticker.")


def _is_rate_limit_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "too many requests" in text or "rate limited" in text or "429" in text


def _fetch_symbol_price_with_retries(
    symbol: str,
    yf_module: Any = yf,
    max_retries: int = 2,
) -> float:
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            ticker_obj = yf_module.Ticker(symbol)
            return round(_extract_last_price(ticker_obj), 4)
        except Exception as exc:
            last_exc = exc
            if attempt >= max_retries:
                break
            sleep_seconds = 1.5 * (attempt + 1) if _is_rate_limit_error(exc) else 0.4 * (attempt + 1)
            print(f"[prices] retry {symbol} in {sleep_seconds:.1f}s: {exc}")
            time.sleep(sleep_seconds)
    raise RuntimeError(f"{symbol}: {last_exc}")


def fetch_latest_prices(
    symbols: Iterable[str],
    yf_module: Any = yf,
    throttle_seconds: float = 0.12,
) -> Dict[str, float]:
    prices: Dict[str, float] = {}
    for symbol in sorted(set(symbols)):
        prices[symbol] = _fetch_symbol_price_with_retries(symbol, yf_module=yf_module)
        if throttle_seconds > 0:
            time.sleep(throttle_seconds)
    return prices


def fetch_latest_prices_safe(
    symbols: Iterable[str],
    yf_module: Any = yf,
    throttle_seconds: float = 0.12,
) -> Dict[str, float]:
    prices: Dict[str, float] = {}
    for symbol in sorted(set(symbols)):
        try:
            prices[symbol] = _fetch_symbol_price_with_retries(symbol, yf_module=yf_module)
        except Exception as exc:
            print(f"[prices] skip {symbol}: {exc}")
        if throttle_seconds > 0:
            time.sleep(throttle_seconds)
    return prices


def _iter_positions(user: Dict[str, Any]):
    portfolio = user.get("portfolio", [])
    if isinstance(portfolio, list):
        for position in portfolio:
            if isinstance(position, dict):
                yield position
        return
    if isinstance(portfolio, dict):
        for key in ("stocks", "cryptos", "commodities"):
            positions = portfolio.get(key, [])
            if not isinstance(positions, list):
                continue
            for position in positions:
                if isinstance(position, dict):
                    yield position


def update_stock_prices(users: Dict[str, Any], prices: Dict[str, float]) -> Dict[str, Any]:
    updated = json.loads(json.dumps(users))
    for user in updated.values():
        portfolio_total = 0.0
        for position in _iter_positions(user):
            symbol = position.get("symbol")
            qty = float(position.get("qty", 0))
            if not symbol or symbol not in prices:
                continue
            current_price = float(prices[symbol])
            market_value = round(qty * current_price, 2)
            position["current_price"] = round(current_price, 4)
            position["market_value"] = market_value
            portfolio_total += market_value
        user["portfolio_value"] = round(portfolio_total, 2)
        user["total_balance"] = round(float(user.get("cash_balance", 0)) + portfolio_total, 2)
        user["net_worth"] = round(user["total_balance"] - float(user.get("liability", 0)), 2)
    return updated


def update_stock_prices_file(path: str = "json_data/user.json", yf_module: Any = yf) -> Dict[str, Any]:
    print(f"[prices] updating prices in {path}")
    with open(path, "r", encoding="utf-8") as f:
        users = json.load(f)
    all_symbols = []
    for user in users.values():
        for position in _iter_positions(user):
            symbol = position.get("symbol")
            if symbol:
                all_symbols.append(symbol)
    prices = fetch_latest_prices_safe(all_symbols, yf_module=yf_module)
    if not prices:
        raise RuntimeError("No prices were updated (likely rate-limited or upstream unavailable).")
    updated = update_stock_prices(users, prices)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(updated, f, indent=2)
    print(f"[prices] updated {len(prices)} symbols")
    return updated


def update_stock_listings_cache_prices_file(
    path: str = "json_data/stock_listings_cache.json",
    yf_module: Any = yf,
) -> Dict[str, Any]:
    print(f"[prices] updating stock listing cache prices in {path}")
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    symbols_bucket = payload.get("symbols")
    if not isinstance(symbols_bucket, dict):
        raise ValueError("stock listings cache must contain a top-level 'symbols' object")

    symbols = [str(symbol).strip().upper() for symbol in symbols_bucket.keys() if str(symbol).strip()]
    prices = fetch_latest_prices_safe(symbols, yf_module=yf_module)

    updated_count = 0
    for symbol, entry in symbols_bucket.items():
        if not isinstance(entry, dict):
            continue
        normalized_symbol = str(symbol).strip().upper()
        if normalized_symbol in prices:
            entry["current_price"] = prices[normalized_symbol]
            updated_count += 1

    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"[prices] updated cache prices for {updated_count}/{len(symbols)} symbols")
    return payload

if __name__ == "__main__":
    result = update_stock_prices_file()
    update_stock_listings_cache_prices_file()
    result = update_assets_file(json_path="json_data/user.json", csv_path="csv_data/users_assets.csv")
    print("stock and asset updates complete")
