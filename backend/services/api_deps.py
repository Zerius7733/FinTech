from pathlib import Path
from typing import Any, Dict

from backend.services.auth_registry import AccountStateError
from backend.services.auth_registry import LoginAuthError
from backend.services.auth_registry import LoginValidationError
from backend.services.auth_registry import OtpDeliveryError
from backend.services.auth_registry import OtpExpiredError
from backend.services.auth_registry import OtpValidationError
from backend.services.auth_registry import PendingRegistrationError
from backend.services.auth_registry import RegisterConflictError
from backend.services.auth_registry import RegisterValidationError


COMMODITY_ALIAS_TO_SYMBOL = {
    "GOLD": "GC=F",
    "SILVER": "SI=F",
    "OIL": "CL=F",
    "WTI": "CL=F",
    "BRENT": "BZ=F",
    "NATGAS": "NG=F",
    "COPPER": "HG=F",
    "PLATINUM": "PL=F",
    "PALLADIUM": "PA=F",
}

DEFAULT_VISION_MODEL = "gpt-4.1-mini"


def add_default_assets_row(*args: Any, **kwargs: Any) -> Any:
    from backend.services.assets_registry import add_default_assets_row as impl
    return impl(*args, **kwargs)


def add_default_user_profile(*args: Any, **kwargs: Any) -> Any:
    from backend.services.user_profile_registry import add_default_user_profile as impl
    return impl(*args, **kwargs)


def ensure_user_subscription(*args: Any, **kwargs: Any) -> Any:
    from backend.services.subscription_registry import ensure_user_subscription as impl
    return impl(*args, **kwargs)


def authenticate_login_user(*args: Any, **kwargs: Any) -> Any:
    from backend.services.auth_registry import authenticate_login_user as impl
    return impl(*args, **kwargs)


def hash_password(*args: Any, **kwargs: Any) -> Any:
    from backend.services.auth_registry import hash_password as impl
    return impl(*args, **kwargs)


def ensure_login_csv_schema(*args: Any, **kwargs: Any) -> Any:
    from backend.services.auth_registry import ensure_login_csv_schema as impl
    return impl(*args, **kwargs)


def normalize_email_address(*args: Any, **kwargs: Any) -> Any:
    from backend.services.auth_registry import normalize_email_address as impl
    return impl(*args, **kwargs)


def register_login_user(*args: Any, **kwargs: Any) -> Any:
    from backend.services.auth_registry import register_login_user as impl
    return impl(*args, **kwargs)


def resend_registration_otp(*args: Any, **kwargs: Any) -> Any:
    from backend.services.auth_registry import resend_registration_otp as impl
    return impl(*args, **kwargs)


def reset_password_with_otp(*args: Any, **kwargs: Any) -> Any:
    from backend.services.auth_registry import reset_password_with_otp as impl
    return impl(*args, **kwargs)


def start_password_reset(*args: Any, **kwargs: Any) -> Any:
    from backend.services.auth_registry import start_password_reset as impl
    return impl(*args, **kwargs)


def start_registration(*args: Any, **kwargs: Any) -> Any:
    from backend.services.auth_registry import start_registration as impl
    return impl(*args, **kwargs)


def validate_password_strength(*args: Any, **kwargs: Any) -> Any:
    from backend.services.auth_registry import validate_password_strength as impl
    return impl(*args, **kwargs)


def validate_registration_fields(*args: Any, **kwargs: Any) -> Any:
    from backend.services.auth_registry import validate_registration_fields as impl
    return impl(*args, **kwargs)


def verify_registration_otp(*args: Any, **kwargs: Any) -> Any:
    from backend.services.auth_registry import verify_registration_otp as impl
    return impl(*args, **kwargs)


def normalize_users_data(*args: Any, **kwargs: Any) -> Any:
    from backend.services.user_profile_registry import normalize_users_data as impl
    return impl(*args, **kwargs)


def rewrite_user_profiles_with_order(*args: Any, **kwargs: Any) -> Any:
    from backend.services.user_profile_registry import rewrite_user_profiles_with_order as impl
    return impl(*args, **kwargs)


def is_premium_subscription(*args: Any, **kwargs: Any) -> Any:
    from backend.services.subscription_registry import is_premium_subscription as impl
    return impl(*args, **kwargs)


def normalize_subscription_plan(*args: Any, **kwargs: Any) -> Any:
    from backend.services.subscription_registry import normalize_subscription_plan as impl
    return impl(*args, **kwargs)


def subscription_payload(*args: Any, **kwargs: Any) -> Any:
    from backend.services.subscription_registry import subscription_payload as impl
    return impl(*args, **kwargs)


def calculate_user_wellness(*args: Any, **kwargs: Any) -> Any:
    from backend.services.wealth_wellness.engine import calculate_user_wellness as impl
    return impl(*args, **kwargs)


def update_wellness_file(*args: Any, **kwargs: Any) -> Any:
    from backend.services.wealth_wellness.engine import update_wellness_file as impl
    return impl(*args, **kwargs)


def build_retirement_plan(*args: Any, **kwargs: Any) -> Any:
    from backend.services.retirement import build_retirement_plan as impl
    return impl(*args, **kwargs)


def build_peer_benchmarks(*args: Any, **kwargs: Any) -> Any:
    from backend.services.peer_benchmarking import build_peer_benchmarks as impl
    return impl(*args, **kwargs)


def build_portfolio_impact(*args: Any, **kwargs: Any) -> Any:
    from backend.services.portfolio_impact import build_portfolio_impact as impl
    return impl(*args, **kwargs)


def build_financial_planning_overview(*args: Any, **kwargs: Any) -> Any:
    from backend.services.financial_planning import build_financial_planning_overview as impl
    return impl(*args, **kwargs)


def build_financial_planning_scenario(*args: Any, **kwargs: Any) -> Any:
    from backend.services.financial_planning import build_financial_planning_scenario as impl
    return impl(*args, **kwargs)


def get_positions_by_asset_class(*args: Any, **kwargs: Any) -> Any:
    from backend.services.portfolio_selector import get_positions_by_asset_class as impl
    return impl(*args, **kwargs)


def generate_gpt_recommendations(*args: Any, **kwargs: Any) -> Any:
    from backend.services.recommendation import generate_gpt_recommendations as impl
    return impl(*args, **kwargs)


def generate_user_recommendations(*args: Any, **kwargs: Any) -> Any:
    from backend.services.recommendation import generate_user_recommendations as impl
    return impl(*args, **kwargs)


def fetch_commodity_price(*args: Any, **kwargs: Any) -> Any:
    from backend.commodity_price_retriever import fetch_commodity_price as impl
    return impl(*args, **kwargs)


def fetch_coingecko_coin_listings(*args: Any, **kwargs: Any) -> Any:
    from backend.coingecko_market_retriever import fetch_coingecko_coin_listings as impl
    return impl(*args, **kwargs)


def fetch_crypto_price(*args: Any, **kwargs: Any) -> Any:
    from backend.crypto_price_retriever import fetch_crypto_price as impl
    return impl(*args, **kwargs)


def fetch_latest_prices(*args: Any, **kwargs: Any) -> Any:
    from backend.stock_price_updater import fetch_latest_prices as impl
    return impl(*args, **kwargs)


def fetch_stock_listings(*args: Any, **kwargs: Any) -> Any:
    from backend.stock_market_retriever import fetch_stock_listings as impl
    return impl(*args, **kwargs)


def fetch_top_stock_listings_from_yfinance(*args: Any, **kwargs: Any) -> Any:
    from backend.stock_market_retriever import fetch_top_stock_listings_from_yfinance as impl
    return impl(*args, **kwargs)


def rebuild_stock_listings_cache_from_nasdaq(*args: Any, **kwargs: Any) -> Any:
    from backend.stock_market_retriever_nasdaq import rebuild_stock_listings_cache_from_nasdaq as impl
    return impl(*args, **kwargs)


def update_stock_listings_cache_prices_file(*args: Any, **kwargs: Any) -> Any:
    from backend.stock_price_updater import update_stock_listings_cache_prices_file as impl
    return impl(*args, **kwargs)


def update_stock_prices_file(*args: Any, **kwargs: Any) -> Any:
    from backend.stock_price_updater import update_stock_prices_file as impl
    return impl(*args, **kwargs)


def update_assets_file(*args: Any, **kwargs: Any) -> Any:
    from backend.users_assets_update import update_assets_file as impl
    return impl(*args, **kwargs)


def get_precomputed_commodity_rankings(*args: Any, **kwargs: Any) -> Any:
    from backend.services.commodity_market_pipeline import get_precomputed_commodity_rankings as impl
    return impl(*args, **kwargs)


def refresh_commodity_market_data(*args: Any, **kwargs: Any) -> Any:
    from backend.services.commodity_market_pipeline import refresh_commodity_market_data as impl
    return impl(*args, **kwargs)


def get_precomputed_stock_rankings(*args: Any, **kwargs: Any) -> Any:
    from backend.services.stock_market_pipeline import get_precomputed_stock_rankings as impl
    return impl(*args, **kwargs)


def get_precomputed_bond_rankings(*args: Any, **kwargs: Any) -> Any:
    from backend.services.bond_market_pipeline import get_precomputed_bond_rankings as impl
    return impl(*args, **kwargs)


def refresh_bond_market_data(*args: Any, **kwargs: Any) -> Any:
    from backend.services.bond_market_pipeline import refresh_bond_market_data as impl
    return impl(*args, **kwargs)


def get_precomputed_real_asset_rankings(*args: Any, **kwargs: Any) -> Any:
    from backend.services.real_asset_market_pipeline import get_precomputed_real_asset_rankings as impl
    return impl(*args, **kwargs)


def refresh_real_asset_market_data(*args: Any, **kwargs: Any) -> Any:
    from backend.services.real_asset_market_pipeline import refresh_real_asset_market_data as impl
    return impl(*args, **kwargs)


def refresh_stock_market_data(*args: Any, **kwargs: Any) -> Any:
    from backend.services.stock_market_pipeline import refresh_stock_market_data as impl
    return impl(*args, **kwargs)


async def resolve_asset(*args: Any, **kwargs: Any) -> Any:
    from backend.services.asset_resolver import resolve_asset as impl
    return await impl(*args, **kwargs)


def create_pending_import(*args: Any, **kwargs: Any) -> Any:
    from backend.services.screenshot_importer import create_pending_import as impl
    return impl(*args, **kwargs)


def parse_screenshot_with_llm(*args: Any, **kwargs: Any) -> Any:
    from backend.services.screenshot_importer import parse_screenshot_with_llm as impl
    return impl(*args, **kwargs)


def confirm_import(*args: Any, **kwargs: Any) -> Any:
    from backend.services.screenshot_importer import confirm_import as impl
    return impl(*args, **kwargs)


def merge_holdings_into_user(*args: Any, **kwargs: Any) -> Any:
    from backend.services.screenshot_importer import merge_holdings_into_user as impl
    return impl(*args, **kwargs)


class InsightError(Exception):
    pass


async def build_insights(*args: Any, **kwargs: Any) -> Dict[str, Any]:
    from backend.services.insights_service import InsightError as ImplInsightError
    from backend.services.insights_service import build_insights as impl

    try:
        return await impl(*args, **kwargs)
    except ImplInsightError as exc:
        err = InsightError(str(exc))
        status_code = getattr(exc, "status_code", 500)
        setattr(err, "status_code", status_code)
        raise err from exc


def evaluate_compatibility(*args: Any, **kwargs: Any) -> Any:
    from backend.services.compatibility import evaluate_compatibility as impl
    return impl(*args, **kwargs)


def synthesize_compatibility_with_llm(*args: Any, **kwargs: Any) -> Any:
    from backend.services.compatibility import synthesize_compatibility_with_llm as impl
    return impl(*args, **kwargs)


__all__ = [
    "COMMODITY_ALIAS_TO_SYMBOL",
    "DEFAULT_VISION_MODEL",
    "InsightError",
    "AccountStateError",
    "LoginAuthError",
    "LoginValidationError",
    "OtpDeliveryError",
    "OtpExpiredError",
    "OtpValidationError",
    "PendingRegistrationError",
    "RegisterConflictError",
    "RegisterValidationError",
    "add_default_assets_row",
    "add_default_user_profile",
    "authenticate_login_user",
    "build_insights",
    "build_financial_planning_overview",
    "build_financial_planning_scenario",
    "build_peer_benchmarks",
    "build_portfolio_impact",
    "build_retirement_plan",
    "calculate_user_wellness",
    "confirm_import",
    "create_pending_import",
    "ensure_login_csv_schema",
    "evaluate_compatibility",
    "fetch_coingecko_coin_listings",
    "fetch_commodity_price",
    "fetch_crypto_price",
    "fetch_latest_prices",
    "fetch_stock_listings",
    "fetch_top_stock_listings_from_yfinance",
    "generate_gpt_recommendations",
    "generate_user_recommendations",
    "get_positions_by_asset_class",
    "get_precomputed_commodity_rankings",
    "get_precomputed_stock_rankings",
    "merge_holdings_into_user",
    "normalize_email_address",
    "normalize_users_data",
    "parse_screenshot_with_llm",
    "hash_password",
    "rebuild_stock_listings_cache_from_nasdaq",
    "refresh_commodity_market_data",
    "refresh_stock_market_data",
    "register_login_user",
    "resend_registration_otp",
    "reset_password_with_otp",
    "resolve_asset",
    "rewrite_user_profiles_with_order",
    "start_password_reset",
    "start_registration",
    "synthesize_compatibility_with_llm",
    "update_assets_file",
    "update_stock_listings_cache_prices_file",
    "update_stock_prices_file",
    "update_wellness_file",
    "validate_password_strength",
    "validate_registration_fields",
    "verify_registration_otp",
]
