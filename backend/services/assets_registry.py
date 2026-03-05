import csv
from pathlib import Path
from typing import Dict


def _load_rows(csv_path: Path) -> list[Dict[str, str]]:
    if not csv_path.exists():
        return []
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return [row for row in reader]


def _ensure_csv_exists(csv_path: Path) -> None:
    if csv_path.exists():
        return
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["user_id", "name", "dbs", "uob", "ocbc", "liability", "income", "estate", "expense"],
        )
        writer.writeheader()


def add_default_assets_row(csv_path: Path, user_id: str, name: str) -> None:
    _ensure_csv_exists(csv_path)
    rows = _load_rows(csv_path)
    if any((row.get("user_id") or "").strip().lower() == user_id.strip().lower() for row in rows):
        return

    with open(csv_path, "a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["user_id", "name", "dbs", "uob", "ocbc", "liability", "income", "estate", "expense"],
        )
        writer.writerow(
            {
                "user_id": user_id,
                "name": name,
                "dbs": "0",
                "uob": "0",
                "ocbc": "0",
                "liability": "0",
                "income": "0",
                "estate": "0",
                "expense": "0",
            }
        )
