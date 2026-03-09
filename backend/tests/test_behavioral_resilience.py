import unittest
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.services.wealth_wellness.behavioral_resilience import calculate_behavioral_resilience


class BehavioralResilienceTests(unittest.TestCase):
    def test_diversified_homeowner_profile_scores_high(self) -> None:
        user = {
            "cash_balance": 30000,
            "income": 9000,
            "expenses": 4200,
            "mortgage": 260000,
            "estate": 700000,
            "liability": 15000,
            "liability_items": [
                {"label": "Mortgage", "amount": 260000, "is_mortgage": True},
                {"label": "Car Loan", "amount": 15000, "is_mortgage": False},
            ],
            "manual_assets": [
                {"category": "real_estate", "value": 700000},
                {"category": "banks", "value": 15000},
            ],
            "portfolio": {
                "stocks": [
                    {"symbol": "VTI", "market_value": 80000},
                    {"symbol": "VXUS", "market_value": 50000},
                    {"symbol": "BND", "market_value": 30000},
                ],
                "cryptos": [{"symbol": "BTC-USD", "market_value": 10000}],
                "commodities": [{"symbol": "GLD", "market_value": 15000}],
            },
            "risk_profile": 55,
        }

        result = calculate_behavioral_resilience(user)

        self.assertGreaterEqual(result["behavioral_resilience_score"], 75.0)
        self.assertLessEqual(result["financial_stress_index"], 35.0)
        self.assertEqual(result["confidence"], "High")
        self.assertGreater(result["derived_metrics"]["liquidity_months"], 10.0)
        self.assertIn("stability", result["resilience_summary"].lower())

    def test_low_liquidity_moderate_debt_scores_weaker(self) -> None:
        user = {
            "cash_balance": 1000,
            "income": 5000,
            "expenses": 4500,
            "liability": 18000,
            "liability_items": [{"label": "Personal Loan", "amount": 18000}],
            "portfolio": {"stocks": [{"symbol": "VOO", "market_value": 3000}]},
            "risk_profile": 40,
        }

        result = calculate_behavioral_resilience(user)

        self.assertLess(result["behavioral_resilience_score"], 55.0)
        self.assertGreater(result["financial_stress_index"], 45.0)
        self.assertEqual(result["confidence"], "High")
        self.assertLess(result["resilience_breakdown"]["liquidity_score"], 20.0)

    def test_concentrated_btc_exposure_penalizes_diversification_and_alignment(self) -> None:
        user = {
            "cash_balance": 12000,
            "income": 8000,
            "expenses": 3500,
            "portfolio": {
                "stocks": [],
                "cryptos": [{"symbol": "BTC-USD", "market_value": 190000}],
                "commodities": [],
            },
            "portfolio_value": 190000,
            "risk_profile": "conservative",
        }

        result = calculate_behavioral_resilience(user)

        self.assertGreater(result["derived_metrics"]["crypto_exposure_ratio"], 0.95)
        self.assertLess(result["resilience_breakdown"]["diversification_score"], 20.0)
        self.assertLess(result["resilience_breakdown"]["risk_alignment_score"], 25.0)
        self.assertIn("concentration", " ".join(result["action_insights"]).lower())

    def test_zero_expenses_falls_back_to_income_estimate(self) -> None:
        user = {
            "cash_balance": 6000,
            "income": 4000,
            "expenses": 0,
            "portfolio": {"stocks": [{"symbol": "SPY", "market_value": 5000}]},
            "risk_profile": 50,
        }

        result = calculate_behavioral_resilience(user)

        self.assertEqual(result["derived_metrics"]["derived_expenses"], 2400.0)
        self.assertEqual(result["derived_metrics"]["derived_expenses_source"], "estimated_from_income")
        self.assertEqual(result["confidence"], "High")

    def test_conflicting_income_streams_reduce_confidence(self) -> None:
        user = {
            "cash_balance": 8000,
            "income": 0,
            "expenses": 2200,
            "income_streams": [{"label": "Salary", "monthly_amount": 6500}],
            "estate": 200000,
            "manual_assets": [{"category": "real_estate", "value": 350000}],
            "liability": 5000,
            "liability_items": [{"label": "Card", "amount": 25000}],
            "portfolio": {"stocks": [{"symbol": "QQQ", "market_value": 12000}]},
            "risk_profile": 45,
        }

        result = calculate_behavioral_resilience(user)

        self.assertEqual(result["derived_metrics"]["derived_income"], 6500.0)
        self.assertEqual(result["confidence"], "Medium")
        self.assertGreater(result["resilience_breakdown"]["debt_score"], 0.0)

    def test_empty_profile_is_low_confidence(self) -> None:
        result = calculate_behavioral_resilience({})

        self.assertLess(result["behavioral_resilience_score"], 40.0)
        self.assertGreater(result["financial_stress_index"], 55.0)
        self.assertEqual(result["confidence"], "Low")
        self.assertEqual(result["derived_metrics"]["derived_income"], 0.0)
        self.assertEqual(result["derived_metrics"]["derived_expenses_source"], "missing")


if __name__ == "__main__":
    unittest.main()
