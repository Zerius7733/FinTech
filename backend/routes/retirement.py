from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, HTTPException

import backend.api_models as models
import backend.services.api_deps as api


def build_router(
    *,
    read_users_data: Callable[[], dict[str, Any]],
    read_user_csv_profile: Callable[[str], dict[str, Any]],
) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/users/{user_id}/retirement",
        tags=["Retirement"],
        summary="Build a retirement plan using current profile, portfolio, and target retirement age",
    )
    def build_user_retirement_plan(user_id: str, payload: models.RetirementPlanRequest) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            plan_user = dict(user)
            raw_age = plan_user.get("age")
            needs_csv_age = raw_age in (None, "", 0, "0")
            if needs_csv_age:
                csv_profile = read_user_csv_profile(user_id)
                csv_age = (csv_profile.get("age") or "").strip()
                if csv_age:
                    try:
                        plan_user["age"] = int(float(csv_age))
                    except Exception:
                        pass

            plan = api.build_retirement_plan(
                user=plan_user,
                retirement_age=payload.retirement_age,
                monthly_expenses=payload.monthly_expenses,
                essential_monthly_expenses=payload.essential_monthly_expenses,
            )
            return {"status": "ok", "user_id": user_id, **plan}
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"retirement plan failed: {exc}") from exc

    return router
