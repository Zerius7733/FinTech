import csv
from pathlib import Path
from typing import Dict

from backend.stores.user_csv_store import CANONICAL_USER_CSV_FIELDS, ensure_users_csv_fieldnames


def _load_rows_with_fieldnames(csv_path: Path) -> tuple[list[str], list[Dict[str, str]]]:
    if not csv_path.exists():
        return CANONICAL_USER_CSV_FIELDS[:], []
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = ensure_users_csv_fieldnames(list(reader.fieldnames or []))
        return fieldnames, [row for row in reader]


def _write_rows(csv_path: Path, rows: list[Dict[str, str]], fieldnames: list[str]) -> None:
    fieldnames = ensure_users_csv_fieldnames(fieldnames)
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def _ensure_csv_exists(csv_path: Path) -> None:
    if csv_path.exists():
        return
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CANONICAL_USER_CSV_FIELDS)
        writer.writeheader()


def add_default_assets_row(csv_path: Path, user_id: str, name: str) -> None:
    _ensure_csv_exists(csv_path)
    fieldnames, rows = _load_rows_with_fieldnames(csv_path)
    existing = next((row for row in rows if (row.get("user_id") or "").strip().lower() == user_id.strip().lower()), None)
    if existing is None:
        existing = {key: "" for key in fieldnames}
        existing.update({"user_id": user_id, "name": name})
        rows.append(existing)
    else:
        if not (existing.get("name") or "").strip():
            existing["name"] = name
        for key in ("dbs", "uob", "ocbc", "other_banks", "synced_account_balance", "synced_balance_reload_count", "liability", "income", "estate", "expense"):
            if (existing.get(key) or "").strip() == "":
                existing[key] = "0"
        for key in ("username", "password", "email", "email_verified", "password_updated_at", "age", "age_group", "country", "investor_type", "currency"):
            if key not in existing:
                existing[key] = ""

    for key in ("dbs", "uob", "ocbc", "other_banks", "synced_account_balance", "synced_balance_reload_count", "liability", "income", "estate", "expense"):
        if (existing.get(key) or "").strip() == "":
            existing[key] = "0"

    _write_rows(csv_path, rows, fieldnames)
