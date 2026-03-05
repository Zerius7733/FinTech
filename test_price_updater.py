import json
import tempfile
import unittest
from pathlib import Path

import price_updater


class _FakeTicker:
    def __init__(self, price):
        self.fast_info = {"lastPrice": price}


class _FakeYF:
    def __init__(self, price_map):
        self.price_map = price_map

    def Ticker(self, symbol):
        return _FakeTicker(self.price_map[symbol])


class PriceUpdaterTests(unittest.TestCase):
    def test_fetch_latest_prices(self):
        fake_yf = _FakeYF({"AAPL": 200.1234, "MSFT": 420.55})
        prices = price_updater.fetch_latest_prices(["MSFT", "AAPL"], yf_module=fake_yf)
        self.assertEqual(prices["AAPL"], 200.1234)
        self.assertEqual(prices["MSFT"], 420.55)

    def test_update_user_prices(self):
        users = {
            "u001": {
                "name": "Alice",
                "cash_balance": 1000,
                "liability": 300,
                "portfolio": [
                    {"symbol": "AAPL", "qty": 2, "avg_price": 100},
                    {"symbol": "MSFT", "qty": 1, "avg_price": 200},
                ],
            }
        }
        updated = price_updater.update_user_prices(users, {"AAPL": 150.0, "MSFT": 400.0})
        self.assertEqual(updated["u001"]["portfolio"][0]["market_value"], 300.0)
        self.assertEqual(updated["u001"]["portfolio"][1]["current_price"], 400.0)
        self.assertEqual(updated["u001"]["portfolio_value"], 700.0)
        self.assertEqual(updated["u001"]["total_balance"], 1700.0)
        self.assertEqual(updated["u001"]["net_worth"], 1400.0)

    def test_update_prices_file(self):
        fake_yf = _FakeYF({"AAPL": 101.0})
        payload = {
            "u001": {
                "name": "Alice",
                "cash_balance": 500.0,
                "liability": 100.0,
                "portfolio": [{"symbol": "AAPL", "qty": 3, "avg_price": 90.0}],
            }
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "user.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            updated = price_updater.update_prices_file(str(path), yf_module=fake_yf)
            self.assertIn("_meta", updated)
            self.assertEqual(updated["u001"]["portfolio_value"], 303.0)
            self.assertEqual(updated["u001"]["total_balance"], 803.0)
            self.assertEqual(updated["u001"]["net_worth"], 703.0)


if __name__ == "__main__":
    unittest.main()
