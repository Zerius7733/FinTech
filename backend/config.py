import os
import time
from collections import defaultdict, deque
from typing import Any

from dotenv import load_dotenv
from fastapi import HTTPException

import backend.constants as const

load_dotenv()


def parse_csv_env(name: str, default: str) -> list[str]:
    return [value.strip() for value in os.getenv(name, default).split(",") if value.strip()]


def build_allowed_origin_regex() -> str:
    regex_values = [
        os.getenv("ALLOWED_ORIGIN_REGEX", "").strip(),
        os.getenv("ALLOWED_EXTENSION_ORIGIN_REGEX", r"chrome-extension://.*").strip(),
    ]
    parts = [value for value in regex_values if value]
    return "|".join(f"(?:{value})" for value in parts) if parts else ""


def enforce_insights_rate_limit(subject: str) -> None:
    if not const.INSIGHTS_RATE_LIMIT_ENABLED:
        return
    now = time.time()
    bucket = const.INSIGHTS_RATE_LIMIT_BUCKETS[subject]
    while bucket and now - bucket[0] > const.INSIGHTS_RATE_LIMIT_WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= const.INSIGHTS_RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail=(
                "insight rate limit reached. "
                f"Try again after {const.INSIGHTS_RATE_LIMIT_WINDOW_SECONDS} seconds."
            ),
        )
    bucket.append(now)
