import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List

import requests


OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4.1-mini"
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
) -> Dict[str, Any]:
    portfolio = user.get("portfolio", []) or []
    compact_portfolio: List[Dict[str, Any]] = []
    for p in portfolio:
        if not isinstance(p, dict):
            continue
        compact_portfolio.append(
            {
                "symbol": p.get("symbol"),
                "qty": p.get("qty"),
                "current_price": p.get("current_price"),
                "market_value": p.get("market_value"),
            }
        )

    payload = {
        "risk_profile": user.get("risk_profile"),
        "financial_wellness_score": user.get("financial_wellness_score"),
        "financial_stress_index": user.get("financial_stress_index"),
        "wellness_metrics": user.get("wellness_metrics", {}),
        "portfolio": compact_portfolio,
        "rule_based_recommendations": rule_based.get("recommendations", []),
        "requested_recommendation_count": limit,
    }
    if latent_growth_context:
        payload["latent_growth_context"] = latent_growth_context
    return payload


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
    )

    system_prompt = (
        "You are a financial wellness recommendation assistant. "
        "Return personalized, data-driven actions and scenario-based insights. "
        "Use only the provided data and recommendations. "
        "Do not invent metrics or holdings. Keep output concise and practical."
    )

    user_prompt = (
        "Generate JSON with keys: "
        "summary, top_recommendations, scenario_insights, immediate_next_steps. "
        "top_recommendations must be an array of up to requested_recommendation_count items, "
        "each with: title, action, why, priority. "
        "scenario_insights should include bullish_case, base_case, bearish_case. "
        "immediate_next_steps must be a short array for the next 30 days. "
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
