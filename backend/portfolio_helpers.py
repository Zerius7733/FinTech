import json
from pathlib import Path
from typing import Any

import yfinance as yf

import backend.constants as const
import backend.services.api_deps as api


def _read_json_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    return payload if isinstance(payload, dict) else {}


def _normalize_lookup_symbol(value: Any) -> str:
    text = str(value or "").strip().upper()
    if not text:
        return ""
    return text.replace("-USD", "")


def _normalize_lookup_name(value: Any) -> str:
    return str(value or "").strip().lower()


def _safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:
        return None
    return number


def _compute_ath_change_percentage(current_price: Any, ath: Any) -> float | None:
    current = _safe_float(current_price)
    ath_value = _safe_float(ath)
    if current is None or ath_value is None or ath_value <= 0:
        return None
    return round(((current - ath_value) / ath_value) * 100, 5)


def _build_crypto_ath_index() -> dict[str, dict[str, Any]]:
    payload = _read_json_file(const.COINGECKO_MARKETS_CACHE_PATH)
    index: dict[str, dict[str, Any]] = {}
    for entry in payload.get("entries", {}).values():
        if not isinstance(entry, dict):
            continue
        for row in entry.get("rows", []):
            if not isinstance(row, dict):
                continue
            normalized = {
                "ath": _safe_float(row.get("ath")),
                "ath_change_percentage": _safe_float(row.get("ath_change_percentage")),
            }
            keys = {
                _normalize_lookup_symbol(row.get("symbol")),
                _normalize_lookup_name(row.get("id")),
                _normalize_lookup_name(row.get("name")),
            }
            for key in keys:
                if key:
                    index[key] = normalized
    return index


def _build_commodity_ath_index() -> dict[str, dict[str, Any]]:
    payload = _read_json_file(const.COMMODITY_MARKET_RANKINGS_PATH)
    index: dict[str, dict[str, Any]] = {}
    for row in payload.get("items", []):
        if not isinstance(row, dict):
            continue
        normalized = {
            "ath": _safe_float(row.get("ath")),
            "ath_change_percentage": _safe_float(row.get("ath_change_percentage")),
            "symbol": row.get("symbol"),
            "name": row.get("name"),
            "current_price": row.get("current_price"),
        }
        keys = {
            _normalize_lookup_symbol(row.get("symbol")),
            _normalize_lookup_name(row.get("id")),
            _normalize_lookup_name(row.get("name")),
        }
        for key in keys:
            if key:
                index[key] = normalized
    return index


def _build_stock_ath_index() -> dict[str, dict[str, Any]]:
    payload = _read_json_file(const.STOCK_LISTINGS_CACHE_PATH)
    index: dict[str, dict[str, Any]] = {}
    symbols = payload.get("symbols", {})
    if not isinstance(symbols, dict):
        return index
    for symbol, row in symbols.items():
        if not isinstance(row, dict):
            continue
        index[_normalize_lookup_symbol(symbol)] = {
            "ath": _safe_float(row.get("ath")),
            "ath_change_percentage": _compute_ath_change_percentage(
                row.get("current_price"),
                row.get("ath"),
            ),
        }
    return index


def _fetch_stock_ath_payload(symbol: Any) -> dict[str, Any] | None:
    symbol_text = str(symbol or "").strip().upper()
    if not symbol_text:
        return None
    try:
        ticker = yf.Ticker(symbol_text)
        info = ticker.info or {}
        fast_info = getattr(ticker, "fast_info", {}) or {}
        ath = _safe_float(
            info.get("fiftyTwoWeekHigh")
            or fast_info.get("yearHigh")
            or fast_info.get("fiftyTwoWeekHigh")
        )
        current_price = _safe_float(
            fast_info.get("lastPrice")
            or fast_info.get("last_price")
            or info.get("regularMarketPrice")
            or info.get("currentPrice")
        )
        if ath is None:
            return None
        return {
            "ath": ath,
            "ath_change_percentage": _compute_ath_change_percentage(current_price, ath),
        }
    except Exception:
        return None


def _lookup_ath_payload(
    bucket: str,
    symbol: Any,
    name: Any,
    crypto_index: dict[str, dict[str, Any]],
    commodity_index: dict[str, dict[str, Any]],
    stock_index: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    symbol_key = _normalize_lookup_symbol(symbol)
    name_key = _normalize_lookup_name(name)
    if bucket == "cryptos":
        for key in (symbol_key, name_key):
            if key and key in crypto_index:
                return crypto_index[key]
        return None
    if bucket == "commodities":
        for key in (symbol_key, name_key):
            if key and key in commodity_index:
                return commodity_index[key]
        if symbol_key in const.COMMON_COMMODITY_ETFS:
            return stock_index.get(symbol_key)
        return None
    cached_payload = stock_index.get(symbol_key)
    if cached_payload:
        return cached_payload
    return _fetch_stock_ath_payload(symbol)


def enrich_portfolio_with_ath(user: dict[str, Any]) -> dict[str, Any]:
    portfolio = user.get("portfolio")
    if not isinstance(portfolio, dict):
        return user

    crypto_index = _build_crypto_ath_index()
    commodity_index = _build_commodity_ath_index()
    stock_index = _build_stock_ath_index()

    for bucket in ("stocks", "cryptos", "commodities"):
        entries = portfolio.get(bucket, [])
        if not isinstance(entries, list):
            continue
        for item in entries:
            if not isinstance(item, dict):
                continue
            ath_payload = _lookup_ath_payload(
                bucket=bucket,
                symbol=item.get("symbol"),
                name=item.get("name"),
                crypto_index=crypto_index,
                commodity_index=commodity_index,
                stock_index=stock_index,
            )
            if not ath_payload:
                continue
            ath_value = _safe_float(ath_payload.get("ath"))
            if ath_value is not None:
                item["ath"] = ath_value
            ath_change_percentage = _safe_float(ath_payload.get("ath_change_percentage"))
            if ath_change_percentage is None:
                ath_change_percentage = _compute_ath_change_percentage(
                    item.get("current_price"),
                    ath_value,
                )
            if ath_change_percentage is not None:
                item["ath_change_percentage"] = ath_change_percentage

            if bucket != "commodities":
                continue

            symbol_key = _normalize_lookup_symbol(item.get("symbol"))
            name_key = _normalize_lookup_name(item.get("name"))
            display_row = None
            for key in (symbol_key, name_key):
                if key and key in commodity_index:
                    display_row = commodity_index[key]
                    break
            if display_row is None:
                underlying_symbol = const.COMMODITY_ETF_TO_UNDERLYING.get(symbol_key)
                if underlying_symbol:
                    display_row = commodity_index.get(underlying_symbol)
            if not display_row:
                continue

            if display_row.get("symbol") is not None:
                item["commodity_display_symbol"] = str(display_row.get("symbol"))
            if display_row.get("name") is not None:
                item["commodity_display_name"] = str(display_row.get("name"))
            display_price = _safe_float(display_row.get("current_price"))
            if display_price is not None:
                item["commodity_display_current_price"] = display_price
            display_ath = _safe_float(display_row.get("ath"))
            if display_ath is not None:
                item["commodity_display_ath"] = display_ath
            display_ath_change = _safe_float(display_row.get("ath_change_percentage"))
            if display_ath_change is None:
                display_ath_change = _compute_ath_change_percentage(display_price, display_ath)
            if display_ath_change is not None:
                item["commodity_display_ath_change_percentage"] = display_ath_change
    return user


def read_user_portfolio_history(user_id: str) -> dict[str, Any]:
    history_path = const.USER_PORTFOLIO_DIR / f"{user_id}.json"
    if history_path.exists():
        with open(history_path, "r", encoding="utf-8") as f:
            return json.load(f)

    normalized = str(user_id or "").strip().lower()
    if normalized.startswith("u") and normalized[1:].isdigit():
        legacy_id = f"u{int(normalized[1:]) + 1:03d}"
        legacy_path = const.USER_PORTFOLIO_DIR / f"{legacy_id}.json"
        if legacy_path.exists():
            with open(legacy_path, "r", encoding="utf-8") as f:
                legacy_history = json.load(f)
            try:
                with open(history_path, "w", encoding="utf-8") as f:
                    json.dump(legacy_history, f, indent=2)
            except Exception:
                pass
            return legacy_history

    return {"daily_values": []}


def normalize_risk_profile(value: Any) -> float:
    if isinstance(value, (int, float)):
        numeric = float(value)
    else:
        normalized = str(value or "").strip().lower()
        mapping = {
            "low": 0.0,
            "conservative": 0.0,
            "moderate": 50.0,
            "medium": 50.0,
            "balanced": 50.0,
            "high": 100.0,
            "aggressive": 100.0,
        }
        if normalized in mapping:
            numeric = mapping[normalized]
        else:
            try:
                numeric = float(normalized)
            except ValueError as exc:
                raise ValueError("risk_profile must be a number between 0 and 100") from exc

    if numeric < 0 or numeric > 100:
        raise ValueError("risk_profile must be between 0 and 100")
    return round(numeric, 2)


def _sum_portfolio_positions(user: dict[str, Any]) -> float:
    portfolio = user.get("portfolio", {})
    if isinstance(portfolio, list):
        positions = portfolio
    elif isinstance(portfolio, dict):
        positions = []
        for bucket in ("stocks", "cryptos", "commodities"):
            bucket_positions = portfolio.get(bucket, [])
            if isinstance(bucket_positions, list):
                positions.extend(bucket_positions)
    else:
        positions = []
    return round(sum(float(position.get("market_value", 0.0) or 0.0) for position in positions), 2)


def normalize_manual_asset_category(value: str) -> str:
    normalized = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    alias_map = {
        "stock": "stock",
        "stocks": "stock",
        "crypto": "crypto",
        "cryptos": "crypto",
        "commodity": "commodity",
        "commodities": "commodity",
    }
    normalized = alias_map.get(normalized, normalized)
    allowed = {"real_estate", "business", "private_asset", "banks", "stock", "crypto", "commodity", "other"}
    if normalized not in allowed:
        raise ValueError(
            "asset category must be one of: real_estate, business, private_asset, banks, stock, crypto, commodity, other"
        )
    return normalized


def ensure_financial_collections(user: dict[str, Any]) -> dict[str, Any]:
    manual_assets = user.get("manual_assets")
    if not isinstance(manual_assets, list):
        manual_assets = []
    liability_items = user.get("liability_items")
    if not isinstance(liability_items, list):
        liability_items = []
    income_streams = user.get("income_streams")
    if not isinstance(income_streams, list):
        income_streams = []

    if not manual_assets and float(user.get("estate", 0.0) or 0.0) > 0:
        manual_assets = [{
            "id": "estate-seed",
            "label": "Property",
            "category": "real_estate",
            "value": round(float(user.get("estate", 0.0) or 0.0), 2),
        }]
    if not liability_items and float(user.get("liability", 0.0) or 0.0) > 0:
        liability_items = [{
            "id": "liability-seed",
            "label": "Existing Liabilities",
            "amount": round(float(user.get("liability", 0.0) or 0.0), 2),
            "is_mortgage": False,
        }]
    if float(user.get("mortgage", 0.0) or 0.0) > 0 and not any(bool(item.get("is_mortgage")) for item in liability_items):
        liability_items.append({
            "id": "mortgage-seed",
            "label": "Mortgage",
            "amount": round(float(user.get("mortgage", 0.0) or 0.0), 2),
            "is_mortgage": True,
        })
    if not income_streams and float(user.get("income", 0.0) or 0.0) > 0:
        income_streams = [{
            "id": "income-seed",
            "label": "Primary Income",
            "monthly_amount": round(float(user.get("income", 0.0) or 0.0), 2),
        }]

    user["manual_assets"] = manual_assets
    user["liability_items"] = liability_items
    user["income_streams"] = income_streams
    return user


def recalculate_user_financials(user: dict[str, Any]) -> dict[str, Any]:
    user = ensure_financial_collections(user)
    manual_assets = user.get("manual_assets", [])
    liability_items = user.get("liability_items", [])
    income_streams = user.get("income_streams", [])

    real_estate_value = round(sum(
        float(item.get("value", 0.0) or 0.0)
        for item in manual_assets
        if item.get("category") == "real_estate"
    ), 2)
    non_estate_asset_value = round(sum(
        float(item.get("value", 0.0) or 0.0)
        for item in manual_assets
        if item.get("category") != "real_estate"
    ), 2)
    liability_total = round(sum(
        float(item.get("amount", 0.0) or 0.0)
        for item in liability_items
        if not bool(item.get("is_mortgage"))
    ), 2)
    mortgage_total = round(sum(
        float(item.get("amount", 0.0) or 0.0)
        for item in liability_items
        if bool(item.get("is_mortgage"))
    ), 2)
    income_total = round(sum(float(item.get("monthly_amount", 0.0) or 0.0) for item in income_streams), 2)
    portfolio_total = _sum_portfolio_positions(user)
    cash_balance = round(float(user.get("cash_balance", 0.0) or 0.0), 2)
    expenses = round(float(user.get("expenses", 0.0) or 0.0), 2)

    user["estate"] = real_estate_value
    user["liability"] = liability_total
    user["mortgage"] = mortgage_total
    user["income"] = income_total
    user["portfolio_value"] = portfolio_total
    user["total_balance"] = round(cash_balance + portfolio_total + real_estate_value + non_estate_asset_value, 2)
    user["net_worth"] = round(user["total_balance"] - liability_total - expenses, 2)

    wellness_result = api.calculate_user_wellness(user)
    user["wellness_metrics"] = wellness_result["wellness_metrics"]
    user["behavioral_resilience_score"] = wellness_result["behavioral_resilience_score"]
    user["financial_resilience_score"] = wellness_result["financial_resilience_score"]
    user["financial_wellness_score"] = wellness_result["financial_wellness_score"]
    user["financial_stress_index"] = wellness_result["financial_stress_index"]
    user["confidence"] = wellness_result["confidence"]
    user["resilience_summary"] = wellness_result["resilience_summary"]
    user["resilience_breakdown"] = wellness_result["resilience_breakdown"]
    user["action_insights"] = wellness_result["action_insights"]
    return user
