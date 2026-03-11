import os
from typing import Any, Dict

from backend.services.insights.gpt import InsightError as GPTInsightError
from backend.services.insights.gpt import build_insights_gpt
from backend.services.insights.gpt import build_insights_gpt_web_fallback
from backend.services.insights.ollama import InsightError as OllamaInsightError
from backend.services.insights.ollama import build_insights_ollama


class InsightError(Exception):
    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.status_code = status_code


def _is_truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _reload_dotenv_with_override() -> None:
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv(override=True)
    except Exception:
        # Keep runtime resilient if python-dotenv is unavailable.
        return


def _provider_from_env() -> str:
    _reload_dotenv_with_override()
    raw_provider = (
        os.getenv("INSIGHTS_PROVIDER", "").strip()
        or os.getenv("INSIGHTS_MODEL_PROVIDER", "").strip()
        or os.getenv("INSIGHTS_MODEL", "").strip()
    )

    if raw_provider:
        provider = raw_provider.lower()
        if provider in {"ollama", "local"}:
            return "ollama"
        if provider in {"gpt", "openai"}:
            return "gpt"
        raise InsightError(
            f"invalid insights provider '{raw_provider}'. Use one of: ollama, gpt.",
            status_code=500,
        )

    # Backward compatibility with existing env toggle in app.py.
    ollama_mode = os.getenv("OLLAMA_MODE", "1")
    return "ollama" if _is_truthy(ollama_mode) else "gpt"


def selected_insights_provider() -> str:
    return _provider_from_env()


def _should_use_openai_web_fallback(exc: Exception) -> bool:
    detail = str(exc).strip().lower()
    return getattr(exc, "status_code", 0) == 404 and detail in {
        "price data not found",
        "close price not available",
    }


async def build_insights(asset_type: str, symbol: str, months: int) -> Dict[str, Any]:
    provider = _provider_from_env()
    try:
        if provider == "ollama":
            return await build_insights_ollama(asset_type=asset_type, symbol=symbol, months=months)
        return await build_insights_gpt(asset_type=asset_type, symbol=symbol, months=months)
    except OllamaInsightError as exc:
        if _should_use_openai_web_fallback(exc):
            try:
                return await build_insights_gpt_web_fallback(
                    asset_type=asset_type,
                    symbol=symbol,
                    months=months,
                    failure_reason=str(exc),
                )
            except GPTInsightError:
                pass
        raise InsightError(str(exc), status_code=exc.status_code) from exc
    except GPTInsightError as exc:
        if _should_use_openai_web_fallback(exc):
            try:
                return await build_insights_gpt_web_fallback(
                    asset_type=asset_type,
                    symbol=symbol,
                    months=months,
                    failure_reason=str(exc),
                )
            except GPTInsightError:
                pass
        raise InsightError(str(exc), status_code=exc.status_code) from exc
