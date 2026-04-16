from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


class PlanningScenarioRequest(BaseModel):
    cpf_age: int | None = None
    cpf_eligible_monthly_income: float | None = None
    cpf_ordinary_wage_ceiling: float = 8000
    tax_residency: str = "resident"
    annual_reliefs: float = 0
    household_members: list[dict[str, Any]] = Field(default_factory=list)
    shared_goals: list[dict[str, Any]] = Field(default_factory=list)
    retirement_age: int | None = None
    monthly_expenses: float | None = None
    essential_monthly_expenses: float | None = None
    horizon_years: int = 5


def build_router(
    *,
    user_store: Any,
    planning: Any,
) -> APIRouter:
    router = APIRouter()

    @router.get("/users/{user_id}/planning/overview", tags=["Planning"], summary="Build planning overview")
    def get_planning_overview(user_id: str) -> dict[str, Any]:
        try:
            user = user_store.read_users_data().get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            return {"status": "ok", "user_id": user_id, **planning.build_financial_planning_overview(user)}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"planning overview failed: {exc}") from exc

    @router.post("/users/{user_id}/planning/scenario", tags=["Planning"], summary="Build planning scenario")
    def get_planning_scenario(user_id: str, payload: PlanningScenarioRequest) -> dict[str, Any]:
        try:
            user = user_store.read_users_data().get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            return {"status": "ok", "user_id": user_id, **planning.build_financial_planning_scenario(user, **payload.model_dump())}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"planning scenario failed: {exc}") from exc

    return router
