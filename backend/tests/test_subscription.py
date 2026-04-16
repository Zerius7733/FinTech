import json
import tempfile
import unittest
from pathlib import Path
import sys

from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import backend.app as app_module


class SubscriptionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.user_path = Path(self.temp_dir.name) / "user.json"
        self.original_user_json_path = app_module.USER_JSON_PATH
        app_module.USER_JSON_PATH = self.user_path
        self._write_users(
            {
                "u001": {
                    "name": "Tester",
                    "portfolio": {"stocks": [], "cryptos": [], "commodities": []},
                    "subscription_plan": "free",
                }
            }
        )
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

    def test_get_user_includes_subscription_payload(self) -> None:
        response = self.client.get("/users/u001")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["subscription"]["plan"], "free")
        self.assertFalse(payload["subscription"]["is_premium"])

    def test_update_user_subscription_persists_plan(self) -> None:
        response = self.client.post("/users/u001/subscription", json={"plan": "premium"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["subscription"]["plan"], "premium")
        self.assertTrue(payload["subscription"]["is_premium"])

        persisted = self._read_users()
        self.assertEqual(persisted["u001"]["subscription_plan"], "premium")

    def test_free_plan_blocks_market_insights(self) -> None:
        response = self.client.get("/api/insights?type=stock&symbol=AAPL&months=3&user_id=u001")
        self.assertEqual(response.status_code, 402)
        payload = response.json()
        self.assertEqual(payload["detail"]["required_plan"], "premium")
        self.assertEqual(payload["detail"]["upgrade_url"], "/pricing")


if __name__ == "__main__":
    unittest.main()
