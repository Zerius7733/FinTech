import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import re
from typing import Any, Dict, List, Tuple
from uuid import uuid4

import requests

from backend.market_scripts.commodity_price_retriever import normalize_commodity_symbol


OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_VISION_MODEL = "gpt-4.1-mini"
BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
WORKSPACE_DIR = PROJECT_DIR.parent
IMPORTS_PATH = BACKEND_DIR / "data" / "json" / "screenshot_imports.json"
PENDING_TTL_HOURS = 24
CONFIRMED_TTL_HOURS = 168  # 7 days

CRYPTO_NAME_TO_SYMBOL = {
    "BITCOIN": "BTC-USD",
    "BTC": "BTC-USD",
    "ETHEREUM": "ETH-USD",
    "ETHER": "ETH-USD",
    "ETH": "ETH-USD",
    "SOLANA": "SOL-USD",
    "SOL": "SOL-USD",
    "XRP": "XRP-USD",
    "DOGE": "DOGE-USD",
    "DOGECOIN": "DOGE-USD",
}


def _find_api_key() -> str:
    direct = os.getenv("OPENAI_API_KEY")
    if direct:
        return direct

    candidate_paths = [
        PROJECT_DIR / ".env",
        BACKEND_DIR / ".env",
        WORKSPACE_DIR / ".env",
    ]

    for env_path in candidate_paths:
        if not env_path.exists():
            continue
        for line in env_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if not stripped.startswith("OPENAI_API_KEY="):
                continue
            _, value = stripped.split("=", maxsplit=1)
            return value.strip().strip('"').strip("'")
    return ""


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_imports_file() -> None:
    IMPORTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not IMPORTS_PATH.exists():
        IMPORTS_PATH.write_text("{}", encoding="utf-8")


def _load_imports() -> Dict[str, Any]:
    _ensure_imports_file()
    with open(IMPORTS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    imports = data if isinstance(data, dict) else {}
    pruned = _prune_imports(imports)
    if pruned != imports:
        _write_imports(pruned)
    return pruned


def _write_imports(data: Dict[str, Any]) -> None:
    _ensure_imports_file()
    with open(IMPORTS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _strip_data_uri(image_input: str) -> Tuple[str, str]:
    raw = (image_input or "").strip()
    if not raw:
        raise ValueError("image_base64 cannot be empty")

    mime = "image/png"
    b64 = raw
    if raw.startswith("data:"):
        header, _, payload = raw.partition(",")
        b64 = payload.strip()
        if ";base64" in header:
            mime = header[5:].split(";", 1)[0] or mime

    try:
        base64.b64decode(b64, validate=True)
    except Exception as exc:
        raise ValueError("image_base64 is not valid base64") from exc

    return b64, mime


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    text = text.replace("$", "")
    try:
        return float(text)
    except ValueError:
        # Fallback for strings like "2 BTC" or "44,444 XLM"
        match = re.search(r"[-+]?[0-9]*\.?[0-9]+", text)
        if not match:
            return None
        try:
            return float(match.group(0))
        except ValueError:
            return None


def _parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _prune_imports(imports: Dict[str, Any]) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    keep: Dict[str, Any] = {}
    for key, value in imports.items():
        if not isinstance(value, dict):
            continue
        status = str(value.get("status", "pending")).lower()
        created_at = _parse_iso(value.get("created_at"))
        confirmed_at = _parse_iso(value.get("confirmed_at"))

        reference = confirmed_at if status == "confirmed" and confirmed_at else created_at
        if reference is None:
            keep[key] = value
            continue

        age_hours = (now - reference).total_seconds() / 3600.0
        ttl = CONFIRMED_TTL_HOURS if status == "confirmed" else PENDING_TTL_HOURS
        if age_hours <= ttl:
            keep[key] = value
    return keep


def _normalize_asset_class(value: str) -> str:
    key = (value or "").strip().lower()
    mapping = {
        "stock": "stocks",
        "stocks": "stocks",
        "equity": "stocks",
        "equities": "stocks",
        "crypto": "cryptos",
        "cryptos": "cryptos",
        "cryptocurrency": "cryptos",
        "cryptocurrencies": "cryptos",
        "commodity": "commodities",
        "commodities": "commodities",
    }
    return mapping.get(key, "")


def _normalize_symbol(asset_class: str, symbol_or_name: str) -> str:
    base = (symbol_or_name or "").strip().upper()
    if not base:
        return ""

    if asset_class == "cryptos":
        mapped = CRYPTO_NAME_TO_SYMBOL.get(base, base)
        if "-" not in mapped:
            mapped = f"{mapped}-USD"
        return mapped

    if asset_class == "commodities":
        try:
            return normalize_commodity_symbol(base)
        except Exception:
            return base

    return base


def _extract_json_text(content: str) -> str:
    text = (content or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def _extract_openai_content(data: Any) -> str:
    if not isinstance(data, dict):
        return ""

    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            msg = first.get("message", {})
            if isinstance(msg, dict):
                content = msg.get("content")
                if isinstance(content, str):
                    return content
                if isinstance(content, list):
                    texts: List[str] = []
                    for part in content:
                        if isinstance(part, dict) and isinstance(part.get("text"), str):
                            texts.append(part["text"])
                    return "\n".join(texts).strip()
    return ""


def _normalize_holdings(raw_holdings: Any) -> List[Dict[str, Any]]:
    if not isinstance(raw_holdings, list):
        return []

    normalized: List[Dict[str, Any]] = []
    for row in raw_holdings:
        if not isinstance(row, dict):
            continue

        asset_class = _normalize_asset_class(str(row.get("asset_class", "")))
        symbol_input = row.get("symbol") or row.get("ticker") or row.get("name")
        symbol = _normalize_symbol(asset_class, str(symbol_input or "")) if asset_class else ""

        if not asset_class or not symbol:
            continue

        qty = _safe_float(row.get("qty", row.get("quantity")))
        avg_price = _safe_float(row.get("avg_price"))
        current_price = _safe_float(row.get("current_price"))
        market_value = _safe_float(row.get("market_value"))
        confidence = _safe_float(row.get("confidence"))
        if confidence is None:
            confidence = 0.9 if qty is not None and (current_price is not None or market_value is not None) else 0.6

        normalized.append(
            {
                "asset_class": asset_class,
                "symbol": symbol,
                "name": row.get("name"),
                "qty": qty,
                "avg_price": avg_price,
                "current_price": current_price,
                "market_value": market_value,
                "confidence": round(confidence, 4),
            }
        )

    return normalized


def _normalize_confirm_holdings(raw_holdings: Any) -> List[Dict[str, Any]]:
    rows = _normalize_holdings(raw_holdings)
    normalized: List[Dict[str, Any]] = []
    for row in rows:
        qty = _safe_float(row.get("qty"))
        current_price = _safe_float(row.get("current_price"))
        market_value = _safe_float(row.get("market_value"))

        # Accept user-confirm payload even when qty is omitted but value/price is present.
        if qty is None and current_price is not None and current_price > 0 and market_value is not None:
            qty = market_value / current_price

        row["qty"] = qty
        normalized.append(row)
    return normalized


def _token_for_symbol(symbol: str) -> str:
    value = (symbol or "").strip().upper()
    if value.endswith("-USD"):
        return value.split("-", 1)[0]
    if value.endswith("=F"):
        return value.split("=", 1)[0]
    return value


def _qty_from_text_for_symbol(page_text: str, symbol: str, name: str | None = None) -> float | None:
    text = (page_text or "").upper()
    if not text:
        return None

    tokens = [_token_for_symbol(symbol)]
    if name:
        tokens.append(str(name).strip().upper())

    for token in tokens:
        if not token:
            continue
        pattern = re.compile(rf"([0-9][0-9,]*(?:\.[0-9]+)?)\s*{re.escape(token)}\b")
        match = pattern.search(text)
        if match:
            return _safe_float(match.group(1))
    return None


def _backfill_missing_qty(holdings: List[Dict[str, Any]], page_text: str) -> List[Dict[str, Any]]:
    if not page_text:
        return holdings
    for row in holdings:
        if row.get("qty") is not None:
            continue
        symbol = str(row.get("symbol", ""))
        name = row.get("name")
        qty = _qty_from_text_for_symbol(page_text, symbol, name=name if isinstance(name, str) else None)
        if qty is not None and qty > 0:
            row["qty"] = qty
    return holdings


def _backfill_derived_fields(holdings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for row in holdings:
        qty = _safe_float(row.get("qty"))
        current_price = _safe_float(row.get("current_price"))
        market_value = _safe_float(row.get("market_value"))

        if current_price is None and qty is not None and qty > 0 and market_value is not None:
            row["current_price"] = round(market_value / qty, 8)
            current_price = row["current_price"]

        if market_value is None and qty is not None and qty > 0 and current_price is not None:
            row["market_value"] = round(qty * current_price, 2)
    return holdings


def _build_parse_warnings(holdings: List[Dict[str, Any]]) -> List[str]:
    warnings: List[str] = []
    for i, row in enumerate(holdings, start=1):
        if row.get("qty") is None:
            warnings.append(f"Row {i} ({row.get('symbol')}): qty missing")
        if row.get("current_price") is None:
            warnings.append(f"Row {i} ({row.get('symbol')}): current_price missing")
        if row.get("avg_price") is None:
            warnings.append(f"Row {i} ({row.get('symbol')}): avg_price missing")
    if not holdings:
        warnings.append("No holdings detected from screenshot.")
    return warnings


def parse_screenshot_with_llm(
    image_base64: str,
    model: str = DEFAULT_VISION_MODEL,
    page_text: str | None = None,
) -> Dict[str, Any]:
    api_key = _find_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set (env var or .env at repo root)")

    b64, mime = _strip_data_uri(image_base64)
    image_sha256 = hashlib.sha256(b64.encode("utf-8")).hexdigest()

    system_prompt = (
        "You are a portfolio extraction engine. "
        "Read the screenshot and extract holdings only if visible. "
        "Classify each holding as stocks, cryptos, or commodities. "
        "Extract ALL visible holdings rows from the screenshot table, not just one example row. "
        "Return strict JSON and do not add commentary."
    )

    user_prompt = (
        "Return JSON with keys: platform_name, detected_asset_classes, holdings, needs_review, notes. "
        "holdings must be array of objects with keys: asset_class, symbol, name, qty, avg_price, "
        "current_price, market_value, confidence. "
        "asset_class must be one of stocks, cryptos, commodities. "
        "Prioritize accurate extraction of qty, current_price, and avg_price for each row. "
        "If symbol is coin name, map common names to ticker forms like BTC-USD and ETH-USD. "
        "If value is missing, return null for that field. "
        "If multiple holdings are visible, include every visible row in holdings."
    )
    if page_text:
        user_prompt += (
            "\\n\\nAdditional page text context (from browser DOM, may include table values):\\n"
            f"{page_text[:12000]}"
        )

    body = {
        "model": model,
        "temperature": 0.0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                ],
            },
        ],
    }

    response = requests.post(
        f"{OPENAI_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=body,
        timeout=60,
    )

    if response.status_code >= 400:
        try:
            err = response.json()
        except ValueError:
            err = {"error": response.text[:300]}
        raise RuntimeError(f"OpenAI API error ({response.status_code}): {err}")

    data = response.json()
    content = _extract_openai_content(data)
    if not content:
        raise RuntimeError("OpenAI response did not contain parseable content")

    text = _extract_json_text(content)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("OpenAI output was not valid JSON") from exc

    holdings = _normalize_holdings(parsed.get("holdings"))
    holdings = _backfill_missing_qty(holdings, page_text or "")
    holdings = _backfill_derived_fields(holdings)
    warnings = _build_parse_warnings(holdings)
    return {
        "platform_name": parsed.get("platform_name"),
        "detected_asset_classes": parsed.get("detected_asset_classes", []),
        "holdings": holdings,
        "needs_review": bool(parsed.get("needs_review", True)),
        "notes": parsed.get("notes", []),
        "warnings": warnings,
        "image_sha256": image_sha256,
        "model": model,
    }


def create_pending_import(user_id: str, parsed: Dict[str, Any]) -> Dict[str, Any]:
    imports = _load_imports()
    import_id = f"imp_{uuid4().hex[:16]}"
    imports[import_id] = {
        "status": "pending",
        "user_id": user_id,
        "created_at": _utc_now_iso(),
        "parsed": parsed,
    }
    _write_imports(imports)

    return {
        "import_id": import_id,
        "status": "pending",
        "user_id": user_id,
        "parsed": parsed,
    }


def get_pending_import(import_id: str) -> Dict[str, Any]:
    imports = _load_imports()
    record = imports.get(import_id)
    if not isinstance(record, dict):
        raise ValueError("import_id not found")
    return record


def _ensure_portfolio_dict(user: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    portfolio = user.get("portfolio")
    if isinstance(portfolio, dict):
        for key in ("stocks", "cryptos", "commodities"):
            if not isinstance(portfolio.get(key), list):
                portfolio[key] = []
        return portfolio

    converted = {"stocks": [], "cryptos": [], "commodities": []}
    if isinstance(portfolio, list):
        for row in portfolio:
            if not isinstance(row, dict):
                continue
            symbol = str(row.get("symbol", "")).strip().upper()
            if symbol.endswith("-USD"):
                converted["cryptos"].append(row)
            elif symbol.endswith("=F"):
                converted["commodities"].append(row)
            else:
                converted["stocks"].append(row)
    user["portfolio"] = converted
    return converted


def _weighted_avg(old_qty: float, old_avg: float | None, new_qty: float, new_avg: float | None) -> float | None:
    if old_avg is None and new_avg is None:
        return None
    if old_avg is None:
        return new_avg
    if new_avg is None:
        return old_avg
    total_qty = old_qty + new_qty
    if total_qty <= 0:
        return None
    return (old_qty * old_avg + new_qty * new_avg) / total_qty


def _recompute_portfolio_totals(user: Dict[str, Any]) -> None:
    portfolio = _ensure_portfolio_dict(user)
    total = 0.0

    for bucket in ("stocks", "cryptos", "commodities"):
        for pos in portfolio.get(bucket, []):
            if not isinstance(pos, dict):
                continue
            # Keep stored portfolio schema clean; classification fields are import-only metadata.
            pos.pop("asset_class", None)
            pos.pop("confidence", None)
            qty = _safe_float(pos.get("qty")) or 0.0
            current = _safe_float(pos.get("current_price"))
            avg = _safe_float(pos.get("avg_price"))
            if current is not None:
                mv = qty * current
            elif avg is not None:
                mv = qty * avg
            else:
                mv = _safe_float(pos.get("market_value")) or 0.0
            pos["qty"] = round(qty, 8)
            pos["market_value"] = round(mv, 2)
            total += float(pos["market_value"])

    user["portfolio_value"] = round(total, 2)
    cash = _safe_float(user.get("cash_balance")) or 0.0
    user["total_balance"] = round(cash + total, 2)
    liability = _safe_float(user.get("liability")) or 0.0
    user["net_worth"] = round(user["total_balance"] - liability, 2)


def merge_holdings_into_user(user: Dict[str, Any], holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    portfolio = _ensure_portfolio_dict(user)
    merged_count = 0
    skipped: List[Dict[str, Any]] = []

    for row in _normalize_holdings(holdings):
        qty = row.get("qty")
        if qty is None or qty <= 0:
            skipped.append({"symbol": row.get("symbol"), "reason": "missing_or_non_positive_qty"})
            continue

        bucket = row["asset_class"]
        symbol = str(row["symbol"]).upper()
        positions = portfolio[bucket]

        existing = None
        for pos in positions:
            if not isinstance(pos, dict):
                continue
            if str(pos.get("symbol", "")).upper() == symbol:
                existing = pos
                break

        if existing is None:
            existing = {
                "symbol": symbol,
                "qty": 0.0,
            }
            positions.append(existing)

        old_qty = _safe_float(existing.get("qty")) or 0.0
        new_qty = float(qty)
        old_avg = _safe_float(existing.get("avg_price"))
        new_avg = _safe_float(row.get("avg_price"))

        existing["qty"] = round(old_qty + new_qty, 8)

        merged_avg = _weighted_avg(old_qty, old_avg, new_qty, new_avg)
        if merged_avg is not None:
            existing["avg_price"] = round(merged_avg, 6)

        incoming_current = _safe_float(row.get("current_price"))
        if incoming_current is not None:
            existing["current_price"] = round(incoming_current, 6)

        if row.get("name"):
            existing["name"] = row["name"]

        merged_count += 1

    _recompute_portfolio_totals(user)

    return {
        "merged_count": merged_count,
        "skipped": skipped,
        "portfolio": user.get("portfolio", {}),
        "portfolio_value": user.get("portfolio_value"),
        "total_balance": user.get("total_balance"),
        "net_worth": user.get("net_worth"),
    }


def confirm_import(
    import_id: str,
    user_id: str,
    users_data: Dict[str, Any],
    override_holdings: List[Dict[str, Any]],
) -> Dict[str, Any]:
    imports = _load_imports()
    record = imports.get(import_id)
    if not isinstance(record, dict):
        raise ValueError("import_id not found")
    if record.get("user_id") != user_id:
        raise ValueError("import_id does not belong to this user_id")
    if record.get("status") != "pending":
        raise ValueError("import is not pending")

    user = users_data.get(user_id)
    if not isinstance(user, dict):
        raise ValueError("user_id not found")

    incoming = _normalize_confirm_holdings(override_holdings)
    if not incoming:
        raise ValueError("confirm payload contains no valid holdings")
    if not any((_safe_float(h.get("qty")) or 0) > 0 for h in incoming):
        preview = [{k: h.get(k) for k in ("asset_class", "symbol", "qty", "market_value", "current_price")} for h in incoming[:3]]
        raise ValueError(f"confirm payload has no positive qty values; preview={preview}")

    merge_result = merge_holdings_into_user(user, incoming)
    users_data[user_id] = user

    # Delete import record immediately after successful apply to avoid lingering files.
    imports.pop(import_id, None)
    _write_imports(imports)

    return {
        "import_id": import_id,
        "status": "confirmed",
        **merge_result,
    }
