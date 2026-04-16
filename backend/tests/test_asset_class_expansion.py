import json
import tempfile
import unittest
from pathlib import Path
import sys
from unittest.mock import patch

from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import backend.app as app_module


class AssetClassExpansionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.user_path = Path(self.temp_dir.name) / "user.json"
        self.original_user_json_path = app_module.USER_JSON_PATH
        app_module.USER_JSON_PATH = self.user_path
        self._write_users({
            "u001": {
                "name": "Tester",
                "portfolio": {
                    "stocks": [],
                    "bonds": [],
                    "real_assets": [],
                    "cryptos": [],
                    "commodities": [],
                },
                "subscription_plan": "free",
            }
        })
        self.client = TestClient(app_module.app)

    def tearDown(self) -> None:
        app_module.USER_JSON_PATH = self.original_user_json_path
        self.temp_dir.cleanup()

    def _write_users(self, payload) -> None:
        with open(self.user_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)

    def _read_users(self):
        with open(self.user_path, "r", encoding="utf-8") as handle:
            return json.load(handle)

    @patch("backend.app.api.get_precomputed_bond_rankings")
    def test_bond_market_endpoint_returns_rows(self, mock_rankings) -> None:
        mock_rankings.return_value = [
            {
                "id": "vanguard-total-bond",
                "name": "Vanguard Total Bond Market ETF",
                "symbol": "BND",
                "current_price": 72.14,
                "market_cap": 101000000,
                "total_volume": 5000000,
                "price_change_percentage_24h": 0.21,
                "ath": 89.44,
            }
        ]
        response = self.client.get("/api/market/bonds?page=1&per_page=10")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload[0]["symbol"], "BND")

    @patch("backend.app.api.get_precomputed_real_asset_rankings")
    def test_real_asset_market_endpoint_returns_rows(self, mock_rankings) -> None:
        mock_rankings.return_value = [
            {
                "id": "vanguard-real-estate",
                "name": "Vanguard Real Estate ETF",
                "symbol": "VNQ",
                "current_price": 88.02,
                "market_cap": 88000000,
                "total_volume": 4100000,
                "price_change_percentage_24h": 0.54,
                "ath": 116.71,
            }
        ]
        response = self.client.get("/api/market/real-assets?page=1&per_page=10")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload[0]["symbol"], "VNQ")

    @patch("backend.app.api.fetch_latest_prices")
    def test_add_bond_holding_persists_to_bond_bucket(self, mock_prices) -> None:
        mock_prices.return_value = {"BND": 72.14}
        response = self.client.post(
            "/users/u001/financials/portfolio",
            json={"symbol": "BND", "asset_class": "bond", "qty": 5, "avg_price": 70.0, "name": "Vanguard Total Bond Market ETF"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["asset_class"], "bonds")

        users = self._read_users()
        self.assertEqual(users["u001"]["portfolio"]["bonds"][0]["symbol"], "BND")

    @patch("backend.app.api.fetch_latest_prices")
    def test_add_real_asset_holding_persists_to_real_asset_bucket(self, mock_prices) -> None:
        mock_prices.return_value = {"VNQ": 88.02}
        response = self.client.post(
            "/users/u001/financials/portfolio",
            json={"symbol": "VNQ", "asset_class": "real_asset", "qty": 3, "avg_price": 86.0, "name": "Vanguard Real Estate ETF"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["asset_class"], "real_assets")

        users = self._read_users()
        self.assertEqual(users["u001"]["portfolio"]["real_assets"][0]["symbol"], "VNQ")


if __name__ == "__main__":
    unittest.main()
