import csv
from pathlib import Path
from typing import Dict

USER_CSV_FIELDS = [
    "user_id",
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


def _load_rows(csv_path: Path) -> list[Dict[str, str]]:
    if not csv_path.exists():
        return []
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return [row for row in reader]


def _write_rows(csv_path: Path, rows: list[Dict[str, str]]) -> None:
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=USER_CSV_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in USER_CSV_FIELDS})


def _ensure_csv_exists(csv_path: Path) -> None:
    if csv_path.exists():
        return
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=USER_CSV_FIELDS)
        writer.writeheader()


def add_default_assets_row(csv_path: Path, user_id: str, name: str) -> None:
    _ensure_csv_exists(csv_path)
    rows = _load_rows(csv_path)
    existing = next((row for row in rows if (row.get("user_id") or "").strip().lower() == user_id.strip().lower()), None)
    if existing is None:
        existing = {
            "user_id": user_id,
            "username": "",
            "password": "",
            "email": "",
            "name": name,
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
        rows.append(existing)
    else:
        if not (existing.get("name") or "").strip():
            existing["name"] = name
        for key in ("dbs", "uob", "ocbc", "other_banks", "liability", "income", "estate", "expense"):
            if (existing.get(key) or "").strip() == "":
                existing[key] = "0"
        for key in ("username", "password", "email", "age", "age_group", "country"):
            if key not in existing:
                existing[key] = ""

    _write_rows(csv_path, rows)
