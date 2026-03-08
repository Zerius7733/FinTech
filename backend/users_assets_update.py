import csv
import json
import csv
from typing import Any, Dict 
from backend.services.wealth_wellness.engine import calculate_user_wellness

def _to_float(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, str):
        value = value.replace(",", "").replace("_", "").strip()
    return float(value)


def _portfolio_positions(user: Dict[str, Any]):
    portfolio = user.get("portfolio", [])
    if isinstance(portfolio, list):
        return portfolio
    if isinstance(portfolio, dict):
        stocks = portfolio.get("stocks", []) if isinstance(portfolio.get("stocks", []), list) else []
        cryptos = portfolio.get("cryptos", []) if isinstance(portfolio.get("cryptos", []), list) else []
        commodities = portfolio.get("commodities", []) if isinstance(portfolio.get("commodities", []), list) else []
        return stocks + cryptos + commodities
    return []


def _refresh_position_market_values(user: Dict[str, Any]) -> None:
    for position in _portfolio_positions(user):
        qty = position.get("qty")
        current_price = position.get("current_price")
        if qty is None or current_price is None:
            continue
        try:
            quantity = float(qty)
            price = float(current_price)
        except (TypeError, ValueError):
            continue
        if quantity < 0 or price < 0:
            continue
        position["market_value"] = round(quantity * price, 2)


def update_assets_from_csv(users: Dict[str, Any], csv_path: str) -> Dict[str, Any]:
    updated = json.loads(json.dumps(users))
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if isinstance(row, dict):
                row = {str(k).lstrip("\ufeff"): v for k, v in row.items()}
            user_id = (row.get("user_id") or "").strip()
            if not user_id or user_id not in updated:
                continue
            user = updated[user_id]
            dbs = _to_float(row.get("dbs"))
            uob = _to_float(row.get("uob"))
            ocbc = _to_float(row.get("ocbc"))
            other_banks = _to_float(
                row.get("other_banks")
                if row.get("other_banks") not in (None, "")
                else row.get("other_bank")
            )
            user["name"] = row.get("name", user.get("name"))
            user["cash_balance"] = round(dbs + uob + ocbc + other_banks, 2)
            user["liability"] = round(_to_float(row.get("liability")), 2)
            user["income"] = round(_to_float(row.get("income")), 2)
            user["estate"] = round(_to_float(row.get("estate")), 2)
            # Support both legacy "expense" and newer "expenses" CSV columns.
            expense_value = row.get("expenses") if row.get("expenses") not in (None, "") else row.get("expense")
            user["expenses"] = round(_to_float(expense_value), 2)
            _refresh_position_market_values(user)
            portfolio_total = sum(float(p.get("market_value", 0)) for p in _portfolio_positions(user))
            user["portfolio_value"] = round(portfolio_total, 2)
            user["total_balance"] = round(user["cash_balance"] + portfolio_total + user["estate"], 2)
            user["net_worth"] = round(user["total_balance"] - user["liability"] - user["expenses"], 2)

            wellness = calculate_user_wellness(user)
            user["wellness_metrics"] = wellness["wellness_metrics"]
            user["financial_wellness_score"] = wellness["financial_wellness_score"]
            user["financial_stress_index"] = wellness["financial_stress_index"]
    return updated

def update_assets_file(
    json_path: str = "json_data/user.json", csv_path: str = "csv_data/users.csv"
) -> Dict[str, Any]:
    print(f"[assets] syncing from {csv_path} -> {json_path}")
    with open(json_path, "r", encoding="utf-8-sig") as f:
        users = json.load(f)
    updated = update_assets_from_csv(users, csv_path=csv_path)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(updated, f, indent=2)
    print("[assets] sync complete")
    return updated

def main():
    update_assets_file()

if __name__ == "__main__": 
    main()
