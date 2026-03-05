import json
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Query
from pydantic import AliasChoices, BaseModel, Field

from backend.crypto_price_retriever import fetch_crypto_price
from backend.services.recommendation import generate_gpt_recommendations
from backend.services.recommendation import generate_user_recommendations
from backend.services.wealth_wellness.engine import calculate_user_wellness
from backend.services.wealth_wellness.engine import update_wellness_file
from backend.stock_price_updater import fetch_latest_prices
from backend.stock_price_updater import update_stock_prices_file
from backend.users_assets_update import update_assets_file


BASE_DIR = Path(__file__).resolve().parent
JSON_PATH = BASE_DIR / "json_data" / "user.json"
CSV_PATH = BASE_DIR / "csv_data" / "users_assets.csv"

app = FastAPI(
    title="FinTech Wellness API",
    version="1.0.0",
    openapi_tags=[
        {"name": "Health", "description": "API health and readiness endpoints."},
        {"name": "Users", "description": "User retrieval endpoints."},
        {"name": "Recommendations", "description": "Personalized recommendation endpoints."},
        {"name": "Updates", "description": "Endpoints that run data update jobs."},
        {"name": "Market", "description": "Live market quote retrieval endpoints."},
        {"name": "Portfolio", "description": "User portfolio information endpoints."},
    ],
)


def _safe_summary(result: Dict[str, Any]) -> Dict[str, Any]:
    user_count = len([k for k in result.keys() if not k.startswith("_")])
    return {
        "status": "ok",
        "user_count": user_count,
    }


def _read_users_data() -> Dict[str, Any]:
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_users_data(data: Dict[str, Any]) -> None:
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _parse_market_query(query: str) -> Dict[str, str]:
    parts = [part.strip().upper() for part in query.split(",", maxsplit=1)]
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("query must be in format 'STOCK, SPY' or 'CRYPTO, BTC'")
    asset_type, ticker = parts
    if asset_type not in {"STOCK", "CRYPTO"}:
        raise ValueError("asset type must be STOCK or CRYPTO")
    return {"asset_type": asset_type, "ticker": ticker}


def _normalize_risk_profile(value: str) -> str:
    normalized = (value or "").strip().lower()
    mapping = {
        "low": "Low",
        "moderate": "Moderate",
        "medium": "Moderate",
        "high": "High",
    }
    if normalized not in mapping:
        raise ValueError("risk_appetite must be one of: Low, Moderate, High")
    return mapping[normalized]


class UserRiskUpdateRequest(BaseModel):
    user_id: str
    risk_profile: str = Field(
        validation_alias=AliasChoices("risk_profile", "risk_appetite", "risk_appetitie")
    )


@app.get("/health", tags=["Health"], summary="API health check")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/users", tags=["Users"], summary="Get all users")
def get_users() -> Dict[str, Any]:
    try:
        data = _read_users_data()
        users = {k: v for k, v in data.items() if not k.startswith("_")}
        return {"status": "ok", "count": len(users), "users": users}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read users failed: {exc}") from exc


@app.get("/users/{user_id}", tags=["Users"], summary="Get user by ID")
def get_user_by_id(user_id: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        return {"status": "ok", "user_id": user_id, "user": user}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read user failed: {exc}") from exc


@app.get(
    "/users/{user_id}/wellness",
    tags=["Users"],
    summary="Get wellness section by user ID",
)
def get_user_wellness_by_id(user_id: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        return {
            "status": "ok",
            "user_id": user_id,
            "wellness_metrics": user.get("wellness_metrics", {}),
            "risk_profile": user.get("risk_profile"),
            "financial_wellness_score": user.get("financial_wellness_score"),
            "financial_stress_index": user.get("financial_stress_index"),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read wellness failed: {exc}") from exc


@app.get(
    "/users/{user_id}/recommendations",
    tags=["Recommendations"],
    summary="Get rule-based recommendations by user ID",
)
def get_user_recommendations(
    user_id: str,
    limit: int = Query(3, ge=1, le=10, description="Maximum number of recommendation items"),
) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        result = generate_user_recommendations(user, limit=limit)
        return {"status": "ok", "user_id": user_id, **result}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read recommendations failed: {exc}") from exc


@app.get(
    "/users/{user_id}/recommendations/gpt",
    tags=["Recommendations"],
    summary="Get GPT-generated recommendations by user ID",
)
def get_user_recommendations_gpt(
    user_id: str,
    limit: int = Query(3, ge=1, le=10, description="Maximum number of recommendation items"),
    model: str = Query("gpt-4.1-mini", description="OpenAI model name"),
) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

        rule_based = generate_user_recommendations(user, limit=limit)
        gpt_output = generate_gpt_recommendations(
            user_id=user_id,
            user=user,
            rule_based=rule_based,
            limit=limit,
            model=model,
        )
        return {
            "status": "ok",
            "user_id": user_id,
            "model": gpt_output["model"],
            "rule_based": rule_based,
            "gpt_recommendations": gpt_output["recommendations"],
        }
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"gpt recommendation failed: {exc}") from exc


@app.post(
    "/users/risk",
    tags=["Users"],
    summary="Update user risk appetite and recalibrate scores",
)
def update_user_risk_and_recalibrate(payload: UserRiskUpdateRequest) -> Dict[str, Any]:
    try:
        users = _read_users_data()
        user = users.get(payload.user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{payload.user_id}' not found")

        user["risk_profile"] = _normalize_risk_profile(payload.risk_profile)
        wellness_result = calculate_user_wellness(user)
        user["wellness_metrics"] = wellness_result["wellness_metrics"]
        user["financial_wellness_score"] = wellness_result["financial_wellness_score"]
        user["financial_stress_index"] = wellness_result["financial_stress_index"]
        users[payload.user_id] = user
        _write_users_data(users)

        return {
            "status": "ok",
            "user_id": payload.user_id,
            "risk_profile": user["risk_profile"],
            "wellness_metrics": user["wellness_metrics"],
            "financial_wellness_score": user["financial_wellness_score"],
            "financial_stress_index": user["financial_stress_index"],
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"risk update failed: {exc}") from exc


@app.get(
    "/market/quote",
    tags=["Market"],
    summary="Get quote for STOCK or CRYPTO",
)
def get_market_quote(
    query: str = Query(..., description="Format: STOCK, SPY or CRYPTO, BTC"),
) -> Dict[str, Any]:
    try:
        parsed = _parse_market_query(query)
        asset_type = parsed["asset_type"]
        ticker = parsed["ticker"]

        if asset_type == "STOCK":
            price = fetch_latest_prices([ticker])[ticker]
            return {"status": "ok", "asset_type": asset_type, "symbol": ticker, "price": price}

        crypto_quote = fetch_crypto_price(ticker)
        return {
            "status": "ok",
            "asset_type": asset_type,
            "symbol": crypto_quote["symbol"],
            "price": crypto_quote["price"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"quote retrieval failed: {exc}") from exc


@app.get(
    "/portfolio/{user_id}",
    tags=["Portfolio"],
    summary="Get portfolio positions by user ID",
)
def get_portfolio_by_user_id(user_id: str) -> Dict[str, Any]:
    try:
        data = _read_users_data()
        user = data.get(user_id)
        if not isinstance(user, dict):
            raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
        return {"status": "ok", "user_id": user_id, "portfolio": user.get("portfolio", [])}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"read portfolio failed: {exc}") from exc


@app.get("/update/assets", tags=["Updates"], summary="Update users' assets")
def update_assets() -> Dict[str, Any]:
    try:
        print("[api] /update/assets called")
        result = update_assets_file(str(JSON_PATH), str(CSV_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"assets update failed: {exc}") from exc


@app.get("/update/prices", tags=["Updates"], summary="Update stock prices")
def update_prices() -> Dict[str, Any]:
    try:
        print("[api] /update/prices called")
        result = update_stock_prices_file(str(JSON_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"price update failed: {exc}") from exc


@app.get("/update/wellness", tags=["Updates"], summary="Update wellness metrics")
def update_wellness() -> Dict[str, Any]:
    try:
        print("[api] /update/wellness called")
        result = update_wellness_file(str(JSON_PATH))
        return _safe_summary(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"wellness update failed: {exc}") from exc


@app.get("/update/all", tags=["Updates"], summary="Run full update pipeline")
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
