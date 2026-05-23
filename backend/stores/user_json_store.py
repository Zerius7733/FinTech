import csv
import json
import os
import tempfile
from typing import Any

import backend.settings.constants as const
import backend.services.users as user_services
from backend.services.portfolio.helpers import recalculate_user_financials


def _load_json_document(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8-sig") as f:
        raw = f.read()
    if not raw.strip():
        return {}
    decoder = json.JSONDecoder(strict=False)
    index = 0
    documents: list[Any] = []
    while index < len(raw):
        while index < len(raw) and raw[index].isspace():
            index += 1
        if index >= len(raw):
            break
        try:
            document, index = decoder.raw_decode(raw, index)
        except json.JSONDecodeError:
            if documents:
                break
            return {}
        documents.append(document)

    if not documents:
        return {}
    if len(documents) == 1:
        return documents[0] if isinstance(documents[0], dict) else {}

    merged: dict[str, Any] = {}
    for document in documents:
        if isinstance(document, dict):
            merged.update(document)
    return merged


def _atomic_write_json(path: str, data: dict[str, Any]) -> None:
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".user-json-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def read_users_data() -> dict[str, Any]:
    data = _load_json_document(str(const.USER_JSON_PATH))
    normalized = user_services.normalize_users_data(data)
    normalized = hydrate_missing_login_users(normalized)
    return user_services.hydrate_users_from_csv(
        normalized,
        recalculate_user_financials=recalculate_user_financials,
    )


def hydrate_missing_login_users(users: dict[str, Any]) -> dict[str, Any]:
    if not const.LOGIN_CSV_PATH.exists():
        return users
    hydrated = dict(users)
    with open(const.LOGIN_CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            user_id = (row.get("user_id") or "").strip()
            if not user_id or user_id in hydrated:
                continue
            name = (row.get("name") or row.get("username") or user_id).strip()
            hydrated[user_id] = {"name": name}
    return user_services.normalize_users_data(hydrated)


def write_users_data(data: dict[str, Any]) -> None:
    _atomic_write_json(str(const.USER_JSON_PATH), user_services.normalize_users_data(data))


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
