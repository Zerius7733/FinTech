from typing import Any

from fastapi import APIRouter, HTTPException

import backend.api_models as models


def build_router(
    *,
    user_store: Any,
    auth: Any,
    users: Any,
    constants: Any,
) -> APIRouter:
    router = APIRouter()

    @router.post("/auth/login", tags=["Users"], summary="Authenticate a user")
    def login(payload: models.LoginRequest) -> dict[str, object]:
        try:
            result = auth.authenticate_login_user(
                login_csv_path=constants.LOGIN_CSV_PATH,
                username=payload.username,
                password=payload.password,
            )
            return {"status": "ok", **result}
        except auth.LoginValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except auth.LoginAuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"login failed: {exc}") from exc

    @router.post("/auth/register", tags=["Users"], summary="Register login user into users.csv")
    def register_user(payload: models.RegisterRequest) -> dict[str, object]:
        try:
            result = auth.register_login_user(
                login_csv_path=constants.LOGIN_CSV_PATH,
                username=payload.username,
                password=payload.password,
                email=payload.email,
                user_id=user_store.next_available_user_id(),
            )
            users.add_default_user_profile(
                json_path=constants.USER_JSON_PATH,
                user_id=result["user_id"],
                name=result["username"],
            )
            auth.add_default_assets_row(
                csv_path=constants.ASSETS_CSV_PATH,
                user_id=result["user_id"],
                name=result["username"],
            )
            return {"status": "ok", **result}
        except auth.RegisterValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except auth.RegisterConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"register failed: {exc}") from exc

    @router.post("/auth/register/precheck", tags=["Users"], summary="Validate signup fields before registration")
    def register_precheck(payload: models.RegisterPrecheckRequest) -> dict[str, object]:
        try:
            validated = auth.validate_registration_fields(
                login_csv_path=constants.LOGIN_CSV_PATH,
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
        except auth.RegisterValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except auth.RegisterConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"register precheck failed: {exc}") from exc

    return router
