import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend import app as app_module
from backend.services.financial_planning import (
    build_financial_planning_overview,
    build_financial_planning_scenario,
    estimate_cpf_contributions,
    estimate_singapore_tax,
    summarize_income,
)


class FinancialPlanningServiceTests(unittest.TestCase):
    def test_income_summary_prefers_streams(self) -> None:
        user = {
            "income": 5000,
            "income_streams": [
                {"label": "Salary", "monthly_amount": 4200},
                {"label": "Rental", "monthly_amount": 1300},
            ],
        }

        summary = summarize_income(user)

        self.assertEqual(summary["monthly_total"], 5500.0)
        self.assertEqual(summary["annual_total"], 66000.0)
        self.assertEqual(summary["source"], "income_streams")
        self.assertEqual(summary["source_count"], 2)

    def test_cpf_estimate_uses_age_band_and_ceiling(self) -> None:
        estimate = estimate_cpf_contributions(6000, age=34)

        self.assertEqual(estimate["age_band"], "55 and below")
        self.assertEqual(estimate["monthly_employee_cpf"], 1200.0)
        self.assertEqual(estimate["monthly_employer_cpf"], 1020.0)
        self.assertEqual(estimate["monthly_total_cpf"], 2220.0)
        self.assertEqual(estimate["applied_wage"], 6000.0)

    def test_resident_tax_uses_progressive_bands(self) -> None:
        estimate = estimate_singapore_tax(72000)

        self.assertEqual(estimate["tax_residency"], "resident")
        self.assertEqual(estimate["estimated_tax"], 2790.0)
        self.assertEqual(estimate["effective_rate"], 3.88)
        self.assertEqual(estimate["breakdown"][-1]["rate"], 7.0)

    def test_household_goal_split_uses_income_shares(self) -> None:
        user = {
            "name": "Primary",
            "income": 6000,
            "expenses": 3000,
        }

        overview = build_financial_planning_overview(
            user,
            horizon_years=5,
        )

        household = overview["household"]
        self.assertEqual(household["monthly_income"], 6000.0)
        self.assertEqual(household["monthly_expenses"], 3000.0)
        self.assertEqual(household["monthly_surplus"], 3000.0)

        household_with_members = build_financial_planning_scenario(
            user,
            cpf_age=34,
            household_members=[
                {"name": "Partner", "monthly_income": 4000, "monthly_expenses": 1500},
                {"name": "Sibling", "monthly_income": 2000, "monthly_expenses": 700},
            ],
            shared_goals=[
                {"name": "Emergency fund", "target_amount": 12000, "target_months": 12, "owners": []}
            ],
            horizon_years=5,
        )

        shared_goal = household_with_members["household"]["shared_goals"][0]
        split = {item["name"]: item["monthly_contribution"] for item in shared_goal["recommended_split"]}
        self.assertEqual(household_with_members["household"]["monthly_income"], 12000.0)
        self.assertEqual(household_with_members["household"]["monthly_expenses"], 5200.0)
        self.assertEqual(household_with_members["household"]["monthly_surplus"], 6800.0)
        self.assertEqual(shared_goal["required_monthly_contribution"], 1000.0)
        self.assertEqual(split["Primary"], 500.0)
        self.assertEqual(split["Partner"], 333.33)
        self.assertEqual(split["Sibling"], 166.67)

    def test_scenario_composes_retirement_and_latent_growth(self) -> None:
        user = {
            "name": "Primary",
            "age": 34,
            "income": 6000,
            "expenses": 3200,
            "portfolio": {"stocks": [{"symbol": "SPY", "market_value": 10000}]},
            "subscription_plan": "free",
        }

        with patch(
            "backend.services.financial_planning.build_retirement_plan",
            return_value={"headline": "retirement"},
        ) as retirement_mock, patch(
            "backend.services.financial_planning.build_portfolio_impact",
            return_value={"headline": "impact"},
        ) as impact_mock:
            result = build_financial_planning_scenario(
                user,
                cpf_age=34,
                cpf_eligible_monthly_income=6000,
                retirement_age=60,
                monthly_expenses=3200,
                essential_monthly_expenses=2200,
                horizon_years=5,
            )

        self.assertEqual(result["subscription"]["plan"], "free")
        self.assertEqual(result["scenario"]["retirement"]["headline"], "retirement")
        self.assertEqual(result["scenario"]["portfolio_impact"]["headline"], "impact")
        retirement_mock.assert_called_once()
        impact_mock.assert_called_once()


class FinancialPlanningEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app_module.app)

    def test_overview_endpoint_returns_planning_bundle(self) -> None:
        with patch.object(
            app_module,
            "_read_users_data",
            return_value={
                "u123": {
                    "name": "Ada",
                    "age": 34,
                    "income": 6000,
                    "expenses": 3200,
                    "subscription_plan": "premium",
                    "income_streams": [{"label": "Salary", "monthly_amount": 6000}],
                    "portfolio": {"stocks": [{"symbol": "SPY", "market_value": 10000}]},
                }
            },
        ):
            response = self.client.get("/users/u123/planning/overview")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["subscription"]["plan"], "premium")
        self.assertIn("cpf", body)
        self.assertIn("tax", body)
        self.assertIn("portfolio_impact", body)

    def test_scenario_endpoint_parses_household_and_goal_inputs(self) -> None:
        with patch.object(
            app_module,
            "_read_users_data",
            return_value={
                "u123": {
                    "name": "Ada",
                    "age": 34,
                    "income": 6000,
                    "expenses": 3200,
                    "subscription_plan": "free",
                }
            },
        ), patch.object(
            app_module.api,
            "build_financial_planning_scenario",
            return_value={"income": {"monthly_total": 6000.0}, "scenario": {"notes": []}},
        ) as scenario_mock:
            response = self.client.post(
                "/users/u123/planning/scenario",
                json={
                    "cpf_age": 34,
                    "cpf_eligible_monthly_income": 6000,
                    "tax_residency": "resident",
                    "annual_reliefs": 0,
                    "horizon_years": 5,
                    "retirement_age": 60,
                    "monthly_expenses": 3200,
                    "essential_monthly_expenses": 2200,
                    "household_members": [
                        {"name": "Partner", "monthly_income": 4000, "monthly_expenses": 1500}
                    ],
                    "shared_goals": [
                        {"name": "Emergency fund", "target_amount": 12000, "target_months": 12, "owners": ["Ada"]}
                    ],
                },
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["income"]["monthly_total"], 6000.0)
        scenario_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
