from collections.abc import Callable
from pathlib import Path

from fastapi import APIRouter, HTTPException

import backend.api_models as models
import backend.services.api_deps as api


def build_router(
    *,
    login_csv_path: Path,
    user_json_path: Path,
    assets_csv_path: Path,
    next_available_user_id: Callable[[], str],
) -> APIRouter:
    router = APIRouter()

    @router.post("/auth/login", tags=["Users"], summary="Authenticate a user")
    def login(payload: models.LoginRequest) -> dict[str, object]:
        try:
            result = api.authenticate_login_user(
                login_csv_path=login_csv_path,
                username=payload.username,
                password=payload.password,
            )
            return {"status": "ok", **result}
        except api.LoginValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except api.LoginAuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"login failed: {exc}") from exc

    @router.post("/auth/register", tags=["Users"], summary="Register login user into users.csv")
    def register_user(payload: models.RegisterRequest) -> dict[str, object]:
        try:
            result = api.register_login_user(
                login_csv_path=login_csv_path,
                username=payload.username,
                password=payload.password,
                email=payload.email,
                user_id=next_available_user_id(),
            )
            api.add_default_user_profile(
                json_path=user_json_path,
                user_id=result["user_id"],
                name=result["username"],
            )
            api.add_default_assets_row(
                csv_path=assets_csv_path,
                user_id=result["user_id"],
                name=result["username"],
            )
            return {"status": "ok", **result}
        except api.RegisterValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except api.RegisterConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"register failed: {exc}") from exc

    @router.post("/auth/register/precheck", tags=["Users"], summary="Validate signup fields before registration")
    def register_precheck(payload: models.RegisterPrecheckRequest) -> dict[str, object]:
        try:
            validated = api.validate_registration_fields(
                login_csv_path=login_csv_path,
                username=payload.username,
                password=payload.password,
                email=payload.email,
                exclude_user_id=payload.user_id,
                require_email=True,
            )
            return {
                "status": "ok",
                "username": validated["username"],
                "email": validated["email"],
                "password_rules_passed": True,
            }
        except api.RegisterValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except api.RegisterConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"register precheck failed: {exc}") from exc

    return router
