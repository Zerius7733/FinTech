import asyncio,os
import csv
import json
import time
import uuid
import io
from dotenv import load_dotenv
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Dict
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import AliasChoices, BaseModel, Field
import backend.services.api_deps as api

load_dotenv()


BASE_DIR = Path(__file__).resolve().parent
USER_JSON_PATH = BASE_DIR / "json_data" / "user.json"
USER_PORTFOLIO_DIR = BASE_DIR / "json_data" / "user_portfolio"
CSV_PATH = BASE_DIR / "csv_data" / "users.csv"
LOGIN_CSV_PATH = BASE_DIR / "csv_data" / "users.csv"
ASSETS_CSV_PATH = BASE_DIR / "csv_data" / "users.csv"
STOCK_LISTINGS_CACHE_PATH = BASE_DIR / "json_data" / "stock_listings_cache.json"
COINGECKO_MARKETS_CACHE_PATH = BASE_DIR / "json_data" / "coingecko_markets_cache.json"
COMMODITY_MARKET_RANKINGS_PATH = BASE_DIR / "json_data" / "commodity_market_rankings.json"
COMMON_COMMODITY_ETFS = {"GLD", "SLV", "IAU", "SIVR", "PPLT", "PALL"}
COMMODITY_ETF_TO_UNDERLYING = {
    "GLD": "GC=F",
    "IAU": "GC=F",
    "SLV": "SI=F",
    "SIVR": "SI=F",
    "PPLT": "PL=F",
    "PALL": "PA=F",
}
STOCK_MARKET_REFRESH_INTERVAL_SECONDS = 30 * 60
INSIGHTS_RATE_LIMIT_ENABLED = os.getenv("INSIGHTS_RATE_LIMIT_ENABLED", "1").strip().lower() in {"1", "true", "yes", "on"}
INSIGHTS_RATE_LIMIT_WINDOW_SECONDS = max(1, int(os.getenv("INSIGHTS_RATE_LIMIT_WINDOW_SECONDS", "3600")))
INSIGHTS_RATE_LIMIT_MAX_REQUESTS = max(1, int(os.getenv("INSIGHTS_RATE_LIMIT_MAX_REQUESTS", "10")))
_INSIGHTS_RATE_LIMIT_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
YOUTUBE_HELP_VIDEO_URL = "https://youtu.be/1yTlB7DJeT8"
YOUTUBE_HELP_EMBED_URL = "https://www.youtube.com/embed/1yTlB7DJeT8"

app = FastAPI(
    title="FinTech Wellness API",
    version="1.0.0",
    openapi_tags=[
        {"name": "Health", "description": "API health and readiness endpoints."},
        {"name": "Users", "description": "User retrieval endpoints."},
        {"name": "Recommendations", "description": "Personalized recommendation endpoints."},
        {"name": "Compatibility", "description": "User profile compatibility endpoints."},
        {"name": "Imports", "description": "Screenshot import and portfolio merge endpoints."},
        {"name": "Updates", "description": "Endpoints that run data update jobs."},
        {"name": "Market", "description": "Live market quote retrieval endpoints."},
        {"name": "Portfolio", "description": "User portfolio information endpoints."},
        {"name": "Retirement", "description": "Retirement planning and target allocation endpoints."},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api.rewrite_user_profiles_with_order(USER_JSON_PATH)
api.ensure_login_csv_schema(LOGIN_CSV_PATH)


async def _run_stock_market_refresh() -> None:
    try:
        result = await asyncio.to_thread(api.refresh_stock_market_data)
        meta = result.get("_meta", {}) if isinstance(result, dict) else {}
        print(
            "[api] stock market refresh complete:",
            {
                "source": meta.get("source"),
                "ranked_count": meta.get("ranked_count"),
                "failed_count": meta.get("failed_count"),
            },
        )
    except Exception as exc:
        print(f"[api] stock market refresh failed: {exc}")


async def _run_commodity_market_refresh() -> None:
    try:
        result = await asyncio.to_thread(api.refresh_commodity_market_data)
        meta = result.get("_meta", {}) if isinstance(result, dict) else {}
        print(
            "[api] commodity market refresh complete:",
            {
                "source": meta.get("source"),
                "ranked_count": meta.get("ranked_count"),
                "failed_count": meta.get("failed_count"),
            },
        )
    except Exception as exc:
        print(f"[api] commodity market refresh failed: {exc}")


async def _market_refresh_loop() -> None:
    #await _run_stock_market_refresh()
    #await _run_commodity_market_refresh()
    while True:
        await asyncio.sleep(STOCK_MARKET_REFRESH_INTERVAL_SECONDS)
        await _run_stock_market_refresh()
        await _run_commodity_market_refresh()


@app.on_event("startup")
async def startup_stock_market_refresh() -> None:
    app.state.stock_market_refresh_task = asyncio.create_task(_market_refresh_loop())


@app.on_event("shutdown")
async def shutdown_stock_market_refresh() -> None:
    task = getattr(app.state, "stock_market_refresh_task", None)
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


def _safe_summary(result: Dict[str, Any]) -> Dict[str, Any]:
    user_count = len([k for k in result.keys() if not k.startswith("_")])
    return {
        "status": "ok",
        "user_count": user_count,
    }


def _read_users_data() -> Dict[str, Any]:
    with open(USER_JSON_PATH, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
    return api.normalize_users_data(data)


def _write_users_data(data: Dict[str, Any]) -> None:
    with open(USER_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(api.normalize_users_data(data), f, indent=2)


def _next_available_user_id() -> str:
    max_id = 0

    if LOGIN_CSV_PATH.exists():
        with open(LOGIN_CSV_PATH, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                raw = str((row or {}).get("user_id", "")).strip().lower()
                if raw.startswith("u") and raw[1:].isdigit():
                    max_id = max(max_id, int(raw[1:]))

    try:
        users = _read_users_data()
    except Exception:
        users = {}
    for user_id in users.keys():
        raw = str(user_id or "").strip().lower()
        if raw.startswith("u") and raw[1:].isdigit():
            max_id = max(max_id, int(raw[1:]))

    return f"u{max_id + 1:03d}"


def _read_json_file(path: Path) -> Dict[str, Any]:
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


def _build_crypto_ath_index() -> Dict[str, Dict[str, Any]]:
    payload = _read_json_file(COINGECKO_MARKETS_CACHE_PATH)
    index: Dict[str, Dict[str, Any]] = {}
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


def _build_commodity_ath_index() -> Dict[str, Dict[str, Any]]:
    payload = _read_json_file(COMMODITY_MARKET_RANKINGS_PATH)
    index: Dict[str, Dict[str, Any]] = {}
    for row in payload.get("items", []):
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


def _build_stock_ath_index() -> Dict[str, Dict[str, Any]]:
    payload = _read_json_file(STOCK_LISTINGS_CACHE_PATH)
    index: Dict[str, Dict[str, Any]] = {}
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


def _lookup_ath_payload(
    bucket: str,
    symbol: Any,
    name: Any,
    crypto_index: Dict[str, Dict[str, Any]],
    commodity_index: Dict[str, Dict[str, Any]],
    stock_index: Dict[str, Dict[str, Any]],
) -> Dict[str, Any] | None:
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
        if symbol_key in COMMON_COMMODITY_ETFS:
            return stock_index.get(symbol_key)
        return None
    return stock_index.get(symbol_key)


def _enrich_portfolio_with_ath(user: Dict[str, Any]) -> Dict[str, Any]:
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
                underlying_symbol = COMMODITY_ETF_TO_UNDERLYING.get(symbol_key)
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


def _read_user_portfolio_history(user_id: str) -> Dict[str, Any]:
    history_path = USER_PORTFOLIO_DIR / f"{user_id}.json"
    if history_path.exists():
        with open(history_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # Backward compatibility for shifted IDs (e.g. u000 now mapped from prior u001 history file).
    normalized = str(user_id or "").strip().lower()
    if normalized.startswith("u") and normalized[1:].isdigit():
        legacy_id = f"u{int(normalized[1:]) + 1:03d}"
        legacy_path = USER_PORTFOLIO_DIR / f"{legacy_id}.json"
        if legacy_path.exists():
            with open(legacy_path, "r", encoding="utf-8") as f:
                legacy_history = json.load(f)
            # Best-effort copy so future calls hit the normalized path directly.
            try:
                with open(history_path, "w", encoding="utf-8") as f:
                    json.dump(legacy_history, f, indent=2)
            except Exception:
                pass
            return legacy_history

    # Do not hard-fail the profile page if no history exists yet.
    return {"daily_values": []}


def _parse_market_query(query: str) -> Dict[str, str]:
    parts = [part.strip().upper() for part in query.split(",", maxsplit=1)]
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("query must be in format 'STOCK, SPY', 'CRYPTO, BTC', or 'COMMODITY, GOLD'")
    asset_type, ticker = parts
    if asset_type not in {"STOCK", "CRYPTO", "COMMODITY"}:
        raise ValueError("asset type must be STOCK, CRYPTO, or COMMODITY")
    return {"asset_type": asset_type, "ticker": ticker}


def _normalize_risk_profile(value: Any) -> float:
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


def _age_to_group(age: int) -> str:
    if age <= 29:
        return "18-29"
    if age <= 44:
        return "30-44"
    if age <= 59:
        return "45-59"
    return "60+"


def _enforce_insights_rate_limit(subject: str) -> None:
    if not INSIGHTS_RATE_LIMIT_ENABLED:
        return
    now = time.time()
    bucket = _INSIGHTS_RATE_LIMIT_BUCKETS[subject]
    while bucket and now - bucket[0] > INSIGHTS_RATE_LIMIT_WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= INSIGHTS_RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail=(
                "insight rate limit reached. "
                f"Try again after {INSIGHTS_RATE_LIMIT_WINDOW_SECONDS} seconds."
            ),
        )
    bucket.append(now)


def _sum_portfolio_positions(user: Dict[str, Any]) -> float:
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


def _normalize_manual_asset_category(value: str) -> str:
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


def _ensure_financial_collections(user: Dict[str, Any]) -> Dict[str, Any]:
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


def _recalculate_user_financials(user: Dict[str, Any]) -> Dict[str, Any]:
    user = _ensure_financial_collections(user)
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
    user["financial_wellness_score"] = wellness_result["financial_wellness_score"]
    user["financial_stress_index"] = wellness_result["financial_stress_index"]
    return user


def _sync_user_to_assets_csv(user_id: str, user: Dict[str, Any]) -> None:
    csv_path = ASSETS_CSV_PATH
    default_headers = [
        "user_id",
        "username",
        "password",
        "email",
        "name",
        "dbs",
        "uob",
        "ocbc",
        "other_banks",
        "liability",
        "income",
        "estate",
        "expense",
        "age",
        "age_group",
        "country",
    ]

    if csv_path.exists():
        with open(csv_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            rows = [dict(row) for row in reader]
            fieldnames = list(reader.fieldnames or [])
    else:
        rows = []
        fieldnames = default_headers[:]

    if "other_banks" not in fieldnames and "other_bank" not in fieldnames:
        fieldnames.append("other_banks")

    for required in ("user_id", "name", "liability", "income", "estate", "username", "password", "email"):
        if required not in fieldnames:
            fieldnames.append(required)

    other_bank_col = "other_banks" if "other_banks" in fieldnames else "other_bank"
    banks_total = round(sum(
        float(item.get("value", 0.0) or 0.0)
        for item in (user.get("manual_assets") or [])
        if str(item.get("category", "")).strip().lower() == "banks"
    ), 2)

    target_index = None
    for idx, row in enumerate(rows):
        if (row.get("user_id") or "").strip() == user_id:
            target_index = idx
            break

    if target_index is None:
        row = {key: "" for key in fieldnames}
        row["user_id"] = user_id
        row["name"] = str(user.get("name", "") or "")
        row.setdefault("username", "")
        row.setdefault("password", "")
        row.setdefault("email", "")
        row.setdefault("age", "")
        row.setdefault("age_group", "")
        row.setdefault("country", "")
        row.setdefault("dbs", "0")
        row.setdefault("uob", "0")
        row.setdefault("ocbc", "0")
        row.setdefault("expense", str(user.get("expenses", 0.0) or 0.0))
        rows.append(row)
        target_index = len(rows) - 1

    target = rows[target_index]
    target["name"] = str(user.get("name", target.get("name", "")) or "")
    target["liability"] = f"{round(float(user.get('liability', 0.0) or 0.0), 2):.2f}"
    target["income"] = f"{round(float(user.get('income', 0.0) or 0.0), 2):.2f}"
    target["estate"] = f"{round(float(user.get('estate', 0.0) or 0.0), 2):.2f}"
    target[other_bank_col] = f"{banks_total:.2f}"

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            clean_row = {key: row.get(key, "") for key in fieldnames}
            writer.writerow(clean_row)


def _update_user_csv_profile(user_id: str, updates: Dict[str, Any]) -> None:
    csv_path = ASSETS_CSV_PATH
    if csv_path.exists():
        with open(csv_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            rows = [dict(row) for row in reader]
            fieldnames = list(reader.fieldnames or [])
    else:
        rows = []
        fieldnames = [
            "user_id", "username", "password", "email", "name",
            "dbs", "uob", "ocbc", "other_banks", "liability", "income", "estate", "expense",
            "age", "age_group", "country",
        ]

    if "user_id" not in fieldnames:
        fieldnames.insert(0, "user_id")

    for key in updates.keys():
        if key not in fieldnames:
            fieldnames.append(key)

    target = next((row for row in rows if (row.get("user_id") or "").strip() == user_id), None)
    if target is None:
        target = {key: "" for key in fieldnames}
        target["user_id"] = user_id
        rows.append(target)

    for key, value in updates.items():
        target[key] = "" if value is None else str(value)

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def _read_user_csv_profile(user_id: str) -> Dict[str, Any]:
    csv_path = ASSETS_CSV_PATH
    if not csv_path.exists():
        return {}
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if (row.get("user_id") or "").strip() == user_id:
                return dict(row)
    return {}


def _load_users_csv() -> tuple[list[Dict[str, str]], list[str]]:
    if ASSETS_CSV_PATH.exists():
        with open(ASSETS_CSV_PATH, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            rows = [dict(row) for row in reader]
            fieldnames = list(reader.fieldnames or [])
    else:
        rows = []
        fieldnames = []
    return rows, fieldnames


def _write_users_csv(rows: list[Dict[str, str]], fieldnames: list[str]) -> None:
    if not fieldnames:
        return
    with open(ASSETS_CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


class UserRiskUpdateRequest(BaseModel):
    user_id: str
    risk_profile: float | str = Field(
        validation_alias=AliasChoices("risk_profile", "risk_appetite", "risk_appetitie")
    )


class UserAgeUpdateRequest(BaseModel):
    user_id: str
    age: int = Field(..., ge=18, le=100)


class RetirementPlanRequest(BaseModel):
    retirement_age: int = Field(..., ge=19, le=100)
    monthly_expenses: float = Field(..., ge=0)
    essential_monthly_expenses: float = Field(..., ge=0)


class ManualAssetCreateRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    category: str = Field(..., min_length=1, max_length=40)
    value: float = Field(..., ge=0)
    symbol: str | None = Field(default=None, max_length=20)


class PortfolioHoldingCreateRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)
    asset_class: str = Field(..., min_length=1, max_length=20)
    qty: float = Field(1.0, gt=0)
    avg_price: float | None = Field(default=None, ge=0)
    name: str | None = Field(default=None, max_length=80)


class LiabilityItemCreateRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    amount: float = Field(..., ge=0)
    is_mortgage: bool = False


class IncomeStreamCreateRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    monthly_amount: float = Field(..., ge=0)


class RegisterRequest(BaseModel):
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str


class SurveyProfileUpdateRequest(BaseModel):
    user_id: str
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    country: str | None = None
    age: int | None = Field(default=None, ge=18, le=100)
    age_group: str | None = None


class UserProfileDetailsUpdateRequest(BaseModel):
    user_id: str
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    country: str | None = None
    investor_type: str | None = None
    currency: str | None = None
    password: str | None = None


class ScreenshotMergeRequest(BaseModel):
    holdings: list[Dict[str, Any]]


class CoinListingResponse(BaseModel):
    id: str
    name: str
    symbol: str
    image: str | None = None
    market_cap_rank: float | int | None = None
    current_price: float | int | None = None
    market_cap: float | int | None = None
    total_volume: float | int | None = None
    price_change_percentage_24h: float | int | None = None
    price_change_percentage_7d: float | int | None = None
    circulating_supply: float | int | None = None
    ath: float | int | None = None
    ath_change_percentage: float | int | None = None

class StockListingResponse(BaseModel):
    id: str
    name: str
    symbol: str
    current_price: float | int | None = None
    market_cap: float | int | None = None
    total_volume: float | int | None = None
    price_change_percentage_24h: float | int | None = None
    ath: float | int | None = None


class ScreenshotParseRequest(BaseModel):
    image_base64: str
    model: str = api.DEFAULT_VISION_MODEL
    page_text: str | None = None


class ScreenshotHolding(BaseModel):
    asset_class: str
    symbol: str
    qty: float | None = None
    avg_price: float | None = None
    current_price: float | None = None
    market_value: float | None = None
    name: str | None = None
    confidence: float | None = None


class ScreenshotConfirmRequest(BaseModel):
    import_id: str
    holdings: list[ScreenshotHolding]


class ScreenshotParseRequest(BaseModel):
    image_base64: str
    model: str = api.DEFAULT_VISION_MODEL
    page_text: str | None = None


class ScreenshotHolding(BaseModel):
    asset_class: str
    symbol: str
    qty: float | None = None
    avg_price: float | None = None
    current_price: float | None = None
    market_value: float | None = None
    name: str | None = None
    confidence: float | None = None


class ScreenshotConfirmRequest(BaseModel):
    import_id: str
    holdings: list[ScreenshotHolding]


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class AssetResolveResponse(BaseModel):
    query: str
    symbol: str
    name: str
    category: str
    source: str


class InsightsResponse(BaseModel):
    type: str
    symbol: str
    name: str
    period: Dict[str, Any]
    metrics: Dict[str, Any]
    notable_moves: list[Dict[str, Any]]
    drivers: list[Dict[str, Any]]
    narrative: str
    tldr: list[str]
    conclusion: str
    disclaimer: str
    citations: list[Dict[str, Any]]
    warnings: list[str]



@app.get("/health", tags=["Health"], summary="API health check")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/app/content/video", tags=["Health"], summary="Get app help video URL")
def get_app_help_video() -> Dict[str, str]:
    return {
        "status": "ok",
        "youtube_url": YOUTUBE_HELP_VIDEO_URL,
        "embed_url": YOUTUBE_HELP_EMBED_URL,
    }


@app.post("/auth/login", tags=["Users"], summary="Authenticate a user")
def login(payload: LoginRequest) -> Dict[str, Any]:
    try:
        result = api.authenticate_login_user(
            login_csv_path=LOGIN_CSV_PATH,
            username=payload.username,
            password=payload.password,
        )
        return {"status": "ok", **result}
    except api.LoginValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except api.LoginAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"login failed: {exc}") from exc


@app.get(
    "/api/assets/resolve",
    tags=["Market"],
    summary="Resolve a symbol to stock, crypto, commodity, or unknown",
    response_model=AssetResolveResponse,
)
async def resolve_asset_category(
    q: str = Query(..., description="Symbol or alias to resolve, e.g. AAPL, BTC, XAU"),
) -> AssetResolveResponse:
    result = await api.resolve_asset(q)
    return AssetResolveResponse(**result)


@app.get(
    "/api/insights",
    tags=["Market"],
    summary="Get historical analytics + grounded narrative for a symbol",
    response_model=InsightsResponse,
)
async def get_asset_insights(
    request: Request,
    type: str = Query(..., description="One of: stock, crypto, commodity"),
    symbol: str = Query(..., description="Ticker/symbol to analyze"),
    months: int = Query(3, ge=1, le=24, description="Historical window in months"),
    user_id: str | None = Query(None, description="Optional user id for rate limiting"),
) -> InsightsResponse:
    try:
        rate_subject = f"user:{user_id}" if user_id else f"ip:{getattr(request.client, 'host', 'unknown')}"
        _enforce_insights_rate_limit(rate_subject)
        result = await api.build_insights(asset_type=type, symbol=symbol, months=months)
        return InsightsResponse(**result)
    except api.InsightError as exc:
        detail = str(exc)
        if detail == "price data not found":
            detail = (
                f"price data not found for type='{type}', symbol='{symbol}', months={months}. "
                "Check the type/symbol pair, e.g. stock:AAPL, crypto:BTC, commodity:GOLD."
            )
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"insights failed: {exc}") from exc

@app.get(
    "/api/market/cryptos",
    tags=["Market"],
    summary="Get CoinGecko crypto listings in normalized format",
    response_model=list[StockListingResponse],
)
def get_crypto_listings(
    page: int = Query(1, ge=1, description="CoinGecko page number"),
    per_page: int = Query(50, ge=1, le=250, description="Items per page (max 250)"),
) -> list[StockListingResponse]:
    try:
        rows = api.fetch_coingecko_coin_listings(page=page, per_page=per_page)
        return [StockListingResponse(**row) for row in rows]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"coingecko fetch failed: {exc}") from exc

@app.get(
    "/api/market/stocks",
    tags=["Market"],
    summary="Get stock listings in normalized format",
    response_model=list[StockListingResponse],
)
def get_stock_listings(
    page: int = Query(1, ge=1, description="Stock page number"),
    per_page: int = Query(50, ge=1, le=250, description="Items per page (max 250)"),
) -> list[StockListingResponse]:
    try:
        rows = api.get_precomputed_stock_rankings(
            page=page,
            per_page=per_page,
        )
        return [StockListingResponse(**row) for row in rows]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        print(f"[api] stock fetch failed: {exc}")
        raise HTTPException(status_code=502, detail=f"stock fetch failed: {exc}") from exc


@app.get(
    "/api/market/commodities",
    tags=["Market"],
    summary="Get commodity listings in normalized format",
    response_model=list[CoinListingResponse],
)
def get_commodity_listings(
    page: int = Query(1, ge=1, description="Commodity page number"),
    per_page: int = Query(50, ge=1, le=250, description="Items per page (max 250)"),
) -> list[CoinListingResponse]:
    try:
        rows = api.get_precomputed_commodity_rankings(
            page=page,
            per_page=per_page,
        )
        return [CoinListingResponse(**row) for row in rows]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        print(f"[api] commodity fetch failed: {exc}")
        raise HTTPException(status_code=502, detail=f"commodity fetch failed: {exc}") from exc


@app.post("/auth/register", tags=["Users"], summary="Register login user into users.csv")
def register_user(payload: RegisterRequest) -> Dict[str, Any]:
    try:
        result = api.register_login_user(
            login_csv_path=LOGIN_CSV_PATH,
            username=payload.username,
            password=payload.password,
            user_id=_next_available_user_id(),
        )
        api.add_default_user_profile(
            json_path=USER_JSON_PATH,
            user_id=result["user_id"],
            name=result["username"],
        )
        api.add_default_assets_row(
            csv_path=ASSETS_CSV_PATH,
            user_id=result["user_id"],
            name=result["username"],
        )
        return {"status": "ok", **result}
    except api.RegisterValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except api.RegisterConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"register failed: {exc}") from exc


@app.post("/users/survey/profile", tags=["Users"], summary="Persist survey profile fields into users.csv")
def update_survey_profile(payload: SurveyProfileUpdateRequest) -> Dict[str, Any]:
    try:
        user_id = payload.user_id.strip()
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")

        first = (payload.first_name or "").strip()
        last = (payload.last_name or "").strip()
        full_name = " ".join(part for part in (first, last) if part).strip()

        updates = {
            "email": (payload.email or "").strip(),
            "country": (payload.country or "").strip(),
        }
        if payload.age is not None:
            updates["age"] = str(payload.age)
            updates["age_group"] = _age_to_group(int(payload.age))
        else:
            updates["age_group"] = (payload.age_group or "").strip()
        if full_name:
            updates["name"] = full_name

        _update_user_csv_profile(user_id=user_id, updates=updates)

        users = _read_users_data()
        user = users.get(user_id)
        if isinstance(user, dict):
            if full_name:
                user["name"] = full_name
            if "age" in updates:
                user["age"] = int(payload.age or 0)
            if updates.get("age_group"):
                user["age_group"] = updates["age_group"]
            user["email"] = updates.get("email", user.get("email", ""))
            user["country"] = updates.get("country", user.get("country", ""))
            users[user_id] = user
            _write_users_data(users)

        return {"status": "ok", "user_id": user_id, "updates": updates}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"survey profile update failed: {exc}") from exc


@app.post("/users/profile/details", tags=["Users"], summary="Persist profile details into users.csv")
def update_profile_details(payload: UserProfileDetailsUpdateRequest) -> Dict[str, Any]:
    try:
        user_id = (payload.user_id or "").strip()
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")

        first = (payload.first_name or "").strip()
        last = (payload.last_name or "").strip()
        full_name = " ".join(part for part in (first, last) if part).strip()

        updates: Dict[str, Any] = {
            "email": (payload.email or "").strip(),
            "country": (payload.country or "").strip(),
            "investor_type": (payload.investor_type or "").strip(),
            "currency": (payload.currency or "").strip(),
        }
        if full_name:
            updates["name"] = full_name
        password = (payload.password or "").strip()
        if password:
            updates["password"] = password

        _update_user_csv_profile(user_id=user_id, updates=updates)

        users = _read_users_data()
        user = users.get(user_id)
        if isinstance(user, dict):
            if full_name:
                user["name"] = full_name
            user["email"] = updates.get("email", user.get("email", ""))
            user["country"] = updates.get("country", user.get("country", ""))
            users[user_id] = user
            _write_users_data(users)

        safe_updates = dict(updates)
        if "password" in safe_updates:
            safe_updates["password"] = "***"

        return {"status": "ok", "user_id": user_id, "updates": safe_updates}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"profile details update failed: {exc}") from exc


@app.get("/users/profile/details/{user_id}", tags=["Users"], summary="Read profile details from users.csv")
def get_profile_details(user_id: str) -> Dict[str, Any]:
    try:
        user_id = (user_id or "").strip()
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")
        row = _read_user_csv_profile(user_id)
        if not row:
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found in users.csv")
        return {"status": "ok", "user_id": user_id, "profile": row}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"profile details read failed: {exc}") from exc


@app.get(
    "/users/{user_id}/danger/export",
    tags=["Users"],
    summary="Export current portfolio holdings as CSV",
)
def export_user_portfolio_csv(user_id: str) -> Response:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        portfolio = user.get("portfolio", {})
        rows: list[Dict[str, Any]] = []
        if isinstance(portfolio, dict):
            for asset_class in ("stocks", "cryptos", "commodities"):
                entries = portfolio.get(asset_class, [])
                if not isinstance(entries, list):
                    continue
                for item in entries:
                    qty = float(item.get("qty", 0.0) or 0.0)
                    avg_price = float(item.get("avg_price", 0.0) or 0.0)
                    current_price = float(item.get("current_price", 0.0) or 0.0)
                    market_value = float(item.get("market_value", qty * current_price) or 0.0)
                    rows.append(
                        {
                            "user_id": user_id,
                            "asset_class": asset_class,
                            "symbol": str(item.get("symbol", "") or ""),
                            "name": str(item.get("name", "") or ""),
                            "qty": round(qty, 8),
                            "avg_price": round(avg_price, 6),
                            "current_price": round(current_price, 6),
                            "market_value": round(market_value, 2),
                        }
                    )

        output = io.StringIO()
        headers = ["user_id", "asset_class", "symbol", "name", "qty", "avg_price", "current_price", "market_value"]
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

        csv_data = output.getvalue()
        filename = f"{user_id}_portfolio_export.csv"
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"portfolio export failed: {exc}") from exc


@app.delete(
    "/users/{user_id}/danger/portfolio",
    tags=["Users"],
    summary="Delete all portfolio holdings for a user",
)
def delete_user_portfolio_data(user_id: str) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        user["portfolio"] = {"stocks": [], "cryptos": [], "commodities": []}
        users[user_id] = _recalculate_user_financials(user)
        _write_users_data(users)
        _sync_user_to_assets_csv(user_id, users[user_id])

        history_path = USER_PORTFOLIO_DIR / f"{user_id}.json"
        if history_path.exists():
            history_path.unlink()

        return {"status": "ok", "user_id": user_id, "message": "portfolio data deleted"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"portfolio delete failed: {exc}") from exc


@app.delete(
    "/users/{user_id}/danger/account",
    tags=["Users"],
    summary="Permanently delete account and all related data",
)
def delete_user_account(user_id: str) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        if not isinstance(users.get(user_id), dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        users.pop(user_id, None)
        _write_users_data(users)

        rows, fieldnames = _load_users_csv()
        if fieldnames:
            rows = [row for row in rows if (row.get("user_id") or "").strip() != user_id]
            _write_users_csv(rows, fieldnames)

        history_path = USER_PORTFOLIO_DIR / f"{user_id}.json"
        if history_path.exists():
            history_path.unlink()

        return {"status": "ok", "user_id": user_id, "message": "account deleted"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"account delete failed: {exc}") from exc


@app.get("/users", tags=["Users"], summary="Get all users")
def get_users() -> Dict[str, Any]:
    try:
        data = _read_users_data()
        users = {k: v for k, v in data.items() if not k.startswith("_")}
        return {"status": "ok", "count": len(users), "users": users}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read users failed: {exc}") from exc


@app.get("/users/{user_id}", tags=["Users"], summary="Get user by ID")
def get_user_by_id(user_id: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        user = _ensure_financial_collections(user)
        user = _enrich_portfolio_with_ath(user)
        return {"status": "ok", "user_id": user_id, "user": user}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read user failed: {exc}") from exc


@app.get(
    "/users/{user_id}/benchmarks",
    tags=["Users"],
    summary="Get Singapore peer benchmarking for a user",
)
def get_user_peer_benchmarks(user_id: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if user is None:
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        benchmark_user = dict(user) if isinstance(user, dict) else {}
        raw_age = benchmark_user.get("age")
        needs_csv_age = raw_age in (None, "", 0, "0")
        if needs_csv_age:
            csv_profile = _read_user_csv_profile(user_id)
            csv_age = (csv_profile.get("age") or "").strip()
            if csv_age:
                try:
                    benchmark_user["age"] = int(float(csv_age))
                except Exception:
                    pass
        result = api.build_peer_benchmarks(benchmark_user)
        return {"status": "ok", "user_id": user_id, **result}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"peer benchmarking failed: {exc}") from exc


@app.get(
    "/users/{user_id}/financials",
    tags=["Users"],
    summary="Get editable financial items by user ID",
)
def get_user_financial_items(user_id: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        user = _ensure_financial_collections(user)
        return {
            "status": "ok",
            "user_id": user_id,
            "manual_assets": user.get("manual_assets", []),
            "liability_items": user.get("liability_items", []),
            "income_streams": user.get("income_streams", []),
            "summary": {
                "income": user.get("income", 0.0),
                "liability": user.get("liability", 0.0),
                "mortgage": user.get("mortgage", 0.0),
                "estate": user.get("estate", 0.0),
                "portfolio_value": user.get("portfolio_value", 0.0),
                "net_worth": user.get("net_worth", 0.0),
            },
            "user": user,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read financial items failed: {exc}") from exc


@app.post(
    "/users/{user_id}/financials/assets",
    tags=["Users"],
    summary="Add a manual asset to a user profile",
)
def add_user_manual_asset(user_id: str, payload: ManualAssetCreateRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        user = _ensure_financial_collections(user)
        normalized_category = _normalize_manual_asset_category(payload.category)
        raw_label = payload.label.strip()
        raw_symbol = (payload.symbol or "").strip()
        if normalized_category in {"stock", "crypto", "commodity"}:
            symbol = (raw_symbol or raw_label).strip().upper()
            if not symbol:
                raise HTTPException(status_code=400, detail="symbol is required for stock, crypto, and commodity assets")
            label = symbol
        else:
            symbol = None
            label = raw_label

        item = {
            "id": str(uuid.uuid4()),
            "label": label,
            "category": normalized_category,
            "value": round(float(payload.value), 2),
        }
        if symbol:
            item["symbol"] = symbol
        user["manual_assets"].append(item)
        users[user_id] = _recalculate_user_financials(user)
        _write_users_data(users)
        _sync_user_to_assets_csv(user_id, users[user_id])
        return {"status": "ok", "user_id": user_id, "item": item, "user": users[user_id]}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"asset create failed: {exc}") from exc


@app.post(
    "/users/{user_id}/financials/portfolio",
    tags=["Users"],
    summary="Add a holding into user portfolio and fetch latest market price",
)
def add_user_portfolio_holding(user_id: str, payload: PortfolioHoldingCreateRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        portfolio = user.get("portfolio")
        if not isinstance(portfolio, dict):
            portfolio = {"stocks": [], "cryptos": [], "commodities": []}

        symbol = payload.symbol.strip().upper()
        if not symbol:
            raise HTTPException(status_code=400, detail="symbol is required")

        requested = payload.asset_class.strip().lower()
        if requested in {"stock", "stocks", "equity", "equities"}:
            bucket = "stocks"
            query_type = "STOCK"
        elif requested in {"crypto", "cryptos", "digital_asset", "digital_assets"}:
            bucket = "cryptos"
            query_type = "CRYPTO"
        elif requested in {"commodity", "commodities"}:
            bucket = "commodities"
            query_type = "COMMODITY"
        else:
            raise HTTPException(status_code=400, detail="asset_class must be stock, crypto, or commodity")

        quote = get_market_quote(query=f"{query_type}, {symbol}")
        fetched_symbol = str(quote.get("symbol") or symbol).upper()
        price = round(float(quote.get("price") or 0.0), 6)
        if price <= 0:
            raise HTTPException(status_code=400, detail=f"could not fetch a valid market price for '{symbol}'")

        qty = round(float(payload.qty), 8)
        avg_price = round(float(payload.avg_price), 6) if payload.avg_price is not None else price
        market_value = round(qty * price, 2)
        incoming_name = (payload.name or "").strip()

        entries = portfolio.get(bucket, [])
        if not isinstance(entries, list):
            entries = []

        existing = next(
            (item for item in entries if str(item.get("symbol", "")).strip().upper() == fetched_symbol),
            None,
        )
        if existing is not None:
            old_qty = float(existing.get("qty", 0.0) or 0.0)
            old_avg = float(existing.get("avg_price", price) or price)
            new_qty = round(old_qty + qty, 8)
            if new_qty > 0:
                weighted_avg = round(((old_qty * old_avg) + (qty * avg_price)) / new_qty, 6)
            else:
                weighted_avg = avg_price
            existing["qty"] = new_qty
            existing["avg_price"] = weighted_avg
            existing["current_price"] = price
            existing["market_value"] = round(new_qty * price, 2)
            if incoming_name:
                existing["name"] = incoming_name
            item = existing
        else:
            item = {
                "symbol": fetched_symbol,
                "qty": qty,
                "avg_price": avg_price,
                "current_price": price,
                "market_value": market_value,
            }
            if incoming_name:
                item["name"] = incoming_name
            entries.append(item)

        portfolio[bucket] = entries
        user["portfolio"] = portfolio
        users[user_id] = _recalculate_user_financials(user)
        _write_users_data(users)
        _sync_user_to_assets_csv(user_id, users[user_id])
        return {"status": "ok", "user_id": user_id, "asset_class": bucket, "item": item, "user": users[user_id]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"portfolio holding create failed: {exc}") from exc


@app.delete(
    "/users/{user_id}/financials/portfolio/{asset_class}/{symbol}",
    tags=["Users"],
    summary="Remove a portfolio holding (stocks, cryptos, or commodities) from a user profile",
)
def remove_user_portfolio_holding(user_id: str, asset_class: str, symbol: str) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        portfolio = user.get("portfolio")
        if not isinstance(portfolio, dict):
            raise HTTPException(status_code=400, detail="user portfolio is not in expected format")

        bucket = asset_class.strip().lower()
        if bucket in {"stock", "stocks", "equity", "equities"}:
            bucket = "stocks"
        elif bucket in {"crypto", "cryptos", "digital_assets", "digital_asset"}:
            bucket = "cryptos"
        elif bucket in {"commodity", "commodities"}:
            bucket = "commodities"
        else:
            raise HTTPException(status_code=400, detail="asset_class must be stocks, cryptos, or commodities")

        entries = portfolio.get(bucket, [])
        if not isinstance(entries, list):
            raise HTTPException(status_code=400, detail=f"portfolio bucket '{bucket}' is invalid")

        target = symbol.strip().lower()
        if not target:
            raise HTTPException(status_code=400, detail="symbol is required")

        remove_index = next(
            (
                idx
                for idx, item in enumerate(entries)
                if str(item.get("symbol", "")).strip().lower() == target
            ),
            None,
        )
        if remove_index is None:
            raise HTTPException(status_code=404, detail=f"holding '{symbol}' not found in {bucket}")

        entries.pop(remove_index)
        portfolio[bucket] = entries
        user["portfolio"] = portfolio
        users[user_id] = _recalculate_user_financials(user)
        _write_users_data(users)
        return {"status": "ok", "user_id": user_id, "asset_class": bucket, "symbol": symbol, "user": users[user_id]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"portfolio holding delete failed: {exc}") from exc


@app.delete(
    "/users/{user_id}/financials/assets/{item_id}",
    tags=["Users"],
    summary="Remove a manual asset from a user profile",
)
def remove_user_manual_asset(user_id: str, item_id: str) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        user = _ensure_financial_collections(user)
        before = len(user["manual_assets"])
        user["manual_assets"] = [item for item in user["manual_assets"] if item.get("id") != item_id]
        if len(user["manual_assets"]) == before:
            raise HTTPException(status_code=404, detail=f"asset item '{item_id}' not found")
        users[user_id] = _recalculate_user_financials(user)
        _write_users_data(users)
        _sync_user_to_assets_csv(user_id, users[user_id])
        return {"status": "ok", "user_id": user_id, "user": users[user_id]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"asset delete failed: {exc}") from exc


@app.post(
    "/users/{user_id}/financials/liabilities",
    tags=["Users"],
    summary="Add a liability item to a user profile",
)
def add_user_liability_item(user_id: str, payload: LiabilityItemCreateRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        user = _ensure_financial_collections(user)
        item = {
            "id": str(uuid.uuid4()),
            "label": payload.label.strip(),
            "amount": round(float(payload.amount), 2),
            "is_mortgage": bool(payload.is_mortgage),
        }
        user["liability_items"].append(item)
        users[user_id] = _recalculate_user_financials(user)
        _write_users_data(users)
        _sync_user_to_assets_csv(user_id, users[user_id])
        return {"status": "ok", "user_id": user_id, "item": item, "user": users[user_id]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"liability create failed: {exc}") from exc


@app.delete(
    "/users/{user_id}/financials/liabilities/{item_id}",
    tags=["Users"],
    summary="Remove a liability item from a user profile",
)
def remove_user_liability_item(user_id: str, item_id: str) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        user = _ensure_financial_collections(user)
        before = len(user["liability_items"])
        user["liability_items"] = [item for item in user["liability_items"] if item.get("id") != item_id]
        if len(user["liability_items"]) == before:
            raise HTTPException(status_code=404, detail=f"liability item '{item_id}' not found")
        users[user_id] = _recalculate_user_financials(user)
        _write_users_data(users)
        _sync_user_to_assets_csv(user_id, users[user_id])
        return {"status": "ok", "user_id": user_id, "user": users[user_id]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"liability delete failed: {exc}") from exc


@app.post(
    "/users/{user_id}/financials/income",
    tags=["Users"],
    summary="Add an income stream to a user profile",
)
def add_user_income_stream(user_id: str, payload: IncomeStreamCreateRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        user = _ensure_financial_collections(user)
        item = {
            "id": str(uuid.uuid4()),
            "label": payload.label.strip(),
            "monthly_amount": round(float(payload.monthly_amount), 2),
        }
        user["income_streams"].append(item)
        users[user_id] = _recalculate_user_financials(user)
        _write_users_data(users)
        _sync_user_to_assets_csv(user_id, users[user_id])
        return {"status": "ok", "user_id": user_id, "item": item, "user": users[user_id]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"income create failed: {exc}") from exc


@app.delete(
    "/users/{user_id}/financials/income/{item_id}",
    tags=["Users"],
    summary="Remove an income stream from a user profile",
)
def remove_user_income_stream(user_id: str, item_id: str) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        user = _ensure_financial_collections(user)
        before = len(user["income_streams"])
        user["income_streams"] = [item for item in user["income_streams"] if item.get("id") != item_id]
        if len(user["income_streams"]) == before:
            raise HTTPException(status_code=404, detail=f"income stream '{item_id}' not found")
        users[user_id] = _recalculate_user_financials(user)
        _write_users_data(users)
        _sync_user_to_assets_csv(user_id, users[user_id])
        return {"status": "ok", "user_id": user_id, "user": users[user_id]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"income delete failed: {exc}") from exc


@app.post(
    "/users/age",
    tags=["Users"],
    summary="Update user age",
)
def update_user_age(payload: UserAgeUpdateRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(payload.user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{payload.user_id}' not found")

        user["age"] = int(payload.age)
        users[payload.user_id] = user
        _write_users_data(users)
        return {
            "status": "ok",
            "user_id": payload.user_id,
            "age": user["age"],
            "user": user,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"age update failed: {exc}") from exc


@app.get(
    "/users/{user_id}/wellness",
    tags=["Users"],
    summary="Get wellness section by user ID",
)
def get_user_wellness_by_id(user_id: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        return {
            "status": "ok",
            "user_id": user_id,
            "wellness_metrics": user.get("wellness_metrics", {}),
            "risk_profile": user.get("risk_profile"),
            "financial_wellness_score": user.get("financial_wellness_score"),
            "financial_stress_index": user.get("financial_stress_index"),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read wellness failed: {exc}") from exc


@app.get(
    "/users/{user_id}/impact",
    tags=["Users"],
    summary="Get estimated portfolio impact and missed-opportunity metrics by user ID",
)
def get_user_portfolio_impact(
    user_id: str,
    horizon_years: int = Query(5, ge=1, le=10, description="Scenario horizon in years"),
) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        result = api.build_portfolio_impact(user, horizon_years=horizon_years)
        return {"status": "ok", "user_id": user_id, **result}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"impact calculation failed: {exc}") from exc


@app.get(
    "/users/{user_id}/compatibility",
    tags=["Compatibility"],
    summary="Evaluate compatibility between user profile and target asset",
)
async def get_user_target_compatibility(
    user_id: str,
    target_type: str = Query(..., description="stock | crypto | commodity"),
    symbol: str = Query(..., description="Target symbol, e.g. SPY, BTC, GC=F"),
    model: str = Query("gpt-4.1-mini", description="OpenAI model for synthesis"),
) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        symbol_query = (symbol or "").strip().upper()
        resolve_query = symbol_query[:-4] if symbol_query.endswith("-USD") else symbol_query
        resolved = await api.resolve_asset(resolve_query)
        resolved_category = str(resolved.get("category", "unknown")).lower()

        result = api.evaluate_compatibility(
            user=user,
            target_type=target_type,
            symbol=symbol,
            resolved_category=resolved_category,
        )
        llm = api.synthesize_compatibility_with_llm(
            user_id=user_id,
            user=user,
            compatibility=result,
            model=model,
        )
        return {
            "status": "ok",
            "user_id": user_id,
            "risk_profile": user.get("risk_profile"),
            "financial_wellness_score": user.get("financial_wellness_score"),
            "financial_stress_index": user.get("financial_stress_index"),
            "resolved_asset": resolved,
            "llm_model": llm.get("model"),
            "llm_synthesis": llm.get("synthesis"),
            **result,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"compatibility synthesis failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"compatibility check failed: {exc}") from exc


@app.get(
    "/users/{user_id}/recommendations",
    tags=["Recommendations"],
    summary="Get rule-based recommendations by user ID",
    include_in_schema=False,
)
def get_user_recommendations(
    user_id: str,
    limit: int = Query(3, ge=1, le=10, description="Maximum number of recommendation items"),
) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        result = api.generate_user_recommendations(user, limit=limit)
        return {"status": "ok", "user_id": user_id, **result}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read recommendations failed: {exc}") from exc


@app.get(
    "/users/{user_id}/recommendations/gpt",
    tags=["Recommendations"],
    summary="Get GPT-generated recommendations by user ID",
)
def get_user_recommendations_gpt(
    user_id: str,
    limit: int = Query(3, ge=1, le=10, description="Maximum number of recommendation items"),
    model: str = Query("gpt-4.1-mini", description="OpenAI model name"),
) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        rule_based = api.generate_user_recommendations(user, limit=limit)
        gpt_output = api.generate_gpt_recommendations(
            user_id=user_id,
            user=user,
            rule_based=rule_based,
            limit=limit,
            model=model,
        )
        return {
            "status": "ok",
            "user_id": user_id,
            "model": gpt_output["model"],
            "rule_based": rule_based,
            "gpt_recommendations": gpt_output["recommendations"],
        }
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"gpt recommendation failed: {exc}") from exc


@app.post(
    "/users/{user_id}/imports/screenshot/parse",
    tags=["Imports"],
    summary="Parse screenshot into holdings (stocks/cryptos/commodities)",
)
def parse_screenshot_import(user_id: str, payload: ScreenshotParseRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        if not isinstance(users.get(user_id), dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        parsed = api.parse_screenshot_with_llm(
            payload.image_base64,
            model=payload.model,
            page_text=payload.page_text,
        )
        pending = api.create_pending_import(user_id=user_id, parsed=parsed)
        return {
            "status": "ok",
            "user_id": user_id,
            "import_id": pending["import_id"],
            "parsed": pending["parsed"],
            "next_step": "Call /users/{user_id}/imports/screenshot/confirm with this import_id",
        }
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"screenshot parse failed: {exc}") from exc


@app.post(
    "/imports/screenshot/parse",
    tags=["Imports"],
    summary="Parse screenshot into holdings without requiring login",
)
def parse_screenshot_import_guest(payload: ScreenshotParseRequest) -> Dict[str, Any]:
    try:
        parsed = api.parse_screenshot_with_llm(
            payload.image_base64,
            model=payload.model,
            page_text=payload.page_text,
        )
        return {
            "status": "ok",
            "parsed": parsed,
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"screenshot parse failed: {exc}") from exc


@app.post(
    "/users/{user_id}/imports/screenshot/confirm",
    tags=["Imports"],
    summary="Confirm parsed screenshot holdings and merge into user portfolio",
)
async def confirm_screenshot_import(user_id: str, request: Request) -> Dict[str, Any]:
    try:
        body = await request.json()
        if not isinstance(body, dict):
            raise HTTPException(status_code=400, detail="request body must be a JSON object")

        import_id = body.get("import_id")
        holdings = body.get("holdings")
        if not isinstance(import_id, str) or not import_id.strip():
            raise HTTPException(status_code=400, detail="import_id is required")
        if not isinstance(holdings, list):
            raise HTTPException(status_code=400, detail="holdings must be an array")

        users = _read_users_data()
        if not isinstance(users.get(user_id), dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        override_holdings = holdings
        if len(override_holdings) == 0:
            raise HTTPException(
                status_code=400,
                detail="holdings array is empty; please provide at least one valid row",
            )
        result = api.confirm_import(
            import_id=import_id.strip(),
            user_id=user_id,
            users_data=users,
            override_holdings=override_holdings,
        )
        _write_users_data(users)
        diagnostics = {
            "received_holdings_count": len(override_holdings) if override_holdings is not None else None,
            "received_holdings_preview": (override_holdings or [])[:3],
            "raw_body_preview": {k: body.get(k) for k in ("import_id", "holdings")},
        }
        return {
            "status": "ok",
            "user_id": user_id,
            "import_id": result["import_id"],
            "import_status": result["status"],
            "merged_count": result["merged_count"],
            "skipped": result["skipped"],
            "portfolio_value": result["portfolio_value"],
            "total_balance": result["total_balance"],
            "net_worth": result["net_worth"],
            "portfolio": result["portfolio"],
            "diagnostics": diagnostics,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        preview = []
        if isinstance(locals().get("holdings"), list):
            preview = locals()["holdings"][:3]
        raise HTTPException(status_code=400, detail=f"{exc}; raw_holdings_preview={preview}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"screenshot confirm failed: {exc}") from exc


@app.post(
    "/users/{user_id}/imports/screenshot/merge",
    tags=["Imports"],
    summary="Merge screenshot-extracted holdings directly into user portfolio",
)
def merge_screenshot_holdings_direct(user_id: str, payload: ScreenshotMergeRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        result = api.merge_holdings_into_user(user, payload.holdings)
        users[user_id] = _recalculate_user_financials(user)
        _write_users_data(users)
        _sync_user_to_assets_csv(user_id, users[user_id])
        return {"status": "ok", "user_id": user_id, **result, "user": users[user_id]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"screenshot direct merge failed: {exc}") from exc


@app.post(
    "/users/risk",
    tags=["Users"],
    summary="Update user risk appetite and recalibrate scores",
)
def update_user_risk_and_recalibrate(payload: UserRiskUpdateRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(payload.user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{payload.user_id}' not found")

        user["risk_profile"] = _normalize_risk_profile(payload.risk_profile)
        wellness_result = api.calculate_user_wellness(user)
        user["wellness_metrics"] = wellness_result["wellness_metrics"]
        user["financial_wellness_score"] = wellness_result["financial_wellness_score"]
        user["financial_stress_index"] = wellness_result["financial_stress_index"]
        users[payload.user_id] = user
        _write_users_data(users)

        return {
            "status": "ok",
            "user_id": payload.user_id,
            "risk_profile": user["risk_profile"],
            "wellness_metrics": user["wellness_metrics"],
            "financial_wellness_score": user["financial_wellness_score"],
            "financial_stress_index": user["financial_stress_index"],
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"risk update failed: {exc}") from exc


@app.post(
    "/users/{user_id}/retirement",
    tags=["Retirement"],
    summary="Build a retirement plan using current profile, portfolio, and target retirement age",
)
def build_user_retirement_plan(user_id: str, payload: RetirementPlanRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        plan_user = dict(user)
        raw_age = plan_user.get("age")
        needs_csv_age = raw_age in (None, "", 0, "0")
        if needs_csv_age:
            csv_profile = _read_user_csv_profile(user_id)
            csv_age = (csv_profile.get("age") or "").strip()
            if csv_age:
                try:
                    plan_user["age"] = int(float(csv_age))
                except Exception:
                    pass

        plan = api.build_retirement_plan(
            user=plan_user,
            retirement_age=payload.retirement_age,
            monthly_expenses=payload.monthly_expenses,
            essential_monthly_expenses=payload.essential_monthly_expenses,
        )
        return {"status": "ok", "user_id": user_id, **plan}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"retirement plan failed: {exc}") from exc


@app.get(
    "/market/quote",
    tags=["Market"],
    summary="Get quote for STOCK, CRYPTO, or COMMODITY",
)
def get_market_quote(
    query: str = Query(
        ...,
        description="Format: STOCK, SPY or CRYPTO, BTC or COMMODITY, GOLD",
    ),
) -> Dict[str, Any]:
    try:
        parsed = _parse_market_query(query)
        asset_type = parsed["asset_type"]
        ticker = parsed["ticker"]

        if asset_type == "STOCK":
            price = api.fetch_latest_prices([ticker])[ticker]
            return {"status": "ok", "asset_type": asset_type, "symbol": ticker, "price": price}

        if asset_type == "CRYPTO":
            crypto_quote = api.fetch_crypto_price(ticker)
            return {
                "status": "ok",
                "asset_type": asset_type,
                "symbol": crypto_quote["symbol"],
                "price": crypto_quote["price"],
            }

        commodity_quote = api.fetch_commodity_price(ticker)
        return {
            "status": "ok",
            "asset_type": asset_type,
            "symbol": commodity_quote["symbol"],
            "price": commodity_quote["price"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"quote retrieval failed: {exc}") from exc


@app.get(
    "/portfolio/{user_id}",
    tags=["Portfolio"],
    summary="Get portfolio positions by user ID",
)
def get_portfolio_by_user_id(user_id: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        user = _enrich_portfolio_with_ath(_ensure_financial_collections(user))
        return {"status": "ok", "user_id": user_id, "portfolio": user.get("portfolio", [])}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read portfolio failed: {exc}") from exc


@app.get(
    "/portfolio/{user_id}/history",
    tags=["Portfolio"],
    summary="Get daily portfolio history by user ID",
)
def get_portfolio_history_by_user_id(user_id: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        history = _read_user_portfolio_history(user_id)
        daily_points = history.get("daily_values", [])
        if not isinstance(daily_points, list):
            raise HTTPException(status_code=500, detail="invalid portfolio history format")

        return {
            "status": "ok",
            "user_id": user_id,
            "history": history,
            "count": len(daily_points),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read portfolio history failed: {exc}") from exc


@app.get(
    "/portfolio/{user_id}/{asset_class}",
    tags=["Portfolio"],
    summary="Get portfolio positions by asset class (stocks, cryptos, commodities)",
)
def get_portfolio_by_asset_class(user_id: str, asset_class: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        bucket, positions = api.get_positions_by_asset_class(
            user=user,
            asset_class=asset_class,
            commodity_alias_symbols=api.COMMODITY_ALIAS_TO_SYMBOL.values(),
            common_commodity_etfs=COMMON_COMMODITY_ETFS,
        )

        return {
            "status": "ok",
            "user_id": user_id,
            "asset_class": bucket,
            "count": len(positions),
            "positions": positions,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read asset class failed: {exc}") from exc


@app.get("/update/assets", tags=["Updates"], summary="Update users' assets")
def update_assets() -> Dict[str, Any]:
    try:
        print("[api] /update/assets called")
        result = api.update_assets_file(str(USER_JSON_PATH), str(CSV_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"assets update failed: {exc}") from exc


@app.get("/update/prices", tags=["Updates"], summary="Update stock prices")
def update_prices() -> Dict[str, Any]:
    try:
        print("[api] /update/prices called")
        # Backward-compatible alias: portfolio prices only.
        result = api.update_stock_prices_file(str(USER_JSON_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"price update failed: {exc}") from exc


@app.get("/update/prices/portfolio", tags=["Updates"], summary="Update portfolio stock prices")
def update_portfolio_prices() -> Dict[str, Any]:
    try:
        print("[api] /update/prices/portfolio called")
        result = api.update_stock_prices_file(str(USER_JSON_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"portfolio price update failed: {exc}") from exc


@app.get("/update/prices/listings", tags=["Updates"], summary="Update stock listings cache prices")
def update_listing_cache_prices() -> Dict[str, Any]:
    try:
        print("[api] /update/prices/listings called")
        result = api.update_stock_listings_cache_prices_file(str(STOCK_LISTINGS_CACHE_PATH))
        symbols = result.get("symbols", {}) if isinstance(result, dict) else {}
        count = len(symbols) if isinstance(symbols, dict) else 0
        return {"status": "ok", "updated_symbols": count}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"listing cache price update failed: {exc}") from exc


@app.get(
    "/update/market/stocks",
    tags=["Updates"],
    summary="Ingest stock market snapshot and rebuild precomputed stock rankings",
)
def refresh_stock_market_rankings() -> Dict[str, Any]:
    try:
        print("[api] /update/market/stocks called")
        result = api.refresh_stock_market_data()
        meta = result.get("_meta", {}) if isinstance(result, dict) else {}
        return {
            "status": "ok",
            "source": meta.get("source"),
            "built_at_epoch": meta.get("built_at_epoch"),
            "ranked_count": meta.get("ranked_count"),
            "failed_count": meta.get("failed_count"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"stock market refresh failed: {exc}") from exc


@app.get(
    "/update/market/commodities",
    tags=["Updates"],
    summary="Ingest commodity market snapshot and rebuild precomputed commodity rankings",
)
def refresh_commodity_market_rankings() -> Dict[str, Any]:
    try:
        print("[api] /update/market/commodities called")
        result = api.refresh_commodity_market_data()
        meta = result.get("_meta", {}) if isinstance(result, dict) else {}
        return {
            "status": "ok",
            "source": meta.get("source"),
            "built_at_epoch": meta.get("built_at_epoch"),
            "ranked_count": meta.get("ranked_count"),
            "failed_count": meta.get("failed_count"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"commodity market refresh failed: {exc}") from exc


@app.get(
    "/update/cache/listings/rebuild",
    tags=["Updates"],
    summary="Rebuild stock listings cache from Nasdaq screener universe",
)
def rebuild_listing_cache() -> Dict[str, Any]:
    try:
        print("[api] /update/cache/listings/rebuild called")
        result = api.rebuild_stock_listings_cache_from_nasdaq(str(STOCK_LISTINGS_CACHE_PATH))
        meta = result.get("_meta", {}) if isinstance(result, dict) else {}
        symbols = result.get("symbols", {}) if isinstance(result, dict) else {}
        count = len(symbols) if isinstance(symbols, dict) else 0
        return {
            "status": "ok",
            "rebuilt_symbols": count,
            "source": meta.get("source"),
            "rebuilt_at_epoch": meta.get("rebuilt_at_epoch"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"listing cache rebuild failed: {exc}") from exc


@app.get("/update/wellness", tags=["Updates"], summary="Update wellness metrics")
def update_wellness() -> Dict[str, Any]:
    try:
        print("[api] /update/wellness called")
        result = api.update_wellness_file(str(USER_JSON_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"wellness update failed: {exc}") from exc


@app.get("/update/all", tags=["Updates"], summary="Run full update pipeline")
def update_all() -> Dict[str, Any]:
    try:
        print("[api] /update/all called")
        api.update_assets_file(str(USER_JSON_PATH), str(CSV_PATH))
        api.update_stock_prices_file(str(USER_JSON_PATH))
        result = api.update_wellness_file(str(USER_JSON_PATH))
        print("[api] /update/all completed")
        summary = _safe_summary(result)
        summary["pipeline"] = ["assets", "prices", "wellness"]
        return summary
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"full update failed: {exc}") from exc
