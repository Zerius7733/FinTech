from typing import Any

from fastapi import APIRouter, HTTPException, Request

import backend.api_models as models


def build_router(
    *,
    user_store: Any,
    csv_store: Any,
    portfolio: Any,
    imports: Any,
) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/users/{user_id}/imports/screenshot/parse",
        tags=["Imports"],
        summary="Parse screenshot into holdings (stocks/cryptos/commodities)",
    )
    def parse_screenshot_import(user_id: str, payload: models.ScreenshotParseRequest) -> dict[str, Any]:
        try:
            users = user_store.read_users_data()
            if not isinstance(users.get(user_id), dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            parsed = imports.parse_screenshot_with_llm(
                payload.image_base64,
                model=payload.model,
                page_text=payload.page_text,
            )
            pending = imports.create_pending_import(user_id=user_id, parsed=parsed)
            return {
                "status": "ok",
                "user_id": user_id,
                "import_id": pending["import_id"],
                "parsed": pending["parsed"],
                "next_step": "Call /users/{user_id}/imports/screenshot/confirm with this import_id",
            }
        except HTTPException:
            raise
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"screenshot parse failed: {exc}") from exc

    @router.post(
        "/imports/screenshot/parse",
        tags=["Imports"],
        summary="Parse screenshot into holdings without requiring login",
    )
    def parse_screenshot_import_guest(payload: models.ScreenshotParseRequest) -> dict[str, Any]:
        try:
            parsed = imports.parse_screenshot_with_llm(
                payload.image_base64,
                model=payload.model,
                page_text=payload.page_text,
            )
            return {
                "status": "ok",
                "parsed": parsed,
            }
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"screenshot parse failed: {exc}") from exc

    @router.post(
        "/users/{user_id}/imports/screenshot/confirm",
        tags=["Imports"],
        summary="Confirm parsed screenshot holdings and merge into user portfolio",
    )
    async def confirm_screenshot_import(user_id: str, request: Request) -> dict[str, Any]:
        try:
            body = await request.json()
            if not isinstance(body, dict):
                raise HTTPException(status_code=400, detail="request body must be a JSON object")

            import_id = body.get("import_id")
            holdings = body.get("holdings")
            if not isinstance(import_id, str) or not import_id.strip():
                raise HTTPException(status_code=400, detail="import_id is required")
            if not isinstance(holdings, list):
                raise HTTPException(status_code=400, detail="holdings must be an array")

            users = user_store.read_users_data()
            if not isinstance(users.get(user_id), dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            override_holdings = holdings
            if len(override_holdings) == 0:
                raise HTTPException(
                    status_code=400,
                    detail="holdings array is empty; please provide at least one valid row",
                )
            result = imports.confirm_import(
                import_id=import_id.strip(),
                user_id=user_id,
                users_data=users,
                override_holdings=override_holdings,
            )
            user_store.write_users_data(users)
            diagnostics = {
                "received_holdings_count": len(override_holdings) if override_holdings is not None else None,
                "received_holdings_preview": (override_holdings or [])[:3],
                "raw_body_preview": {k: body.get(k) for k in ("import_id", "holdings")},
            }
            return {
                "status": "ok",
                "user_id": user_id,
                "import_id": result["import_id"],
                "import_status": result["status"],
                "merged_count": result["merged_count"],
                "skipped": result["skipped"],
                "portfolio_value": result["portfolio_value"],
                "total_balance": result["total_balance"],
                "net_worth": result["net_worth"],
                "portfolio": result["portfolio"],
                "diagnostics": diagnostics,
            }
        except HTTPException:
            raise
        except ValueError as exc:
            preview = []
            if isinstance(locals().get("holdings"), list):
                preview = locals()["holdings"][:3]
            raise HTTPException(status_code=400, detail=f"{exc}; raw_holdings_preview={preview}") from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"screenshot confirm failed: {exc}") from exc

    @router.post(
        "/users/{user_id}/imports/screenshot/merge",
        tags=["Imports"],
        summary="Merge screenshot-extracted holdings directly into user portfolio",
    )
    def merge_screenshot_holdings_direct(user_id: str, payload: models.ScreenshotMergeRequest) -> dict[str, Any]:
        try:
            users = user_store.read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            result = imports.merge_holdings_into_user(user, payload.holdings)
            users[user_id] = portfolio.recalculate_user_financials(user)
            user_store.write_users_data(users)
            csv_store.sync_user_to_assets_csv(user_id, users[user_id])
            return {"status": "ok", "user_id": user_id, **result, "user": users[user_id]}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"screenshot direct merge failed: {exc}") from exc

    return router
