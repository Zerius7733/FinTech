import asyncio
import json
import math
import os
import re
import time
import email.utils
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus

import httpx
import numpy as np
import pandas as pd
import yfinance as yf

from backend.services.guardrails.no_advice import validate_text
# ----------------------------
# Config / Maps
# ----------------------------

COMMODITY_TICKER_MAP: Dict[str, Tuple[str, str]] = {
    "XAU": ("GC=F", "Gold"),
    "GOLD": ("GC=F", "Gold"),
    "XAG": ("SI=F", "Silver"),
    "SILVER": ("SI=F", "Silver"),
    "CL": ("CL=F", "Crude Oil"),
    "WTI": ("CL=F", "Crude Oil"),
    "BRENT": ("BZ=F", "Brent Oil"),
    "NG": ("NG=F", "Natural Gas"),
}

def _ollama_base_url() -> str:
    _load_env_once()
    return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").strip().rstrip("/")


def _ollama_model() -> str:
    _load_env_once()
    return os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct").strip() or "qwen2.5:7b-instruct"


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


INSIGHTS_CACHE = TTLCache(ttl_seconds=600)
NEWS_CACHE = TTLCache(ttl_seconds=1800)
_ENV_LOADED = False


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
                raise InsightError(
                    f"HTTP {response.status_code} from {url}: {response.text[:2000]}",
                    status_code=502,
                )
            return response.json()
        except InsightError:
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
    df = yf.download(symbol, start=str(start), end=str(end + timedelta(days=1)), interval="1d", progress=False)
    frame = _normalize_yf_frame(df)
    ticker = yf.Ticker(symbol)
    info = ticker.info or {}
    name = str(info.get("shortName") or info.get("longName") or symbol)
    return PriceSeries(symbol=symbol, name=name, category="stock", frame=frame, source="yfinance")


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


def _fetch_commodity_history(symbol: str, start: date, end: date) -> PriceSeries:
    mapped = COMMODITY_TICKER_MAP.get(symbol)
    if not mapped:
        raise InsightError("commodity symbol not supported", status_code=404)
    yf_symbol, display_name = mapped
    try:
        df = yf.download(yf_symbol, start=str(start), end=str(end + timedelta(days=1)), interval="1d", progress=False)
        frame = _normalize_yf_frame(df)
    except InsightError:
        raise InsightError(f"commodity data unavailable for {symbol}", status_code=424)
    except Exception as exc:
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


# ----------------------------
# News Retrieval (drivers)
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
    recent_fallback: List[Dict[str, Any]] = []
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

    rss_url = (
        "https://news.google.com/rss/search?"
        f"q={quote_plus(query + ' when:1d')}&hl=en-US&gl=US&ceid=US:en"
    )
    results: List[Dict[str, Any]] = []
    recent_fallback: List[Dict[str, Any]] = []
    today = _now_utc_date()

    try:
        response = await client.get(rss_url, timeout=10.0)
        if response.status_code >= 400:
            NEWS_CACHE.set(query, {"results": []})
            return []

        root = ET.fromstring(response.text)
        for item in root.findall(".//item"):
            title = (item.findtext("title") or "").strip()
            url = (item.findtext("link") or "").strip()
            source = (item.findtext("source") or "").strip()
            pub_raw = (item.findtext("pubDate") or "").strip()
            if not title or not url:
                continue

            published_at = ""
            try:
                dt = email.utils.parsedate_to_datetime(pub_raw)
                if dt is not None:
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    dt_utc = dt.astimezone(timezone.utc)
                    published_at = dt_utc.date().isoformat()
                    # prioritize current-day news; keep recent as fallback
                    if dt_utc.date() != today:
                        if 0 <= (today - dt_utc.date()).days <= 7:
                            recent_fallback.append(
                                {
                                    "headline": title,
                                    "source": source,
                                    "url": url,
                                    "published_at": published_at,
                                }
                            )
                        continue
            except Exception:
                continue

            results.append(
                {
                    "headline": title,
                    "source": source,
                    "url": url,
                    "published_at": published_at,
                }
            )
            if len(results) >= 10:
                break
    except Exception:
        results = []

    if not results and recent_fallback:
        results = recent_fallback[:10]

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
            results = await _openai_web_search_news(client, query)
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
    timeout_seconds: float = 20.0,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Uses local Ollama chat API to produce a grounded narrative.
    It must cite only provided drivers by URL and must pass validate_text().
    """

    system_base = (
        "You are a financial market activity explainer. "
        "Use ONLY the provided metrics, notable_moves, and drivers. "
        "Do not provide investment advice or recommendations.\n"
        "Forbidden words/phrases: buy, sell, hold, should, recommend, opportunity, undervalued, overvalued, target price.\n"
        "Write neutral descriptive language only."
    )

    user_payload = {
        "metrics": metrics,
        "notable_moves": notable_moves,
        "drivers": drivers,
        "task": (
            "Return STRICT JSON only with keys: "
            "narrative (string), selected_driver_urls (array of urls you used, subset of drivers), citation_map (object id->url). "
            "Narrative should be concise (5-10 sentences), mention notable dates/moves, and cite with [1], [2] etc that map to citation_map."
        ),
    }

    async def _call_model(system_prompt: str) -> Dict[str, Any]:
        payload = {
            "model": _ollama_model(),
            "stream": False,
            "format": "json",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
            "options": {"temperature": 0.1},
        }
        resp_json = await _request_json(
            client,
            "POST",
            f"{_ollama_base_url()}/api/chat",
            json_payload=payload,
            headers={"Content-Type": "application/json"},
            timeout=timeout_seconds,
            max_retries=1,
        )
        message = resp_json.get("message", {})
        text = ""
        if isinstance(message, dict):
            content = message.get("content", "")
            if isinstance(content, str):
                text = content.strip()
        if not text:
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

    try:
        parsed = await _call_model(system_base)
        narrative = str(parsed.get("narrative", "")).strip()
        if not narrative:
            if not drivers:
                return _metrics_only_fallback(), []
            return "Unable to generate narrative without violating no-advice constraints.", []

        ok, _reasons = validate_text(narrative)
        if not ok:
            strict_prompt = system_base + "\nIf you might violate the forbidden list, output an empty narrative."
            strict_parsed = await _call_model(strict_prompt)
            parsed = strict_parsed or parsed
            narrative = str(parsed.get("narrative", "")).strip()
            ok, _reasons = validate_text(narrative)
            if not ok or not narrative:
                return "Unable to generate narrative without violating no-advice constraints.", []

        selected_urls = parsed.get("selected_driver_urls", [])
        if not isinstance(selected_urls, list):
            selected_urls = []
        selected_urls = [str(u).strip() for u in selected_urls if str(u).strip()]

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
        if not drivers:
            return _metrics_only_fallback(), []
        return "Narrative generation unavailable. Returning computed metrics and retrieved drivers only.", []
    except httpx.TimeoutException:
        return "Narrative generation timed out. Returning computed metrics and retrieved drivers only.", []
    except Exception:
        if not drivers:
            return _metrics_only_fallback(), []
        return "Unable to generate narrative without violating no-advice constraints.", []


# ----------------------------
# Public function
# ----------------------------

async def build_insights(asset_type: str, symbol: str, months: int) -> Dict[str, Any]:
    _load_env_once()
    atype = _normalize_type(asset_type)
    sym = _normalize_symbol(symbol)

    if months <= 0 or months > 24:
        raise InsightError("months must be between 1 and 24", status_code=400)

    cache_key = f"{atype}:{sym}:{months}"
    cached = INSIGHTS_CACHE.get(cache_key)
    if cached is not None:
        return cached

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

        drivers = await _build_drivers(client, atype, price_series.symbol, price_series.name, notable_moves)

        # Narrative via Ollama (grounded in metrics + drivers)
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
    return result
