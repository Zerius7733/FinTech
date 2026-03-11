import csv
import io
import random
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

import backend.api_models as models
import backend.constants as const
import backend.services.api_deps as api


def build_router(
    *,
    read_users_data: Callable[[], dict[str, Any]],
    write_users_data: Callable[[dict[str, Any]], None],
    ensure_financial_collections: Callable[[dict[str, Any]], dict[str, Any]],
    recalculate_user_financials: Callable[[dict[str, Any]], dict[str, Any]],
    normalize_manual_asset_category: Callable[[str], str],
    load_users_csv: Callable[[], tuple[list[dict[str, str]], list[str]]],
    write_users_csv: Callable[[list[dict[str, str]], list[str]], None],
    read_synced_account_balance_from_csv_row: Callable[[dict[str, Any]], float],
    apply_synced_csv_profile_to_user: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]],
    sync_user_to_assets_csv: Callable[[str, dict[str, Any]], None],
    fetch_market_quote: Callable[..., dict[str, Any]],
    read_user_portfolio_history: Callable[[str], dict[str, Any]],
    enrich_portfolio_with_ath: Callable[[dict[str, Any]], dict[str, Any]],
    user_portfolio_dir: Path,
    synced_account_balance_field: str,
    synced_balance_reload_count_field: str,
) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/users/{user_id}/danger/export",
        tags=["Users"],
        summary="Export current portfolio holdings as CSV",
    )
    def export_user_portfolio_csv(user_id: str) -> Response:
        try:
            data = read_users_data()
            user = data.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            portfolio = user.get("portfolio", {})
            rows: list[dict[str, Any]] = []
            if isinstance(portfolio, dict):
                for asset_class in ("stocks", "cryptos", "commodities"):
                    entries = portfolio.get(asset_class, [])
                    if not isinstance(entries, list):
                        continue
                    for item in entries:
                        qty = float(item.get("qty", 0.0) or 0.0)
                        avg_price = float(item.get("avg_price", 0.0) or 0.0)
                        current_price = float(item.get("current_price", 0.0) or 0.0)
                        market_value = float(item.get("market_value", qty * current_price) or 0.0)
                        rows.append(
                            {
                                "user_id": user_id,
                                "asset_class": asset_class,
                                "symbol": str(item.get("symbol", "") or ""),
                                "name": str(item.get("name", "") or ""),
                                "qty": round(qty, 8),
                                "avg_price": round(avg_price, 6),
                                "current_price": round(current_price, 6),
                                "market_value": round(market_value, 2),
                            }
                        )

            output = io.StringIO()
            headers = ["user_id", "asset_class", "symbol", "name", "qty", "avg_price", "current_price", "market_value"]
            writer = csv.DictWriter(output, fieldnames=headers)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)

            csv_data = output.getvalue()
            filename = f"{user_id}_portfolio_export.csv"
            return Response(
                content=csv_data,
                media_type="text/csv",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"portfolio export failed: {exc}") from exc

    @router.delete(
        "/users/{user_id}/danger/portfolio",
        tags=["Users"],
        summary="Delete all portfolio holdings for a user",
    )
    def delete_user_portfolio_data(user_id: str) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            user["portfolio"] = {"stocks": [], "cryptos": [], "commodities": []}
            user["manual_assets"] = []
            users[user_id] = recalculate_user_financials(user)
            write_users_data(users)

            history_path = user_portfolio_dir / f"{user_id}.json"
            if history_path.exists():
                history_path.unlink()

            return {"status": "ok", "user_id": user_id, "message": "portfolio data deleted"}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"portfolio delete failed: {exc}") from exc

    @router.delete(
        "/users/{user_id}/danger/account",
        tags=["Users"],
        summary="Permanently delete account and all related data",
    )
    def delete_user_account(user_id: str) -> dict[str, Any]:
        try:
            users = read_users_data()
            if not isinstance(users.get(user_id), dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            users.pop(user_id, None)
            write_users_data(users)

            rows, fieldnames = load_users_csv()
            if fieldnames:
                rows = [row for row in rows if (row.get("user_id") or "").strip() != user_id]
                write_users_csv(rows, fieldnames)

            history_path = user_portfolio_dir / f"{user_id}.json"
            if history_path.exists():
                history_path.unlink()

            return {"status": "ok", "user_id": user_id, "message": "account deleted"}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"account delete failed: {exc}") from exc

    @router.post(
        "/users/{user_id}/financials/assets",
        tags=["Users"],
        summary="Add a manual asset to a user profile",
    )
    def add_user_manual_asset(user_id: str, payload: models.ManualAssetCreateRequest) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            user = ensure_financial_collections(user)
            normalized_category = normalize_manual_asset_category(payload.category)
            raw_label = payload.label.strip()
            raw_symbol = (payload.symbol or "").strip()
            if normalized_category in {"stock", "crypto", "commodity"}:
                symbol = (raw_symbol or raw_label).strip().upper()
                if not symbol:
                    raise HTTPException(status_code=400, detail="symbol is required for stock, crypto, and commodity assets")
                label = symbol
            else:
                symbol = None
                label = raw_label

            item = {
                "id": str(uuid.uuid4()),
                "label": label,
                "category": normalized_category,
                "value": round(float(payload.value), 2),
            }
            if symbol:
                item["symbol"] = symbol
            user["manual_assets"].append(item)
            users[user_id] = recalculate_user_financials(user)
            write_users_data(users)
            return {"status": "ok", "user_id": user_id, "item": item, "user": users[user_id]}
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"asset create failed: {exc}") from exc

    @router.post(
        "/users/{user_id}/financials/synced-balance/reload",
        tags=["Users"],
        summary="Reload the synced account balance for a user",
    )
    def reload_user_synced_balance(user_id: str) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            rows, fieldnames = load_users_csv()
            target = next((row for row in rows if (row.get("user_id") or "").strip() == user_id), None)
            if target is None:
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found in users.csv")

            current_balance = read_synced_account_balance_from_csv_row(target)
            current_count = int(target.get(synced_balance_reload_count_field) or 0)
            if current_count == 0:
                delta = 1000.0
            else:
                delta = float(random.randint(-50, 50))
            new_balance = max(0.0, round(current_balance + delta, 2))
            next_count = current_count + 1
            target[synced_account_balance_field] = f"{new_balance:.2f}"
            target[synced_balance_reload_count_field] = str(next_count)
            write_users_csv(rows, fieldnames)

            user = apply_synced_csv_profile_to_user(user, target)
            users[user_id] = recalculate_user_financials(user)
            write_users_data(users)
            sync_user_to_assets_csv(user_id, users[user_id])

            return {
                "status": "ok",
                "user_id": user_id,
                "synced_account_balance": users[user_id].get("cash_balance", 0.0),
                "reload_count": next_count,
                "delta": delta,
                "user": users[user_id],
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"synced balance reload failed: {exc}") from exc

    @router.post(
        "/users/{user_id}/financials/portfolio",
        tags=["Users"],
        summary="Add a holding into user portfolio and fetch latest market price",
    )
    def add_user_portfolio_holding(user_id: str, payload: models.PortfolioHoldingCreateRequest) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            portfolio = user.get("portfolio")
            if not isinstance(portfolio, dict):
                portfolio = {"stocks": [], "cryptos": [], "commodities": []}

            symbol = payload.symbol.strip().upper()
            if not symbol:
                raise HTTPException(status_code=400, detail="symbol is required")

            requested = payload.asset_class.strip().lower()
            if requested in {"stock", "stocks", "equity", "equities"}:
                bucket = "stocks"
                query_type = "STOCK"
            elif requested in {"crypto", "cryptos", "digital_asset", "digital_assets"}:
                bucket = "cryptos"
                query_type = "CRYPTO"
            elif requested in {"commodity", "commodities"}:
                bucket = "commodities"
                query_type = "COMMODITY"
            else:
                raise HTTPException(status_code=400, detail="asset_class must be stock, crypto, or commodity")

            quote = fetch_market_quote(query=f"{query_type}, {symbol}")
            fetched_symbol = str(quote.get("symbol") or symbol).upper()
            price = round(float(quote.get("price") or 0.0), 6)
            if price <= 0:
                raise HTTPException(status_code=400, detail=f"could not fetch a valid market price for '{symbol}'")

            qty = round(float(payload.qty), 8)
            avg_price = round(float(payload.avg_price), 6) if payload.avg_price is not None else price
            market_value = round(qty * price, 2)
            incoming_name = (payload.name or "").strip()

            entries = portfolio.get(bucket, [])
            if not isinstance(entries, list):
                entries = []

            existing = next(
                (item for item in entries if str(item.get("symbol", "")).strip().upper() == fetched_symbol),
                None,
            )
            if existing is not None:
                old_qty = float(existing.get("qty", 0.0) or 0.0)
                old_avg = float(existing.get("avg_price", price) or price)
                new_qty = round(old_qty + qty, 8)
                if new_qty > 0:
                    weighted_avg = round(((old_qty * old_avg) + (qty * avg_price)) / new_qty, 6)
                else:
                    weighted_avg = avg_price
                existing["qty"] = new_qty
                existing["avg_price"] = weighted_avg
                existing["current_price"] = price
                existing["market_value"] = round(new_qty * price, 2)
                if incoming_name:
                    existing["name"] = incoming_name
                item = existing
            else:
                item = {
                    "symbol": fetched_symbol,
                    "qty": qty,
                    "avg_price": avg_price,
                    "current_price": price,
                    "market_value": market_value,
                }
                if incoming_name:
                    item["name"] = incoming_name
                entries.append(item)

            portfolio[bucket] = entries
            user["portfolio"] = portfolio
            users[user_id] = recalculate_user_financials(user)
            write_users_data(users)
            return {"status": "ok", "user_id": user_id, "asset_class": bucket, "item": item, "user": users[user_id]}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"portfolio holding create failed: {exc}") from exc

    @router.delete(
        "/users/{user_id}/financials/portfolio/{asset_class}/{symbol}",
        tags=["Users"],
        summary="Remove a portfolio holding (stocks, cryptos, or commodities) from a user profile",
    )
    def remove_user_portfolio_holding(user_id: str, asset_class: str, symbol: str) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            portfolio = user.get("portfolio")
            if not isinstance(portfolio, dict):
                raise HTTPException(status_code=400, detail="user portfolio is not in expected format")

            bucket = asset_class.strip().lower()
            if bucket in {"stock", "stocks", "equity", "equities"}:
                bucket = "stocks"
            elif bucket in {"crypto", "cryptos", "digital_assets", "digital_asset"}:
                bucket = "cryptos"
            elif bucket in {"commodity", "commodities"}:
                bucket = "commodities"
            else:
                raise HTTPException(status_code=400, detail="asset_class must be stocks, cryptos, or commodities")

            entries = portfolio.get(bucket, [])
            if not isinstance(entries, list):
                raise HTTPException(status_code=400, detail=f"portfolio bucket '{bucket}' is invalid")

            target = symbol.strip().lower()
            if not target:
                raise HTTPException(status_code=400, detail="symbol is required")

            remove_index = next(
                (
                    idx
                    for idx, item in enumerate(entries)
                    if str(item.get("symbol", "")).strip().lower() == target
                ),
                None,
            )
            if remove_index is None:
                raise HTTPException(status_code=404, detail=f"holding '{symbol}' not found in {bucket}")

            entries.pop(remove_index)
            portfolio[bucket] = entries
            user["portfolio"] = portfolio
            users[user_id] = recalculate_user_financials(user)
            write_users_data(users)
            return {"status": "ok", "user_id": user_id, "asset_class": bucket, "symbol": symbol, "user": users[user_id]}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"portfolio holding delete failed: {exc}") from exc

    @router.delete(
        "/users/{user_id}/financials/assets/{item_id}",
        tags=["Users"],
        summary="Remove a manual asset from a user profile",
    )
    def remove_user_manual_asset(user_id: str, item_id: str) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            user = ensure_financial_collections(user)
            before = len(user["manual_assets"])
            user["manual_assets"] = [item for item in user["manual_assets"] if item.get("id") != item_id]
            if len(user["manual_assets"]) == before:
                raise HTTPException(status_code=404, detail=f"asset item '{item_id}' not found")
            users[user_id] = recalculate_user_financials(user)
            write_users_data(users)
            return {"status": "ok", "user_id": user_id, "user": users[user_id]}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"asset delete failed: {exc}") from exc

    @router.post(
        "/users/{user_id}/financials/liabilities",
        tags=["Users"],
        summary="Add a liability item to a user profile",
    )
    def add_user_liability_item(user_id: str, payload: models.LiabilityItemCreateRequest) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            user = ensure_financial_collections(user)
            item = {
                "id": str(uuid.uuid4()),
                "label": payload.label.strip(),
                "amount": round(float(payload.amount), 2),
                "is_mortgage": bool(payload.is_mortgage),
            }
            user["liability_items"].append(item)
            users[user_id] = recalculate_user_financials(user)
            write_users_data(users)
            return {"status": "ok", "user_id": user_id, "item": item, "user": users[user_id]}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"liability create failed: {exc}") from exc

    @router.delete(
        "/users/{user_id}/financials/liabilities/{item_id}",
        tags=["Users"],
        summary="Remove a liability item from a user profile",
    )
    def remove_user_liability_item(user_id: str, item_id: str) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            user = ensure_financial_collections(user)
            before = len(user["liability_items"])
            user["liability_items"] = [item for item in user["liability_items"] if item.get("id") != item_id]
            if len(user["liability_items"]) == before:
                raise HTTPException(status_code=404, detail=f"liability item '{item_id}' not found")
            users[user_id] = recalculate_user_financials(user)
            write_users_data(users)
            return {"status": "ok", "user_id": user_id, "user": users[user_id]}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"liability delete failed: {exc}") from exc

    @router.post(
        "/users/{user_id}/financials/income",
        tags=["Users"],
        summary="Add an income stream to a user profile",
    )
    def add_user_income_stream(user_id: str, payload: models.IncomeStreamCreateRequest) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            user = ensure_financial_collections(user)
            item = {
                "id": str(uuid.uuid4()),
                "label": payload.label.strip(),
                "monthly_amount": round(float(payload.monthly_amount), 2),
            }
            user["income_streams"].append(item)
            users[user_id] = recalculate_user_financials(user)
            write_users_data(users)
            return {"status": "ok", "user_id": user_id, "item": item, "user": users[user_id]}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"income create failed: {exc}") from exc

    @router.delete(
        "/users/{user_id}/financials/income/{item_id}",
        tags=["Users"],
        summary="Remove an income stream from a user profile",
    )
    def remove_user_income_stream(user_id: str, item_id: str) -> dict[str, Any]:
        try:
            users = read_users_data()
            user = users.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            user = ensure_financial_collections(user)
            before = len(user["income_streams"])
            user["income_streams"] = [item for item in user["income_streams"] if item.get("id") != item_id]
            if len(user["income_streams"]) == before:
                raise HTTPException(status_code=404, detail=f"income stream '{item_id}' not found")
            users[user_id] = recalculate_user_financials(user)
            write_users_data(users)
            return {"status": "ok", "user_id": user_id, "user": users[user_id]}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"income delete failed: {exc}") from exc

    @router.get(
        "/portfolio/{user_id}",
        tags=["Portfolio"],
        summary="Get portfolio positions by user ID",
    )
    def get_portfolio_by_user_id(user_id: str) -> dict[str, Any]:
        try:
            data = read_users_data()
            user = data.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")
            user = enrich_portfolio_with_ath(ensure_financial_collections(user))
            return {"status": "ok", "user_id": user_id, "portfolio": user.get("portfolio", [])}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"read portfolio failed: {exc}") from exc

    @router.get(
        "/portfolio/{user_id}/history",
        tags=["Portfolio"],
        summary="Get daily portfolio history by user ID",
    )
    def get_portfolio_history_by_user_id(user_id: str) -> dict[str, Any]:
        try:
            data = read_users_data()
            user = data.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            history = read_user_portfolio_history(user_id)
            daily_points = history.get("daily_values", [])
            if not isinstance(daily_points, list):
                raise HTTPException(status_code=500, detail="invalid portfolio history format")

            return {
                "status": "ok",
                "user_id": user_id,
                "history": history,
                "count": len(daily_points),
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"read portfolio history failed: {exc}") from exc

    @router.get(
        "/portfolio/{user_id}/{asset_class}",
        tags=["Portfolio"],
        summary="Get portfolio positions by asset class (stocks, cryptos, commodities)",
    )
    def get_portfolio_by_asset_class(user_id: str, asset_class: str) -> dict[str, Any]:
        try:
            data = read_users_data()
            user = data.get(user_id)
            if not isinstance(user, dict):
                raise HTTPException(status_code=404, detail=f"user_id '{user_id}' not found")

            bucket, positions = api.get_positions_by_asset_class(
                user=user,
                asset_class=asset_class,
                commodity_alias_symbols=api.COMMODITY_ALIAS_TO_SYMBOL.values(),
                common_commodity_etfs=const.COMMON_COMMODITY_ETFS,
            )

            return {
                "status": "ok",
                "user_id": user_id,
                "asset_class": bucket,
                "count": len(positions),
                "positions": positions,
            }
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"read asset class failed: {exc}") from exc

    return router
