import json
import time
from pathlib import Path
from typing import Any, Dict, List

import yfinance as yf


BASE_DIR = Path(__file__).resolve().parent.parent
SNAPSHOT_PATH = BASE_DIR / "json_data" / "real_asset_market_snapshot.json"
RANKINGS_PATH = BASE_DIR / "json_data" / "real_asset_market_rankings.json"
MAX_PROVIDER_ATTEMPTS = 3

REAL_ASSET_UNIVERSE = [
    {"id": "vanguard-real-estate", "name": "Vanguard Real Estate ETF", "symbol": "VNQ"},
    {"id": "ishares-us-real-estate", "name": "iShares U.S. Real Estate ETF", "symbol": "IYR"},
    {"id": "schwab-us-reit", "name": "Schwab U.S. REIT ETF", "symbol": "SCHH"},
    {"id": "dow-jones-reit", "name": "SPDR Dow Jones REIT ETF", "symbol": "RWR"},
    {"id": "ishares-core-us-reit", "name": "iShares Core U.S. REIT ETF", "symbol": "USRT"},
    {"id": "ishares-global-reit", "name": "iShares Global REIT ETF", "symbol": "REET"},
    {"id": "real-estate-select-sector", "name": "Real Estate Select Sector SPDR Fund", "symbol": "XLRE"},
    {"id": "ishares-cohen-steers", "name": "iShares Cohen & Steers REIT ETF", "symbol": "ICF"},
    {"id": "global-x-superdividend-reit", "name": "Global X SuperDividend REIT ETF", "symbol": "SRET"},
    {"id": "pacer-industrial-real-estate", "name": "Pacer Benchmark Industrial Real Estate SCTR ETF", "symbol": "INDS"},
    {"id": "global-x-data-center-reit", "name": "Pacer Data & Infrastructure Real Estate ETF", "symbol": "SRVR"},
    {"id": "ishares-mortgage-real-estate", "name": "iShares Mortgage Real Estate ETF", "symbol": "REM"},
    {"id": "realty-income", "name": "Realty Income Corp.", "symbol": "O"},
    {"id": "prologis", "name": "Prologis, Inc.", "symbol": "PLD"},
    {"id": "american-tower", "name": "American Tower Corporation", "symbol": "AMT"},
    {"id": "public-storage", "name": "Public Storage", "symbol": "PSA"},
    {"id": "simon-property-group", "name": "Simon Property Group, Inc.", "symbol": "SPG"},
    {"id": "equinix", "name": "Equinix, Inc.", "symbol": "EQIX"},
    {"id": "digital-realty", "name": "Digital Realty Trust, Inc.", "symbol": "DLR"},
    {"id": "crown-castle", "name": "Crown Castle Inc.", "symbol": "CCI"},
    {"id": "avalonbay", "name": "AvalonBay Communities, Inc.", "symbol": "AVB"},
    {"id": "equity-residential", "name": "Equity Residential", "symbol": "EQR"},
    {"id": "vici-properties", "name": "VICI Properties Inc.", "symbol": "VICI"},
    {"id": "wp-carey", "name": "W. P. Carey Inc.", "symbol": "WPC"},
    {"id": "alexandria-real-estate", "name": "Alexandria Real Estate Equities, Inc.", "symbol": "ARE"},
    {"id": "iron-mountain", "name": "Iron Mountain Incorporated", "symbol": "IRM"},
    {"id": "global-x-us-infra", "name": "iShares U.S. Infrastructure ETF", "symbol": "IFRA"},
    {"id": "global-x-industrial-infra", "name": "Global X U.S. Infrastructure Development ETF", "symbol": "PAVE"},
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


def _rank_by_depth(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ranked = sorted(
        rows,
        key=lambda item: (
            item.get("market_cap") or 0,
            item.get("total_volume") or 0,
        ),
        reverse=True,
    )
    for index, row in enumerate(ranked, start=1):
        row["market_cap_rank"] = index
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


class YFinanceRealAssetMarketProvider:
    def fetch_symbol(self, entry: Dict[str, str]) -> Dict[str, Any] | None:
        symbol = entry["symbol"]
        last_error: Exception | None = None
        for attempt in range(MAX_PROVIDER_ATTEMPTS):
            try:
                ticker = yf.Ticker(symbol)
                info = ticker.info or {}
                fast_info = getattr(ticker, "fast_info", {}) or {}

                price = _safe_float(fast_info.get("lastPrice") or fast_info.get("last_price"))
                if price is None:
                    price = _safe_float(info.get("regularMarketPrice") or info.get("currentPrice"))
                if price is None:
                    raise RuntimeError(f"{symbol} missing price")

                market_cap = _safe_int(fast_info.get("marketCap"))
                if market_cap is None:
                    market_cap = _safe_int(info.get("marketCap") or info.get("totalAssets"))

                volume = _safe_int(
                    fast_info.get("lastVolume")
                    or info.get("regularMarketVolume")
                    or info.get("volume")
                )
                history = ticker.history(period="1mo", interval="1d", auto_adjust=False)
                closes = history["Close"].dropna() if history is not None and not history.empty and "Close" in history else []
                volumes = history["Volume"].dropna() if history is not None and not history.empty and "Volume" in history else []
                pct_24h = _safe_float(info.get("regularMarketChangePercent"))
                if pct_24h is None and len(closes) >= 2 and closes.iloc[-2] not in (None, 0):
                    pct_24h = float(((closes.iloc[-1] - closes.iloc[-2]) / closes.iloc[-2]) * 100)
                pct_7d = None
                if len(closes) >= 6 and closes.iloc[-6] not in (None, 0):
                    pct_7d = float(((closes.iloc[-1] - closes.iloc[-6]) / closes.iloc[-6]) * 100)
                if volume is None and len(volumes) > 0:
                    volume = _safe_int(volumes.iloc[-1])
                ath = _safe_float(info.get("fiftyTwoWeekHigh"))
                name = str(info.get("longName") or info.get("shortName") or entry["name"])

                return {
                    "id": entry["id"],
                    "name": name,
                    "symbol": symbol,
                    "image": None,
                    "market_cap_rank": None,
                    "current_price": price,
                    "market_cap": market_cap,
                    "total_volume": volume,
                    "price_change_percentage_24h": pct_24h,
                    "price_change_percentage_7d": pct_7d,
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


class RealAssetMarketRepository:
    def load_rankings(self) -> Dict[str, Any]:
        return _read_json(RANKINGS_PATH)

    def save_snapshot(self, payload: Dict[str, Any]) -> None:
        _write_json(SNAPSHOT_PATH, payload)

    def save_rankings(self, payload: Dict[str, Any]) -> None:
        _write_json(RANKINGS_PATH, payload)


class RealAssetMarketIngestionService:
    def __init__(
        self,
        provider: YFinanceRealAssetMarketProvider | None = None,
        repository: RealAssetMarketRepository | None = None,
    ) -> None:
        self.provider = provider or YFinanceRealAssetMarketProvider()
        self.repository = repository or RealAssetMarketRepository()

    def refresh(self) -> Dict[str, Any]:
        fetched_rows: List[Dict[str, Any]] = []
        failed_symbols: List[str] = []

        for entry in REAL_ASSET_UNIVERSE:
            row = self.provider.fetch_symbol(entry)
            if row is None:
                failed_symbols.append(entry["symbol"])
                continue
            fetched_rows.append(row)

        if not fetched_rows:
            raise RuntimeError("No real-asset data could be fetched from yfinance.")

        ranked_rows = _rank_by_depth(fetched_rows)
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

    def get_precomputed_rankings(self, *, page: int, per_page: int) -> List[Dict[str, Any]]:
        normalized_page = max(1, int(page))
        normalized_per_page = max(1, min(250, int(per_page)))
        rankings_payload = self.repository.load_rankings()
        items = rankings_payload.get("items", []) if isinstance(rankings_payload, dict) else []

        if not isinstance(items, list) or len(items) < len(REAL_ASSET_UNIVERSE):
            rankings_payload = self.refresh()
            items = rankings_payload.get("items", [])

        if not isinstance(items, list) or not items:
            raise RuntimeError("No precomputed real-asset rankings are available.")

        start = (normalized_page - 1) * normalized_per_page
        end = start + normalized_per_page
        page_rows = items[start:end]
        if not page_rows:
            raise RuntimeError(
                f"No ranked real assets available for page={normalized_page}, per_page={normalized_per_page}."
            )
        return page_rows


def refresh_real_asset_market_data() -> Dict[str, Any]:
    return RealAssetMarketIngestionService().refresh()


def get_precomputed_real_asset_rankings(page: int = 1, per_page: int = 50) -> List[Dict[str, Any]]:
    return RealAssetMarketIngestionService().get_precomputed_rankings(page=page, per_page=per_page)
