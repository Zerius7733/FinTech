import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict

USER_CSV_FIELDS = [
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
    "liability",
    "income",
    "estate",
    "expense",
    "age",
    "age_group",
    "country",
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _utc_days_ago_iso(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _normalize_created_at(value: str | None) -> str:
    text = (value or "").strip()
    if not text:
        return _utc_days_ago_iso(31)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return _utc_days_ago_iso(31)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


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
        rows: list[Dict[str, str]] = []
        for row in reader:
            normalized: Dict[str, str] = {}
            for key, value in (row or {}).items():
                clean_key = str(key or "").lstrip("\ufeff")
                normalized[clean_key] = value
            rows.append(normalized)
        return rows


def _ensure_login_csv_exists(login_csv_path: Path) -> None:
    if login_csv_path.exists():
        return
    with open(login_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=USER_CSV_FIELDS)
        writer.writeheader()


def ensure_login_csv_schema(login_csv_path: Path) -> None:
    _ensure_login_csv_exists(login_csv_path)
    with open(login_csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        current_fields = list(reader.fieldnames or [])
        rows = [row for row in reader]

    if current_fields == USER_CSV_FIELDS and all((row.get("created_at") or "").strip() for row in rows):
        return

    rewritten_rows: list[Dict[str, str]] = []
    for row in rows:
        rewritten = {field: (row.get(field) or "") for field in USER_CSV_FIELDS}
        rewritten["created_at"] = _normalize_created_at(row.get("created_at"))
        rewritten_rows.append(rewritten)

    with open(login_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=USER_CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rewritten_rows)


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
    ensure_login_csv_schema(login_csv_path)
    rows = _load_login_rows(login_csv_path)

    if any((row.get("username") or "").strip().lower() == normalized_username.lower() for row in rows):
        raise RegisterConflictError(f"username '{normalized_username}' already exists")

    if requested_user_id:
        if any((row.get("user_id") or "").strip().lower() == requested_user_id.lower() for row in rows):
            raise RegisterConflictError(f"user_id '{requested_user_id}' already exists")
        final_user_id = requested_user_id
    else:
        final_user_id = _next_user_id(rows)

    created_at = _utc_now_iso()

    with open(login_csv_path, "a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=USER_CSV_FIELDS)
        writer.writerow(
            {
                "user_id": final_user_id,
                "created_at": created_at,
                "username": normalized_username,
                "password": normalized_password,
                "email": f"{normalized_username.lower()}@example.com",
                "name": normalized_username,
                "dbs": "0",
                "uob": "0",
                "ocbc": "0",
                "other_banks": "0",
                "liability": "0",
                "income": "0",
                "estate": "0",
                "expense": "0",
                "age": "",
                "age_group": "",
                "country": "",
            }
        )

    return {
        "user_id": final_user_id,
        "username": normalized_username,
        "created_at": created_at,
    }


def authenticate_login_user(login_csv_path: Path, username: str, password: str) -> Dict[str, str]:
    normalized_username = (username or "").strip()
    normalized_password = (password or "").strip()

    if not normalized_username:
        raise LoginValidationError("username is required")
    if not normalized_password:
        raise LoginValidationError("password is required")

    ensure_login_csv_schema(login_csv_path)
    rows = _load_login_rows(login_csv_path)
    if not rows:
        raise LoginAuthError("invalid username or password")

    target_row = None
    for row in rows:
        username_value = (row.get("username") or "").strip().lower()
        email_value = (row.get("email") or "").strip().lower()
        user_id_value = (row.get("user_id") or "").strip().lower()
        if normalized_username.lower() in {username_value, email_value, user_id_value}:
            target_row = row
            break

    if target_row is None:
        raise LoginAuthError("invalid username or password")

    stored_password = (target_row.get("password") or "").strip()
    if stored_password != normalized_password:
        raise LoginAuthError("invalid username or password")

    return {
        "user_id": (target_row.get("user_id") or "").strip(),
        "created_at": _normalize_created_at(target_row.get("created_at")),
        "username": (target_row.get("username") or "").strip(),
    }
