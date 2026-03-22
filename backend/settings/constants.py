import os
from collections import defaultdict, deque
from pathlib import Path


# Static paths and app constants.
BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
JSON_DATA_DIR = DATA_DIR / "json"
CSV_DATA_DIR = DATA_DIR / "csv"
KNOWLEDGE_BASE_DIR = DATA_DIR / "knowledge_base"

USER_JSON_PATH = JSON_DATA_DIR / "user.json"
USER_PORTFOLIO_DIR = JSON_DATA_DIR / "user_portfolio"
CSV_PATH = CSV_DATA_DIR / "users.csv"
LOGIN_CSV_PATH = CSV_PATH
ASSETS_CSV_PATH = CSV_DATA_DIR / "users.csv"
STOCK_LISTINGS_CACHE_PATH = JSON_DATA_DIR / "stock_listings_cache.json"
COINGECKO_MARKETS_CACHE_PATH = JSON_DATA_DIR / "coingecko_markets_cache.json"
COMMODITY_MARKET_RANKINGS_PATH = JSON_DATA_DIR / "commodity_market_rankings.json"

COMMON_COMMODITY_ETFS = {"GLD", "SLV", "IAU", "SIVR", "PPLT", "PALL"}
COMMODITY_ETF_TO_UNDERLYING = {
    "GLD": "GC=F",
    "IAU": "GC=F",
    "SLV": "SI=F",
    "SIVR": "SI=F",
    "PPLT": "PL=F",
    "PALL": "PA=F",
}

STOCK_MARKET_REFRESH_INTERVAL_SECONDS = 30 * 60
CRYPTO_MARKET_REFRESH_TARGETS = (
    (1, 100),
    (2, 100),
)

YOUTUBE_HELP_VIDEO_URL = "https://youtu.be/1yTlB7DJeT8"
YOUTUBE_HELP_EMBED_URL = "https://www.youtube.com/embed/1yTlB7DJeT8"

SYNCED_ACCOUNT_BALANCE_FIELD = "synced_account_balance"
SYNCED_BALANCE_RELOAD_COUNT_FIELD = "synced_balance_reload_count"

OPENAPI_TAGS = [
    {"name": "Health", "description": "API health and readiness endpoints."},
    {"name": "Users", "description": "User retrieval endpoints."},
    {"name": "Recommendations", "description": "Personalized recommendation endpoints."},
    {"name": "Compatibility", "description": "User profile compatibility endpoints."},
    {"name": "Imports", "description": "Screenshot import and portfolio merge endpoints."},
    {"name": "Updates", "description": "Endpoints that run data update jobs."},
    {"name": "Market", "description": "Live market quote retrieval endpoints."},
    {"name": "Portfolio", "description": "User portfolio information endpoints."},
    {"name": "Retirement", "description": "Retirement planning and target allocation endpoints."},
]

# Env-derived settings and runtime-backed configuration.
INSIGHTS_RATE_LIMIT_ENABLED = os.getenv("INSIGHTS_RATE_LIMIT_ENABLED", "1").strip().lower() in {"1", "true", "yes", "on"}
INSIGHTS_RATE_LIMIT_WINDOW_SECONDS = max(1, int(os.getenv("INSIGHTS_RATE_LIMIT_WINDOW_SECONDS", "3600")))
INSIGHTS_RATE_LIMIT_MAX_REQUESTS = max(1, int(os.getenv("INSIGHTS_RATE_LIMIT_MAX_REQUESTS", "10")))
INSIGHTS_RATE_LIMIT_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
