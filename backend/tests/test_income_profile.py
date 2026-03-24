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
from backend.services.income_profile import build_income_summary


class IncomeProfileServiceTests(unittest.TestCase):
    def test_build_income_summary_handles_singapore_cpf(self) -> None:
        user = {
            "country": "Singapore",
            "income_streams": [
                {
                    "label": "Salary",
                    "gross_monthly_amount": 6000,
                    "annual_bonus": 12000,
                    "tax_country": "SG",
                    "income_type": "salary",
                    "cpf_applicable": True,
                }
            ],
        }

        summary = build_income_summary(user)

        self.assertEqual(summary["country"], "SG")
        self.assertEqual(summary["monthly_gross"], 6000.0)
        self.assertEqual(summary["annual_gross"], 84000.0)
        self.assertGreater(summary["monthly_net"], 0)
        self.assertGreater(summary["cpf"]["employee_monthly"], 0)
        self.assertGreater(summary["cpf"]["employer_monthly"], 0)
        self.assertGreater(summary["cpf"]["accounts_monthly"]["ordinary"], 0)
        self.assertEqual(len(summary["streams"]), 1)

    def test_build_income_summary_handles_united_states_tax(self) -> None:
        user = {
            "country": "United States",
            "income_streams": [
                {
                    "label": "Salary",
                    "gross_monthly_amount": 10000,
                    "tax_country": "US",
                    "income_type": "salary",
                    "cpf_applicable": False,
                }
            ],
        }

        summary = build_income_summary(user)

        self.assertEqual(summary["country"], "US")
        self.assertEqual(summary["monthly_gross"], 10000.0)
        self.assertGreater(summary["monthly_tax"], 0)
        self.assertLess(summary["monthly_net"], summary["monthly_gross"])
        self.assertEqual(summary["cpf"]["employee_monthly"], 0.0)


class IncomeProfileEndpointTests(unittest.TestCase):
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
                    "portfolio": {"stocks": [], "cryptos": [], "commodities": [], "bonds": [], "real_assets": []},
                    "income_streams": [
                        {
                            "label": "Salary",
                            "gross_monthly_amount": 6000,
                            "tax_country": "SG",
                            "income_type": "salary",
                            "cpf_applicable": True,
                        }
                    ],
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

    def test_financial_items_include_income_summary_household_and_shared_goals(self) -> None:
        response = self.client.get("/users/u001/financials")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("income_summary", payload["summary"])
        self.assertEqual(payload["summary"]["income_summary"]["country"], "SG")
        self.assertIn("household_profile", payload)
        self.assertIn("shared_goals", payload)

    def test_household_and_shared_goal_updates_persist(self) -> None:
        household_response = self.client.post(
            "/users/u001/household",
            json={
                "mode": "household",
                "partner_name": "Jamie",
                "partner_monthly_contribution": 2200,
                "partner_monthly_income": 4800,
                "partner_fixed_expenses": 900,
                "shared_budget_monthly": 1800,
                "contribution_style": "income_weighted",
                "dependents_count": 1,
                "shared_cash_reserve_target": 20000,
            },
        )
        self.assertEqual(household_response.status_code, 200)

        goal_response = self.client.post(
            "/users/u001/shared-goals",
            json={
                "title": "BTO downpayment",
                "target_amount": 80000,
                "current_saved": 12000,
                "monthly_contribution": 2500,
                "target_date": "2028-12",
                "priority": 2,
                "owners": ["Tester", "Jamie"],
            },
        )
        self.assertEqual(goal_response.status_code, 200)

        persisted = self._read_users()["u001"]
        self.assertEqual(persisted["household_profile"]["mode"], "household")
        self.assertEqual(persisted["household_profile"]["partner_name"], "Jamie")
        self.assertEqual(persisted["household_profile"]["partner_monthly_income"], 4800.0)
        self.assertEqual(persisted["household_profile"]["dependents_count"], 1)
        self.assertEqual(len(persisted["shared_goals"]), 1)
        self.assertEqual(persisted["shared_goals"][0]["title"], "BTO downpayment")
        self.assertEqual(persisted["shared_goals"][0]["current_saved"], 12000.0)
        self.assertEqual(persisted["shared_goals"][0]["priority"], 2)


if __name__ == "__main__":
    unittest.main()
