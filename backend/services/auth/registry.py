import csv
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict
from email_validator import EmailNotValidError, validate_email

REQUIRED_LOGIN_CSV_FIELDS = [
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


def _ensure_login_csv_fieldnames(fieldnames: list[str]) -> list[str]:
    normalized = [str(field or "").lstrip("\ufeff") for field in (fieldnames or []) if str(field or "").strip()]
    for key in REQUIRED_LOGIN_CSV_FIELDS:
        if key not in normalized:
            normalized.append(key)
    return normalized


def _load_login_table(login_csv_path: Path) -> tuple[list[Dict[str, str]], list[str]]:
    if not login_csv_path.exists():
        return [], _ensure_login_csv_fieldnames([])
    with open(login_csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = _ensure_login_csv_fieldnames(list(reader.fieldnames or []))
        rows: list[Dict[str, str]] = []
        for row in reader:
            normalized: Dict[str, str] = {}
            for key, value in (row or {}).items():
                clean_key = str(key or "").lstrip("\ufeff")
                normalized[clean_key] = value
            rows.append(normalized)
        return rows, fieldnames


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


PASSWORD_MIN_LENGTH = 8
PASSWORD_UPPER_RE = re.compile(r"[A-Z]")
PASSWORD_LOWER_RE = re.compile(r"[a-z]")
PASSWORD_DIGIT_RE = re.compile(r"\d")
PASSWORD_SPECIAL_RE = re.compile(r"[^A-Za-z0-9]")


def _load_login_rows(login_csv_path: Path) -> list[Dict[str, str]]:
    rows, _ = _load_login_table(login_csv_path)
    return rows


def _ensure_login_csv_exists(login_csv_path: Path) -> None:
    if login_csv_path.exists():
        return
    with open(login_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=_ensure_login_csv_fieldnames([]))
        writer.writeheader()


def ensure_login_csv_schema(login_csv_path: Path) -> None:
    _ensure_login_csv_exists(login_csv_path)
    rows, fieldnames = _load_login_table(login_csv_path)
    with open(login_csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        current_fields = [str(field or "").lstrip("\ufeff") for field in list(reader.fieldnames or [])]

    if current_fields == fieldnames and all((row.get("created_at") or "").strip() for row in rows):
        return

    rewritten_rows: list[Dict[str, str]] = []
    for row in rows:
        rewritten = {field: (row.get(field) or "") for field in fieldnames}
        rewritten["created_at"] = _normalize_created_at(row.get("created_at"))
        rewritten_rows.append(rewritten)

    with open(login_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rewritten_rows)


def bootstrap_login_csv_from_assets_csv(login_csv_path: Path, assets_csv_path: Path) -> None:
    if login_csv_path.exists():
        return
    if not assets_csv_path.exists():
        _ensure_login_csv_exists(login_csv_path)
        return

    with open(assets_csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        asset_fieldnames = _ensure_login_csv_fieldnames(list(reader.fieldnames or []))
        asset_rows = [dict(row) for row in reader]

    migrated_rows: list[Dict[str, str]] = []
    for row in asset_rows:
        user_id = (row.get("user_id") or "").strip()
        username = (row.get("username") or "").strip()
        password = (row.get("password") or "").strip()
        if not user_id or not username:
            continue
        migrated = {field: (row.get(field) or "") for field in asset_fieldnames}
        migrated.update(
            {
                "user_id": user_id,
                "created_at": _normalize_created_at(row.get("created_at")),
                "username": username,
                "password": password,
                "email": (row.get("email") or "").strip() or f"{username.lower()}@example.com",
                "name": (row.get("name") or "").strip() or username,
                "dbs": (row.get("dbs") or "0").strip() or "0",
                "uob": (row.get("uob") or "0").strip() or "0",
                "ocbc": (row.get("ocbc") or "0").strip() or "0",
                "other_banks": (row.get("other_banks") or "0").strip() or "0",
                "synced_account_balance": (row.get("synced_account_balance") or "0").strip() or "0",
                "synced_balance_reload_count": (row.get("synced_balance_reload_count") or "0").strip() or "0",
                "liability": (row.get("liability") or "0").strip() or "0",
                "income": (row.get("income") or "0").strip() or "0",
                "estate": (row.get("estate") or "0").strip() or "0",
                "expense": (row.get("expense") or "0").strip() or "0",
                "age": (row.get("age") or "").strip(),
                "age_group": (row.get("age_group") or "").strip(),
                "country": (row.get("country") or "").strip(),
            }
        )
        migrated_rows.append(migrated)

    with open(login_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=asset_fieldnames)
        writer.writeheader()
        writer.writerows(migrated_rows)


def _next_user_id(rows: list[Dict[str, str]]) -> str:
    max_id = 0
    for row in rows:
        raw = (row.get("user_id") or "").strip().lower()
        if raw.startswith("u") and raw[1:].isdigit():
            max_id = max(max_id, int(raw[1:]))
    return f"u{max_id + 1:03d}"


def normalize_email_address(email: str, *, require_email: bool = True) -> str:
    normalized_email = (email or "").strip()
    if not normalized_email:
        if require_email:
            raise RegisterValidationError("email is required")
        return ""
    try:
        validated = validate_email(normalized_email, check_deliverability=False)
    except EmailNotValidError as exc:
        raise RegisterValidationError("enter a valid email address like name@domain.com") from exc
    return validated.normalized


def validate_password_strength(password: str) -> str:
    normalized_password = (password or "").strip()
    if not normalized_password:
        raise RegisterValidationError("password is required")
    if len(normalized_password) < PASSWORD_MIN_LENGTH:
        raise RegisterValidationError("password must be at least 8 characters long")
    if not PASSWORD_UPPER_RE.search(normalized_password):
        raise RegisterValidationError("password must include at least one uppercase letter")
    if not PASSWORD_LOWER_RE.search(normalized_password):
        raise RegisterValidationError("password must include at least one lowercase letter")
    if not PASSWORD_DIGIT_RE.search(normalized_password):
        raise RegisterValidationError("password must include at least one number")
    if not PASSWORD_SPECIAL_RE.search(normalized_password):
        raise RegisterValidationError("password must include at least one special character")
    return normalized_password


def validate_registration_fields(
    login_csv_path: Path,
    username: str,
    password: str,
    email: str | None = None,
    *,
    exclude_user_id: str | None = None,
    require_email: bool = False,
) -> Dict[str, str]:
    normalized_username = (username or "").strip()
    if not normalized_username:
        raise RegisterValidationError("username is required")

    normalized_password = validate_password_strength(password)
    normalized_email = normalize_email_address(email or "", require_email=require_email)
    normalized_exclude_user_id = (exclude_user_id or "").strip().lower()

    _ensure_login_csv_exists(login_csv_path)
    ensure_login_csv_schema(login_csv_path)
    rows = _load_login_rows(login_csv_path)

    for row in rows:
        row_user_id = (row.get("user_id") or "").strip().lower()
        if normalized_exclude_user_id and row_user_id == normalized_exclude_user_id:
            continue

        row_username = (row.get("username") or "").strip().lower()
        if row_username == normalized_username.lower():
            raise RegisterConflictError(f"username '{normalized_username}' already exists")

        if normalized_email:
            row_email = (row.get("email") or "").strip().lower()
            if row_email == normalized_email.lower():
                raise RegisterConflictError(f"email '{normalized_email}' already exists")

    return {
        "username": normalized_username,
        "password": normalized_password,
        "email": normalized_email,
    }


def register_login_user(
    login_csv_path: Path,
    username: str,
    password: str,
    email: str | None = None,
    user_id: str | None = None,
) -> Dict[str, str]:
    validated = validate_registration_fields(
        login_csv_path=login_csv_path,
        username=username,
        password=password,
        email=email,
        require_email=False,
    )
    normalized_username = validated["username"]
    normalized_password = validated["password"]
    normalized_email = validated["email"]
    requested_user_id = (user_id or "").strip()

    _ensure_login_csv_exists(login_csv_path)
    ensure_login_csv_schema(login_csv_path)
    rows, fieldnames = _load_login_table(login_csv_path)

    if requested_user_id:
        if any((row.get("user_id") or "").strip().lower() == requested_user_id.lower() for row in rows):
            final_user_id = _next_user_id(rows)
        else:
            final_user_id = requested_user_id
    else:
        final_user_id = _next_user_id(rows)

    created_at = _utc_now_iso()

    with open(login_csv_path, "a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        row = {field: "" for field in fieldnames}
        row.update(
            {
                "user_id": final_user_id,
                "created_at": created_at,
                "username": normalized_username,
                "password": normalized_password,
                "email": normalized_email or f"{normalized_username.lower()}@example.com",
                "name": normalized_username,
                "dbs": "0",
                "uob": "0",
                "ocbc": "0",
                "other_banks": "0",
                "synced_account_balance": "0",
                "synced_balance_reload_count": "0",
                "liability": "0",
                "income": "0",
                "estate": "0",
                "expense": "0",
                "age": "",
                "age_group": "",
                "country": "",
            }
        )
        writer.writerow(row)

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
