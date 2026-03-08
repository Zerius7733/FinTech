from typing import Dict, Any, List

RISK_PROFILE_DIVERSIFICATION_TARGET = {
    "Low": 1.0,
    "Moderate": 0.8,
    "High": 0.7,
}


def _resolve_profile(profile: str) -> str:
    value = (profile or "").strip().title()
    return value if value in RISK_PROFILE_DIVERSIFICATION_TARGET else "Moderate"


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
    profile = _resolve_profile(str(user.get("risk_profile", "Moderate")))
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
    # Riskier profiles are allowed to hold more concentrated portfolios.
    target = RISK_PROFILE_DIVERSIFICATION_TARGET[profile]
    score = max(0.0, min(100.0, (normalized / target) * 100.0))
    return {"diversification_hhi": round(hhi, 4), "diversification_score": round(score, 2)}
