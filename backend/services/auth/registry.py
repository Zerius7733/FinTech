import csv
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import threading
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any

from email_validator import EmailNotValidError, validate_email

BASE_USER_CSV_FIELDS = [
    "user_id", "created_at", "username", "password", "email", "email_verified", "password_updated_at",
    "name", "dbs", "uob", "ocbc", "other_banks", "synced_account_balance", "synced_balance_reload_count",
    "liability", "income", "estate", "expense", "age", "age_group", "country",
]

PASSWORD_MIN_LENGTH = 8
PASSWORD_UPPER_RE = re.compile(r"[A-Z]")
PASSWORD_LOWER_RE = re.compile(r"[a-z]")
PASSWORD_DIGIT_RE = re.compile(r"\d")
PASSWORD_SPECIAL_RE = re.compile(r"[^A-Za-z0-9]")
HASH_PREFIX = "pbkdf2_sha256"
HASH_ITERATIONS = 390_000
OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = max(3, int(os.getenv("AUTH_OTP_EXPIRY_MINUTES", "10")))
OTP_RESEND_COOLDOWN_SECONDS = max(15, int(os.getenv("AUTH_OTP_RESEND_COOLDOWN_SECONDS", "60")))
OTP_MAX_ATTEMPTS = max(3, int(os.getenv("AUTH_OTP_MAX_ATTEMPTS", "5")))
STATE_LOCK = threading.Lock()


class RegisterValidationError(Exception): pass
class RegisterConflictError(Exception): pass
class LoginValidationError(Exception): pass
class LoginAuthError(Exception): pass
class AccountStateError(Exception): pass
class OtpValidationError(Exception): pass
class OtpExpiredError(Exception): pass
class OtpDeliveryError(Exception): pass
class PendingRegistrationError(Exception): pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _utc_days_ago_iso(days: int) -> str:
    return (_utc_now() - timedelta(days=days)).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _parse_iso_datetime(value: str | None) -> datetime | None:
    text = (value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _normalize_created_at(value: str | None) -> str:
    parsed = _parse_iso_datetime(value)
    if parsed is None:
        return _utc_days_ago_iso(31)
    return parsed.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _merge_fieldnames(existing_fieldnames: list[str]) -> list[str]:
    merged = [str(field or "").lstrip("\ufeff") for field in existing_fieldnames if str(field or "").strip()]
    for field in BASE_USER_CSV_FIELDS:
        if field not in merged:
            merged.append(field)
    return merged


def _load_login_rows_with_fieldnames(login_csv_path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not login_csv_path.exists():
        return BASE_USER_CSV_FIELDS[:], []
    with open(login_csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = _merge_fieldnames(list(reader.fieldnames or []))
        rows = []
        for row in reader:
            rows.append({str(key or "").lstrip("\ufeff"): value or "" for key, value in (row or {}).items()})
    return fieldnames, rows


def _ensure_login_csv_exists(login_csv_path: Path) -> None:
    if login_csv_path.exists():
        return
    login_csv_path.parent.mkdir(parents=True, exist_ok=True)
    with open(login_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=BASE_USER_CSV_FIELDS)
        writer.writeheader()


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    temp_path.replace(path)


def _load_auth_state(auth_state_path: Path) -> dict[str, Any]:
    if not auth_state_path.exists():
        return {"pending_registrations": {}, "password_resets": {}}
    with open(auth_state_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    if not isinstance(payload, dict):
        return {"pending_registrations": {}, "password_resets": {}}
    payload["pending_registrations"] = payload.get("pending_registrations") if isinstance(payload.get("pending_registrations"), dict) else {}
    payload["password_resets"] = payload.get("password_resets") if isinstance(payload.get("password_resets"), dict) else {}
    return payload


def _cleanup_auth_state(payload: dict[str, Any]) -> dict[str, Any]:
    now = _utc_now()
    for bucket_name in ("pending_registrations", "password_resets"):
        bucket = payload.get(bucket_name, {})
        if not isinstance(bucket, dict):
            payload[bucket_name] = {}
            continue
        stale_keys = []
        for key, value in bucket.items():
            expires_at = _parse_iso_datetime(str((value or {}).get("otp_expires_at", "")))
            if expires_at is None or expires_at + timedelta(hours=12) < now:
                stale_keys.append(key)
        for key in stale_keys:
            bucket.pop(key, None)
    return payload


def _is_password_hash(value: str) -> bool:
    return str(value or "").startswith(f"{HASH_PREFIX}$")


def _hash_password_value(password: str, *, validate_strength: bool) -> str:
    normalized_password = str(password or "").strip()
    if validate_strength:
        normalized_password = validate_password_strength(normalized_password)
    elif not normalized_password:
        raise RegisterValidationError("password is required")
    salt = secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac("sha256", normalized_password.encode("utf-8"), salt.encode("utf-8"), HASH_ITERATIONS)
    return f"{HASH_PREFIX}${HASH_ITERATIONS}${salt}${derived.hex()}"


def hash_password(password: str) -> str:
    return _hash_password_value(password, validate_strength=True)


def verify_password(password: str, stored_password: str) -> bool:
    candidate = str(password or "").strip()
    stored = str(stored_password or "").strip()
    if not candidate or not stored:
        return False
    if _is_password_hash(stored):
        try:
            _, raw_iterations, salt, expected_hash = stored.split("$", 3)
            iterations = int(raw_iterations)
        except ValueError:
            return False
        derived = hashlib.pbkdf2_hmac("sha256", candidate.encode("utf-8"), salt.encode("utf-8"), iterations)
        return hmac.compare_digest(derived.hex(), expected_hash)
    return hmac.compare_digest(candidate, stored)


def _hash_otp_code(email: str, otp_code: str) -> str:
    digest = hashlib.sha256()
    digest.update(normalize_email_address(email, require_email=True).lower().encode("utf-8"))
    digest.update(b":")
    digest.update(str(otp_code or "").strip().encode("utf-8"))
    return digest.hexdigest()


def _generate_otp_code() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(OTP_LENGTH))


def _mask_email(email: str) -> str:
    normalized = normalize_email_address(email, require_email=True)
    local, _, domain = normalized.partition("@")
    if len(local) <= 2:
        masked_local = f"{local[:1]}*"
    else:
        masked_local = f"{local[:2]}{'*' * max(1, len(local) - 2)}"
    return f"{masked_local}@{domain}"


def _smtp_port() -> int:
    try:
        return int(os.getenv("SMTP_PORT", "587"))
    except ValueError:
        return 587


def _console_email_mode_enabled() -> bool:
    return str(os.getenv("AUTH_EMAIL_MODE", "")).strip().lower() == "console"


def _send_email_via_smtp(recipient_email: str, subject: str, text_body: str) -> None:
    if _console_email_mode_enabled():
        print("[auth-email][console]", {"to": recipient_email, "subject": subject, "body": text_body})
        return
    host = str(os.getenv("SMTP_HOST", "")).strip()
    username = str(os.getenv("SMTP_USERNAME", "")).strip()
    password = str(os.getenv("SMTP_PASSWORD", "")).strip()
    from_email = str(os.getenv("SMTP_FROM_EMAIL", username)).strip()
    from_name = str(os.getenv("SMTP_FROM_NAME", "Unova")).strip()
    use_ssl = str(os.getenv("SMTP_USE_SSL", "0")).strip().lower() in {"1", "true", "yes", "on"}
    use_starttls = str(os.getenv("SMTP_USE_STARTTLS", "1")).strip().lower() in {"1", "true", "yes", "on"}
    if not host or not username or not password or not from_email:
        raise OtpDeliveryError("email delivery is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, and SMTP_FROM_EMAIL.")
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{from_name} <{from_email}>"
    message["To"] = recipient_email
    message.set_content(text_body)
    port = _smtp_port()
    try:
        if use_ssl:
            with smtplib.SMTP_SSL(host, port, timeout=20) as server:
                server.login(username, password)
                server.send_message(message)
            return
        with smtplib.SMTP(host, port, timeout=20) as server:
            if use_starttls:
                server.starttls()
            server.login(username, password)
            server.send_message(message)
    except Exception as exc:
        raise OtpDeliveryError(f"failed to send verification email: {exc}") from exc


def _build_registration_email(otp_code: str) -> tuple[str, str]:
    return ("Your Unova verification code", f"Use this one-time code to verify your Unova account.\n\nVerification code: {otp_code}\nExpires in: {OTP_EXPIRY_MINUTES} minutes\n\nIf you did not start this registration, you can ignore this email.")


def _build_password_reset_email(otp_code: str) -> tuple[str, str]:
    return ("Your Unova password reset code", f"Use this one-time code to reset your Unova password.\n\nReset code: {otp_code}\nExpires in: {OTP_EXPIRY_MINUTES} minutes\n\nIf you did not request a password reset, you can ignore this email.")


def ensure_login_csv_schema(login_csv_path: Path) -> None:
    _ensure_login_csv_exists(login_csv_path)
    fieldnames, rows = _load_login_rows_with_fieldnames(login_csv_path)
    merged_fieldnames = _merge_fieldnames(fieldnames)
    needs_rewrite = merged_fieldnames != fieldnames
    rewritten_rows = []
    for row in rows:
        rewritten = {field: (row.get(field) or "") for field in merged_fieldnames}
        rewritten["created_at"] = _normalize_created_at(row.get("created_at"))
        rewritten["email_verified"] = "false" if str(row.get("email_verified", "")).strip().lower() == "false" else "true"
        rewritten["password_updated_at"] = _normalize_created_at(row.get("password_updated_at") or row.get("created_at"))
        password = str(row.get("password") or "").strip()
        if password and not _is_password_hash(password):
            rewritten["password"] = _hash_password_value(password, validate_strength=False)
            needs_rewrite = True
        elif password:
            rewritten["password"] = password
        rewritten_rows.append(rewritten)
        if rewritten != row:
            needs_rewrite = True
    if not needs_rewrite:
        return
    with open(login_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=merged_fieldnames)
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
        asset_fieldnames = _merge_fieldnames(list(reader.fieldnames or []))
        asset_rows = [dict(row) for row in reader]
    migrated_rows = []
    for row in asset_rows:
        user_id = (row.get("user_id") or "").strip()
        username = (row.get("username") or "").strip()
        password = (row.get("password") or "").strip()
        if not user_id or not username:
            continue
        migrated = {field: (row.get(field) or "") for field in asset_fieldnames}
        migrated.update({
            "user_id": user_id,
            "created_at": _normalize_created_at(row.get("created_at")),
            "username": username,
            "password": password,
            "email": (row.get("email") or "").strip() or f"{username.lower()}@example.com",
            "email_verified": "false" if str(row.get("email_verified", "")).strip().lower() == "false" else "true",
            "password_updated_at": _normalize_created_at(row.get("password_updated_at") or row.get("created_at")),
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
        })
        migrated_rows.append(migrated)
    with open(login_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=asset_fieldnames)
        writer.writeheader()
        writer.writerows(migrated_rows)
    ensure_login_csv_schema(login_csv_path)


def _next_user_id(rows: list[dict[str, str]]) -> str:
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
        return validate_email(normalized_email, check_deliverability=False).normalized
    except EmailNotValidError as exc:
        raise RegisterValidationError("enter a valid email address like name@domain.com") from exc


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


def _find_user_row(rows: list[dict[str, str]], identifier: str) -> dict[str, str] | None:
    normalized_identifier = str(identifier or "").strip().lower()
    if not normalized_identifier:
        return None
    for row in rows:
        username_value = (row.get("username") or "").strip().lower()
        email_value = (row.get("email") or "").strip().lower()
        user_id_value = (row.get("user_id") or "").strip().lower()
        if normalized_identifier in {username_value, email_value, user_id_value}:
            return row
    return None


def validate_registration_fields(*, login_csv_path: Path, username: str, password: str, email: str | None = None, exclude_user_id: str | None = None, require_email: bool = True) -> dict[str, str]:
    normalized_username = str(username or "").strip()
    if not normalized_username:
        raise RegisterValidationError("username is required")
    normalized_password = validate_password_strength(password)
    normalized_email = normalize_email_address(email or "", require_email=require_email)
    excluded = (exclude_user_id or "").strip().lower()
    ensure_login_csv_schema(login_csv_path)
    _, rows = _load_login_rows_with_fieldnames(login_csv_path)
    for row in rows:
        row_user_id = (row.get("user_id") or "").strip().lower()
        if excluded and row_user_id == excluded:
            continue
        if (row.get("username") or "").strip().lower() == normalized_username.lower():
            raise RegisterConflictError(f"username '{normalized_username}' already exists")
        if normalized_email and (row.get("email") or "").strip().lower() == normalized_email.lower():
            raise RegisterConflictError(f"email '{normalized_email}' already exists")
    return {"username": normalized_username, "password": normalized_password, "email": normalized_email}


def register_login_user(login_csv_path: Path, username: str, password: str, email: str | None = None, user_id: str | None = None) -> dict[str, str]:
    validated = validate_registration_fields(login_csv_path=login_csv_path, username=username, password=password, email=email, require_email=False)
    normalized_username = validated["username"]
    normalized_email = validated["email"]
    requested_user_id = (user_id or "").strip()
    ensure_login_csv_schema(login_csv_path)
    fieldnames, rows = _load_login_rows_with_fieldnames(login_csv_path)
    if requested_user_id and any((row.get("user_id") or "").strip().lower() == requested_user_id.lower() for row in rows):
        final_user_id = _next_user_id(rows)
    elif requested_user_id:
        final_user_id = requested_user_id
    else:
        final_user_id = _next_user_id(rows)
    created_at = _utc_now_iso()
    merged_fieldnames = _merge_fieldnames(fieldnames)
    with open(login_csv_path, "a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=merged_fieldnames)
        writer.writerow({
            "user_id": final_user_id, "created_at": created_at, "username": normalized_username, "password": hash_password(password),
            "email": normalized_email or f"{normalized_username.lower()}@example.com", "email_verified": "true", "password_updated_at": created_at,
            "name": normalized_username, "dbs": "0", "uob": "0", "ocbc": "0", "other_banks": "0", "synced_account_balance": "0", "synced_balance_reload_count": "0",
            "liability": "0", "income": "0", "estate": "0", "expense": "0", "age": "", "age_group": "", "country": "",
        })
    return {"user_id": final_user_id, "username": normalized_username, "created_at": created_at, "email": normalized_email or f"{normalized_username.lower()}@example.com"}


def authenticate_login_user(login_csv_path: Path, username: str, password: str) -> dict[str, str]:
    normalized_username = (username or "").strip()
    normalized_password = (password or "").strip()
    if not normalized_username:
        raise LoginValidationError("username is required")
    if not normalized_password:
        raise LoginValidationError("password is required")
    ensure_login_csv_schema(login_csv_path)
    _, rows = _load_login_rows_with_fieldnames(login_csv_path)
    target_row = _find_user_row(rows, normalized_username)
    if target_row is None or not verify_password(normalized_password, str(target_row.get("password") or "")):
        raise LoginAuthError("invalid username or password")
    if str(target_row.get("email_verified") or "true").strip().lower() == "false":
        raise AccountStateError("email address is not verified yet")
    return {
        "user_id": (target_row.get("user_id") or "").strip(),
        "created_at": _normalize_created_at(target_row.get("created_at")),
        "username": (target_row.get("username") or "").strip(),
        "email": (target_row.get("email") or "").strip(),
    }


def _ensure_not_rate_limited(challenge: dict[str, Any]) -> None:
    sent_at = _parse_iso_datetime(str(challenge.get("otp_sent_at", "")))
    if sent_at is None:
        return
    next_allowed = sent_at + timedelta(seconds=OTP_RESEND_COOLDOWN_SECONDS)
    now = _utc_now()
    if next_allowed > now:
        wait_seconds = int((next_allowed - now).total_seconds()) + 1
        raise OtpValidationError(f"please wait {max(wait_seconds, 1)} seconds before requesting another code")


def _build_otp_response(email: str, *, expires_at: str, otp_code: str | None = None) -> dict[str, Any]:
    response = {
        "status": "otp_sent",
        "email": normalize_email_address(email, require_email=True),
        "email_masked": _mask_email(email),
        "expires_at": expires_at,
        "resend_available_in_seconds": OTP_RESEND_COOLDOWN_SECONDS,
        "otp_length": OTP_LENGTH,
    }
    if _console_email_mode_enabled() and otp_code:
        response["delivery_mode"] = "console"
        response["otp_code"] = otp_code
        response["delivery_notice"] = (
            "Email OTP delivery is still under development and requires funding to run in production. "
            "For now, use the OTP shown here and in the backend console."
        )
    return response


def start_registration(*, login_csv_path: Path, auth_state_path: Path, username: str, password: str, email: str, requested_user_id: str | None = None) -> dict[str, Any]:
    validated = validate_registration_fields(login_csv_path=login_csv_path, username=username, password=password, email=email, require_email=True)
    normalized_email = validated["email"]
    normalized_username = validated["username"]
    requested_id = (requested_user_id or "").strip()
    with STATE_LOCK:
        state = _cleanup_auth_state(_load_auth_state(auth_state_path))
        pending_bucket = state["pending_registrations"]
        for existing_email, pending in list(pending_bucket.items()):
            if existing_email != normalized_email.lower() and str((pending or {}).get("username", "")).strip().lower() == normalized_username.lower():
                raise RegisterConflictError(f"username '{normalized_username}' is already waiting for verification")
        otp_code = _generate_otp_code()
        expires_at = (_utc_now() + timedelta(minutes=OTP_EXPIRY_MINUTES)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        subject, body = _build_registration_email(otp_code)
        _send_email_via_smtp(normalized_email, subject, body)
        pending_bucket[normalized_email.lower()] = {
            "username": normalized_username, "email": normalized_email, "password_hash": hash_password(validated["password"]),
            "requested_user_id": requested_id, "otp_hash": _hash_otp_code(normalized_email, otp_code), "otp_expires_at": expires_at,
            "otp_sent_at": _utc_now_iso(), "otp_attempts_remaining": OTP_MAX_ATTEMPTS, "created_at": _utc_now_iso(),
        }
        _atomic_write_json(auth_state_path, state)
    return _build_otp_response(normalized_email, expires_at=expires_at, otp_code=otp_code)


def resend_registration_otp(*, auth_state_path: Path, email: str) -> dict[str, Any]:
    normalized_email = normalize_email_address(email, require_email=True)
    with STATE_LOCK:
        state = _cleanup_auth_state(_load_auth_state(auth_state_path))
        pending = state["pending_registrations"].get(normalized_email.lower())
        if not isinstance(pending, dict):
            raise PendingRegistrationError("no pending registration found for that email")
        _ensure_not_rate_limited(pending)
        otp_code = _generate_otp_code()
        expires_at = (_utc_now() + timedelta(minutes=OTP_EXPIRY_MINUTES)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        subject, body = _build_registration_email(otp_code)
        _send_email_via_smtp(normalized_email, subject, body)
        pending["otp_hash"] = _hash_otp_code(normalized_email, otp_code)
        pending["otp_expires_at"] = expires_at
        pending["otp_sent_at"] = _utc_now_iso()
        pending["otp_attempts_remaining"] = OTP_MAX_ATTEMPTS
        state["pending_registrations"][normalized_email.lower()] = pending
        _atomic_write_json(auth_state_path, state)
    return _build_otp_response(normalized_email, expires_at=expires_at, otp_code=otp_code)


def verify_registration_otp(*, login_csv_path: Path, auth_state_path: Path, email: str, otp_code: str) -> dict[str, Any]:
    normalized_email = normalize_email_address(email, require_email=True)
    normalized_code = str(otp_code or "").strip()
    if len(normalized_code) != OTP_LENGTH or not normalized_code.isdigit():
        raise OtpValidationError(f"enter the {OTP_LENGTH}-digit code from your email")
    with STATE_LOCK:
        state = _cleanup_auth_state(_load_auth_state(auth_state_path))
        pending = state["pending_registrations"].get(normalized_email.lower())
        if not isinstance(pending, dict):
            raise PendingRegistrationError("no pending registration found for that email")
        expires_at = _parse_iso_datetime(str(pending.get("otp_expires_at", "")))
        if expires_at is None or expires_at < _utc_now():
            state["pending_registrations"].pop(normalized_email.lower(), None)
            _atomic_write_json(auth_state_path, state)
            raise OtpExpiredError("verification code expired. Request a new one")
        remaining = int(pending.get("otp_attempts_remaining") or OTP_MAX_ATTEMPTS)
        if remaining <= 0:
            state["pending_registrations"].pop(normalized_email.lower(), None)
            _atomic_write_json(auth_state_path, state)
            raise OtpValidationError("too many incorrect attempts. Start registration again")
        if not hmac.compare_digest(_hash_otp_code(normalized_email, normalized_code), str(pending.get("otp_hash") or "")):
            pending["otp_attempts_remaining"] = remaining - 1
            state["pending_registrations"][normalized_email.lower()] = pending
            _atomic_write_json(auth_state_path, state)
            raise OtpValidationError("incorrect verification code")
        ensure_login_csv_schema(login_csv_path)
        fieldnames, rows = _load_login_rows_with_fieldnames(login_csv_path)
        requested_user_id = str(pending.get("requested_user_id") or "").strip()
        final_user_id = _next_user_id(rows) if requested_user_id and any((row.get("user_id") or "").strip().lower() == requested_user_id.lower() for row in rows) else (requested_user_id or _next_user_id(rows))
        created_at = _utc_now_iso()
        with open(login_csv_path, "a", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=_merge_fieldnames(fieldnames))
            writer.writerow({
                "user_id": final_user_id, "created_at": created_at, "username": str(pending.get("username") or "").strip(), "password": str(pending.get("password_hash") or "").strip(),
                "email": normalized_email, "email_verified": "true", "password_updated_at": created_at, "name": str(pending.get("username") or "").strip(),
                "dbs": "0", "uob": "0", "ocbc": "0", "other_banks": "0", "synced_account_balance": "0", "synced_balance_reload_count": "0",
                "liability": "0", "income": "0", "estate": "0", "expense": "0", "age": "", "age_group": "", "country": "",
            })
        state["pending_registrations"].pop(normalized_email.lower(), None)
        _atomic_write_json(auth_state_path, state)
    return {"status": "ok", "user_id": final_user_id, "username": str(pending.get("username") or "").strip(), "email": normalized_email, "created_at": created_at}


def start_password_reset(*, login_csv_path: Path, auth_state_path: Path, identifier: str) -> dict[str, Any]:
    normalized_identifier = str(identifier or "").strip()
    if not normalized_identifier:
        raise LoginValidationError("email or username is required")
    ensure_login_csv_schema(login_csv_path)
    _, rows = _load_login_rows_with_fieldnames(login_csv_path)
    row = _find_user_row(rows, normalized_identifier)
    if row is None:
        return {"status": "otp_sent_if_account_exists"}
    email = normalize_email_address(str(row.get("email") or ""), require_email=True)
    with STATE_LOCK:
        state = _cleanup_auth_state(_load_auth_state(auth_state_path))
        existing = state["password_resets"].get(email.lower())
        if isinstance(existing, dict):
            _ensure_not_rate_limited(existing)
        otp_code = _generate_otp_code()
        expires_at = (_utc_now() + timedelta(minutes=OTP_EXPIRY_MINUTES)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        subject, body = _build_password_reset_email(otp_code)
        _send_email_via_smtp(email, subject, body)
        state["password_resets"][email.lower()] = {"user_id": (row.get("user_id") or "").strip(), "email": email, "otp_hash": _hash_otp_code(email, otp_code), "otp_expires_at": expires_at, "otp_sent_at": _utc_now_iso(), "otp_attempts_remaining": OTP_MAX_ATTEMPTS}
        _atomic_write_json(auth_state_path, state)
    return _build_otp_response(email, expires_at=expires_at)


def reset_password_with_otp(*, login_csv_path: Path, auth_state_path: Path, email: str, otp_code: str, new_password: str) -> dict[str, Any]:
    normalized_email = normalize_email_address(email, require_email=True)
    normalized_code = str(otp_code or "").strip()
    if len(normalized_code) != OTP_LENGTH or not normalized_code.isdigit():
        raise OtpValidationError(f"enter the {OTP_LENGTH}-digit code from your email")
    password_hash = hash_password(new_password)
    with STATE_LOCK:
        state = _cleanup_auth_state(_load_auth_state(auth_state_path))
        challenge = state["password_resets"].get(normalized_email.lower())
        if not isinstance(challenge, dict):
            raise OtpValidationError("no password reset request found for that email")
        expires_at = _parse_iso_datetime(str(challenge.get("otp_expires_at", "")))
        if expires_at is None or expires_at < _utc_now():
            state["password_resets"].pop(normalized_email.lower(), None)
            _atomic_write_json(auth_state_path, state)
            raise OtpExpiredError("password reset code expired. Request a new one")
        if not hmac.compare_digest(_hash_otp_code(normalized_email, normalized_code), str(challenge.get("otp_hash") or "")):
            challenge["otp_attempts_remaining"] = int(challenge.get("otp_attempts_remaining") or OTP_MAX_ATTEMPTS) - 1
            state["password_resets"][normalized_email.lower()] = challenge
            _atomic_write_json(auth_state_path, state)
            raise OtpValidationError("incorrect reset code")
        fieldnames, rows = _load_login_rows_with_fieldnames(login_csv_path)
        user_id = str(challenge.get("user_id") or "").strip()
        updated = False
        for row in rows:
            if (row.get("user_id") or "").strip() == user_id:
                row["password"] = password_hash
                row["password_updated_at"] = _utc_now_iso()
                row["email_verified"] = "true"
                updated = True
                break
        if not updated:
            raise OtpValidationError("account no longer exists")
        merged_fieldnames = _merge_fieldnames(fieldnames)
        with open(login_csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=merged_fieldnames)
            writer.writeheader()
            writer.writerows([{key: row.get(key, "") for key in merged_fieldnames} for row in rows])
        state["password_resets"].pop(normalized_email.lower(), None)
        _atomic_write_json(auth_state_path, state)
    return {"status": "ok", "email": normalized_email}


__all__ = [
    "AccountStateError", "LoginAuthError", "LoginValidationError", "OtpDeliveryError", "OtpExpiredError", "OtpValidationError",
    "PASSWORD_MIN_LENGTH", "PendingRegistrationError", "RegisterConflictError", "RegisterValidationError", "authenticate_login_user",
    "bootstrap_login_csv_from_assets_csv", "ensure_login_csv_schema", "hash_password", "normalize_email_address", "register_login_user",
    "resend_registration_otp", "reset_password_with_otp", "start_password_reset", "start_registration", "validate_password_strength",
    "validate_registration_fields", "verify_password", "verify_registration_otp",
]
