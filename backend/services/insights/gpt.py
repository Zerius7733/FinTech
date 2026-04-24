import asyncio
import json
import math
import os
import re
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np
import pandas as pd
import yfinance as yf

import backend.settings.config as settings_config
from backend.services.guardrails.no_advice import validate_text
# ----------------------------
# Config / Maps
# ----------------------------

COMMODITY_TICKER_MAP: Dict[str, Tuple[str, str]] = {
    "GC=F": ("GC=F", "Gold"),
    "XAU": ("GC=F", "Gold"),
    "GOLD": ("GC=F", "Gold"),
    "SI=F": ("SI=F", "Silver"),
    "XAG": ("SI=F", "Silver"),
    "SILVER": ("SI=F", "Silver"),
    "CL=F": ("CL=F", "Crude Oil"),
    "CL": ("CL=F", "Crude Oil"),
    "WTI": ("CL=F", "Crude Oil"),
    "BZ=F": ("BZ=F", "Brent Oil"),
    "BRENT": ("BZ=F", "Brent Oil"),
    "NG=F": ("NG=F", "Natural Gas"),
    "NG": ("NG=F", "Natural Gas"),
    "HG=F": ("HG=F", "Copper"),
    "COPPER": ("HG=F", "Copper"),
    "PL=F": ("PL=F", "Platinum"),
    "PLATINUM": ("PL=F", "Platinum"),
    "PA=F": ("PA=F", "Palladium"),
    "PALLADIUM": ("PA=F", "Palladium"),
    "RB=F": ("RB=F", "RBOB Gasoline"),
    "HO=F": ("HO=F", "Heating Oil"),
    "ZC=F": ("ZC=F", "Corn"),
    "CORN": ("ZC=F", "Corn"),
    "ZO=F": ("ZO=F", "Oats"),
    "OATS": ("ZO=F", "Oats"),
    "ZS=F": ("ZS=F", "Soybeans"),
    "SOYBEANS": ("ZS=F", "Soybeans"),
    "ZW=F": ("ZW=F", "Wheat"),
    "WHEAT": ("ZW=F", "Wheat"),
    "ZM=F": ("ZM=F", "Soybean Meal"),
    "ZL=F": ("ZL=F", "Soybean Oil"),
    "CC=F": ("CC=F", "Cocoa"),
    "COCOA": ("CC=F", "Cocoa"),
    "KC=F": ("KC=F", "Coffee"),
    "COFFEE": ("KC=F", "Coffee"),
    "CT=F": ("CT=F", "Cotton"),
    "COTTON": ("CT=F", "Cotton"),
    "SB=F": ("SB=F", "Sugar"),
    "SUGAR": ("SB=F", "Sugar"),
    "HE=F": ("HE=F", "Lean Hogs"),
    "LEAN_HOGS": ("HE=F", "Lean Hogs"),
    "LE=F": ("LE=F", "Live Cattle"),
    "LIVE_CATTLE": ("LE=F", "Live Cattle"),
    "GF=F": ("GF=F", "Feeder Cattle"),
    "FEEDER_CATTLE": ("GF=F", "Feeder Cattle"),
}

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"


def _openai_news_model() -> str:
    _load_env_once()
    return settings_config.openai_news_model()


def _openai_narrative_model() -> str:
    _load_env_once()
    return settings_config.openai_narrative_model()


def _groq_narrative_model() -> str:
    _load_env_once()
    return os.getenv("GROQ_NARRATIVE_MODEL", "llama-3.3-70b-versatile").strip() or "llama-3.3-70b-versatile"


# ----------------------------
# Simple TTL Cache
# ----------------------------

class TTLCache:
    def __init__(self, ttl_seconds: int) -> None:
        self.ttl_seconds = ttl_seconds
        self._store: Dict[str, Tuple[float, Dict[str, Any]]] = {}

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        found = self._store.get(key)
        if not found:
            return None
        expires_at, payload = found
        if time.time() >= expires_at:
            self._store.pop(key, None)
            return None
        return payload

    def set(self, key: str, payload: Dict[str, Any]) -> None:
        self._store[key] = (time.time() + self.ttl_seconds, payload)

    def delete(self, key: str) -> None:
        self._store.pop(key, None)


INSIGHTS_CACHE = TTLCache(ttl_seconds=600)
NEWS_CACHE = TTLCache(ttl_seconds=1800)
_ENV_LOADED = False

INSIGHTS_DISK_DIR_MAP: Dict[str, str] = {
    "stock": "stocks_insights",
    "crypto": "crypto_insights",
    "commodity": "commodities_insights",
}
INSIGHTS_DISK_TTL_SECONDS = 7 * 24 * 60 * 60


# ----------------------------
# Types / Errors
# ----------------------------

class InsightError(Exception):
    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass
class PriceSeries:
    symbol: str
    name: str
    category: str
    frame: pd.DataFrame
    source: str


# ----------------------------
# Env loading
# ----------------------------

def _load_env_once() -> None:
    global _ENV_LOADED
    if _ENV_LOADED:
        return

    def _load_dotenv_file(path: Path) -> None:
        if not path.exists():
            return
        try:
            for raw_line in path.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip("'").strip('"')
                if key and key not in os.environ:
                    os.environ[key] = value
        except Exception:
            return

    repo_root = Path(__file__).resolve().parents[2]
    cwd_root = Path.cwd()
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv(repo_root / ".env", override=False)
        load_dotenv(cwd_root / ".env", override=False)
    except Exception:
        _load_dotenv_file(repo_root / ".env")
        _load_dotenv_file(cwd_root / ".env")
    _ENV_LOADED = True


# ----------------------------
# Helpers
# ----------------------------

def _now_utc_date() -> date:
    return datetime.now(timezone.utc).date()


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _insight_disk_cache_path(asset_type: str, symbol: str) -> Path:
    folder = INSIGHTS_DISK_DIR_MAP.get(asset_type, f"{asset_type}_insights")
    base = Path(__file__).resolve().parents[1] / "data" / "json" / folder
    return base / f"{symbol.lower()}.json"


def _is_disk_cache_fresh(path: Path, ttl_seconds: int = INSIGHTS_DISK_TTL_SECONDS) -> bool:
    if not path.exists():
        return False
    try:
        age_seconds = time.time() - path.stat().st_mtime
        return age_seconds <= ttl_seconds
    except Exception:
        return False


def _load_disk_cached_insight(asset_type: str, symbol: str, months: int) -> Optional[Dict[str, Any]]:
    path = _insight_disk_cache_path(asset_type, symbol)
    if not path.exists():
        return None
    if not _is_disk_cache_fresh(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            return None
        by_months = payload.get("insights_by_months")
        if not isinstance(by_months, dict):
            return None
        key = str(months)
        cached = by_months.get(key)
        if isinstance(cached, dict):
            return cached
        return None
    except Exception:
        return None


def _save_disk_cached_insight(asset_type: str, symbol: str, months: int, result: Dict[str, Any]) -> None:
    path = _insight_disk_cache_path(asset_type, symbol)
    if path.exists() and _is_disk_cache_fresh(path):
        return

    path.parent.mkdir(parents=True, exist_ok=True)

    payload: Dict[str, Any] = {
        "type": asset_type,
        "symbol": symbol.upper(),
        "updated_at": _now_utc_iso(),
        "insights_by_months": {},
    }
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                existing = json.load(f)
            if isinstance(existing, dict):
                payload.update(existing)
                if not isinstance(payload.get("insights_by_months"), dict):
                    payload["insights_by_months"] = {}
        except Exception:
            pass

    payload["type"] = asset_type
    payload["symbol"] = symbol.upper()
    payload["updated_at"] = _now_utc_iso()
    payload["insights_by_months"][str(months)] = result

    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def _period_window(months: int) -> Tuple[date, date]:
    end = _now_utc_date()
    start = end - timedelta(days=max(30, months * 30))
    return start, end


def _normalize_symbol(symbol: str) -> str:
    value = (symbol or "").strip().upper()
    if not value:
        raise InsightError("symbol is required", status_code=400)
    if len(value) > 20:
        raise InsightError("symbol length must be <= 20", status_code=400)
    return value


def _normalize_type(asset_type: str) -> str:
    value = (asset_type or "").strip().lower()
    if value not in {"stock", "crypto", "commodity"}:
        raise InsightError("type must be one of: stock, crypto, commodity", status_code=400)
    return value


def _is_rate_limited_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "too many requests" in msg
        or "rate limit" in msg
        or "rate limited" in msg
        or "429" in msg
    )


async def _request_json(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    json_payload: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: float = 12.0,
    max_retries: int = 2,
) -> Dict[str, Any]:
    last_exc: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        try:
            response = await client.request(
                method,
                url,
                params=params,
                json=json_payload,
                headers=headers,
                timeout=timeout,
            )
            # Important: show useful error bodies
            if response.status_code >= 400:
                upstream_status = int(response.status_code)
                mapped_status = 502
                if upstream_status in {400, 401, 403, 404, 408, 409, 422, 429}:
                    mapped_status = upstream_status
                raise InsightError(
                    f"HTTP {upstream_status} from {url}: {response.text[:2000]}",
                    status_code=mapped_status,
                )
            return response.json()
        except InsightError as exc:
            if attempt < max_retries and getattr(exc, "status_code", 0) == 429:
                await asyncio.sleep(0.6 * (attempt + 1))
                continue
            raise
        except Exception as exc:
            last_exc = exc
            if attempt >= max_retries:
                break
            await asyncio.sleep(0.25 * (attempt + 1))
    if last_exc is None:
        raise InsightError("request failed: unknown_error", status_code=502)
    raise InsightError(
        f"request failed: {type(last_exc).__name__}: {str(last_exc) or 'no_error_message'}",
        status_code=502,
    )


def _normalize_yf_frame(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        raise InsightError("price data not found", status_code=404)
    work = df.copy()
    if isinstance(work.columns, pd.MultiIndex):
        work.columns = [str(c[0]) for c in work.columns]
    if "Close" not in work.columns:
        raise InsightError("close price not available", status_code=404)
    out = pd.DataFrame(index=work.index)
    out["close"] = pd.to_numeric(work["Close"], errors="coerce")
    if "Volume" in work.columns:
        out["volume"] = pd.to_numeric(work["Volume"], errors="coerce")
    else:
        out["volume"] = np.nan
    out = out.dropna(subset=["close"])
    if out.empty:
        raise InsightError("price data not found", status_code=404)
    out.index = pd.to_datetime(out.index)
    return out.sort_index()


# ----------------------------
# Price history fetchers
# ----------------------------

def _fetch_stock_history(symbol: str, start: date, end: date) -> PriceSeries:
    try:
        ticker = yf.Ticker(symbol)
        # yfinance.download can intermittently return empty frames; prefer Ticker.history for stability.
        df = ticker.history(start=str(start), end=str(end + timedelta(days=1)), interval="1d")
        frame = _normalize_yf_frame(df)
        try:
            info = ticker.info or {}
            name = str(info.get("shortName") or info.get("longName") or symbol)
        except Exception:
            name = symbol
        return PriceSeries(symbol=symbol, name=name, category="stock", frame=frame, source="yfinance")
    except InsightError:
        raise
    except Exception as exc:
        if _is_rate_limited_error(exc):
            raise InsightError(
                "market data provider rate limited this request. Please retry in 1-2 minutes.",
                status_code=429,
            ) from exc
        raise


async def _resolve_coingecko_id(client: httpx.AsyncClient, symbol: str) -> Tuple[str, str]:
    payload = await _request_json(
        client,
        "GET",
        "https://api.coingecko.com/api/v3/search",
        params={"query": symbol.lower()},
    )
    coins = payload.get("coins", [])
    if not isinstance(coins, list):
        raise InsightError("crypto symbol not found", status_code=404)
    exact = None
    for coin in coins:
        if str(coin.get("symbol", "")).upper() == symbol:
            exact = coin
            break
    if not exact:
        raise InsightError("crypto symbol not found", status_code=404)
    return str(exact.get("id", "")), str(exact.get("name", symbol))


async def _fetch_crypto_history(
    client: httpx.AsyncClient, symbol: str, start: date, end: date, months: int
) -> PriceSeries:
    def _fetch_crypto_history_yfinance() -> PriceSeries:
        # Ensure yfinance's timezone cache is writable in this project.
        tz_cache_dir = Path(__file__).resolve().parents[1] / "data" / "json" / ".yfinance_tz_cache"
        tz_cache_dir.mkdir(parents=True, exist_ok=True)
        try:
            yf.set_tz_cache_location(str(tz_cache_dir))
        except Exception:
            os.environ["YFINANCE_TZ_CACHE_DIR"] = str(tz_cache_dir)

        yf_symbol = f"{symbol}-USD"
        ticker = yf.Ticker(yf_symbol)
        df = ticker.history(start=str(start), end=str(end + timedelta(days=1)), interval="1d")
        frame = _normalize_yf_frame(df)
        return PriceSeries(symbol=symbol, name=symbol, category="crypto", frame=frame, source="yfinance")

    try:
        coin_id, coin_name = await _resolve_coingecko_id(client, symbol)
        days = max(30, months * 30)
        payload = await _request_json(
            client,
            "GET",
            f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart",
            params={"vs_currency": "usd", "days": str(days), "interval": "daily"},
        )
        prices = payload.get("prices", [])
        volumes = payload.get("total_volumes", [])
        if not prices:
            raise InsightError("crypto price data not found", status_code=404)

        price_map: Dict[date, float] = {}
        for ts_ms, value in prices:
            dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).date()
            price_map[dt] = float(value)

        vol_map: Dict[date, float] = {}
        for ts_ms, value in volumes:
            dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).date()
            vol_map[dt] = float(value)

        rows: List[Tuple[pd.Timestamp, float, float]] = []
        for dt, close in price_map.items():
            if dt < start or dt > end:
                continue
            rows.append((pd.Timestamp(dt), close, vol_map.get(dt, np.nan)))
        if not rows:
            raise InsightError("crypto price data not found in requested period", status_code=404)

        frame = pd.DataFrame(rows, columns=["date", "close", "volume"]).set_index("date").sort_index()
        return PriceSeries(symbol=symbol, name=coin_name, category="crypto", frame=frame, source="coingecko")
    except InsightError as exc:
        # For upstream/transient failures (e.g., network/rate limits), try Yahoo fallback.
        if exc.status_code in {429, 500, 502, 503, 504}:
            try:
                return _fetch_crypto_history_yfinance()
            except Exception:
                pass
        raise
    except Exception:
        # Non-Insight transport/parsing errors: fallback to Yahoo first.
        try:
            return _fetch_crypto_history_yfinance()
        except Exception as fallback_exc:
            raise InsightError(
                f"crypto data unavailable from coingecko and yfinance: {type(fallback_exc).__name__}: {fallback_exc}",
                status_code=502,
            ) from fallback_exc


def _fetch_commodity_history(symbol: str, start: date, end: date) -> PriceSeries:
    mapped = COMMODITY_TICKER_MAP.get(symbol)
    if mapped:
        yf_symbol, display_name = mapped
    elif symbol.endswith("=F"):
        yf_symbol, display_name = symbol, symbol
    else:
        raise InsightError("commodity symbol not supported", status_code=404)
    try:
        ticker = yf.Ticker(yf_symbol)
        df = ticker.history(start=str(start), end=str(end + timedelta(days=1)), interval="1d")
        frame = _normalize_yf_frame(df)
    except InsightError:
        raise InsightError(f"commodity data unavailable for {symbol}", status_code=424)
    except Exception as exc:
        if _is_rate_limited_error(exc):
            raise InsightError(
                "market data provider rate limited this request. Please retry in 1-2 minutes.",
                status_code=429,
            ) from exc
        raise InsightError(f"commodity data unavailable for {symbol}: {exc}", status_code=424)
    return PriceSeries(symbol=symbol, name=display_name, category="commodity", frame=frame, source="yfinance")


# ----------------------------
# Analytics
# ----------------------------

def _compute_metrics(frame: pd.DataFrame) -> Dict[str, Any]:
    close = frame["close"].astype(float)
    returns = close.pct_change().dropna()

    start_price = float(close.iloc[0])
    end_price = float(close.iloc[-1])
    return_pct = ((end_price / start_price) - 1.0) * 100.0 if start_price else 0.0

    volatility = float(returns.std(ddof=1) * math.sqrt(252)) if len(returns) > 1 else 0.0
    rolling_max = close.cummax()
    drawdown = (close / rolling_max) - 1.0
    max_drawdown_pct = float(drawdown.min() * 100.0) if not drawdown.empty else 0.0

    volume = frame["volume"].astype(float)
    valid_vol = volume.dropna()
    avg_daily_volume = float(valid_vol.mean()) if not valid_vol.empty else 0.0

    volume_change_pct = 0.0
    if len(valid_vol) >= 40:
        first20 = float(valid_vol.iloc[:20].mean())
        last20 = float(valid_vol.iloc[-20:].mean())
        if first20 != 0:
            volume_change_pct = ((last20 / first20) - 1.0) * 100.0

    return {
        "start_price": round(start_price, 4),
        "end_price": round(end_price, 4),
        "return_pct": round(return_pct, 4),
        "volatility_annualized": round(volatility, 6),
        "max_drawdown_pct": round(max_drawdown_pct, 4),
        "avg_daily_volume": round(avg_daily_volume, 4),
        "volume_change_pct": round(volume_change_pct, 4),
    }


def _build_notable_moves(frame: pd.DataFrame) -> List[Dict[str, Any]]:
    work = frame.copy()
    work["move_pct"] = work["close"].pct_change() * 100.0
    move_series = work["move_pct"].dropna()

    out: List[Dict[str, Any]] = []

    if not move_series.empty:
        for idx in move_series.nlargest(2).index:
            out.append(
                {
                    "date": idx.date().isoformat(),
                    "move_pct": round(float(work.at[idx, "move_pct"]), 4),
                    "close": round(float(work.at[idx, "close"]), 4),
                    "volume": float(work.at[idx, "volume"]) if pd.notna(work.at[idx, "volume"]) else 0.0,
                    "tag": "largest_up_day",
                }
            )
        for idx in move_series.nsmallest(2).index:
            out.append(
                {
                    "date": idx.date().isoformat(),
                    "move_pct": round(float(work.at[idx, "move_pct"]), 4),
                    "close": round(float(work.at[idx, "close"]), 4),
                    "volume": float(work.at[idx, "volume"]) if pd.notna(work.at[idx, "volume"]) else 0.0,
                    "tag": "largest_down_day",
                }
            )

    vol = work["volume"].dropna()
    if len(vol) > 0:
        for idx in vol.nlargest(2).index:
            move_pct = float(work.at[idx, "move_pct"]) if pd.notna(work.at[idx, "move_pct"]) else 0.0
            out.append(
                {
                    "date": idx.date().isoformat(),
                    "move_pct": round(move_pct, 4),
                    "close": round(float(work.at[idx, "close"]), 4),
                    "volume": float(work.at[idx, "volume"]),
                    "tag": "high_volume_day",
                }
            )

    seen = set()
    deduped: List[Dict[str, Any]] = []
    for row in out:
        key = (row["date"], row["tag"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def _build_tldr_and_conclusion(
    metrics: Dict[str, Any],
    notable_moves: List[Dict[str, Any]],
) -> Tuple[List[str], str]:
    up_moves = [m for m in notable_moves if m.get("tag") == "largest_up_day"]
    down_moves = [m for m in notable_moves if m.get("tag") == "largest_down_day"]
    high_vol = [m for m in notable_moves if m.get("tag") == "high_volume_day"]

    top_up = up_moves[0] if up_moves else None
    top_down = down_moves[0] if down_moves else None
    top_vol = high_vol[0] if high_vol else None

    return_pct = float(metrics.get("return_pct", 0.0))
    vol_ann = float(metrics.get("volatility_annualized", 0.0))
    mdd = float(metrics.get("max_drawdown_pct", 0.0))

    bullet_1 = f"Period return: {return_pct:.2f}% with annualized volatility {vol_ann:.3f}."
    if top_up and top_down:
        bullet_2 = (
            f"Largest up day: {top_up.get('date')} ({float(top_up.get('move_pct', 0.0)):.2f}%), "
            f"largest down day: {top_down.get('date')} ({float(top_down.get('move_pct', 0.0)):.2f}%)."
        )
    else:
        bullet_2 = f"Maximum drawdown in window: {mdd:.2f}%."

    if top_vol:
        bullet_3 = (
            f"Highest volume spike was on {top_vol.get('date')} "
            f"with volume {int(float(top_vol.get('volume', 0.0))):,}."
        )
    else:
        bullet_3 = f"Volume trend change across window: {float(metrics.get('volume_change_pct', 0.0)):.2f}%."

    if return_pct > 0:
        trend = "ended higher"
    elif return_pct < 0:
        trend = "ended lower"
    else:
        trend = "ended flat"
    conclusion = (
        f"Over this period, the asset {trend} ({return_pct:.2f}%) with peak drawdown of {mdd:.2f}%, "
        "indicating meaningful price swings during the window."
    )
    return [bullet_1, bullet_2, bullet_3], conclusion


def _fallback_news_queries(asset_type: str, symbol: str, months: int) -> List[str]:
    base = symbol
    if asset_type == "crypto":
        base = f"{symbol} crypto"
    elif asset_type == "commodity":
        base = f"{symbol} commodity"
    else:
        base = f"{symbol} stock ETF company"

    return [
        f"{base} market news last {months} months",
        f"{base} latest developments last {months} months",
        f"{base} why is it moving recently",
    ]


def _build_no_price_fallback_response(
    asset_type: str,
    symbol: str,
    months: int,
    *,
    narrative: str,
    drivers: List[Dict[str, Any]],
    citations: List[Dict[str, Any]],
    tldr: List[str],
    conclusion: str,
) -> Dict[str, Any]:
    start, end = _period_window(months)
    return {
        "type": asset_type,
        "symbol": symbol,
        "name": symbol,
        "period": {
            "months": months,
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
        "metrics": {
            "history_available": False,
            "data_source": "openai_web_fallback",
        },
        "notable_moves": [],
        "drivers": drivers,
        "narrative": narrative,
        "tldr": tldr,
        "conclusion": conclusion,
        "disclaimer": "AI can make mistakes, please DYOR. Not financial advice.",
        "citations": citations,
        "warnings": [
            "Historical price data was unavailable for this symbol.",
            "Narrative was generated from OpenAI web context instead of verified price history.",
            "Informational only. No investment recommendation.",
        ],
    }


# ----------------------------
# OpenAI Web Search (drivers)
# ----------------------------

def _news_queries(asset_type: str, symbol: str, name: str, move_date: str) -> List[str]:
    dt = date.fromisoformat(move_date)
    start = (dt - timedelta(days=3)).isoformat()
    end = (dt + timedelta(days=3)).isoformat()

    keywords = [
        "earnings",
        "guidance",
        "SEC",
        "lawsuit",
        "rate decision",
        "ETF",
        "hack",
        "regulation",
        "OPEC",
        "supply",
    ]

    base = f"{symbol} {name}".strip()
    if asset_type == "crypto":
        base = f"{symbol} {name} crypto".strip()
    if asset_type == "commodity":
        base = f"{symbol} {name} commodity".strip()

    # Keep queries short; date window helps recency.
    return [f"{base} {kw} around {dt.isoformat()}" for kw in keywords[:4]]


def _extract_json_object(text: str) -> Dict[str, Any]:
    """
    Extract a JSON object from text safely.
    Handles cases where model returns extra text around JSON.
    """
    text = text.strip()
    if not text:
        return {}
    # Fast path
    try:
        return json.loads(text)
    except Exception:
        pass

    # Try to find first {...} block
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


def _responses_extract_text(resp_json: Dict[str, Any]) -> str:
    # 1) Try "output_text" convenience if present (some SDKs / responses include it)
    ot = resp_json.get("output_text")
    if isinstance(ot, str) and ot.strip():
        return ot.strip()

    # 2) Standard "output" list
    output = resp_json.get("output", [])
    if not isinstance(output, list):
        return ""

    chunks: List[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue

        # Sometimes text is nested directly
        if isinstance(item.get("text"), str) and item["text"].strip():
            chunks.append(item["text"].strip())
            continue

        # Messages contain content parts
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            # common part types: output_text, text
            t = part.get("text")
            if isinstance(t, str) and t.strip():
                chunks.append(t.strip())

    return "\n".join(chunks).strip()


def _chat_completion_extract_text(resp_json: Dict[str, Any]) -> str:
    choices = resp_json.get("choices", [])
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message", {})
    if not isinstance(message, dict):
        return ""
    content = message.get("content", "")
    if isinstance(content, str):
        return content.strip()
    return ""


def _extract_openai_web_results(resp_json: Dict[str, Any]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    seen_urls = set()

    def _add_row(headline: str, url: str, source: str = "", published: str = "") -> None:
        h = str(headline or "").strip()
        u = str(url or "").strip()
        s = str(source or "").strip()
        p = str(published or "").strip()
        if not h or not u or u in seen_urls:
            return
        seen_urls.add(u)
        results.append({"headline": h, "source": s, "url": u, "published_at": p})

    output = resp_json.get("output", [])
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue

            if item.get("type") == "web_search_call":
                tool_results = item.get("results", [])
                if isinstance(tool_results, list):
                    for r in tool_results:
                        if not isinstance(r, dict):
                            continue
                        _add_row(
                            headline=r.get("title", ""),
                            url=r.get("url", ""),
                            source=r.get("source", ""),
                            published=r.get("published_date", ""),
                        )

                action = item.get("action", {})
                if isinstance(action, dict):
                    sources = action.get("sources", [])
                    if isinstance(sources, list):
                        for s in sources:
                            if not isinstance(s, dict):
                                continue
                            _add_row(
                                headline=s.get("title", ""),
                                url=s.get("url", ""),
                                source=s.get("source", ""),
                                published=s.get("published_date", ""),
                            )

            content = item.get("content", [])
            if isinstance(content, list):
                for part in content:
                    if not isinstance(part, dict):
                        continue
                    annotations = part.get("annotations", [])
                    if not isinstance(annotations, list):
                        continue
                    for ann in annotations:
                        if not isinstance(ann, dict):
                            continue
                        _add_row(
                            headline=ann.get("title", "") or ann.get("text", "") or "News item",
                            url=ann.get("url", ""),
                            source=ann.get("source", ""),
                            published=ann.get("published_date", ""),
                        )
    return results


def _fetch_yfinance_news(symbol: str, max_items: int = 10) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    try:
        ticker = yf.Ticker(symbol)
        items = ticker.news or []
    except Exception:
        return out

    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        url = str(item.get("link", "")).strip()
        source = str(item.get("publisher", "")).strip()
        ts = item.get("providerPublishTime")
        published = ""
        if isinstance(ts, (int, float)) and ts > 0:
            published = datetime.fromtimestamp(float(ts), tz=timezone.utc).date().isoformat()
        if title and url:
            out.append(
                {
                    "headline": title,
                    "source": source,
                    "url": url,
                    "published_at": published,
                }
            )
        if len(out) >= max_items:
            break
    return out

async def _openai_web_search_news(client: httpx.AsyncClient, query: str) -> List[Dict[str, Any]]:
    cached = NEWS_CACHE.get(query)
    if cached is not None:
        return cached.get("results", [])

    _load_env_once()
    openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not openai_api_key:
        NEWS_CACHE.set(query, {"results": []})
        return []

    payload = {
        "model": _openai_news_model(),
        "temperature": 0.0,
        "input": [
            {
                "role": "user",
                "content": (
                    "Use web search to find recent relevant news for this query:\n"
                    f"{query}\n"
                    "Return results via the tool."
                ),
            }
        ],
        "tools": [{"type": "web_search", "search_context_size": "low"}],
        "include": ["web_search_call.results", "web_search_call.action.sources"],
    }

    resp_json = await _request_json(
        client,
        "POST",
        OPENAI_RESPONSES_URL,
        json_payload=payload,
        headers={
            "Authorization": f"Bearer {openai_api_key}",
            "Content-Type": "application/json",
        },
        timeout=20.0,
        max_retries=1,
    )
    if os.getenv("NEWS_DEBUG", "").strip() == "1":
        try:
            # debug_path = Path(__file__).resolve().parents[1] / "data" / "json" / "openai_news_debug.json"
            # debug_path.parent.mkdir(parents=True, exist_ok=True)
            # debug_path.write_text(
            #     json.dumps(resp_json, indent=2)[:300000],
            #     encoding="utf-8",
            # )
            pass
        except Exception:
            pass
    results = _extract_openai_web_results(resp_json)[:10]

    NEWS_CACHE.set(query, {"results": results})
    return results

async def _build_drivers(
    client: httpx.AsyncClient,
    asset_type: str,
    symbol: str,
    name: str,
    notable_moves: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    urls_seen = set()
    drivers: List[Dict[str, Any]] = []

    for move in notable_moves:
        move_date = move["date"]
        queries = _news_queries(asset_type, symbol, name, move_date)

        for query in queries:
            try:
                results = await _openai_web_search_news(client, query)
            except Exception:
                # News retrieval failures should not fail the whole insights request.
                continue
            for row in results:
                url = str(row.get("url", "")).strip()
                if not url or url in urls_seen:
                    continue
                urls_seen.add(url)

                published = str(row.get("published_at", "")).strip()
                date_value = published[:10] if published else move_date

                drivers.append(
                    {
                        "date": date_value,
                        "headline": str(row.get("headline", "")).strip(),
                        "source": str(row.get("source", "")).strip(),
                        "url": url,
                    }
                )

                if len(drivers) >= 15:
                    return drivers

    if drivers:
        return drivers

    if asset_type == "stock":
        fallback = _fetch_yfinance_news(symbol=symbol, max_items=10)
        for row in fallback:
            url = str(row.get("url", "")).strip()
            if not url or url in urls_seen:
                continue
            urls_seen.add(url)
            published = str(row.get("published_at", "")).strip()
            date_value = published[:10] if published else _now_utc_date().isoformat()
            drivers.append(
                {
                    "date": date_value,
                    "headline": str(row.get("headline", "")).strip(),
                    "source": str(row.get("source", "")).strip(),
                    "url": url,
                }
            )
            if len(drivers) >= 15:
                break

    return drivers
# ----------------------------
# Narrative (LLM, grounded, no-advice)
# ----------------------------

async def _generate_narrative_with_llm(
    client: httpx.AsyncClient,
    metrics: Dict[str, Any],
    notable_moves: List[Dict[str, Any]],
    drivers: List[Dict[str, Any]],
    *,
    timeout_seconds: float = 30.0,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Uses chat completions to produce a grounded narrative.
    It must cite only provided drivers by URL and must pass validate_text().
    """
    _load_env_once()
    openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
    groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not openai_api_key and not groq_api_key:
        if not drivers:
            return "No major news items retrieved in this window. Narrative based on metrics only.", []
        return "Narrative unavailable because no LLM provider key is set.", []

    system_base = (
        "You are a financial market activity explainer. "
        "Use ONLY the provided metrics, notable_moves, and drivers. "
        "Do not provide investment advice or recommendations.\n"
        "Forbidden words/phrases: buy, sell, hold, should, recommend, opportunity, undervalued, overvalued, target price.\n"
        "Write neutral descriptive language only. "
        "If causality is uncertain, use cautious phrasing like 'coincided with' or 'may have contributed'."
    )

    user_payload = {
        "metrics": metrics,
        "notable_moves": notable_moves,
        "drivers": drivers,
        "task": (
            "Return STRICT JSON only with keys: "
            "narrative (string), selected_driver_urls (array of urls you used, subset of drivers), citation_map (object id->url). "
            "Narrative must be one detailed paragraph (~7-10 sentences) in this style: "
            "performance summary -> volatility/drawdown -> largest up/down sessions -> volume context -> news/key drivers with citations. "
            "Use the EXACT numeric values from metrics/notable_moves (do not create new prices, dates, or percentages). "
            "It must include: start_price, end_price, return_pct, volatility_annualized, max_drawdown_pct, "
            "largest_up_day, largest_down_day, and at least one high_volume_day if available. "
            "Tie each largest_up_day and largest_down_day to at least one nearby driver headline by date when possible, "
            "and cite with [1], [2] etc that map to citation_map. "
            "If evidence is weak, state uncertainty instead of inferring specifics. "
            "Do not invent facts not present in metrics/notable_moves/drivers."
        ),
    }

    async def _call_model(
        system_prompt: str,
        *,
        provider: str,
    ) -> Dict[str, Any]:
        if provider == "openai":
            endpoint = OPENAI_CHAT_URL
            key = openai_api_key
            model = _openai_narrative_model()
            headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        else:
            endpoint = GROQ_CHAT_URL
            key = groq_api_key
            model = _groq_narrative_model()
            headers = {
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            }

        payload = {
            "model": model,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
            "temperature": 0.1,
        }
        resp_json = await _request_json(
            client,
            "POST",
            endpoint,
            json_payload=payload,
            headers=headers,
            timeout=timeout_seconds,
            max_retries=1,
        )
        text = _chat_completion_extract_text(resp_json)
        return _extract_json_object(text)

    def _metrics_only_fallback() -> str:
        return (
            f"Price moved from {metrics.get('start_price', 0)} to {metrics.get('end_price', 0)} "
            f"({metrics.get('return_pct', 0)}% over the selected period). "
            f"Annualized volatility was {metrics.get('volatility_annualized', 0)}, and "
            f"maximum drawdown was {metrics.get('max_drawdown_pct', 0)}%. "
            "No major news items were retrieved in this window."
        )

    def _deterministic_narrative_fallback() -> Tuple[str, List[Dict[str, Any]]]:
        up_moves = [m for m in notable_moves if m.get("tag") == "largest_up_day"][:2]
        down_moves = [m for m in notable_moves if m.get("tag") == "largest_down_day"][:2]
        high_vol = [m for m in notable_moves if m.get("tag") == "high_volume_day"][:2]

        citations: List[Dict[str, Any]] = []
        citation_by_url: Dict[str, int] = {}

        def _cite_url(url: str) -> str:
            clean = (url or "").strip()
            if not clean:
                return ""
            if clean in citation_by_url:
                return f"[{citation_by_url[clean]}]"
            idx = len(citations) + 1
            citation_by_url[clean] = idx
            citations.append({"id": idx, "url": clean})
            return f"[{idx}]"

        def _parse_driver_date(value: str) -> Optional[date]:
            try:
                return date.fromisoformat(value)
            except Exception:
                return None

        def _drivers_near(move_date: str, limit: int = 2) -> List[Dict[str, Any]]:
            move_dt = _parse_driver_date(move_date)
            if move_dt is None:
                return []
            scored: List[Tuple[int, Dict[str, Any]]] = []
            for d in drivers:
                d_date = _parse_driver_date(str(d.get("date", "")))
                if d_date is None:
                    continue
                gap = abs((d_date - move_dt).days)
                if gap <= 3:
                    scored.append((gap, d))
            scored.sort(key=lambda x: x[0])
            return [row for _, row in scored[:limit]]

        start_price = float(metrics.get("start_price", 0.0))
        end_price = float(metrics.get("end_price", 0.0))
        ret = float(metrics.get("return_pct", 0.0))
        vol = float(metrics.get("volatility_annualized", 0.0)) * 100.0
        mdd = float(metrics.get("max_drawdown_pct", 0.0))

        parts: List[str] = [
            (
                f"Over the analyzed period, price moved {ret:.2f}% from {start_price:.2f} to {end_price:.2f}, "
                f"with annualized volatility around {vol:.1f}% and maximum drawdown near {abs(mdd):.2f}%."
            )
        ]

        if up_moves:
            top_up = up_moves[0]
            up_near = _drivers_near(str(top_up.get("date", "")), limit=1)
            up_context = ""
            if up_near:
                d = up_near[0]
                up_ref = _cite_url(str(d.get("url", "")))
                up_context = (
                    f" This may have coincided with {d.get('headline', 'related coverage')} "
                    f"on {d.get('date', '')} {up_ref}."
                )
            parts.append(
                "The strongest up session was "
                f"{top_up.get('date')} ({float(top_up.get('move_pct', 0.0)):.2f}%), "
                f"closing at {float(top_up.get('close', 0.0)):.2f}."
                + up_context
            )
            if len(up_moves) > 1:
                nxt = up_moves[1]
                nxt_near = _drivers_near(str(nxt.get("date", "")), limit=1)
                nxt_context = ""
                if nxt_near:
                    d2 = nxt_near[0]
                    nxt_ref = _cite_url(str(d2.get("url", "")))
                    nxt_context = (
                        f" It may have aligned with {d2.get('headline', 'related news')} "
                        f"({d2.get('date', '')}) {nxt_ref}."
                    )
                parts.append(
                    "Another notable gain occurred on "
                    f"{nxt.get('date')} ({float(nxt.get('move_pct', 0.0)):.2f}%)."
                    + nxt_context
                )

        if down_moves:
            top_down = down_moves[0]
            down_near = _drivers_near(str(top_down.get("date", "")), limit=1)
            down_context = ""
            if down_near:
                dd = down_near[0]
                down_ref = _cite_url(str(dd.get("url", "")))
                down_context = (
                    f" This may have coincided with {dd.get('headline', 'related coverage')} "
                    f"on {dd.get('date', '')} {down_ref}."
                )
            if len(down_moves) > 1:
                second_down = down_moves[1]
                second_near = _drivers_near(str(second_down.get("date", "")), limit=1)
                second_context = ""
                if second_near:
                    sd = second_near[0]
                    second_ref = _cite_url(str(sd.get("url", "")))
                    second_context = (
                        f" Additional downside may align with {sd.get('headline', 'related news')} "
                        f"({sd.get('date', '')}) {second_ref}."
                    )
                parts.append(
                    "The sharpest decline was "
                    f"{top_down.get('date')} ({float(top_down.get('move_pct', 0.0)):.2f}%), "
                    "with additional downside seen on "
                    f"{second_down.get('date')} ({float(second_down.get('move_pct', 0.0)):.2f})."
                    + down_context
                    + second_context
                )
            else:
                parts.append(
                    "The sharpest decline was "
                    f"{top_down.get('date')} ({float(top_down.get('move_pct', 0.0)):.2f})."
                    + down_context
                )

        if high_vol:
            hv_dates = ", ".join(str(m.get("date", "")) for m in high_vol if m.get("date"))
            parts.append(
                f"High-volume activity was concentrated on {hv_dates}, indicating elevated trading interest."
            )

        if drivers:
            top_drivers = drivers[:4]
            driver_bits: List[str] = []
            for d in top_drivers:
                ref = _cite_url(str(d.get("url", "")))
                if not ref:
                    continue
                driver_bits.append(f"{d.get('date', '')}: {d.get('headline', '')} {ref}")
            if driver_bits:
                parts.append(
                    "News flow during key windows included "
                    + "; ".join(driver_bits)
                    + ", which may have contributed to short-term sentiment shifts."
                )
        else:
            parts.append("News retrieval returned limited coverage for the selected window.")

        return " ".join(parts), citations

    try:
        providers = []
        if openai_api_key:
            providers.append("openai")
        if groq_api_key:
            providers.append("groq")

        parsed: Dict[str, Any] = {}
        for provider in providers:
            try:
                parsed = await _call_model(system_base, provider=provider)
                if parsed:
                    break
            except Exception:
                continue
        narrative = str(parsed.get("narrative", "")).strip()
        if not narrative and not parsed:
            if not drivers:
                return _metrics_only_fallback(), []
            return _deterministic_narrative_fallback()

        ok, _reasons = validate_text(narrative)
        if not ok:
            strict_prompt = system_base + "\nIf you might violate the forbidden list, output an empty narrative."
            strict_parsed: Dict[str, Any] = {}
            for provider in providers:
                try:
                    strict_parsed = await _call_model(strict_prompt, provider=provider)
                    if strict_parsed:
                        break
                except Exception:
                    continue
            parsed = strict_parsed or parsed
            narrative = str(parsed.get("narrative", "")).strip()
            ok, _reasons = validate_text(narrative)
            if not ok or not narrative:
                return _deterministic_narrative_fallback()

        selected_urls = parsed.get("selected_driver_urls", [])
        if not isinstance(selected_urls, list):
            selected_urls = []
        selected_urls = [str(u).strip() for u in selected_urls if str(u).strip()]

        # Build citations (id -> url) in the order the model selected
        citations: List[Dict[str, Any]] = []
        idx = 1
        for url in selected_urls:
            citations.append({"id": idx, "url": url})
            idx += 1

        # If there were no drivers at all, ensure narrative is metrics-based
        if not drivers and not narrative:
            return _metrics_only_fallback(), []

        return narrative, citations

    except InsightError:
        raise
    except httpx.TimeoutException:
        if not drivers:
            return _metrics_only_fallback(), []
        return _deterministic_narrative_fallback()
    except Exception:
        if not drivers:
            return _metrics_only_fallback(), []
        return _deterministic_narrative_fallback()


async def build_insights_gpt_web_fallback(
    asset_type: str,
    symbol: str,
    months: int,
    *,
    failure_reason: str = "price data not found",
) -> Dict[str, Any]:
    _load_env_once()
    atype = _normalize_type(asset_type)
    sym = _normalize_symbol(symbol)

    if months <= 0 or months > 24:
        raise InsightError("months must be between 1 and 24", status_code=400)

    start, end = _period_window(months)
    drivers: List[Dict[str, Any]] = []
    citations: List[Dict[str, Any]] = []

    async with httpx.AsyncClient() as client:
        urls_seen = set()
        for query in _fallback_news_queries(atype, sym, months):
            try:
                results = await _openai_web_search_news(client, query)
            except Exception:
                results = []
            for row in results:
                url = str(row.get("url", "")).strip()
                if not url or url in urls_seen:
                    continue
                urls_seen.add(url)
                published = str(row.get("published_at", "")).strip()
                drivers.append(
                    {
                        "date": published[:10] if published else end.isoformat(),
                        "headline": str(row.get("headline", "")).strip(),
                        "source": str(row.get("source", "")).strip(),
                        "url": url,
                    }
                )
                if len(drivers) >= 10:
                    break
            if len(drivers) >= 10:
                break

        openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not openai_api_key:
            narrative = (
                f"Verified historical price data for {sym} was unavailable for the requested {months}-month window, "
                "so this fallback could not build a metrics-based market narrative. "
                "Recent web context should be reviewed directly before drawing conclusions."
            )
            tldr = [
                "Historical market-price series could not be retrieved.",
                f"Fallback context window: last {months} month(s).",
                f"OpenAI fallback unavailable because OPENAI_API_KEY is not set.",
            ]
            conclusion = (
                f"No verified price-history insight could be produced for {sym}. "
                "Use a supported exchange-qualified ticker or restore market data access."
            )
            return _build_no_price_fallback_response(
                atype,
                sym,
                months,
                narrative=narrative,
                drivers=drivers,
                citations=citations,
                tldr=tldr,
                conclusion=conclusion,
            )

        system_prompt = (
            "You are a financial market context summarizer. "
            "Historical price data is unavailable for this asset. "
            "Use ONLY the supplied web results and failure reason. "
            "Do not provide investment advice or fabricate prices, returns, volatility, or performance metrics. "
            "Write neutral descriptive language only."
        )
        user_payload = {
            "asset_type": atype,
            "symbol": sym,
            "window_months": months,
            "failure_reason": failure_reason,
            "drivers": drivers,
            "task": (
                "Return STRICT JSON only with keys: narrative (string), tldr (array of exactly 3 short bullets), "
                "conclusion (string), selected_driver_urls (array of urls you used). "
                "Narrative should explain that verified price history is unavailable, summarize the main recent themes "
                "from the supplied web results, and clearly separate confirmed facts from uncertainty."
            ),
        }

        narrative = ""
        tldr: List[str] = []
        conclusion = ""
        try:
            resp_json = await _request_json(
                client,
                "POST",
                OPENAI_CHAT_URL,
                json_payload={
                    "model": _openai_narrative_model(),
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(user_payload)},
                    ],
                    "temperature": 0.1,
                },
                headers={
                    "Authorization": f"Bearer {openai_api_key}",
                    "Content-Type": "application/json",
                },
                timeout=25.0,
                max_retries=1,
            )
            parsed = _extract_json_object(_chat_completion_extract_text(resp_json))
            narrative = str(parsed.get("narrative", "")).strip()
            raw_tldr = parsed.get("tldr", [])
            if isinstance(raw_tldr, list):
                tldr = [str(item).strip() for item in raw_tldr if str(item).strip()][:3]
            conclusion = str(parsed.get("conclusion", "")).strip()
            selected_urls = parsed.get("selected_driver_urls", [])
            if not isinstance(selected_urls, list):
                selected_urls = []
            citation_id = 1
            seen_urls = set()
            for url in selected_urls:
                clean = str(url).strip()
                if not clean or clean in seen_urls:
                    continue
                seen_urls.add(clean)
                citations.append({"id": citation_id, "url": clean})
                citation_id += 1
            ok, _reasons = validate_text(narrative)
            if not ok:
                narrative = ""
        except Exception:
            narrative = ""

    if not narrative:
        narrative = (
            f"Verified historical price data for {sym} was unavailable for the requested {months}-month window. "
            "This fallback uses recent web context instead of a metrics-based market history. "
            + (
                "Recent coverage points to the following themes: "
                + "; ".join(
                    f"{row.get('date', '')}: {row.get('headline', '')}" for row in drivers[:3] if row.get("headline")
                )
                + "."
                if drivers
                else "No reliable recent web context was retrieved for the symbol."
            )
        )
    if len(tldr) < 3:
        tldr = [
            "Historical market-price series could not be retrieved.",
            f"Fallback context uses recent web results for {sym}.",
            "Treat this as descriptive context, not a metrics-based market analysis.",
        ]
    if not conclusion:
        conclusion = (
            f"A reduced insight was returned for {sym} because verified price history was unavailable. "
            "The result should be read as contextual news summary rather than technical market analysis."
        )

    return _build_no_price_fallback_response(
        atype,
        sym,
        months,
        narrative=narrative,
        drivers=drivers,
        citations=citations,
        tldr=tldr,
        conclusion=conclusion,
    )


# ----------------------------
# Public function
# ----------------------------

async def build_insights_gpt(asset_type: str, symbol: str, months: int) -> Dict[str, Any]:
    _load_env_once()
    atype = _normalize_type(asset_type)
    sym = _normalize_symbol(symbol)

    if months <= 0 or months > 24:
        raise InsightError("months must be between 1 and 24", status_code=400)

    cache_key = f"{atype}:{sym}:{months}"
    cached = INSIGHTS_CACHE.get(cache_key)
    if cached is not None:
        disk_path = _insight_disk_cache_path(atype, sym)
        if _is_disk_cache_fresh(disk_path):
            return cached
        INSIGHTS_CACHE.delete(cache_key)

    disk_cached = _load_disk_cached_insight(atype, sym, months)
    if disk_cached is not None:
        INSIGHTS_CACHE.set(cache_key, disk_cached)
        return disk_cached

    start, end = _period_window(months)

    async with httpx.AsyncClient() as client:
        # Price series
        if atype == "stock":
            price_series = await asyncio.to_thread(_fetch_stock_history, sym, start, end)
        elif atype == "crypto":
            price_series = await _fetch_crypto_history(client, sym, start, end, months)
        else:
            price_series = await asyncio.to_thread(_fetch_commodity_history, sym, start, end)

        frame = price_series.frame
        metrics = _compute_metrics(frame)
        notable_moves = _build_notable_moves(frame)

        # Drivers via OpenAI web_search tool
        drivers = await _build_drivers(client, atype, price_series.symbol, price_series.name, notable_moves)

        # Narrative via OpenAI (grounded in drivers)
        narrative, citations = await _generate_narrative_with_llm(client, metrics, notable_moves, drivers)

    if not drivers and narrative.strip() == "":
        narrative = "No major news items retrieved in this window. Narrative based on metrics only."
    tldr, conclusion = _build_tldr_and_conclusion(metrics, notable_moves)

    result = {
        "type": atype,
        "symbol": price_series.symbol,
        "name": price_series.name,
        "period": {
            "months": months,
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
        "metrics": metrics,
        "notable_moves": notable_moves,
        "drivers": drivers,
        "narrative": narrative,
        "tldr": tldr,
        "conclusion": conclusion,
        "disclaimer": "AI can make mistakes, please DYOR. Not financial advice.",
        "citations": citations,
        "warnings": ["Informational only. No investment recommendation."],
    }

    INSIGHTS_CACHE.set(cache_key, result)
    _save_disk_cached_insight(atype, sym, months, result)
    return result
