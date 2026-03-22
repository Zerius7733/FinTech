import csv
from typing import Any

import backend.settings.constants as const


def _safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:
        return None
    return number


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def ensure_users_csv_fieldnames(fieldnames: list[str]) -> list[str]:
    required = [
        "user_id",
        "created_at",
        "username",
        "password",
        "email",
        "name",
        "dbs",
        "uob",
        "ocbc",
        "other_banks",
        const.SYNCED_ACCOUNT_BALANCE_FIELD,
        const.SYNCED_BALANCE_RELOAD_COUNT_FIELD,
        "liability",
        "income",
        "estate",
        "expense",
        "age",
        "age_group",
        "country",
    ]
    for key in required:
        if key not in fieldnames:
            fieldnames.append(key)
    return fieldnames


def read_synced_account_balance_from_csv_row(row: dict[str, Any]) -> float:
    synced_value = row.get(const.SYNCED_ACCOUNT_BALANCE_FIELD)
    if synced_value not in (None, ""):
        return round(_safe_float(synced_value) or 0.0, 2)

    legacy_total = 0.0
    for key in ("dbs", "uob", "ocbc"):
        legacy_total += _safe_float(row.get(key, 0.0)) or 0.0
    legacy_total += _safe_float(
        row.get("other_banks")
        if row.get("other_banks") not in (None, "")
        else row.get("other_bank", 0.0)
    ) or 0.0
    return round(legacy_total, 2)


def read_csv_money_field(row: dict[str, Any], field: str, fallback: float = 0.0) -> float:
    raw_value = row.get(field)
    if raw_value in (None, ""):
        return round(float(fallback or 0.0), 2)
    return round(_safe_float(raw_value) or 0.0, 2)


def load_users_csv_lookup() -> dict[str, dict[str, str]]:
    if not const.ASSETS_CSV_PATH.exists():
        return {}
    with open(const.ASSETS_CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = [dict(row) for row in reader]
    lookup: dict[str, dict[str, str]] = {}
    for row in rows:
        user_id = (row.get("user_id") or "").strip()
        if user_id:
            lookup[user_id] = row
    return lookup


def sync_user_to_assets_csv(user_id: str, user: dict[str, Any]) -> None:
    csv_path = const.ASSETS_CSV_PATH
    default_headers = [
        "user_id",
        "created_at",
        "username",
        "password",
        "email",
        "name",
        "dbs",
        "uob",
        "ocbc",
        "other_banks",
        const.SYNCED_ACCOUNT_BALANCE_FIELD,
        const.SYNCED_BALANCE_RELOAD_COUNT_FIELD,
        "liability",
        "income",
        "estate",
        "expense",
        "age",
        "age_group",
        "country",
    ]

    if csv_path.exists():
        with open(csv_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            rows = [dict(row) for row in reader]
            fieldnames = list(reader.fieldnames or [])
    else:
        rows = []
        fieldnames = default_headers[:]

    fieldnames = ensure_users_csv_fieldnames(fieldnames)

    target_index = None
    for idx, row in enumerate(rows):
        if (row.get("user_id") or "").strip() == user_id:
            target_index = idx
            break

    if target_index is None:
        row = {key: "" for key in fieldnames}
        row["user_id"] = user_id
        row["name"] = str(user.get("name", "") or "")
        row.setdefault("username", "")
        row.setdefault("password", "")
        row.setdefault("email", "")
        row.setdefault("age", "")
        row.setdefault("age_group", "")
        row.setdefault("country", "")
        row.setdefault("dbs", "0")
        row.setdefault("uob", "0")
        row.setdefault("ocbc", "0")
        row.setdefault(const.SYNCED_ACCOUNT_BALANCE_FIELD, "0")
        row.setdefault(const.SYNCED_BALANCE_RELOAD_COUNT_FIELD, "0")
        row.setdefault("expense", str(user.get("expenses", 0.0) or 0.0))
        rows.append(row)
        target_index = len(rows) - 1

    target = rows[target_index]
    target["name"] = str(user.get("name", target.get("name", "")) or "")
    target.setdefault(const.SYNCED_ACCOUNT_BALANCE_FIELD, "0")
    target[const.SYNCED_BALANCE_RELOAD_COUNT_FIELD] = str(_safe_int(target.get(const.SYNCED_BALANCE_RELOAD_COUNT_FIELD), 0))

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def update_user_csv_profile(user_id: str, updates: dict[str, Any]) -> None:
    csv_path = const.ASSETS_CSV_PATH
    if csv_path.exists():
        with open(csv_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            rows = [dict(row) for row in reader]
            fieldnames = list(reader.fieldnames or [])
    else:
        rows = []
        fieldnames = [
            "user_id", "created_at", "username", "password", "email", "name",
            "dbs", "uob", "ocbc", "other_banks", const.SYNCED_ACCOUNT_BALANCE_FIELD, const.SYNCED_BALANCE_RELOAD_COUNT_FIELD,
            "liability", "income", "estate", "expense",
            "age", "age_group", "country",
        ]

    fieldnames = ensure_users_csv_fieldnames(fieldnames)

    for key in updates.keys():
        if key not in fieldnames:
            fieldnames.append(key)

    target = next((row for row in rows if (row.get("user_id") or "").strip() == user_id), None)
    if target is None:
        target = {key: "" for key in fieldnames}
        target["user_id"] = user_id
        rows.append(target)

    for key, value in updates.items():
        target[key] = "" if value is None else str(value)

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def read_user_csv_profile(user_id: str) -> dict[str, Any]:
    csv_path = const.ASSETS_CSV_PATH
    if not csv_path.exists():
        return {}
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if (row.get("user_id") or "").strip() == user_id:
                return dict(row)
    return {}


def load_users_csv() -> tuple[list[dict[str, str]], list[str]]:
    if const.ASSETS_CSV_PATH.exists():
        with open(const.ASSETS_CSV_PATH, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            rows = [dict(row) for row in reader]
            fieldnames = list(reader.fieldnames or [])
    else:
        rows = []
        fieldnames = []
    return rows, ensure_users_csv_fieldnames(fieldnames)


def write_users_csv(rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    fieldnames = ensure_users_csv_fieldnames(fieldnames)
    if not fieldnames:
        return
    with open(const.ASSETS_CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def upsert_synced_balance_csv_row(user_id: str, user: dict[str, Any], balance: float, reload_count: int) -> None:
    rows, fieldnames = load_users_csv()
    target = next((row for row in rows if (row.get("user_id") or "").strip() == user_id), None)
    if target is None:
        target = {key: "" for key in fieldnames}
        target["user_id"] = user_id
        rows.append(target)

    target["name"] = str(user.get("name", target.get("name", "")) or "")
    target.setdefault("dbs", "0")
    target.setdefault("uob", "0")
    target.setdefault("ocbc", "0")
    target.setdefault("other_banks", "0")
    target.setdefault("liability", "0")
    target.setdefault("income", "0")
    target.setdefault("estate", "0")
    target.setdefault("expense", str(user.get("expenses", 0.0) or 0.0))
    target[const.SYNCED_ACCOUNT_BALANCE_FIELD] = f"{round(balance, 2):.2f}"
    target[const.SYNCED_BALANCE_RELOAD_COUNT_FIELD] = str(max(0, int(reload_count)))
    write_users_csv(rows, fieldnames)
