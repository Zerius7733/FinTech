import csv
from pathlib import Path
from typing import Dict


class RegisterValidationError(Exception):
    pass


class RegisterConflictError(Exception):
    pass


class LoginValidationError(Exception):
    pass


class LoginAuthError(Exception):
    pass


def _load_login_rows(login_csv_path: Path) -> list[Dict[str, str]]:
    if not login_csv_path.exists():
        return []
    with open(login_csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return [row for row in reader]


def _ensure_login_csv_exists(login_csv_path: Path) -> None:
    if login_csv_path.exists():
        return
    with open(login_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["user_id", "username", "password"])
        writer.writeheader()


def _next_user_id(rows: list[Dict[str, str]]) -> str:
    max_id = 0
    for row in rows:
        raw = (row.get("user_id") or "").strip().lower()
        if raw.startswith("u") and raw[1:].isdigit():
            max_id = max(max_id, int(raw[1:]))
    return f"u{max_id + 1:03d}"


def register_login_user(
    login_csv_path: Path,
    username: str,
    password: str,
    user_id: str | None = None,
) -> Dict[str, str]:
    normalized_username = (username or "").strip()
    normalized_password = (password or "").strip()
    requested_user_id = (user_id or "").strip()

    if not normalized_username:
        raise RegisterValidationError("username is required")
    if not normalized_password:
        raise RegisterValidationError("password is required")

    _ensure_login_csv_exists(login_csv_path)
    rows = _load_login_rows(login_csv_path)

    if any((row.get("username") or "").strip().lower() == normalized_username.lower() for row in rows):
        raise RegisterConflictError(f"username '{normalized_username}' already exists")

    if requested_user_id:
        if any((row.get("user_id") or "").strip().lower() == requested_user_id.lower() for row in rows):
            raise RegisterConflictError(f"user_id '{requested_user_id}' already exists")
        final_user_id = requested_user_id
    else:
        final_user_id = _next_user_id(rows)

    with open(login_csv_path, "a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["user_id", "username", "password"])
        writer.writerow(
            {
                "user_id": final_user_id,
                "username": normalized_username,
                "password": normalized_password,
            }
        )

    return {"user_id": final_user_id, "username": normalized_username}


def authenticate_login_user(login_csv_path: Path, username: str, password: str) -> Dict[str, str]:
    normalized_username = (username or "").strip()
    normalized_password = (password or "").strip()

    if not normalized_username:
        raise LoginValidationError("username is required")
    if not normalized_password:
        raise LoginValidationError("password is required")

    rows = _load_login_rows(login_csv_path)
    if not rows:
        raise LoginAuthError("invalid username or password")

    target_row = None
    for row in rows:
        if (row.get("username") or "").strip().lower() == normalized_username.lower():
            target_row = row
            break

    if target_row is None:
        raise LoginAuthError("invalid username or password")

    stored_password = (target_row.get("password") or "").strip()
    if stored_password != normalized_password:
        raise LoginAuthError("invalid username or password")

    return {
        "user_id": (target_row.get("user_id") or "").strip(),
        "username": (target_row.get("username") or "").strip(),
    }
