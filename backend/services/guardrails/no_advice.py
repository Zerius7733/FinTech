import re
from typing import List, Tuple


FORBIDDEN_PATTERNS = [
    r"\bbuy\b",
    r"\bsell\b",
    r"\bhold\b",
    r"\bshould\b",
    r"\brecommend\b",
    r"\brecommendation\b",
    r"\bundervalued\b",
    r"\bovervalued\b",
    r"\btarget price\b",
    r"\bopportunity\b",
    r"\bstrong buy\b",
    r"\bstrong sell\b",
    r"\bgo long\b",
    r"\bgo short\b",
]


def validate_text(text: str) -> Tuple[bool, List[str]]:
    reasons: List[str] = []
    content = text or ""
    for pattern in FORBIDDEN_PATTERNS:
        if re.search(pattern, content, flags=re.IGNORECASE):
            reasons.append(f"forbidden phrase matched: {pattern}")
    return (len(reasons) == 0, reasons)
