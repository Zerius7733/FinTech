from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, HTTPException, Query

import backend.services.api_deps as api


def build_router(
    *,
    read_users_data: Callable[[], dict[str, Any]],
) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/users/{user_id}/recommendations",
        tags=["Recommendations"],
        summary="Get rule-based recommendations by user ID",
        include_in_schema=False,
    )
    def get_user_recommendations(
        user_id: str,
        limit: int = Query(3, ge=1, le=10, description="Maximum number of recommendation items"),
    ) -> dict[str, Any]:
        try:
            data = read_users_data()
            user = data.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            result = api.generate_user_recommendations(user, limit=limit)
            return {"status": "ok", "user_id": user_id, **result}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"read recommendations failed: {exc}") from exc

    @router.get(
        "/users/{user_id}/recommendations/gpt",
        tags=["Recommendations"],
        summary="Get GPT-generated recommendations by user ID",
    )
    def get_user_recommendations_gpt(
        user_id: str,
        limit: int = Query(3, ge=1, le=10, description="Maximum number of recommendation items"),
        model: str = Query("gpt-4.1-mini", description="OpenAI model name"),
    ) -> dict[str, Any]:
        try:
            data = read_users_data()
            user = data.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            rule_based = api.generate_user_recommendations(user, limit=limit)
            gpt_output = api.generate_gpt_recommendations(
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

    return router
