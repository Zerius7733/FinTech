import json
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException

from backend.services.wealth_wellness.engine import update_wellness_file
from backend.stock_price_updater import update_stock_prices_file
from backend.users_assets_update import update_assets_file


BASE_DIR = Path(__file__).resolve().parent
JSON_PATH = BASE_DIR / "json_data" / "user.json"
CSV_PATH = BASE_DIR / "csv_data" / "users_assets.csv"

app = FastAPI(title="FinTech Wellness API", version="1.0.0")


def _safe_summary(result: Dict[str, Any]) -> Dict[str, Any]:
    user_count = len([k for k in result.keys() if not k.startswith("_")])
    return {
        "status": "ok",
        "user_count": user_count,
    }


@app.get("/health")
# Health check endpoint to verify the API is running.
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/users")
# Returns all users from the JSON data file.
def get_users() -> Dict[str, Any]:
    try:
        with open(JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        users = {k: v for k, v in data.items() if not k.startswith("_")}
        return {"status": "ok", "count": len(users), "users": users}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read users failed: {exc}") from exc


@app.get("/users/{user_id}")
# Returns one user by user_id, or 404 if not found.
def get_user_by_id(user_id: str) -> Dict[str, Any]:
    try:
        with open(JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        return {"status": "ok", "user_id": user_id, "user": user}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read user failed: {exc}") from exc


@app.get("/update/assets")
# Updates users' asset holdings from the CSV source.
def update_assets() -> Dict[str, Any]:
    try:
        print("[api] /update/assets called")
        result = update_assets_file(str(JSON_PATH), str(CSV_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"assets update failed: {exc}") from exc


@app.get("/update/prices")
# Updates stock prices for users' holdings.
def update_prices() -> Dict[str, Any]:
    try:
        print("[api] /update/prices called")
        result = update_stock_prices_file(str(JSON_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"price update failed: {exc}") from exc


@app.get("/update/wellness")
# Recalculates wellness metrics for users.
def update_wellness() -> Dict[str, Any]:
    try:
        print("[api] /update/wellness called")
        result = update_wellness_file(str(JSON_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"wellness update failed: {exc}") from exc


@app.get("/update/all")
# Runs assets, prices, and wellness updates in sequence.
def update_all() -> Dict[str, Any]:
    try:
        print("[api] /update/all called")
        update_assets_file(str(JSON_PATH), str(CSV_PATH))
        update_stock_prices_file(str(JSON_PATH))
        result = update_wellness_file(str(JSON_PATH))
        print("[api] /update/all completed")
        summary = _safe_summary(result)
        summary["pipeline"] = ["assets", "prices", "wellness"]
        return summary
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"full update failed: {exc}") from exc
