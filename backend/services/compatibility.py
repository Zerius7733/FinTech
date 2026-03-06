import json
import os
from pathlib import Path
from typing import Any, Dict, Tuple

import requests
from backend.commodity_price_retriever import COMMODITY_ALIAS_TO_SYMBOL


OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_LLM_MODEL = "gpt-4.1-mini"
BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
WORKSPACE_DIR = PROJECT_DIR.parent
COMMON_CRYPTO_SYMBOLS = {
    "BTC",
    "ETH",
    "SOL",
    "XRP",
    "DOGE",
    "ADA",
    "BNB",
    "XLM",
    "LTC",
    "TRX",
    "DOT",
    "AVAX",
    "MATIC",
    "SHIB",
    "FLR",
}
COMMON_COMMODITY_ETFS = {"GLD", "SLV", "IAU", "SIVR", "PPLT", "PALL"}


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


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


def _normalize_target_type(value: str) -> str:
    normalized = (value or "").strip().lower()
    mapping = {
        "stock": "stocks",
        "stocks": "stocks",
        "crypto": "cryptos",
        "cryptos": "cryptos",
        "commodity": "commodities",
        "commodities": "commodities",
    }
    if normalized not in mapping:
        raise ValueError("target_type must be one of: stock, crypto, commodity")
    return mapping[normalized]


def _normalize_symbol(target_type: str, symbol: str) -> str:
    value = (symbol or "").strip().upper()
    if not value:
        raise ValueError("symbol is required")

    if target_type == "stocks":
        if value.endswith("-USD") or value in COMMON_CRYPTO_SYMBOLS:
            raise ValueError(f"symbol '{value}' looks like crypto, but target_type is stock")

    if target_type == "commodities":
        if value.endswith("-USD") or value in COMMON_CRYPTO_SYMBOLS:
            raise ValueError(f"symbol '{value}' looks like crypto, but target_type is commodity")
        value = COMMODITY_ALIAS_TO_SYMBOL.get(value, value)
        if value.endswith("=F") or value in COMMON_COMMODITY_ETFS:
            return value
        raise ValueError(
            "commodity symbol must be a known alias (e.g. GOLD) or commodity ticker (e.g. GC=F, SI=F, GLD)"
        )

    if target_type == "cryptos":
        if value.endswith("=F") or value in COMMODITY_ALIAS_TO_SYMBOL or value in COMMON_COMMODITY_ETFS:
            raise ValueError(f"symbol '{value}' looks like commodity, but target_type is crypto")
        if "-" not in value:
            value = f"{value}-USD"
    return value


def _validate_resolved_category(normalized_type: str, resolved_category: str | None, raw_symbol: str) -> None:
    if not resolved_category or resolved_category == "unknown":
        return
    expected = {
        "stocks": "stock",
        "cryptos": "crypto",
        "commodities": "commodity",
    }[normalized_type]
    if resolved_category != expected:
        raise ValueError(
            f"symbol '{raw_symbol.strip().upper()}' resolves to {resolved_category}, not {expected}. "
            f"Please use target_type={resolved_category}."
        )


def _iter_portfolio_positions(user: Dict[str, Any]):
    portfolio = user.get("portfolio", {})
    if isinstance(portfolio, dict):
        for bucket in ("stocks", "cryptos", "commodities"):
            entries = portfolio.get(bucket, [])
            if not isinstance(entries, list):
                continue
            for row in entries:
                if isinstance(row, dict):
                    yield bucket, row
        return

    if isinstance(portfolio, list):
        for row in portfolio:
            if isinstance(row, dict):
                yield "stocks", row


def _profile_risk_score(profile: str) -> float:
    mapping = {
        "low": 30.0,
        "moderate": 55.0,
        "high": 80.0,
    }
    return mapping.get((profile or "").strip().lower(), 55.0)


def _asset_risk_score(target_type: str, symbol: str) -> float:
    base = {
        "stocks": 55.0,
        "cryptos": 85.0,
        "commodities": 65.0,
    }[target_type]

    overrides = {
        "SPY": 48.0,
        "QQQ": 60.0,
        "BTC-USD": 90.0,
        "ETH-USD": 86.0,
        "GC=F": 58.0,
        "SI=F": 68.0,
    }
    return overrides.get(symbol, base)


def _find_existing_position(user: Dict[str, Any], target_type: str, symbol: str) -> Dict[str, Any] | None:
    for bucket, position in _iter_portfolio_positions(user):
        if bucket != target_type:
            continue
        if str(position.get("symbol", "")).strip().upper() == symbol:
            return position
    return None


def _position_weight(user: Dict[str, Any], position: Dict[str, Any] | None) -> float:
    if not position:
        return 0.0
    portfolio_value = float(user.get("portfolio_value", 0.0) or 0.0)
    if portfolio_value <= 0:
        return 0.0
    market_value = float(position.get("market_value", 0.0) or 0.0)
    return max(0.0, market_value / portfolio_value)


def _risk_fit(user: Dict[str, Any], target_type: str, symbol: str) -> float:
    user_risk = _profile_risk_score(str(user.get("risk_profile", "Moderate")))
    asset_risk = _asset_risk_score(target_type, symbol)
    return round(_clamp(100.0 - abs(user_risk - asset_risk) * 1.4), 2)


def _liquidity_fit(user: Dict[str, Any], target_type: str, symbol: str) -> float:
    months = float((user.get("wellness_metrics", {}) or {}).get("liquidity_months", 0.0) or 0.0)
    asset_risk = _asset_risk_score(target_type, symbol)

    if asset_risk >= 85:
        required_months = 6.0
    elif asset_risk >= 65:
        required_months = 4.0
    else:
        required_months = 3.0

    score = (months / required_months) * 100.0
    return round(_clamp(score), 2)


def _concentration_impact(user: Dict[str, Any], target_type: str, symbol: str) -> Tuple[float, bool, Dict[str, Any] | None]:
    existing = _find_existing_position(user, target_type, symbol)
    already_in_portfolio = existing is not None
    hhi = float((user.get("wellness_metrics", {}) or {}).get("diversification_hhi", 0.0) or 0.0)

    if not already_in_portfolio:
        score = 88.0 if hhi > 0.45 else 78.0
        return round(_clamp(score), 2), False, None

    weight = _position_weight(user, existing)
    penalty = min(70.0, weight * 140.0)
    score = 82.0 - penalty
    return round(_clamp(score), 2), True, existing


def _stress_guardrail(user: Dict[str, Any]) -> Tuple[float, bool]:
    stress = float(user.get("financial_stress_index", 0.0) or 0.0)
    if stress >= 80:
        return 0.0, True
    if stress >= 65:
        return 20.0, True
    if stress >= 50:
        return 55.0, False
    return round(_clamp(100.0 - stress), 2), False


def _rating(score: float) -> str:
    if score >= 75:
        return "Good"
    if score >= 50:
        return "Moderate"
    return "Poor"


def _build_user_friendly_view(
    target_type: str,
    symbol: str,
    score: float,
    rating: str,
    warnings: list[str],
    blocked: bool,
    risk_fit: float,
    liquidity_fit: float,
    concentration_impact: float,
    stress_guardrail: float,
    suggested_cap_pct: float,
    already_in_portfolio: bool,
) -> Dict[str, Any]:
    if blocked:
        verdict = "Not suitable right now"
    elif score >= 75:
        verdict = "Generally suitable"
    elif score >= 50:
        verdict = "Maybe suitable"
    else:
        verdict = "Likely not suitable"

    what_this_means = f"For {target_type[:-1]} {symbol}, your profile shows a {rating.lower()} match ({score}/100)."
    if blocked:
        next_step = "Focus on improving cash buffer and reducing financial stress before adding this asset."
    elif score >= 75:
        next_step = "If you proceed, keep position size moderate and diversify."
    elif score >= 50:
        next_step = "Consider a smaller trial allocation and monitor risk."
    else:
        next_step = "Consider safer alternatives that better match your profile."

    risk_read = (
        "Risk level is aligned with your profile."
        if risk_fit >= 70
        else "Risk level may be higher than your profile is comfortable with."
    )
    liquidity_read = (
        "Your liquidity buffer looks adequate for this asset's volatility."
        if liquidity_fit >= 70
        else "Your liquidity buffer may be thin for this asset's price swings."
    )
    concentration_read = (
        "Adding this could increase concentration because you already hold this asset."
        if already_in_portfolio
        else "Adding this can improve diversification if position size is controlled."
    )
    stress_read = (
        "Your financial stress is high, so this idea is currently penalized."
        if blocked
        else "Financial stress is not triggering a hard block, but still matters."
    )

    action_plan = []
    if blocked:
        action_plan.append("Pause adding this asset until stress indicators improve.")
    else:
        action_plan.append("Start with a small allocation instead of a full position.")
    action_plan.append(f"Keep this target below about {suggested_cap_pct}% of the portfolio.")
    action_plan.append("Recheck liquidity and concentration after any buy.")

    return {
        "verdict": verdict,
        "overall_assessment": what_this_means,
        "why_this_rating": {
            "risk_fit": {"score": risk_fit, "plain_english": risk_read},
            "liquidity_fit": {"score": liquidity_fit, "plain_english": liquidity_read},
            "concentration_impact": {"score": concentration_impact, "plain_english": concentration_read},
            "stress_guardrail": {"score": stress_guardrail, "plain_english": stress_read},
        },
        "top_risks": warnings[:3],
        "suggested_positioning": {
            "allocation_cap_pct": suggested_cap_pct,
            "already_in_portfolio": already_in_portfolio,
        },
        "action_plan": action_plan,
        "next_step": next_step,
    }


def evaluate_compatibility(
    user: Dict[str, Any],
    target_type: str,
    symbol: str,
    resolved_category: str | None = None,
) -> Dict[str, Any]:
    normalized_type = _normalize_target_type(target_type)
    normalized_symbol = _normalize_symbol(normalized_type, symbol)
    _validate_resolved_category(normalized_type, resolved_category, symbol)

    risk_fit = _risk_fit(user, normalized_type, normalized_symbol)
    liquidity_fit = _liquidity_fit(user, normalized_type, normalized_symbol)
    concentration_impact, already_in_portfolio, existing_position = _concentration_impact(
        user, normalized_type, normalized_symbol
    )
    stress_guardrail, blocked = _stress_guardrail(user)

    base_score = (
        risk_fit * 0.35
        + liquidity_fit * 0.25
        + concentration_impact * 0.20
        + stress_guardrail * 0.20
    )

    if blocked:
        final_score = min(base_score, stress_guardrail)
    else:
        final_score = base_score

    final_score = round(_clamp(final_score), 2)

    warnings = []
    if blocked:
        warnings.append("Financial stress is elevated; high-risk additions should be paused.")
    if liquidity_fit < 50:
        warnings.append("Liquidity buffer is weak relative to this target's volatility.")
    if already_in_portfolio:
        warnings.append("Target already exists in portfolio; adding more may increase concentration risk.")

    suggested_cap_pct = round(_clamp(5 + (final_score / 100.0) * 20.0, 0.0, 25.0), 2)

    return {
        "target": {
            "type": normalized_type,
            "symbol": normalized_symbol,
        },
        "already_in_portfolio": already_in_portfolio,
        "existing_position": existing_position,
        "compatibility_score": final_score,
        "rating": _rating(final_score),
        "suggested_allocation_cap_pct": suggested_cap_pct,
        "factors": {
            "risk_fit": risk_fit,
            "liquidity_fit": liquidity_fit,
            "concentration_impact": concentration_impact,
            "stress_guardrail": stress_guardrail,
        },
        "factor_explanations": {
            "risk_fit": "user risk preference alignment versus target asset risk level",
            "liquidity_fit": "cash/liquidity buffer adequacy versus target volatility",
            "concentration_impact": "whether adding this target may worsen concentration risk",
            "stress_guardrail": "penalty/block when financial stress is already elevated",
        },
        "warnings": warnings,
        "guardrails": {
            "disclaimer": "AI can make mistakes. Please DYOR. Not financial advice.",
            "blocked_by_stress": blocked,
        },
        "user_friendly": _build_user_friendly_view(
            target_type=normalized_type,
            symbol=normalized_symbol,
            score=final_score,
            rating=_rating(final_score),
            warnings=warnings,
            blocked=blocked,
            risk_fit=risk_fit,
            liquidity_fit=liquidity_fit,
            concentration_impact=concentration_impact,
            stress_guardrail=stress_guardrail,
            suggested_cap_pct=suggested_cap_pct,
            already_in_portfolio=already_in_portfolio,
        ),
    }


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
                    parts = []
                    for part in content:
                        if isinstance(part, dict) and isinstance(part.get("text"), str):
                            parts.append(part["text"])
                    return "\n".join(parts).strip()
    return ""


def synthesize_compatibility_with_llm(
    user_id: str,
    user: Dict[str, Any],
    compatibility: Dict[str, Any],
    model: str = DEFAULT_LLM_MODEL,
    timeout_seconds: int = 30,
) -> Dict[str, Any]:
    api_key = _find_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set (env var or .env at repo root)")

    payload = {
        "user_id": user_id,
        "risk_profile": user.get("risk_profile"),
        "financial_wellness_score": user.get("financial_wellness_score"),
        "financial_stress_index": user.get("financial_stress_index"),
        "wellness_metrics": user.get("wellness_metrics", {}),
        "compatibility": compatibility,
    }

    system_prompt = (
        "You are a cautious financial compatibility explainer. "
        "Use only provided inputs. "
        "Do not guarantee outcomes. "
        "Always include this disclaimer: "
        "'AI can make mistakes. Please DYOR. Not financial advice.'"
    )
    user_prompt = (
        "Return strict JSON with keys: summary, rationale, action_guidance, risk_notes, disclaimer. "
        "summary should be 1-2 sentences. "
        "rationale should explain risk_fit, liquidity_fit, concentration_impact, stress_guardrail in plain terms. "
        "action_guidance should be short and practical. "
        "risk_notes should be array of concise warnings.\n\n"
        f"INPUT:\n{json.dumps(payload, ensure_ascii=True)}"
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
            err = {"error": response.text[:400]}
        raise RuntimeError(f"OpenAI API error ({response.status_code}): {err}")

    try:
        data = response.json()
    except ValueError as exc:
        raise RuntimeError("OpenAI response was not valid JSON") from exc

    text = _extract_openai_content(data)
    if not text:
        raise RuntimeError("OpenAI response did not contain message content")

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = {"summary_text": text}

    return {
        "model": model,
        "synthesis": parsed,
    }
