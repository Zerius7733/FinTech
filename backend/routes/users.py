from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

import backend.api_models as models
import backend.services.api_deps as api


def build_router(
    *,
    login_csv_path: Path,
    read_users_data: Callable[[], dict[str, Any]],
    write_users_data: Callable[[dict[str, Any]], None],
    update_user_csv_profile: Callable[[str, dict[str, Any]], None],
    read_user_csv_profile: Callable[[str], dict[str, Any]],
    age_to_group: Callable[[int], str],
    normalize_risk_profile: Callable[[Any], float],
    ensure_financial_collections: Callable[[dict[str, Any]], dict[str, Any]],
    enrich_portfolio_with_ath: Callable[[dict[str, Any]], dict[str, Any]],
) -> APIRouter:
    router = APIRouter()

    @router.post("/users/survey/profile", tags=["Users"], summary="Persist survey profile fields into users.csv")
    def update_survey_profile(payload: models.SurveyProfileUpdateRequest) -> dict[str, Any]:
        try:
            user_id = payload.user_id.strip()
            if not user_id:
                raise HTTPException(status_code=400, detail="user_id is required")

            first = (payload.first_name or "").strip()
            last = (payload.last_name or "").strip()
            full_name = " ".join(part for part in (first, last) if part).strip()
            normalized_username = (payload.username or "").strip()
            normalized_email = (payload.email or "").strip()

            if normalized_username:
                api.validate_registration_fields(
                    login_csv_path=login_csv_path,
                    username=normalized_username,
                    password="TempPass1!",
                    email=normalized_email or None,
                    exclude_user_id=user_id,
                    require_email=bool(normalized_email),
                )
            elif normalized_email:
                normalized_email = api.normalize_email_address(normalized_email, require_email=True)

            updates = {
                "username": normalized_username,
                "email": normalized_email,
                "country": (payload.country or "").strip(),
            }
            if payload.age is not None:
                updates["age"] = str(payload.age)
                updates["age_group"] = age_to_group(int(payload.age))
            else:
                updates["age_group"] = (payload.age_group or "").strip()
            if full_name:
                updates["name"] = full_name

            update_user_csv_profile(user_id=user_id, updates=updates)

            users = read_users_data()
            user = users.get(user_id)
            if isinstance(user, dict):
                if full_name:
                    user["name"] = full_name
                if "age" in updates:
                    user["age"] = int(payload.age or 0)
                if updates.get("age_group"):
                    user["age_group"] = updates["age_group"]
                user["username"] = updates.get("username", user.get("username", ""))
                user["email"] = updates.get("email", user.get("email", ""))
                user["country"] = updates.get("country", user.get("country", ""))
                users[user_id] = user
                write_users_data(users)

            return {"status": "ok", "user_id": user_id, "updates": updates}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"survey profile update failed: {exc}") from exc

    @router.post("/users/profile/details", tags=["Users"], summary="Persist profile details into users.csv")
    def update_profile_details(payload: models.UserProfileDetailsUpdateRequest) -> dict[str, Any]:
        try:
            user_id = (payload.user_id or "").strip()
            if not user_id:
                raise HTTPException(status_code=400, detail="user_id is required")

            first = (payload.first_name or "").strip()
            last = (payload.last_name or "").strip()
            full_name = " ".join(part for part in (first, last) if part).strip()

            updates: dict[str, Any] = {
                "email": (payload.email or "").strip(),
                "country": (payload.country or "").strip(),
                "investor_type": (payload.investor_type or "").strip(),
                "currency": (payload.currency or "").strip(),
            }
            if full_name:
                updates["name"] = full_name
            password = (payload.password or "").strip()
            if password:
                updates["password"] = api.validate_password_strength(password)
            if updates["email"]:
                updates["email"] = api.normalize_email_address(updates["email"], require_email=True)

            update_user_csv_profile(user_id=user_id, updates=updates)

            users = read_users_data()
            user = users.get(user_id)
            if isinstance(user, dict):
                if full_name:
                    user["name"] = full_name
                user["email"] = updates.get("email", user.get("email", ""))
                user["country"] = updates.get("country", user.get("country", ""))
                users[user_id] = user
                write_users_data(users)

            safe_updates = dict(updates)
            if "password" in safe_updates:
                safe_updates["password"] = "***"

            return {"status": "ok", "user_id": user_id, "updates": safe_updates}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"profile details update failed: {exc}") from exc

    @router.get("/users/profile/details/{user_id}", tags=["Users"], summary="Read profile details from users.csv")
    def get_profile_details(user_id: str) -> dict[str, Any]:
        try:
            user_id = (user_id or "").strip()
            if not user_id:
                raise HTTPException(status_code=400, detail="user_id is required")
            row = read_user_csv_profile(user_id)
            if not row:
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found in users.csv")
            return {"status": "ok", "user_id": user_id, "profile": row}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"profile details read failed: {exc}") from exc

    @router.get("/users", tags=["Users"], summary="Get all users")
    def get_users() -> dict[str, Any]:
        try:
            data = read_users_data()
            users = {k: v for k, v in data.items() if not k.startswith("_")}
            return {"status": "ok", "count": len(users), "users": users}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"read users failed: {exc}") from exc

    @router.get("/users/{user_id}", tags=["Users"], summary="Get user by ID")
    def get_user_by_id(user_id: str) -> dict[str, Any]:
        try:
            data = read_users_data()
            user = data.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            user = ensure_financial_collections(user)
            user = enrich_portfolio_with_ath(user)
            return {"status": "ok", "user_id": user_id, "user": user}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"read user failed: {exc}") from exc

    @router.get("/users/{user_id}/benchmarks", tags=["Users"], summary="Get Singapore peer benchmarking for a user")
    def get_user_peer_benchmarks(user_id: str) -> dict[str, Any]:
        try:
            data = read_users_data()
            user = data.get(user_id)
            if user is None:
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            benchmark_user = dict(user) if isinstance(user, dict) else {}
            raw_age = benchmark_user.get("age")
            needs_csv_age = raw_age in (None, "", 0, "0")
            if needs_csv_age:
                csv_profile = read_user_csv_profile(user_id)
                csv_age = (csv_profile.get("age") or "").strip()
                if csv_age:
                    try:
                        benchmark_user["age"] = int(float(csv_age))
                    except Exception:
                        pass
            result = api.build_peer_benchmarks(benchmark_user)
            return {"status": "ok", "user_id": user_id, **result}
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"peer benchmarking failed: {exc}") from exc

    @router.get("/users/{user_id}/financials", tags=["Users"], summary="Get editable financial items by user ID")
    def get_user_financial_items(user_id: str) -> dict[str, Any]:
        try:
            data = read_users_data()
            user = data.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            user = ensure_financial_collections(user)
            return {
                "status": "ok",
                "user_id": user_id,
                "manual_assets": user.get("manual_assets", []),
                "liability_items": user.get("liability_items", []),
                "income_streams": user.get("income_streams", []),
                "summary": {
                    "income": user.get("income", 0.0),
                    "liability": user.get("liability", 0.0),
                    "mortgage": user.get("mortgage", 0.0),
                    "estate": user.get("estate", 0.0),
                    "portfolio_value": user.get("portfolio_value", 0.0),
                    "net_worth": user.get("net_worth", 0.0),
                },
                "user": user,
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"read financial items failed: {exc}") from exc

    @router.post("/users/age", tags=["Users"], summary="Update user age")
    def update_user_age(payload: models.UserAgeUpdateRequest) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(payload.user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{payload.user_id}' not found")

            user["age"] = int(payload.age)
            users[payload.user_id] = user
            write_users_data(users)
            return {
                "status": "ok",
                "user_id": payload.user_id,
                "age": user["age"],
                "user": user,
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"age update failed: {exc}") from exc

    @router.get("/users/{user_id}/wellness", tags=["Users"], summary="Get wellness section by user ID")
    def get_user_wellness_by_id(user_id: str) -> dict[str, Any]:
        try:
            data = read_users_data()
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

    @router.get(
        "/users/{user_id}/impact",
        tags=["Users"],
        summary="Get estimated portfolio impact and missed-opportunity metrics by user ID",
    )
    def get_user_portfolio_impact(
        user_id: str,
        horizon_years: int = Query(5, ge=1, le=10, description="Scenario horizon in years"),
    ) -> dict[str, Any]:
        try:
            data = read_users_data()
            user = data.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            result = api.build_portfolio_impact(user, horizon_years=horizon_years)
            return {"status": "ok", "user_id": user_id, **result}
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"impact calculation failed: {exc}") from exc

    @router.get(
        "/users/{user_id}/compatibility",
        tags=["Compatibility"],
        summary="Evaluate compatibility between user profile and target asset",
    )
    async def get_user_target_compatibility(
        user_id: str,
        target_type: str = Query(..., description="stock | crypto | commodity"),
        symbol: str = Query(..., description="Target symbol, e.g. SPY, BTC, GC=F"),
        model: str = Query("gpt-4.1-mini", description="OpenAI model for synthesis"),
    ) -> dict[str, Any]:
        try:
            data = read_users_data()
            user = data.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            symbol_query = (symbol or "").strip().upper()
            resolve_query = symbol_query[:-4] if symbol_query.endswith("-USD") else symbol_query
            resolved = await api.resolve_asset(resolve_query)
            resolved_category = str(resolved.get("category", "unknown")).lower()

            result = api.evaluate_compatibility(
                user=user,
                target_type=target_type,
                symbol=symbol,
                resolved_category=resolved_category,
            )
            llm = api.synthesize_compatibility_with_llm(
                user_id=user_id,
                user=user,
                compatibility=result,
                model=model,
            )
            return {
                "status": "ok",
                "user_id": user_id,
                "risk_profile": user.get("risk_profile"),
                "financial_wellness_score": user.get("financial_wellness_score"),
                "financial_stress_index": user.get("financial_stress_index"),
                "resolved_asset": resolved,
                "llm_model": llm.get("model"),
                "llm_synthesis": llm.get("synthesis"),
                **result,
            }
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=f"compatibility synthesis failed: {exc}") from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"compatibility check failed: {exc}") from exc

    @router.post(
        "/users/risk",
        tags=["Users"],
        summary="Update user risk appetite and recalibrate scores",
    )
    def update_user_risk_and_recalibrate(payload: models.UserRiskUpdateRequest) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(payload.user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{payload.user_id}' not found")

            user["risk_profile"] = normalize_risk_profile(payload.risk_profile)
            wellness_result = api.calculate_user_wellness(user)
            user["wellness_metrics"] = wellness_result["wellness_metrics"]
            user["behavioral_resilience_score"] = wellness_result["behavioral_resilience_score"]
            user["financial_resilience_score"] = wellness_result["financial_resilience_score"]
            user["financial_wellness_score"] = wellness_result["financial_wellness_score"]
            user["financial_stress_index"] = wellness_result["financial_stress_index"]
            user["confidence"] = wellness_result["confidence"]
            user["resilience_summary"] = wellness_result["resilience_summary"]
            user["resilience_breakdown"] = wellness_result["resilience_breakdown"]
            user["action_insights"] = wellness_result["action_insights"]
            users[payload.user_id] = user
            write_users_data(users)

            return {
                "status": "ok",
                "user_id": payload.user_id,
                "risk_profile": user["risk_profile"],
                "behavioral_resilience_score": user["behavioral_resilience_score"],
                "financial_resilience_score": user["financial_resilience_score"],
                "wellness_metrics": user["wellness_metrics"],
                "financial_wellness_score": user["financial_wellness_score"],
                "financial_stress_index": user["financial_stress_index"],
                "confidence": user["confidence"],
                "resilience_summary": user["resilience_summary"],
                "resilience_breakdown": user["resilience_breakdown"],
                "action_insights": user["action_insights"],
            }
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"risk update failed: {exc}") from exc

    return router
