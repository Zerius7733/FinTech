import json
import time
from pathlib import Path
from typing import Any, Dict, List

import yfinance as yf


BASE_DIR = Path(__file__).resolve().parent.parent
SNAPSHOT_PATH = BASE_DIR / "json_data" / "bond_market_snapshot.json"
RANKINGS_PATH = BASE_DIR / "json_data" / "bond_market_rankings.json"
DEFAULT_MAX_AGE_SECONDS = 6 * 60 * 60
MAX_PROVIDER_ATTEMPTS = 3

BOND_UNIVERSE = [
    {"id": "vanguard-total-bond", "name": "Vanguard Total Bond Market ETF", "symbol": "BND"},
    {"id": "ishares-core-us-agg", "name": "iShares Core U.S. Aggregate Bond ETF", "symbol": "AGG"},
    {"id": "ishares-20y-treasury", "name": "iShares 20+ Year Treasury Bond ETF", "symbol": "TLT"},
    {"id": "ishares-7-10y-treasury", "name": "iShares 7-10 Year Treasury Bond ETF", "symbol": "IEF"},
    {"id": "ishares-1-3y-treasury", "name": "iShares 1-3 Year Treasury Bond ETF", "symbol": "SHY"},
    {"id": "spdr-portfolio-short-treasury", "name": "SPDR Portfolio Short Term Treasury ETF", "symbol": "SPTS"},
    {"id": "spdr-portfolio-intermediate-treasury", "name": "SPDR Portfolio Intermediate Term Treasury ETF", "symbol": "SPTI"},
    {"id": "spdr-portfolio-long-treasury", "name": "SPDR Portfolio Long Term Treasury ETF", "symbol": "SPTL"},
    {"id": "vanguard-short-term-bond", "name": "Vanguard Short-Term Bond ETF", "symbol": "BSV"},
    {"id": "vanguard-intermediate-term-bond", "name": "Vanguard Intermediate-Term Bond ETF", "symbol": "BIV"},
    {"id": "vanguard-long-term-bond", "name": "Vanguard Long-Term Bond ETF", "symbol": "BLV"},
    {"id": "vanguard-short-term-treasury", "name": "Vanguard Short-Term Treasury ETF", "symbol": "VGSH"},
    {"id": "vanguard-intermediate-term-treasury", "name": "Vanguard Intermediate-Term Treasury ETF", "symbol": "VGIT"},
    {"id": "vanguard-long-term-treasury", "name": "Vanguard Long-Term Treasury ETF", "symbol": "VGLT"},
    {"id": "ishares-us-treasury-bond", "name": "iShares U.S. Treasury Bond ETF", "symbol": "GOVT"},
    {"id": "ishares-ibonds-tips", "name": "iShares TIPS Bond ETF", "symbol": "TIP"},
    {"id": "ishares-ibonds-muni", "name": "iShares National Muni Bond ETF", "symbol": "MUB"},
    {"id": "ishares-iboxx-investment-grade", "name": "iShares iBoxx Investment Grade Corporate Bond ETF", "symbol": "LQD"},
    {"id": "vanguard-intermediate-term-corp", "name": "Vanguard Intermediate-Term Corporate Bond ETF", "symbol": "VCIT"},
    {"id": "vanguard-short-term-corp", "name": "Vanguard Short-Term Corporate Bond ETF", "symbol": "VCSH"},
    {"id": "ishares-intermediate-corp", "name": "iShares Intermediate-Term Corporate Bond ETF", "symbol": "IGIB"},
    {"id": "ishares-iboxx-high-yield", "name": "iShares iBoxx High Yield Corporate Bond ETF", "symbol": "HYG"},
    {"id": "spdr-bloomberg-high-yield", "name": "SPDR Bloomberg High Yield Bond ETF", "symbol": "JNK"},
    {"id": "spdr-bloomberg-short-high-yield", "name": "SPDR Bloomberg Short Term High Yield Bond ETF", "symbol": "SJNK"},
    {"id": "ishares-broad-usd-em", "name": "iShares J.P. Morgan USD Emerging Markets Bond ETF", "symbol": "EMB"},
    {"id": "vaneck-fallen-angel", "name": "VanEck Fallen Angel High Yield Bond ETF", "symbol": "ANGL"},
    {"id": "wisdomtree-ultra-short", "name": "WisdomTree Ultra Short-Term Bond Fund", "symbol": "USHY"},
    {"id": "spdr-bloomberg-1-3m-bill", "name": "SPDR Bloomberg 1-3 Month T-Bill ETF", "symbol": "BIL"},
    {"id": "ishares-0-3m-treasury", "name": "iShares 0-3 Month Treasury Bond ETF", "symbol": "SGOV"},
    {"id": "vanguard-total-international-bond", "name": "Vanguard Total International Bond ETF", "symbol": "BNDX"},
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


class YFinanceBondMarketProvider:
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


class BondMarketRepository:
    def load_rankings(self) -> Dict[str, Any]:
        return _read_json(RANKINGS_PATH)

    def save_snapshot(self, payload: Dict[str, Any]) -> None:
        _write_json(SNAPSHOT_PATH, payload)

    def save_rankings(self, payload: Dict[str, Any]) -> None:
        _write_json(RANKINGS_PATH, payload)


class BondMarketIngestionService:
    def __init__(
        self,
        provider: YFinanceBondMarketProvider | None = None,
        repository: BondMarketRepository | None = None,
    ) -> None:
        self.provider = provider or YFinanceBondMarketProvider()
        self.repository = repository or BondMarketRepository()

    def refresh(self) -> Dict[str, Any]:
        fetched_rows: List[Dict[str, Any]] = []
        failed_symbols: List[str] = []

        for entry in BOND_UNIVERSE:
            row = self.provider.fetch_symbol(entry)
            if row is None:
                failed_symbols.append(entry["symbol"])
                continue
            fetched_rows.append(row)

        if not fetched_rows:
            raise RuntimeError("No bond data could be fetched from yfinance.")

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

        if not isinstance(items, list) or len(items) < len(BOND_UNIVERSE):
            rankings_payload = self.refresh()
            items = rankings_payload.get("items", [])

        if not isinstance(items, list) or not items:
            raise RuntimeError("No precomputed bond rankings are available.")

        start = (normalized_page - 1) * normalized_per_page
        end = start + normalized_per_page
        page_rows = items[start:end]
        if not page_rows:
            raise RuntimeError(f"No ranked bonds available for page={normalized_page}, per_page={normalized_per_page}.")
        return page_rows


def refresh_bond_market_data() -> Dict[str, Any]:
    return BondMarketIngestionService().refresh()


def get_precomputed_bond_rankings(page: int = 1, per_page: int = 50) -> List[Dict[str, Any]]:
    return BondMarketIngestionService().get_precomputed_rankings(page=page, per_page=per_page)
