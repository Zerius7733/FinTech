import json
import time
from pathlib import Path
from typing import Any, Dict, List

import yfinance as yf


BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_UNIVERSE_PATH = BASE_DIR / "data" / "knowledge_base" / "stocks_symbols" / "large_cap_us.txt"
SNAPSHOT_PATH = BASE_DIR / "data" / "json" / "stock_market_snapshot.json"
RANKINGS_PATH = BASE_DIR / "data" / "json" / "stock_market_rankings.json"
MAX_PROVIDER_ATTEMPTS = 3
DEFAULT_MAX_AGE_SECONDS = 6 * 60 * 60


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _rank_by_market_cap(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ranked = sorted(rows, key=lambda item: item.get("market_cap") or 0, reverse=True)
    rank = 0
    for row in ranked:
        if row.get("market_cap") is None:
            row["market_cap_rank"] = None
            continue
        rank += 1
        row["market_cap_rank"] = rank
    return ranked


def _read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _load_symbol_universe(path: Path = DEFAULT_UNIVERSE_PATH) -> List[str]:
    if not path.exists():
        raise ValueError(f"stock universe file not found: {path}")
    symbols: List[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        value = line.strip().upper()
        if not value or value.startswith("#"):
            continue
        symbols.append(value)
    deduped = list(dict.fromkeys(symbols))
    if not deduped:
        raise ValueError(f"stock universe file is empty: {path}")
    return deduped


class YFinanceStockMarketProvider:
    def fetch_symbol(self, symbol: str) -> Dict[str, Any] | None:
        last_error: Exception | None = None
        for attempt in range(MAX_PROVIDER_ATTEMPTS):
            try:
                ticker = yf.Ticker(symbol)
                info = ticker.info or {}
                fast_info = getattr(ticker, "fast_info", {}) or {}

                price = _safe_float(fast_info.get("lastPrice") or fast_info.get("last_price"))
                if price is None:
                    price = _safe_float(info.get("regularMarketPrice") or info.get("currentPrice"))

                market_cap = _safe_int(fast_info.get("marketCap"))
                if market_cap is None:
                    market_cap = _safe_int(info.get("marketCap"))
                if market_cap is None:
                    raise RuntimeError(f"{symbol} missing market cap")

                volume = _safe_int(
                    fast_info.get("lastVolume")
                    or info.get("regularMarketVolume")
                    or info.get("volume")
                )
                pct_24h = _safe_float(info.get("regularMarketChangePercent"))
                ath = _safe_float(info.get("fiftyTwoWeekHigh"))
                name = str(info.get("longName") or info.get("shortName") or symbol)

                return {
                    "id": symbol.lower(),
                    "name": name,
                    "symbol": symbol,
                    "image": None,
                    "market_cap_rank": None,
                    "current_price": price,
                    "market_cap": market_cap,
                    "total_volume": volume,
                    "price_change_percentage_24h": pct_24h,
                    "price_change_percentage_7d": None,
                    "circulating_supply": None,
                    "ath": ath,
                    "ath_change_percentage": None,
                }
            except Exception as exc:
                last_error = exc
                if attempt < MAX_PROVIDER_ATTEMPTS - 1:
                    time.sleep(0.25 * (attempt + 1))
        if last_error is not None:
            return None
        return None


class StockMarketRepository:
    def load_snapshot(self) -> Dict[str, Any]:
        return _read_json(SNAPSHOT_PATH)

    def load_rankings(self) -> Dict[str, Any]:
        return _read_json(RANKINGS_PATH)

    def save_snapshot(self, payload: Dict[str, Any]) -> None:
        _write_json(SNAPSHOT_PATH, payload)

    def save_rankings(self, payload: Dict[str, Any]) -> None:
        _write_json(RANKINGS_PATH, payload)


class StockMarketIngestionService:
    def __init__(
        self,
        provider: YFinanceStockMarketProvider | None = None,
        repository: StockMarketRepository | None = None,
        universe_path: Path = DEFAULT_UNIVERSE_PATH,
    ) -> None:
        self.provider = provider or YFinanceStockMarketProvider()
        self.repository = repository or StockMarketRepository()
        self.universe_path = universe_path

    def refresh(self) -> Dict[str, Any]:
        symbols = _load_symbol_universe(self.universe_path)
        fetched_rows: List[Dict[str, Any]] = []
        failed_symbols: List[str] = []

        for symbol in symbols:
            row = self.provider.fetch_symbol(symbol)
            if row is None:
                failed_symbols.append(symbol)
                continue
            fetched_rows.append(row)

        if not fetched_rows:
            raise RuntimeError("No stock data could be fetched from yfinance.")

        ranked_rows = _rank_by_market_cap(fetched_rows)
        now = int(time.time())
        snapshot_payload = {
            "_meta": {
                "source": "yfinance",
                "ingested_at_epoch": now,
                "symbol_count": len(fetched_rows),
                "failed_count": len(failed_symbols),
            },
            "symbols": {row["symbol"]: row for row in ranked_rows},
            "failed_symbols": failed_symbols,
        }
        rankings_payload = {
            "_meta": {
                "source": "yfinance",
                "built_at_epoch": now,
                "ranked_count": len(ranked_rows),
                "failed_count": len(failed_symbols),
            },
            "items": ranked_rows,
        }
        self.repository.save_snapshot(snapshot_payload)
        self.repository.save_rankings(rankings_payload)
        return rankings_payload

    def get_precomputed_rankings(
        self,
        *,
        page: int,
        per_page: int,
        max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS,
    ) -> List[Dict[str, Any]]:
        normalized_page = max(1, int(page))
        normalized_per_page = max(1, min(250, int(per_page)))
        rankings_payload = self.repository.load_rankings()
        meta = rankings_payload.get("_meta", {}) if isinstance(rankings_payload, dict) else {}
        built_at = meta.get("built_at_epoch")
        items = rankings_payload.get("items", []) if isinstance(rankings_payload, dict) else []

        # Serve cached rankings immediately when available, even if stale,
        # to avoid blocking API responses on a full market refresh.
        # Fresh data is handled by background refresh/update endpoints.
        if not isinstance(items, list) or not items:
            rankings_payload = self.refresh()
            items = rankings_payload.get("items", [])

        if not isinstance(items, list) or not items:
            raise RuntimeError("No precomputed stock rankings are available.")

        start = (normalized_page - 1) * normalized_per_page
        end = start + normalized_per_page
        page_rows = items[start:end]
        if not page_rows:
            raise RuntimeError(f"No ranked stocks available for page={normalized_page}, per_page={normalized_per_page}.")
        return page_rows


def refresh_stock_market_data() -> Dict[str, Any]:
    service = StockMarketIngestionService()
    return service.refresh()


def get_precomputed_stock_rankings(page: int = 1, per_page: int = 50) -> List[Dict[str, Any]]:
    service = StockMarketIngestionService()
    return service.get_precomputed_rankings(page=page, per_page=per_page)


def refresh_stock_market_symbol(symbol: str) -> Dict[str, Any]:
    normalized_symbol = str(symbol or "").strip().upper()
    if not normalized_symbol:
        raise ValueError("stock symbol cannot be empty")

    service = StockMarketIngestionService()
    refreshed_row = service.provider.fetch_symbol(normalized_symbol)
    if refreshed_row is None:
        raise RuntimeError(f"could not refresh stock symbol '{normalized_symbol}'")

    snapshot_payload = service.repository.load_snapshot()
    rankings_payload = service.repository.load_rankings()
    now = int(time.time())

    snapshot_symbols = snapshot_payload.get("symbols")
    if not isinstance(snapshot_symbols, dict):
        snapshot_symbols = {}
        snapshot_payload["symbols"] = snapshot_symbols
    existing_snapshot = snapshot_symbols.get(normalized_symbol)
    if isinstance(existing_snapshot, dict) and existing_snapshot.get("market_cap_rank") is not None:
        refreshed_row["market_cap_rank"] = existing_snapshot.get("market_cap_rank")
    snapshot_symbols[normalized_symbol] = {**existing_snapshot, **refreshed_row} if isinstance(existing_snapshot, dict) else refreshed_row
    snapshot_payload.setdefault("_meta", {})
    snapshot_payload["_meta"]["symbol_refreshed_at_epoch"] = now
    snapshot_payload["_meta"]["last_refreshed_symbol"] = normalized_symbol
    service.repository.save_snapshot(snapshot_payload)

    items = rankings_payload.get("items")
    if isinstance(items, list):
        updated = False
        for index, row in enumerate(items):
            if not isinstance(row, dict):
                continue
            if str(row.get("symbol", "")).strip().upper() != normalized_symbol:
                continue
            refreshed_row["market_cap_rank"] = row.get("market_cap_rank")
            items[index] = {**row, **refreshed_row}
            updated = True
            break
        if not updated:
            items.append(refreshed_row)
        rankings_payload.setdefault("_meta", {})
        rankings_payload["_meta"]["symbol_refreshed_at_epoch"] = now
        rankings_payload["_meta"]["last_refreshed_symbol"] = normalized_symbol
        service.repository.save_rankings(rankings_payload)
        for row in items:
            if isinstance(row, dict) and str(row.get("symbol", "")).strip().upper() == normalized_symbol:
                return row

    return refreshed_row
