import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List

import requests
import backend.settings.config as settings_config


OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = settings_config.openai_narrative_model()
BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent
WORKSPACE_DIR = PROJECT_DIR.parent


def _find_api_key() -> str:
    direct = os.getenv("OPENAI_API_KEY")
    if direct:
        return direct

    candidate_paths = [
        PROJECT_DIR / ".env",   # preferred: repo root
        BACKEND_DIR / ".env",   # backward compatible
        WORKSPACE_DIR / ".env", # fallback if running from workspace root
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


def _build_prompt_payload(
    user_id: str,
    user: Dict[str, Any],
    rule_based: Dict[str, Any],
    limit: int,
    latent_growth_context: Dict[str, Any] | None = None,
    analysis_scope: str = "holistic",
) -> Dict[str, Any]:
    compact_portfolio = _compact_portfolio_positions(user)
    asset_class_totals: Dict[str, float] = {}
    for position in compact_portfolio:
        bucket = str(position.get("asset_class") or "unknown")
        asset_class_totals[bucket] = round(asset_class_totals.get(bucket, 0.0) + float(position.get("market_value") or 0.0), 2)

    normalized_scope = _normalize_analysis_scope(analysis_scope)
    scoped_portfolio = (
        [position for position in compact_portfolio if position.get("asset_class") == "stocks"]
        if normalized_scope == "stocks"
        else compact_portfolio
    )

    payload = {
        "analysis_scope": normalized_scope,
        "user_profile": {
            "investor_type": user.get("investor_type") or "Individual Investor",
            "age": user.get("age"),
            "country": user.get("country"),
            "profile_currency": user.get("currency") or "USD",
        },
        "risk_profile": user.get("risk_profile"),
        "financial_wellness_score": user.get("financial_wellness_score"),
        "financial_stress_index": user.get("financial_stress_index"),
        "wellness_metrics": user.get("wellness_metrics", {}),
        "cash_balance_sgd": user.get("cash_balance", 0.0),
        "income_monthly_sgd": user.get("income", 0.0),
        "liability_sgd": user.get("liability", 0.0),
        "mortgage_sgd": user.get("mortgage", 0.0),
        "manual_assets": _compact_manual_assets(user),
        "portfolio": scoped_portfolio,
        "asset_class_totals_usd": asset_class_totals,
        "rule_based_recommendations": rule_based.get("recommendations", []),
        "requested_recommendation_count": limit,
    }
    if normalized_scope == "stocks":
        payload["stock_review_context"] = _build_stock_review_context(compact_portfolio)
    if latent_growth_context:
        payload["latent_growth_context"] = latent_growth_context
    return payload


def _normalize_analysis_scope(value: Any) -> str:
    normalized = str(value or "holistic").strip().lower().replace("-", "_")
    if normalized in {"stock", "stocks", "equities", "equity", "stock_sleeve"}:
        return "stocks"
    return "holistic"


def _iter_bucketed_positions(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    portfolio = user.get("portfolio", []) or []
    positions: List[Dict[str, Any]] = []
    if isinstance(portfolio, list):
        for position in portfolio:
            if not isinstance(position, dict):
                continue
            next_position = dict(position)
            next_position.setdefault("asset_class", _infer_asset_class(next_position))
            positions.append(next_position)
        return positions

    if isinstance(portfolio, dict):
        for bucket in ("stocks", "bonds", "real_assets", "cryptos", "commodities"):
            bucket_positions = portfolio.get(bucket, [])
            if not isinstance(bucket_positions, list):
                continue
            for position in bucket_positions:
                if not isinstance(position, dict):
                    continue
                next_position = dict(position)
                next_position["asset_class"] = bucket
                positions.append(next_position)
    return positions


def _infer_asset_class(position: Dict[str, Any]) -> str:
    symbol = str(position.get("symbol") or "").upper()
    if symbol.endswith("-USD"):
        return "cryptos"
    if symbol.endswith("=F"):
        return "commodities"
    return "stocks"


def _compact_portfolio_positions(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    compact: List[Dict[str, Any]] = []
    for position in _iter_bucketed_positions(user):
        compact.append(
            {
                "asset_class": position.get("asset_class"),
                "symbol": position.get("symbol"),
                "name": position.get("name"),
                "qty": position.get("qty"),
                "current_price_usd": position.get("current_price"),
                "market_value": position.get("market_value"),
                "quote_currency": position.get("quote_currency") or position.get("currency") or "USD",
                "quote_current_price": position.get("quote_current_price"),
            }
        )
    return compact


def _compact_manual_assets(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    assets = user.get("manual_assets") or []
    if not isinstance(assets, list):
        return []
    compact: List[Dict[str, Any]] = []
    for item in assets:
        if not isinstance(item, dict):
            continue
        compact.append(
            {
                "label": item.get("label"),
                "category": item.get("category"),
                "value_sgd": item.get("value"),
            }
        )
    return compact


def _stock_strategy_role(position: Dict[str, Any]) -> str:
    symbol = str(position.get("symbol") or "").upper()
    name = str(position.get("name") or "").lower()
    broad_core_symbols = {"SPY", "VOO", "IVV", "VTI", "VT", "CSPX", "VWRA", "ES3.SI"}
    if symbol in broad_core_symbols or "s&p" in name or "all-world" in name or "straits times" in name:
        return "possible_core"
    if "etf" in name or symbol in {"QQQ", "SCHD", "DIA", "IWM"}:
        return "possible_tilt"
    return "single_name_or_satellite"


def _build_stock_review_context(compact_portfolio: List[Dict[str, Any]]) -> Dict[str, Any]:
    stock_positions = [position for position in compact_portfolio if position.get("asset_class") == "stocks"]
    stock_total = sum(float(position.get("market_value") or 0.0) for position in stock_positions)
    all_total = sum(float(position.get("market_value") or 0.0) for position in compact_portfolio)
    enriched: List[Dict[str, Any]] = []
    for position in stock_positions:
        value = float(position.get("market_value") or 0.0)
        enriched.append(
            {
                "symbol": position.get("symbol"),
                "name": position.get("name"),
                "market_value": round(value, 2),
                "stock_sleeve_weight": round((value / stock_total) * 100, 2) if stock_total > 0 else 0.0,
                "strategy_role_hint": _stock_strategy_role(position),
                "quote_currency": position.get("quote_currency"),
            }
        )
    enriched.sort(key=lambda item: float(item.get("market_value") or 0.0), reverse=True)
    core_value = sum(item["market_value"] for item in enriched if item.get("strategy_role_hint") == "possible_core")
    tilt_value = sum(item["market_value"] for item in enriched if item.get("strategy_role_hint") == "possible_tilt")
    satellite_value = max(0.0, stock_total - core_value - tilt_value)
    return {
        "stock_sleeve_value_usd": round(stock_total, 2),
        "stock_sleeve_weight_of_portfolio": round((stock_total / all_total) * 100, 2) if all_total > 0 else 0.0,
        "stock_count": len(stock_positions),
        "top_positions": enriched[:10],
        "strategy_mix_hint": {
            "possible_core_weight": round((core_value / stock_total) * 100, 2) if stock_total > 0 else 0.0,
            "possible_tilt_weight": round((tilt_value / stock_total) * 100, 2) if stock_total > 0 else 0.0,
            "single_name_or_satellite_weight": round((satellite_value / stock_total) * 100, 2) if stock_total > 0 else 0.0,
        },
        "review_lenses": [
            "core/satellite structure",
            "tilt/satellite sizing",
            "single-name concentration",
            "country and currency exposure",
            "fit against cash runway, liabilities, income stability, wellness, and risk profile",
        ],
    }


_USER_ID_KEY_PATTERN = re.compile(r'("user_id"\s*:\s*)"[^"]*"', re.IGNORECASE)
_USER_ID_VALUE_PATTERN = re.compile(r"\bu\d{3,}\b", re.IGNORECASE)


def _sanitize_user_id_strings(value: Any) -> Any:
    if isinstance(value, str):
        sanitized = _USER_ID_KEY_PATTERN.sub(r'\1"[redacted]"', value)
        sanitized = _USER_ID_VALUE_PATTERN.sub("[redacted-user-id]", sanitized)
        return sanitized
    if isinstance(value, list):
        return [_sanitize_user_id_strings(item) for item in value]
    if isinstance(value, dict):
        sanitized_dict: Dict[str, Any] = {}
        for key, item in value.items():
            if str(key).lower() == "user_id":
                continue
            sanitized_dict[key] = _sanitize_user_id_strings(item)
        return sanitized_dict
    return value


def _parse_json_content(content: str) -> Dict[str, Any]:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"raw_text": content}


def _extract_text_from_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content") or ""
                if isinstance(text, str) and text:
                    parts.append(text)
        return "\n".join(parts).strip()
    if isinstance(content, dict):
        text = content.get("text") or content.get("content") or ""
        return text if isinstance(text, str) else ""
    return ""


def _extract_openai_content(data: Any) -> str:
    if not isinstance(data, dict):
        return ""

    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message", {})
            if isinstance(message, dict):
                return _extract_text_from_content(message.get("content"))

    output = data.get("output")
    if isinstance(output, list):
        parts: List[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            text = _extract_text_from_content(item.get("content"))
            if text:
                parts.append(text)
        if parts:
            return "\n".join(parts).strip()

    output_text = data.get("output_text")
    if isinstance(output_text, str):
        return output_text

    return ""


def generate_gpt_recommendations(
    user_id: str,
    user: Dict[str, Any],
    rule_based: Dict[str, Any],
    limit: int = 3,
    model: str = DEFAULT_MODEL,
    timeout_seconds: int = 45,
    latent_growth_context: Dict[str, Any] | None = None,
    analysis_scope: str = "holistic",
) -> Dict[str, Any]:
    api_key = _find_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set (env var or .env at repo root)")

    input_payload = _build_prompt_payload(
        user_id=user_id,
        user=user,
        rule_based=rule_based,
        limit=limit,
        latent_growth_context=latent_growth_context,
        analysis_scope=analysis_scope,
    )
    normalized_scope = input_payload["analysis_scope"]

    system_prompt = (
        "You are a financial wellness recommendation assistant. "
        "Return personalized, data-driven actions and scenario-based insights. "
        "Use only the provided data and recommendations. "
        "Do not invent metrics or holdings. Keep output concise and practical. "
        "If investor_type is Student, account for unstable income, smaller balances, learning needs, and liquidity before growth."
    )

    scope_instruction = (
        "Focus on the user's stock/equity sleeve only. Use cash, income, liabilities, wellness, and the wider portfolio as context. "
        "Explicitly review whether a core/satellite or tilt/satellite approach appears sensible for the stock sleeve, without assuming either is always optimal. "
        "Call out concentration, country/currency exposure, and which stock positions look like core, tilt, or satellite candidates based only on provided fields."
        if normalized_scope == "stocks"
        else "Review the full portfolio and financial profile holistically."
    )

    user_prompt = (
        "Generate JSON with keys: "
        "summary, top_recommendations, scenario_insights, immediate_next_steps. "
        "top_recommendations must be an array of up to requested_recommendation_count items, "
        "each with: title, action, why, priority. "
        "scenario_insights should include bullish_case, base_case, bearish_case. "
        "immediate_next_steps must be a short array for the next 30 days. "
        f"{scope_instruction} "
        "If latent_growth_context is present, explicitly incorporate it into the analysis and next steps. "
        "If latent_growth_context is absent, do not mention it.\\n\\n"
        f"INPUT_DATA:\\n{json.dumps(input_payload, ensure_ascii=True)}"
    )

    body = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }

    response = requests.post(
        f"{OPENAI_BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=timeout_seconds,
    )

    if response.status_code >= 400:
        try:
            err = response.json()
        except ValueError:
            err = {"error": {"message": response.text[:500]}}
        raise RuntimeError(f"OpenAI API error ({response.status_code}): {err}")

    try:
        data = response.json()
    except ValueError as exc:
        raise RuntimeError("OpenAI response was not valid JSON") from exc

    content = _extract_openai_content(data)
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("OpenAI response did not contain parsable message content")

    return {
        "model": model,
        "recommendations": _sanitize_user_id_strings(_parse_json_content(content)),
        "raw": data,
    }
