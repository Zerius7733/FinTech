from typing import Any, Dict

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


def fetch_crypto_price(symbol: str, yf_module: Any = yf) -> Dict[str, Any]:
    normalized = symbol.strip().upper()
    if not normalized:
        raise ValueError("crypto ticker cannot be empty")
    if "-" not in normalized:
        normalized = f"{normalized}-USD"

    ticker_obj = yf_module.Ticker(normalized)
    price = round(_extract_last_price(ticker_obj), 4)
    return {"symbol": normalized, "price": price}
