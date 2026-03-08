import csv
import json
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
        return stocks + cryptos
    return []


def update_assets_from_csv(users: Dict[str, Any], csv_path: str) -> Dict[str, Any]:
    updated = json.loads(json.dumps(users))
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            user_id = (row.get("user_id") or "").strip()
            if not user_id or user_id not in updated:
                continue
            user = updated[user_id]
            dbs = _to_float(row.get("dbs"))
            uob = _to_float(row.get("uob"))
            ocbc = _to_float(row.get("ocbc"))
            user["name"] = row.get("name", user.get("name"))
            user["cash_balance"] = round(dbs + uob + ocbc, 2)
            user["liability"] = round(_to_float(row.get("liability")), 2)
            user["income"] = round(_to_float(row.get("income")), 2)
            user["estate"] = round(_to_float(row.get("estate")), 2)
            # Support both legacy "expense" and newer "expenses" CSV columns.
            expense_value = row.get("expenses") if row.get("expenses") not in (None, "") else row.get("expense")
            user["expenses"] = round(_to_float(expense_value), 2)
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
    json_path: str = "json_data/user.json", csv_path: str = "csv_data/users_assets.csv"
) -> Dict[str, Any]:
    print(f"[assets] syncing from {csv_path} -> {json_path}")
    with open(json_path, "r", encoding="utf-8") as f:
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
