import asyncio
import json
import math
import os
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import httpx
import numpy as np
import pandas as pd
import yfinance as yf

from backend.services.guardrails.no_advice import validate_text


COMMODITY_TICKER_MAP = {
    "XAU": ("GC=F", "Gold"),
    "GOLD": ("GC=F", "Gold"),
    "XAG": ("SI=F", "Silver"),
    "SILVER": ("SI=F", "Silver"),
    "CL": ("CL=F", "Crude Oil"),
    "WTI": ("CL=F", "Crude Oil"),
    "BRENT": ("BZ=F", "Brent Oil"),
    "NG": ("NG=F", "Natural Gas"),
}


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


def _load_env_once() -> None:
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    try:
        from dotenv import load_dotenv  # type: ignore

        repo_root = Path(__file__).resolve().parents[2]
        load_dotenv(repo_root / ".env", override=False)
        load_dotenv(Path.cwd() / ".env", override=False)
    except Exception:
        pass
    _ENV_LOADED = True


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
    timeout: float = 8.0,
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
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            last_exc = exc
            if attempt >= max_retries:
                break
            await asyncio.sleep(0.25 * (attempt + 1))
    raise InsightError(f"request failed: {last_exc}", status_code=502)


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
                    "volume": float(work.at[idx, "volume"]) if not math.isnan(float(work.at[idx, "volume"])) else 0.0,
                    "tag": "largest_up_day",
                }
            )
        for idx in move_series.nsmallest(2).index:
            out.append(
                {
                    "date": idx.date().isoformat(),
                    "move_pct": round(float(work.at[idx, "move_pct"]), 4),
                    "close": round(float(work.at[idx, "close"]), 4),
                    "volume": float(work.at[idx, "volume"]) if not math.isnan(float(work.at[idx, "volume"])) else 0.0,
                    "tag": "largest_down_day",
                }
            )

    vol = work["volume"].dropna()
    if len(vol) > 0:
        for idx in vol.nlargest(2).index:
            move_pct = float(work.at[idx, "move_pct"]) if idx in work.index and pd.notna(work.at[idx, "move_pct"]) else 0.0
            out.append(
                {
                    "date": idx.date().isoformat(),
                    "move_pct": round(move_pct, 4),
                    "close": round(float(work.at[idx, "close"]), 4),
                    "volume": float(work.at[idx, "volume"]),
                    "tag": "high_volume_day",
                }
            )

    # Dedupe exact tag+date and keep stable order.
    seen = set()
    deduped: List[Dict[str, Any]] = []
    for row in out:
        key = (row["date"], row["tag"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def _news_queries(asset_type: str, symbol: str, name: str, move_date: str) -> List[str]:
    dt = date.fromisoformat(move_date)
    start = (dt - timedelta(days=3)).isoformat()
    end = (dt + timedelta(days=3)).isoformat()
    keywords = [
        "earnings",
        "guidance",
        "lawsuit",
        "rate decision",
        "ETF",
        "hack",
        "upgrade",
        "downgrade",
        "regulation",
        "OPEC",
    ]
    return [f"{asset_type} {symbol} {name} {kw} {start} to {end}" for kw in keywords[:3]]


async def _fetch_news_for_query(client: httpx.AsyncClient, query: str) -> List[Dict[str, Any]]:
    cached = NEWS_CACHE.get(query)
    if cached is not None:
        return cached.get("results", [])

    _load_env_once()
    api_key = os.getenv("SEARCH_API_KEY", "").strip()
    if not api_key:
        NEWS_CACHE.set(query, {"results": []})
        return []

    payload = await _request_json(
        client,
        "POST",
        "https://api.tavily.com/search",
        json_payload={
            "api_key": api_key,
            "query": query,
            "max_results": 5,
            "search_depth": "basic",
            "include_answer": False,
            "include_images": False,
        },
    )
    results = payload.get("results", [])
    if not isinstance(results, list):
        results = []
    normalized: List[Dict[str, Any]] = []
    for item in results:
        normalized.append(
            {
                "headline": item.get("title", ""),
                "source": item.get("source", ""),
                "url": item.get("url", ""),
                "published_at": item.get("published_date", ""),
            }
        )
    NEWS_CACHE.set(query, {"results": normalized})
    return normalized


async def _build_drivers(
    client: httpx.AsyncClient, asset_type: str, symbol: str, name: str, notable_moves: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    urls_seen = set()
    drivers: List[Dict[str, Any]] = []
    for move in notable_moves:
        move_date = move["date"]
        queries = _news_queries(asset_type, symbol, name, move_date)
        for query in queries:
            results = await _fetch_news_for_query(client, query)
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
    return drivers


async def _generate_narrative_with_llm(
    metrics: Dict[str, Any],
    notable_moves: List[Dict[str, Any]],
    drivers: List[Dict[str, Any]],
    *,
    timeout_seconds: float = 12.0,
) -> Tuple[str, List[Dict[str, Any]]]:
    _load_env_once()
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        if not drivers:
            return "No major news items retrieved in this window. Narrative based on metrics only.", []
        return "Narrative unavailable because OPENAI_API_KEY is not set.", []

    system_base = (
        "You are a financial market explainer. Use only provided data. "
        "Do not provide investment advice, recommendations, directives, or target prices. "
        "Forbidden: buy/sell/hold/should/recommend/opportunity/undervalued/overvalued."
    )
    user_payload = {
        "metrics": metrics,
        "notable_moves": notable_moves,
        "drivers": drivers,
        "task": "Return strict JSON with keys: narrative, selected_driver_urls, citation_map. "
        "Keep narrative neutral and descriptive.",
    }

    async def _call_model(system_prompt: str) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            payload = {
                "model": "gpt-4.1-mini",
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(user_payload)},
                ],
            }
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=timeout_seconds,
            )
            response.raise_for_status()
            body = response.json()
            content = body["choices"][0]["message"]["content"]
            return json.loads(content)

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
        ok, _ = validate_text(narrative)
        if not ok:
            strict_prompt = system_base + " If any forbidden language appears, output empty narrative."
            parsed = await _call_model(strict_prompt)
            narrative = str(parsed.get("narrative", "")).strip()
            ok, _ = validate_text(narrative)
            if not ok or not narrative:
                return (
                    "Unable to generate narrative without violating no-advice constraints.",
                    [],
                )

        selected_urls = parsed.get("selected_driver_urls", [])
        if not isinstance(selected_urls, list):
            selected_urls = []
        selected_urls = [str(u).strip() for u in selected_urls if str(u).strip()]
        selected_set = set(selected_urls)
        citations: List[Dict[str, Any]] = []
        if selected_set:
            idx = 1
            for url in selected_urls:
                citations.append({"id": idx, "url": url})
                idx += 1
        return narrative, citations
    except httpx.TimeoutException:
        return (
            "Narrative generation timed out. Returning computed metrics and retrieved drivers only.",
            [],
        )
    except Exception:
        if not drivers:
            return _metrics_only_fallback(), []
        return "Unable to generate narrative without violating no-advice constraints.", []


async def build_insights(asset_type: str, symbol: str, months: int) -> Dict[str, Any]:
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

    narrative, citations = await _generate_narrative_with_llm(metrics, notable_moves, drivers)
    if not drivers and narrative.strip() == "":
        narrative = "No major news items retrieved in this window. Narrative based on metrics only."

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
        "citations": citations,
        "warnings": ["Informational only. No investment recommendation."],
    }
    INSIGHTS_CACHE.set(cache_key, result)
    return result
