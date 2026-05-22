import csv
import json
import time
from typing import Any, Dict, Iterable

from backend.tools.users_assets_update import update_assets_file
import yfinance as yf

from backend.services.currency import convert_currency
from backend.services.currency import infer_quote_currency
from backend.services.currency import normalize_currency_code


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


def _extract_quote_currency(symbol: str, ticker_obj: Any) -> str:
    fast_info = getattr(ticker_obj, "fast_info", None)
    if fast_info:
        for key in ("currency", "quoteCurrency"):
            currency = fast_info.get(key)
            if currency:
                return normalize_currency_code(currency, default=infer_quote_currency(symbol))
    info = getattr(ticker_obj, "info", {}) or {}
    for key in ("currency", "financialCurrency"):
        currency = info.get(key)
        if currency:
            return normalize_currency_code(currency, default=infer_quote_currency(symbol))
    return infer_quote_currency(symbol)


def _build_price_quote(symbol: str, ticker_obj: Any) -> Dict[str, Any]:
    quote_price = round(_extract_last_price(ticker_obj), 6)
    quote_currency = _extract_quote_currency(symbol, ticker_obj)
    price_usd = round(convert_currency(quote_price, quote_currency, "USD"), 6)
    return {
        "symbol": symbol,
        "price": quote_price,
        "currency": quote_currency,
        "price_usd": price_usd,
    }


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


def _fetch_symbol_quote_with_retries(
    symbol: str,
    yf_module: Any = yf,
    max_retries: int = 2,
) -> Dict[str, Any]:
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            ticker_obj = yf_module.Ticker(symbol)
            return _build_price_quote(symbol, ticker_obj)
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


def fetch_latest_price_quotes(
    symbols: Iterable[str],
    yf_module: Any = yf,
    throttle_seconds: float = 0.12,
) -> Dict[str, Dict[str, Any]]:
    quotes: Dict[str, Dict[str, Any]] = {}
    for symbol in sorted(set(symbols)):
        quotes[symbol] = _fetch_symbol_quote_with_retries(symbol, yf_module=yf_module)
        if throttle_seconds > 0:
            time.sleep(throttle_seconds)
    return quotes


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


def fetch_latest_price_quotes_safe(
    symbols: Iterable[str],
    yf_module: Any = yf,
    throttle_seconds: float = 0.12,
) -> Dict[str, Dict[str, Any]]:
    quotes: Dict[str, Dict[str, Any]] = {}
    for symbol in sorted(set(symbols)):
        try:
            quotes[symbol] = _fetch_symbol_quote_with_retries(symbol, yf_module=yf_module)
        except Exception as exc:
            print(f"[prices] skip {symbol}: {exc}")
        if throttle_seconds > 0:
            time.sleep(throttle_seconds)
    return quotes


def _iter_positions(user: Dict[str, Any]):
    portfolio = user.get("portfolio", [])
    if isinstance(portfolio, list):
        for position in portfolio:
            if isinstance(position, dict):
                yield position
        return
    if isinstance(portfolio, dict):
        for key in ("stocks", "bonds", "real_assets", "cryptos", "commodities"):
            positions = portfolio.get(key, [])
            if not isinstance(positions, list):
                continue
            for position in positions:
                if isinstance(position, dict):
                    yield position


def _price_payload_to_usd(symbol: str, payload: Any) -> tuple[float, str, float]:
    if isinstance(payload, dict):
        quote_price = float(payload.get("price") or payload.get("current_price") or payload.get("price_usd") or 0.0)
        quote_currency = normalize_currency_code(payload.get("currency"), default=infer_quote_currency(symbol))
        price_usd = float(payload.get("price_usd") or convert_currency(quote_price, quote_currency, "USD"))
        return round(price_usd, 6), quote_currency, round(quote_price, 6)

    quote_currency = infer_quote_currency(symbol)
    quote_price = float(payload or 0.0)
    price_usd = convert_currency(quote_price, quote_currency, "USD")
    return round(price_usd, 6), quote_currency, round(quote_price, 6)


def _apply_price_metadata(position: Dict[str, Any], symbol: str, current_price_usd: float, quote_currency: str, quote_price: float) -> None:
    position["current_price"] = round(current_price_usd, 6)
    position["currency"] = "USD"
    position["market_value_currency"] = "USD"
    if quote_currency != "USD":
        position["quote_currency"] = quote_currency
        position["quote_current_price"] = round(quote_price, 6)
    else:
        position.pop("quote_currency", None)
        position.pop("quote_current_price", None)


def update_stock_prices(users: Dict[str, Any], prices: Dict[str, Any]) -> Dict[str, Any]:
    updated = json.loads(json.dumps(users))
    for user in updated.values():
        portfolio_total = 0.0
        for position in _iter_positions(user):
            symbol = position.get("symbol")
            qty = float(position.get("qty", 0))
            if not symbol or symbol not in prices:
                continue
            current_price, quote_currency, quote_price = _price_payload_to_usd(symbol, prices[symbol])
            market_value = round(qty * current_price, 2)
            _apply_price_metadata(position, symbol, current_price, quote_currency, quote_price)
            position["market_value"] = market_value
            portfolio_total += market_value
        manual_assets = user.get("manual_assets", [])
        real_estate_total = 0.0
        other_manual_total = 0.0
        if isinstance(manual_assets, list):
            for item in manual_assets:
                if not isinstance(item, dict):
                    continue
                value = float(item.get("value", 0.0) or 0.0)
                if str(item.get("category", "")).strip().lower() == "real_estate":
                    real_estate_total += value
                else:
                    other_manual_total += value
        portfolio_total_sgd = round(convert_currency(portfolio_total, "USD", "SGD"), 2)
        user["portfolio_value"] = round(portfolio_total, 2)
        user["portfolio_value_currency"] = "USD"
        user["total_balance"] = round(float(user.get("cash_balance", 0)) + portfolio_total_sgd + real_estate_total + other_manual_total, 2)
        user["net_worth"] = round(user["total_balance"] - float(user.get("liability", 0)) - float(user.get("expenses", 0)), 2)
    return updated


def update_stock_prices_file(path: str = "data/json/user.json", yf_module: Any = yf) -> Dict[str, Any]:
    print(f"[prices] updating prices in {path}")
    with open(path, "r", encoding="utf-8") as f:
        users = json.load(f)
    all_symbols = []
    for user in users.values():
        for position in _iter_positions(user):
            symbol = position.get("symbol")
            if symbol:
                all_symbols.append(symbol)
    quotes = fetch_latest_price_quotes_safe(all_symbols, yf_module=yf_module)
    if not quotes:
        raise RuntimeError("No prices were updated (likely rate-limited or upstream unavailable).")
    updated = update_stock_prices(users, quotes)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(updated, f, indent=2)
    print(f"[prices] updated {len(quotes)} symbols")
    return updated


def update_stock_listings_cache_prices_file(
    path: str = "data/json/stock_listings_cache.json",
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
    result = update_assets_file(json_path="data/json/user.json", csv_path="data/csv/users.csv")
    print("stock and asset updates complete")
