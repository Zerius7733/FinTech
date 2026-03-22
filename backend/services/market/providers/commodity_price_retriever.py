from typing import Any, Dict

import yfinance as yf

from backend.services.market.providers.stock_price_updater import _extract_last_price


COMMODITY_ALIAS_TO_SYMBOL = {
    "GOLD": "GC=F",
    "SILVER": "SI=F",
    "OIL": "CL=F",
    "WTI": "CL=F",
    "BRENT": "BZ=F",
    "NATGAS": "NG=F",
    "COPPER": "HG=F",
    "PLATINUM": "PL=F",
    "PALLADIUM": "PA=F",
}


def normalize_commodity_symbol(value: str) -> str:
    cleaned = (value or "").strip().upper()
    if not cleaned:
        raise ValueError("commodity ticker cannot be empty")
    return COMMODITY_ALIAS_TO_SYMBOL.get(cleaned, cleaned)


def fetch_commodity_price(symbol_or_alias: str, yf_module: Any = yf) -> Dict[str, Any]:
    symbol = normalize_commodity_symbol(symbol_or_alias)
    ticker_obj = yf_module.Ticker(symbol)
    price = round(_extract_last_price(ticker_obj), 4)
    return {"input": symbol_or_alias.strip().upper(), "symbol": symbol, "price": price}
