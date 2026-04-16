import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


class SubscriptionUpdateRequest(BaseModel):
    plan: str


class HouseholdProfileRequest(BaseModel):
    mode: str = "personal"
    partner_name: str | None = None
    partner_monthly_contribution: float = 0
    partner_monthly_income: float = 0
    partner_fixed_expenses: float = 0
    shared_budget_monthly: float = 0
    contribution_style: str = "income_weighted"
    dependents_count: int = 0
    shared_cash_reserve_target: float = 0


class SharedGoalRequest(BaseModel):
    title: str
    target_amount: float
    current_saved: float = 0
    monthly_contribution: float = 0
    target_date: str | None = None
    priority: int = 3
    owners: list[str] = Field(default_factory=list)


class AdvisorMatchRequest(BaseModel):
    institution_id: str
    institution_name: str
    product_id: str
    product_name: str
    notes: str | None = None


def build_router(
    *,
    user_store: Any,
    auth: Any,
) -> APIRouter:
    router = APIRouter()

    def normalize_user(user: dict[str, Any]) -> dict[str, Any]:
        normalized = auth.normalize_users_data({"u": user}).get("u", user)
        if isinstance(normalized, dict):
            normalized = auth.ensure_user_subscription(normalized)
        return normalized

    @router.post("/users/{user_id}/subscription", tags=["Users"], summary="Update user subscription plan")
    def update_subscription(user_id: str, payload: SubscriptionUpdateRequest) -> dict[str, Any]:
        try:
            users = user_store.read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            user["subscription_plan"] = auth.normalize_subscription_plan(payload.plan)
            users[user_id] = normalize_user(user)
            user_store.write_users_data(users)
            return {
                "status": "ok",
                "user_id": user_id,
                "user": users[user_id],
                "subscription": auth.subscription_payload(users[user_id]),
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"subscription update failed: {exc}") from exc

    @router.post("/users/{user_id}/household", tags=["Users"], summary="Update household profile")
    def update_household(user_id: str, payload: HouseholdProfileRequest) -> dict[str, Any]:
        try:
            users = user_store.read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            user["household_profile"] = payload.model_dump()
            users[user_id] = normalize_user(user)
            user_store.write_users_data(users)
            return {"status": "ok", "user_id": user_id, "household_profile": users[user_id]["household_profile"]}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"household update failed: {exc}") from exc

    @router.post("/users/{user_id}/shared-goals", tags=["Users"], summary="Add a shared goal")
    def add_shared_goal(user_id: str, payload: SharedGoalRequest) -> dict[str, Any]:
        try:
            users = user_store.read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            goals = user.get("shared_goals", [])
            if not isinstance(goals, list):
                goals = []
            goal = payload.model_dump()
            goals.append(goal)
            user["shared_goals"] = goals
            users[user_id] = normalize_user(user)
            user_store.write_users_data(users)
            return {"status": "ok", "user_id": user_id, "goal": goal}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"shared goal create failed: {exc}") from exc

    @router.post("/users/{user_id}/advisor-match", tags=["Users"], summary="Create an advisor match request")
    def create_advisor_match(user_id: str, payload: AdvisorMatchRequest) -> dict[str, Any]:
        try:
            users = user_store.read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            requests = user.get("advisor_match_requests", [])
            if not isinstance(requests, list):
                requests = []
            request_row = {**payload.model_dump(), "id": str(uuid.uuid4()), "status": "requested"}
            requests.append(request_row)
            user["advisor_match_requests"] = requests
            users[user_id] = normalize_user(user)
            user_store.write_users_data(users)
            return {"status": "ok", "user_id": user_id, "request": request_row}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"advisor match create failed: {exc}") from exc

    return router
