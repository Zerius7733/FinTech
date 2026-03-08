from typing import Dict, Any, List


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _resolve_risk_profile_value(profile: Any) -> float:
    if isinstance(profile, (int, float)):
        return _clamp(float(profile), 0.0, 100.0)

    value = str(profile or "").strip().lower()
    if value in {"low", "conservative"}:
        return 0.0
    if value in {"moderate", "medium", "balanced"}:
        return 50.0
    if value in {"high", "aggressive"}:
        return 100.0

    try:
        return _clamp(float(value), 0.0, 100.0)
    except ValueError:
        return 50.0


def _extract_position_values(user: Dict[str, Any]) -> List[float]:
    values: List[float] = []
    portfolio = user.get("portfolio", [])
    positions: List[Dict[str, Any]] = []
    if isinstance(portfolio, list):
        positions = portfolio
    elif isinstance(portfolio, dict):
        stocks = portfolio.get("stocks", []) if isinstance(portfolio.get("stocks", []), list) else []
        cryptos = portfolio.get("cryptos", []) if isinstance(portfolio.get("cryptos", []), list) else []
        positions = stocks + cryptos

    for position in positions:
        market_value = float(position.get("market_value", 0))
        if market_value > 0:
            values.append(market_value)
    return values


def calculate_diversification_metric(user: Dict[str, Any]) -> Dict[str, float]:
    risk_profile = _resolve_risk_profile_value(user.get("risk_profile", 50.0))
    values = _extract_position_values(user)
    n = len(values)
    if n <= 1:
        return {"diversification_hhi": 1.0 if n == 1 else 0.0, "diversification_score": 0.0}

    total = sum(values)
    if total <= 0:
        return {"diversification_hhi": 0.0, "diversification_score": 0.0}

    weights = [v / total for v in values]
    hhi = sum(w * w for w in weights)
    # Normalize concentration to a 0-100 diversification score.
    min_hhi = 1.0 / n
    normalized = (1.0 - hhi) / (1.0 - min_hhi)
    # Interpolate target from 1.0 (risk=0) to 0.7 (risk=100).
    target = 1.0 - (0.3 * (risk_profile / 100.0))
    score = max(0.0, min(100.0, (normalized / target) * 100.0))
    return {"diversification_hhi": round(hhi, 4), "diversification_score": round(score, 2)}
