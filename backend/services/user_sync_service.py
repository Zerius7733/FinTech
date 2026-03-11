from typing import Any

from backend.portfolio_helpers import ensure_financial_collections
from backend.stores import user_csv_store


def _has_synced_profile_values(row: dict[str, Any]) -> bool:
    if not isinstance(row, dict):
        return False
    synced_balance = user_csv_store.read_synced_account_balance_from_csv_row(row)
    if synced_balance > 0:
        return True
    for field in ("estate", "liability", "income"):
        if user_csv_store.read_csv_money_field(row, field) > 0:
            return True
    return False


def _upsert_seeded_financial_item(items: list[dict[str, Any]], seed_id: str, payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    normalized_items = [item for item in items if isinstance(item, dict)]
    existing_index = next((idx for idx, item in enumerate(normalized_items) if item.get("id") == seed_id), None)

    if payload is None:
        if existing_index is not None:
            normalized_items.pop(existing_index)
        return normalized_items

    next_item = dict(payload)
    if existing_index is None:
        normalized_items.append(next_item)
    else:
        normalized_items[existing_index] = {**normalized_items[existing_index], **next_item}
    return normalized_items


def apply_synced_csv_profile_to_user(user: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    user = ensure_financial_collections(user)

    synced_cash_balance = user_csv_store.read_synced_account_balance_from_csv_row(row)
    synced_estate = user_csv_store.read_csv_money_field(row, "estate")
    synced_liability = user_csv_store.read_csv_money_field(row, "liability")
    synced_income = user_csv_store.read_csv_money_field(row, "income")

    manual_assets = list(user.get("manual_assets", []))
    liability_items = list(user.get("liability_items", []))
    income_streams = list(user.get("income_streams", []))

    manual_assets = _upsert_seeded_financial_item(
        manual_assets,
        "estate-seed",
        {
            "id": "estate-seed",
            "label": "Property",
            "category": "real_estate",
            "value": synced_estate,
        } if synced_estate > 0 else None,
    )
    liability_items = _upsert_seeded_financial_item(
        liability_items,
        "liability-seed",
        {
            "id": "liability-seed",
            "label": "Existing Liabilities",
            "amount": synced_liability,
            "is_mortgage": False,
        } if synced_liability > 0 else None,
    )
    income_streams = _upsert_seeded_financial_item(
        income_streams,
        "income-seed",
        {
            "id": "income-seed",
            "label": "Primary Income",
            "monthly_amount": synced_income,
        } if synced_income > 0 else None,
    )

    user["cash_balance"] = synced_cash_balance
    user["estate"] = synced_estate
    user["liability"] = synced_liability
    user["income"] = synced_income
    user["manual_assets"] = manual_assets
    user["liability_items"] = liability_items
    user["income_streams"] = income_streams
    return user


def hydrate_users_from_csv(users: dict[str, Any], *, recalculate_user_financials: Any) -> dict[str, Any]:
    hydrated = dict(users)
    csv_lookup = user_csv_store.load_users_csv_lookup()
    for user_id, user in list(hydrated.items()):
        if user_id.startswith("_") or not isinstance(user, dict):
            continue
        row = csv_lookup.get(user_id)
        if not row or not _has_synced_profile_values(row):
            continue
        synced_user = apply_synced_csv_profile_to_user(dict(user), row)
        hydrated[user_id] = recalculate_user_financials(synced_user)
    return hydrated
