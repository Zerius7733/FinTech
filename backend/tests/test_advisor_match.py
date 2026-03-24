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


class AdvisorMatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.user_path = Path(self.temp_dir.name) / "user.json"
        self.original_user_json_path = app_module.USER_JSON_PATH
        app_module.USER_JSON_PATH = self.user_path
        self._write_users(
            {
                "u001": {
                    "name": "Tester",
                    "country": "Singapore",
                    "subscription_plan": "free",
                    "portfolio": {"stocks": [], "bonds": [], "real_assets": [], "cryptos": [], "commodities": []},
                    "shared_goals": [],
                    "household_profile": {"mode": "personal"},
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

    def test_create_advisor_match_request_persists(self) -> None:
        response = self.client.post(
            "/users/u001/advisor-match",
            json={
                "institution_id": "aia-sg",
                "institution_name": "AIA Singapore",
                "product_id": "aia-healthshield-gold-max",
                "product_name": "AIA HealthShield Gold Max",
                "notes": "Interested in hospital coverage and family protection.",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["request"]["institution_name"], "AIA Singapore")
        self.assertEqual(payload["request"]["status"], "requested")

        persisted = self._read_users()
        self.assertEqual(len(persisted["u001"]["advisor_match_requests"]), 1)
        self.assertEqual(
            persisted["u001"]["advisor_match_requests"][0]["product_name"],
            "AIA HealthShield Gold Max",
        )


if __name__ == "__main__":
    unittest.main()
