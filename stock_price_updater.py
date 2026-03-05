import csv
import json
from datetime import datetime, timezone
from typing import Any, Dict, Iterable
from users_assets_update import update_assets_file
import yfinance as yf


def _extract_last_price(ticker_obj: Any) -> float:
    fast_info = getattr(ticker_obj, "fast_info", None)
    if fast_info:
        last_price = fast_info.get("lastPrice") or fast_info.get("last_price")
        if last_price is not None:
            return float(last_price)
    info = getattr(ticker_obj, "info", {}) or {}
    for key in ("regularMarketPrice", "currentPrice"):
        if info.get(key) is not None:
            return float(info[key])
    raise RuntimeError("No market price available for ticker.")


def fetch_latest_prices(symbols: Iterable[str], yf_module: Any = yf) -> Dict[str, float]:
    prices: Dict[str, float] = {}
    for symbol in sorted(set(symbols)):
        ticker_obj = yf_module.Ticker(symbol)
        prices[symbol] = round(_extract_last_price(ticker_obj), 4)
    return prices


def update_stock_prices(users: Dict[str, Any], prices: Dict[str, float]) -> Dict[str, Any]:
    updated = json.loads(json.dumps(users))
    for user in updated.values():
        portfolio = user.get("portfolio", [])
        portfolio_total = 0.0
        for position in portfolio:
            symbol = position.get("symbol")
            qty = float(position.get("qty", 0))
            if not symbol or symbol not in prices:
                continue
            current_price = float(prices[symbol])
            market_value = round(qty * current_price, 2)
            position["current_price"] = round(current_price, 4)
            position["market_value"] = market_value
            portfolio_total += market_value
        user["portfolio_value"] = round(portfolio_total, 2)
        user["total_balance"] = round(float(user.get("cash_balance", 0)) + portfolio_total, 2)
        user["net_worth"] = round(user["total_balance"] - float(user.get("liability", 0)), 2)
    return updated


def update_stock_prices_file(path: str = "json_data/user.json", yf_module: Any = yf) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        users = json.load(f)
    all_symbols = []
    for user in users.values():
        for position in user.get("portfolio", []):
            symbol = position.get("symbol")
            if symbol:
                all_symbols.append(symbol)
    prices = fetch_latest_prices(all_symbols, yf_module=yf_module)
    updated = update_stock_prices(users, prices)
    updated["_meta"] = {
        "updated_at_utc": datetime.now(timezone.utc).isoformat(),
        "symbols_updated": sorted(prices.keys()),
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(updated, f, indent=2)
    return updated

if __name__ == "__main__":
    result = update_stock_prices_file()
    result = update_assets_file(json_path="json_data/user.json", csv_path="csv_data/users_assets.csv")
    print(
        json.dumps(
            {
                "status": "ok",
                "updated_at_utc": result.get("_meta", {}).get("updated_at_utc"),
                "symbols_updated": result.get("_meta", {}).get("symbols_updated", []),
            },
            indent=2,
        )
    )
