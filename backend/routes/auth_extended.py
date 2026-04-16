from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import backend.api_models as models


class RegisterVerifyRequest(BaseModel):
    email: str
    otp_code: str


class RegisterResendRequest(BaseModel):
    email: str


class PasswordResetStartRequest(BaseModel):
    identifier: str


class PasswordResetVerifyRequest(BaseModel):
    email: str
    otp_code: str
    new_password: str


def build_router(
    *,
    user_store: Any,
    auth: Any,
    constants: Any,
) -> APIRouter:
    router = APIRouter()
    auth_state_path = constants.JSON_DATA_DIR / "auth_state.json"

    def normalize_user(user: dict[str, Any]) -> dict[str, Any]:
        normalized = auth.normalize_users_data({"u": user}).get("u", user)
        if isinstance(normalized, dict):
            normalized = auth.ensure_user_subscription(normalized)
        return normalized

    @router.post("/auth/login", tags=["Users"], summary="Authenticate a user")
    def login(payload: models.LoginRequest) -> dict[str, Any]:
        try:
            result = auth.authenticate_login_user(
                login_csv_path=constants.LOGIN_CSV_PATH,
                username=payload.username,
                password=payload.password,
            )
            user = user_store.read_users_data().get(result["user_id"])
            subscription = auth.subscription_payload(user if isinstance(user, dict) else None)
            return {"status": "ok", **result, "subscription": subscription, "subscription_plan": subscription["plan"]}
        except auth.LoginValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except auth.LoginAuthError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        except auth.AccountStateError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"login failed: {exc}") from exc

    @router.post("/auth/register/precheck", tags=["Users"], summary="Validate signup fields before registration")
    def register_precheck(payload: models.RegisterPrecheckRequest) -> dict[str, Any]:
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

    @router.post("/auth/register", tags=["Users"], summary="Register a user")
    def register(payload: models.RegisterRequest) -> dict[str, Any]:
        try:
            if payload.email:
                return auth.start_registration(
                    login_csv_path=constants.LOGIN_CSV_PATH,
                    auth_state_path=auth_state_path,
                    username=payload.username,
                    password=payload.password,
                    email=payload.email,
                    requested_user_id=user_store.next_available_user_id(),
                )

            result = auth.register_login_user(
                constants.LOGIN_CSV_PATH,
                payload.username,
                payload.password,
                payload.email,
                user_store.next_available_user_id(),
            )
            users = user_store.read_users_data()
            users[result["user_id"]] = normalize_user({"name": result["username"]})
            user_store.write_users_data(users)
            return {"status": "ok", **result}
        except auth.RegisterValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except auth.RegisterConflictError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"register failed: {exc}") from exc

    @router.post("/auth/register/verify", tags=["Users"], summary="Verify a registration OTP")
    def register_verify(payload: RegisterVerifyRequest) -> dict[str, Any]:
        try:
            result = auth.verify_registration_otp(
                login_csv_path=constants.LOGIN_CSV_PATH,
                auth_state_path=auth_state_path,
                email=payload.email,
                otp_code=payload.otp_code,
            )
            users = user_store.read_users_data()
            users[result["user_id"]] = normalize_user({"name": result["username"]})
            user_store.write_users_data(users)
            return result
        except auth.OtpValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except auth.OtpExpiredError as exc:
            raise HTTPException(status_code=410, detail=str(exc)) from exc
        except auth.PendingRegistrationError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"registration verify failed: {exc}") from exc

    @router.post("/auth/register/resend", tags=["Users"], summary="Resend a registration OTP")
    def register_resend(payload: RegisterResendRequest) -> dict[str, Any]:
        try:
            return auth.resend_registration_otp(auth_state_path=auth_state_path, email=payload.email)
        except auth.PendingRegistrationError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except auth.OtpDeliveryError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"registration resend failed: {exc}") from exc

    @router.post("/auth/password-reset", tags=["Users"], summary="Start password reset")
    def password_reset_start(payload: PasswordResetStartRequest) -> dict[str, Any]:
        try:
            return auth.start_password_reset(
                login_csv_path=constants.LOGIN_CSV_PATH,
                auth_state_path=auth_state_path,
                identifier=payload.identifier,
            )
        except auth.LoginValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"password reset start failed: {exc}") from exc

    @router.post("/auth/password-reset/verify", tags=["Users"], summary="Verify password reset OTP")
    def password_reset_verify(payload: PasswordResetVerifyRequest) -> dict[str, Any]:
        try:
            return auth.reset_password_with_otp(
                login_csv_path=constants.LOGIN_CSV_PATH,
                auth_state_path=auth_state_path,
                email=payload.email,
                otp_code=payload.otp_code,
                new_password=payload.new_password,
            )
        except auth.OtpValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except auth.OtpExpiredError as exc:
            raise HTTPException(status_code=410, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"password reset verify failed: {exc}") from exc

    return router
