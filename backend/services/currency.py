from typing import Any


DEFAULT_CURRENCY = "USD"

USD_TO_CURRENCY = {
    "USD": 1.0,
    "SGD": 1.35,
    "EUR": 0.92,
    "GBP": 0.79,
}


def normalize_currency_code(value: Any, default: str = DEFAULT_CURRENCY) -> str:
    code = str(value or "").strip().upper()
    if code in USD_TO_CURRENCY:
        return code
    fallback = str(default or DEFAULT_CURRENCY).strip().upper()
    return fallback if fallback in USD_TO_CURRENCY else DEFAULT_CURRENCY


def convert_currency(
    amount: Any,
    from_currency: Any = DEFAULT_CURRENCY,
    to_currency: Any = DEFAULT_CURRENCY,
) -> float:
    value = float(amount or 0.0)
    source = normalize_currency_code(from_currency)
    target = normalize_currency_code(to_currency)
    value_in_usd = value / USD_TO_CURRENCY[source]
    return value_in_usd * USD_TO_CURRENCY[target]


def infer_quote_currency(symbol: Any, fallback: str = DEFAULT_CURRENCY) -> str:
    normalized = str(symbol or "").strip().upper()
    if normalized.endswith(".SI") or normalized == "^STI":
        return "SGD"
    return normalize_currency_code(fallback)
