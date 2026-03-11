from typing import Any, Dict

from pydantic import BaseModel


class CoinListingResponse(BaseModel):
    id: str
    name: str
    symbol: str
    image: str | None = None
    market_cap_rank: float | int | None = None
    current_price: float | int | None = None
    market_cap: float | int | None = None
    total_volume: float | int | None = None
    price_change_percentage_24h: float | int | None = None
    price_change_percentage_7d: float | int | None = None
    circulating_supply: float | int | None = None
    ath: float | int | None = None
    ath_change_percentage: float | int | None = None


class StockListingResponse(BaseModel):
    id: str
    name: str
    symbol: str
    current_price: float | int | None = None
    market_cap: float | int | None = None
    total_volume: float | int | None = None
    price_change_percentage_24h: float | int | None = None
    ath: float | int | None = None


class AssetResolveResponse(BaseModel):
    query: str
    symbol: str
    name: str
    category: str
    source: str


class InsightsResponse(BaseModel):
    type: str
    symbol: str
    name: str
    period: Dict[str, Any]
    metrics: Dict[str, Any]
    notable_moves: list[Dict[str, Any]]
    drivers: list[Dict[str, Any]]
    narrative: str
    tldr: list[str]
    conclusion: str
    disclaimer: str
    citations: list[Dict[str, Any]]
    warnings: list[str]
