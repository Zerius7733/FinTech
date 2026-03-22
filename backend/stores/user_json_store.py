import csv
import json
from typing import Any

import backend.settings.constants as const
import backend.services.users as user_services
from backend.services.portfolio.helpers import recalculate_user_financials


def read_users_data() -> dict[str, Any]:
    with open(const.USER_JSON_PATH, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
    normalized = user_services.normalize_users_data(data)
    return user_services.hydrate_users_from_csv(
        normalized,
        recalculate_user_financials=recalculate_user_financials,
    )


def write_users_data(data: dict[str, Any]) -> None:
    with open(const.USER_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(user_services.normalize_users_data(data), f, indent=2)


def next_available_user_id() -> str:
    max_id = 0

    if const.LOGIN_CSV_PATH.exists():
        with open(const.LOGIN_CSV_PATH, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                raw = str((row or {}).get("user_id", "")).strip().lower()
                if raw.startswith("u") and raw[1:].isdigit():
                    max_id = max(max_id, int(raw[1:]))

    try:
        users = read_users_data()
    except Exception:
        users = {}
    for user_id in users.keys():
        raw = str(user_id or "").strip().lower()
        if raw.startswith("u") and raw[1:].isdigit():
            max_id = max(max_id, int(raw[1:]))

    return f"u{max_id + 1:03d}"


def age_to_group(age: int) -> str:
    if age <= 29:
        return "18-29"
    if age <= 44:
        return "30-44"
    if age <= 59:
        return "45-59"
    return "60+"
