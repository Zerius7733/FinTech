import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict


BENCHMARK_DIR = Path(__file__).resolve().parent.parent / "data" / "json" / "benchmarks"
INCOME_BENCHMARK_PATH = BENCHMARK_DIR / "sg_income_by_age.json"
NET_WORTH_BENCHMARK_PATH = BENCHMARK_DIR / "sg_net_worth_by_age.json"


def _load_json(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_income_benchmarks() -> Dict[str, Any]:
    return _load_json(INCOME_BENCHMARK_PATH)


@lru_cache(maxsize=1)
def load_net_worth_benchmarks() -> Dict[str, Any]:
    return _load_json(NET_WORTH_BENCHMARK_PATH)


def _get_age_band(age: int, dataset: Dict[str, Any]) -> Dict[str, Any]:
    for band in dataset.get("bands", []):
        min_age = int(band.get("min_age", 0))
        max_age = int(band.get("max_age", 200))
        if min_age <= age <= max_age:
            return band
    raise ValueError(f"no benchmark band configured for age {age}")


def _interpolate_percentile(value: float, band: Dict[str, Any]) -> int:
    anchors = [
        (1, min(0.0, float(band.get("p10", 0.0) or 0.0) * 0.5)),
        (10, float(band.get("p10", 0.0) or 0.0)),
        (25, float(band.get("p25", 0.0) or 0.0)),
        (50, float(band.get("p50", 0.0) or 0.0)),
        (75, float(band.get("p75", 0.0) or 0.0)),
        (90, float(band.get("p90", 0.0) or 0.0)),
        (99, float(band.get("p90", 0.0) or 0.0) * 1.7),
    ]

    numeric_value = float(value or 0.0)

    if numeric_value <= anchors[0][1]:
        return 1

    for (left_pct, left_value), (right_pct, right_value) in zip(anchors, anchors[1:]):
        if numeric_value <= right_value:
            if right_value <= left_value:
                return int(round(right_pct))
            share = (numeric_value - left_value) / (right_value - left_value)
            return int(round(left_pct + (right_pct - left_pct) * share))

    return 99


def _comparison_label(percentile: int) -> str:
    if percentile >= 75:
        return "well above the median"
    if percentile >= 60:
        return "above the median"
    if percentile >= 40:
        return "around the median"
    if percentile >= 25:
        return "below the median"
    return "well below the median"


def _build_metric_result(
    *,
    value: float,
    age: int,
    dataset: Dict[str, Any],
    subject_label: str,
    source_label: str,
) -> Dict[str, Any]:
    band = _get_age_band(age, dataset)
    percentile = _interpolate_percentile(value, band)
    median = float(band.get("p50", 0.0) or 0.0)
    p25 = float(band.get("p25", 0.0) or 0.0)
    p75 = float(band.get("p75", 0.0) or 0.0)
    placement = _comparison_label(percentile)
    if percentile >= 50:
        headline = f"You are ahead of about {percentile}% of Singapore residents in your age band."
    else:
        headline = f"You are around the {percentile}th percentile among Singapore residents in your age band."
    return {
        "user_value": round(float(value or 0.0), 2),
        "age_band": band.get("label"),
        "percentile": percentile,
        "median": round(median, 2),
        "p25": round(p25, 2),
        "p75": round(p75, 2),
        "comparison": placement,
        "headline": headline,
        "insight": (
            f"Your {subject_label} is {placement} for ages {band.get('label')}. "
            f"The reference median is {median:,.0f} SGD."
        ),
        "source": source_label,
    }


def build_peer_benchmarks(user: Dict[str, Any]) -> Dict[str, Any]:
    raw_age = user.get("age")
    if raw_age is None:
        raise ValueError("user age is required before peer benchmarking can be calculated")

    age = int(raw_age)
    if age < 18 or age > 100:
        raise ValueError("user age must be between 18 and 100")

    income_value = float(user.get("income", 0.0) or 0.0)
    net_worth_value = float(user.get("net_worth", 0.0) or 0.0)

    income_dataset = load_income_benchmarks()
    net_worth_dataset = load_net_worth_benchmarks()

    income_result = _build_metric_result(
        value=income_value,
        age=age,
        dataset=income_dataset,
        subject_label="income",
        source_label="Singapore official income reference bands",
    )
    net_worth_result = _build_metric_result(
        value=net_worth_value,
        age=age,
        dataset=net_worth_dataset,
        subject_label="net worth",
        source_label="Singapore reference net-worth bands",
    )

    return {
        "country": "Singapore",
        "currency": "SGD",
        "age": age,
        "income": income_result,
        "net_worth": net_worth_result,
        "summary": [
            income_result["headline"],
            net_worth_result["headline"],
        ],
    }
