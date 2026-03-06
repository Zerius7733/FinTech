import json
import time
from pathlib import Path
from typing import Any, Dict, List

import yfinance as yf


BASE_DIR = Path(__file__).resolve().parent.parent
SNAPSHOT_PATH = BASE_DIR / "json_data" / "commodity_market_snapshot.json"
RANKINGS_PATH = BASE_DIR / "json_data" / "commodity_market_rankings.json"
DEFAULT_MAX_AGE_SECONDS = 6 * 60 * 60
MAX_PROVIDER_ATTEMPTS = 3

COMMODITY_UNIVERSE = [
    {"id": "gold", "name": "Gold", "symbol": "GC=F"},
    {"id": "silver", "name": "Silver", "symbol": "SI=F"},
    {"id": "copper", "name": "Copper", "symbol": "HG=F"},
    {"id": "wti-crude", "name": "WTI Crude Oil", "symbol": "CL=F"},
    {"id": "brent-crude", "name": "Brent Crude Oil", "symbol": "BZ=F"},
    {"id": "natural-gas", "name": "Natural Gas", "symbol": "NG=F"},
    {"id": "rbob-gasoline", "name": "RBOB Gasoline", "symbol": "RB=F"},
    {"id": "heating-oil", "name": "Heating Oil", "symbol": "HO=F"},
    {"id": "platinum", "name": "Platinum", "symbol": "PL=F"},
    {"id": "palladium", "name": "Palladium", "symbol": "PA=F"},
    {"id": "corn", "name": "Corn", "symbol": "ZC=F"},
    {"id": "oats", "name": "Oats", "symbol": "ZO=F"},
    {"id": "soybeans", "name": "Soybeans", "symbol": "ZS=F"},
    {"id": "wheat", "name": "Wheat", "symbol": "ZW=F"},
    {"id": "soybean-meal", "name": "Soybean Meal", "symbol": "ZM=F"},
    {"id": "soybean-oil", "name": "Soybean Oil", "symbol": "ZL=F"},
    {"id": "cocoa", "name": "Cocoa", "symbol": "CC=F"},
    {"id": "coffee", "name": "Coffee", "symbol": "KC=F"},
    {"id": "cotton", "name": "Cotton", "symbol": "CT=F"},
    {"id": "sugar", "name": "Sugar", "symbol": "SB=F"},
    {"id": "lean-hogs", "name": "Lean Hogs", "symbol": "HE=F"},
    {"id": "live-cattle", "name": "Live Cattle", "symbol": "LE=F"},
    {"id": "feeder-cattle", "name": "Feeder Cattle", "symbol": "GF=F"},
]


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


def _rank_by_volume(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ranked = sorted(rows, key=lambda item: item.get("total_volume") or 0, reverse=True)
    rank = 0
    for row in ranked:
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


class YFinanceCommodityMarketProvider:
    def fetch_contracts(self, contracts: List[Dict[str, str]]) -> tuple[List[Dict[str, Any]], List[str]]:
        if not contracts:
            return [], []
        symbols = [contract["symbol"] for contract in contracts]
        last_error: Exception | None = None
        for attempt in range(MAX_PROVIDER_ATTEMPTS):
            try:
                history = yf.download(
                    symbols,
                    period="5d",
                    interval="1d",
                    auto_adjust=False,
                    progress=False,
                    threads=False,
                    group_by="ticker",
                )
                if history is None or history.empty:
                    raise RuntimeError("commodity batch returned empty price history")

                rows: List[Dict[str, Any]] = []
                failed_symbols: List[str] = []
                for contract in contracts:
                    symbol = contract["symbol"]
                    symbol_frame = None
                    if len(symbols) == 1:
                        symbol_frame = history
                    elif symbol in history.columns.get_level_values(0):
                        symbol_frame = history[symbol]

                    if symbol_frame is None or symbol_frame.empty:
                        failed_symbols.append(symbol)
                        continue

                    closes = symbol_frame["Close"].dropna() if "Close" in symbol_frame.columns else []
                    highs = symbol_frame["High"].dropna() if "High" in symbol_frame.columns else []
                    volumes = symbol_frame["Volume"].dropna() if "Volume" in symbol_frame.columns else []
                    if len(closes) == 0:
                        failed_symbols.append(symbol)
                        continue

                    price = _safe_float(closes.iloc[-1])
                    volume = _safe_int(volumes.iloc[-1]) if len(volumes) > 0 else None
                    ath = _safe_float(highs.max()) if len(highs) > 0 else None
                    pct_24h = None
                    if len(closes) >= 2 and closes.iloc[-2] not in (None, 0):
                        pct_24h = float(((closes.iloc[-1] - closes.iloc[-2]) / closes.iloc[-2]) * 100)

                    rows.append(
                        {
                            "id": contract["id"],
                            "name": contract["name"],
                            "symbol": symbol,
                            "image": None,
                            "market_cap_rank": None,
                            "current_price": price,
                            "market_cap": None,
                            "total_volume": volume,
                            "price_change_percentage_24h": pct_24h,
                            "price_change_percentage_7d": None,
                            "circulating_supply": None,
                            "ath": ath,
                            "ath_change_percentage": None,
                        }
                    )
                return rows, failed_symbols
            except Exception as exc:
                last_error = exc
                if attempt < MAX_PROVIDER_ATTEMPTS - 1:
                    time.sleep(1.0 * (attempt + 1))
        if last_error is not None:
            raise RuntimeError(f"commodity batch fetch failed: {last_error}") from last_error
        return [], symbols


class CommodityMarketRepository:
    def load_rankings(self) -> Dict[str, Any]:
        return _read_json(RANKINGS_PATH)

    def save_snapshot(self, payload: Dict[str, Any]) -> None:
        _write_json(SNAPSHOT_PATH, payload)

    def save_rankings(self, payload: Dict[str, Any]) -> None:
        _write_json(RANKINGS_PATH, payload)


class CommodityMarketIngestionService:
    def __init__(
        self,
        provider: YFinanceCommodityMarketProvider | None = None,
        repository: CommodityMarketRepository | None = None,
    ) -> None:
        self.provider = provider or YFinanceCommodityMarketProvider()
        self.repository = repository or CommodityMarketRepository()

    def refresh(self) -> Dict[str, Any]:
        fetched_rows, failed_symbols = self.provider.fetch_contracts(COMMODITY_UNIVERSE)

        if not fetched_rows:
            raise RuntimeError("No commodity data could be fetched from yfinance.")

        ranked_rows = _rank_by_volume(fetched_rows)
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

        is_stale = not isinstance(built_at, int) or (time.time() - built_at) > max_age_seconds
        if not isinstance(items, list) or not items or is_stale:
            rankings_payload = self.refresh()
            items = rankings_payload.get("items", [])

        if not isinstance(items, list) or not items:
            raise RuntimeError("No precomputed commodity rankings are available.")

        start = (normalized_page - 1) * normalized_per_page
        end = start + normalized_per_page
        page_rows = items[start:end]
        if not page_rows:
            raise RuntimeError(
                f"No ranked commodities available for page={normalized_page}, per_page={normalized_per_page}."
            )
        return page_rows


def refresh_commodity_market_data() -> Dict[str, Any]:
    service = CommodityMarketIngestionService()
    return service.refresh()


def get_precomputed_commodity_rankings(page: int = 1, per_page: int = 50) -> List[Dict[str, Any]]:
    service = CommodityMarketIngestionService()
    return service.get_precomputed_rankings(page=page, per_page=per_page)
