from typing import Any, Dict

from backend.services.screenshot_importer import DEFAULT_VISION_MODEL
from pydantic import AliasChoices, BaseModel, Field


class UserRiskUpdateRequest(BaseModel):
    user_id: str
    risk_profile: float | str = Field(
        validation_alias=AliasChoices("risk_profile", "risk_appetite", "risk_appetitie")
    )


class UserAgeUpdateRequest(BaseModel):
    user_id: str
    age: int = Field(..., ge=18, le=100)


class RetirementPlanRequest(BaseModel):
    retirement_age: int = Field(..., ge=19, le=100)
    monthly_expenses: float = Field(..., ge=0)
    essential_monthly_expenses: float = Field(..., ge=0)


class ManualAssetCreateRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    category: str = Field(..., min_length=1, max_length=40)
    value: float = Field(..., ge=0)
    symbol: str | None = Field(default=None, max_length=20)


class PortfolioHoldingCreateRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)
    asset_class: str = Field(..., min_length=1, max_length=20)
    qty: float = Field(1.0, gt=0)
    avg_price: float | None = Field(default=None, ge=0)
    name: str | None = Field(default=None, max_length=80)


class LiabilityItemCreateRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    amount: float = Field(..., ge=0)
    is_mortgage: bool = False


class IncomeStreamCreateRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    monthly_amount: float = Field(..., ge=0)


class SyncedBalanceUpdateRequest(BaseModel):
    balance: float = Field(..., ge=0)


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str | None = None


class RegisterPrecheckRequest(BaseModel):
    username: str
    password: str
    email: str
    user_id: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class SurveyProfileUpdateRequest(BaseModel):
    user_id: str
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    email: str | None = None
    country: str | None = None
    age: int | None = Field(default=None, ge=18, le=100)
    age_group: str | None = None


class UserProfileDetailsUpdateRequest(BaseModel):
    user_id: str
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    country: str | None = None
    investor_type: str | None = None
    currency: str | None = None
    password: str | None = None


class ScreenshotMergeRequest(BaseModel):
    holdings: list[Dict[str, Any]]


class ScreenshotParseRequest(BaseModel):
    image_base64: str
    model: str = DEFAULT_VISION_MODEL
    page_text: str | None = None


class ScreenshotHolding(BaseModel):
    asset_class: str
    symbol: str
    qty: float | None = None
    avg_price: float | None = None
    current_price: float | None = None
    market_value: float | None = None
    name: str | None = None
    confidence: float | None = None


class ScreenshotConfirmRequest(BaseModel):
    import_id: str
    holdings: list[ScreenshotHolding]


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
