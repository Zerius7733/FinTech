from typing import Any, Dict, Iterable, List, Tuple


ASSET_CLASS_ALIASES = {
    "stock": "stocks",
    "stocks": "stocks",
    "bond": "bonds",
    "bonds": "bonds",
    "fixed_income": "bonds",
    "fixed-income": "bonds",
    "real_asset": "real_assets",
    "real_assets": "real_assets",
    "real-asset": "real_assets",
    "real-assets": "real_assets",
    "crypto": "cryptos",
    "cryptos": "cryptos",
    "commodity": "commodities",
    "commodities": "commodities",
}


def resolve_asset_class(asset_class: str) -> str:
    normalized = (asset_class or "").strip().lower()
    bucket = ASSET_CLASS_ALIASES.get(normalized)
    if not bucket:
        raise ValueError("asset_class must be one of: stocks, bonds, real_assets, cryptos, commodities")
    return bucket


def iter_portfolio_positions(user: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    portfolio = user.get("portfolio", [])
    if isinstance(portfolio, list):
        for position in portfolio:
            if isinstance(position, dict):
                yield position
        return
    if isinstance(portfolio, dict):
        for key in ("stocks", "bonds", "real_assets", "cryptos", "commodities"):
            positions = portfolio.get(key, [])
            if not isinstance(positions, list):
                continue
            for position in positions:
                if isinstance(position, dict):
                    yield position


def is_commodity_position(
    position: Dict[str, Any],
    commodity_alias_symbols: Iterable[str],
    common_commodity_etfs: Iterable[str],
) -> bool:
    asset_type = str(position.get("asset_type", "")).strip().upper()
    symbol = str(position.get("symbol", "")).strip().upper()
    if asset_type == "COMMODITY":
        return True
    if symbol in set(commodity_alias_symbols):
        return True
    if symbol in set(common_commodity_etfs):
        return True
    if symbol.endswith("=F"):
        return True
    return False


def is_crypto_position(position: Dict[str, Any]) -> bool:
    symbol = str(position.get("symbol", "")).strip().upper()
    return symbol.endswith("-USD")


def get_positions_by_asset_class(
    user: Dict[str, Any],
    asset_class: str,
    commodity_alias_symbols: Iterable[str],
    common_commodity_etfs: Iterable[str],
) -> Tuple[str, List[Dict[str, Any]]]:
    bucket = resolve_asset_class(asset_class)
    portfolio = user.get("portfolio", {})
    if isinstance(portfolio, dict):
        positions = portfolio.get(bucket, [])
        if not isinstance(positions, list):
            positions = []
        return bucket, positions

    all_positions = list(iter_portfolio_positions(user))
    if bucket == "commodities":
        positions = [
            p
            for p in all_positions
            if is_commodity_position(p, commodity_alias_symbols, common_commodity_etfs)
        ]
    elif bucket == "cryptos":
        positions = [p for p in all_positions if is_crypto_position(p)]
    else:
        positions = [
            p
            for p in all_positions
            if not is_commodity_position(p, commodity_alias_symbols, common_commodity_etfs)
            and not is_crypto_position(p)
        ]
    return bucket, positions
