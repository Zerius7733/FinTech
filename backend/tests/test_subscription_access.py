import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend import app as app_module
from backend.services.subscription_registry import (
    is_premium_subscription,
    normalize_subscription_plan,
    subscription_payload,
)


class SubscriptionAccessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app_module.app)

    def test_subscription_helper_defaults_to_free(self) -> None:
        self.assertEqual(normalize_subscription_plan(None), "free")
        self.assertEqual(normalize_subscription_plan("premium"), "premium")
        self.assertTrue(is_premium_subscription("paid"))

        payload = subscription_payload({"subscription_plan": "premium"})
        self.assertTrue(payload["is_premium"])
        self.assertEqual(payload["plan"], "premium")

    def test_user_payload_exposes_normalized_subscription(self) -> None:
        with patch.object(
            app_module,
            "_read_users_data",
            return_value={
                "u123": {
                    "name": "Ada",
                    "subscription_plan": "premium",
                    "portfolio": {"stocks": [], "cryptos": [], "commodities": []},
                }
            },
        ):
            response = self.client.get("/users/u123")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["subscription"]["plan"], "premium")
        self.assertEqual(body["user"]["subscription_plan"], "premium")

    def test_free_user_is_blocked_from_market_insights(self) -> None:
        with patch.object(
            app_module,
            "_read_users_data",
            return_value={"u123": {"name": "Ada", "subscription_plan": "free"}},
        ), patch.object(app_module, "_enforce_insights_rate_limit", return_value=None), patch.object(
            app_module.api,
            "build_insights",
            new=AsyncMock(
                return_value={
                    "type": "stock",
                    "symbol": "AAPL",
                    "name": "Apple",
                    "period": {"months": 3},
                    "metrics": {},
                    "notable_moves": [],
                    "drivers": [],
                    "narrative": "",
                    "tldr": [],
                    "conclusion": "",
                    "disclaimer": "",
                    "citations": [],
                    "warnings": [],
                }
            ),
        ):
            response = self.client.get(
                "/api/insights",
                params={"type": "stock", "symbol": "AAPL", "months": 3, "user_id": "u123"},
            )

        self.assertEqual(response.status_code, 402)
        detail = response.json()["detail"]
        self.assertEqual(detail["required_plan"], "premium")
        self.assertIn("upgrade_url", detail)

    def test_premium_user_can_fetch_market_insights(self) -> None:
        with patch.object(
            app_module,
            "_read_users_data",
            return_value={"u123": {"name": "Ada", "subscription_plan": "premium"}},
        ), patch.object(app_module, "_enforce_insights_rate_limit", return_value=None), patch.object(
            app_module.api,
            "build_insights",
            new=AsyncMock(
                return_value={
                    "type": "stock",
                    "symbol": "AAPL",
                    "name": "Apple",
                    "period": {"months": 3},
                    "metrics": {},
                    "notable_moves": [],
                    "drivers": [],
                    "narrative": "",
                    "tldr": [],
                    "conclusion": "",
                    "disclaimer": "",
                    "citations": [],
                    "warnings": [],
                }
            ),
        ):
            response = self.client.get(
                "/api/insights",
                params={"type": "stock", "symbol": "AAPL", "months": 3, "user_id": "u123"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["period"]["months"], 3)

    def test_subscription_update_endpoint_persists_plan(self) -> None:
        stored = {"u123": {"name": "Ada", "subscription_plan": "free"}}

        with patch.object(app_module, "_read_users_data", return_value=stored), patch.object(
            app_module,
            "_write_users_data",
        ) as write_mock:
            response = self.client.post("/users/u123/subscription", json={"plan": "premium"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["subscription"]["plan"], "premium")
        written_data = write_mock.call_args.args[0]
        self.assertIn("u123", written_data)
        self.assertEqual(written_data["u123"]["subscription_plan"], "premium")


if __name__ == "__main__":
    unittest.main()
