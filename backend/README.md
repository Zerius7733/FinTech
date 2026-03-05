# Financial Metrics Reference

This backend computes user-level financial metrics from `backend/json_data/user.json`.

## Where It Is Calculated

- Liquidity metric: `backend/services/wealth_wellness/liquidity_metric.py`
- Diversification metric: `backend/services/wealth_wellness/diversification_metric.py`
- Debt-income metric: `backend/services/wealth_wellness/debt_income_metric.py`
- Financial wellness score: `backend/services/wealth_wellness/score.py`
- Financial stress index: `backend/services/wealth_wellness/stress_index.py`
- Orchestration/write-back: `backend/services/wealth_wellness/engine.py`

## Metrics

### 1) Liquidity Months

- Formula: `liquidity_months = cash_balance / (income)`
- What it means:
  - This estimates how long a user can continue covering normal spending if income is interrupted.
  - It treats `income` as a proxy for monthly cash need.
  - Example: if `cash_balance = 12,000` and monthly income proxy is `2,000`, liquidity is `6 months`.
- Why it matters:
  - Low liquidity increases short-term default risk and forced selling risk.
  - High liquidity gives flexibility during emergencies, layoffs, or market drawdowns.
- Practical interpretation:
  - `< 1 month`: very fragile
  - `1-3 months`: weak
  - `3-6 months`: moderate
  - `>= 6 months`: strong
- Direction: Higher is better.

### 2) Liquidity Score (0-100)

- Formula: `liquidity_score = clamp((liquidity_months / 6*risk_profile) * 100, 0, 100)`
- What it means:
  - Converts liquidity months to a normalized 0-100 scale so it can be blended with other metrics.
  - A 6-month buffer is treated as the target for full score.
- Why this normalization exists:
  - Raw months are not directly comparable with debt ratio or diversification values.
  - Scoring allows weighted aggregation into composite indices.
- Direction: Higher is better.

### 3) Diversification HHI

- Formula:
  - `weight_i = position_market_value_i / total_portfolio_value`
  - `HHI = sum(weight_i^2)`
- What it means:
  - HHI (Herfindahl-Hirschman Index) measures concentration of holdings.
  - If one position dominates, HHI rises toward `1.0`.
  - If holdings are evenly spread, HHI approaches `1/n`.
- Why it matters:
  - Concentration increases idiosyncratic risk (single-stock blowups hurt more).
  - Diversification reduces volatility from company-specific shocks.
- Practical interpretation:
  - `~1.0`: highly concentrated
  - mid-range: partial diversification
  - close to `1/n`: well spread across positions
- Direction: Lower is better (lower concentration).

### 4) Diversification Score (0-100)

- Formula:
  - `min_hhi = 1 / n` (n = number of holdings)
  - `diversification_score = clamp(((1 - HHI) / (1 - min_hhi)) * 100, 0, 100)`
- What it means:
  - Converts concentration into an easy-to-compare quality score.
  - `0` corresponds to maximum concentration.
  - `100` corresponds to ideal equal-weight spread for that `n`.
- Important caveat:
  - This is diversification by position weights only.
  - It does not account for hidden correlation (e.g., several tech stocks moving together).
- Direction: Higher is better.

### 5) Debt-Income Ratio

- Formula:
  - `total_debt = liability + mortgage`
  - `debt_income_ratio = total_debt / (income * 12)`
- What it means:
  - Compares total debt obligations (including mortgage) to one year of income capacity.
  - A ratio of `1.0` means debt equals one year of income.
- Why it matters:
  - High ratios reduce financial flexibility and increase repayment stress.
  - Lower ratios usually imply better debt service resilience.
- Practical interpretation:
  - `< 1`: healthy debt load
  - `1-3`: moderate pressure
  - `> 3`: elevated risk
  - `>= 8`: severe burden in this model
- Direction: Lower is better.

### 6) Debt-Income Score (0-100)

- Rule:
  - ratio `<= 1.0` -> `100`
  - ratio `>= 8.0` -> `0`
  - otherwise linear between 100 and 0
- What it means:
  - This converts debt burden into a comparable score for composite models.
  - Linear interpolation avoids sudden jumps between levels.
- Why thresholds are chosen:
  - `<= 1.0` is treated as strong.
  - `>= 5.0` is treated as very weak repayment posture.
- Direction: Higher is better.

### 7) Financial Wellness Score (0-100)

- Formula:
  - `0.35 * liquidity_score`
  - `+ 0.30 * diversification_score`
  - `+ 0.35 * debt_income_score`
- What it means:
  - A weighted summary of overall financial health.
  - Balances short-term safety (liquidity), portfolio risk structure (diversification), and leverage pressure (debt-income).
- Weight logic:
  - Liquidity and debt-income each carry `35%` because they are direct financial stability levers.
  - Diversification carries `30%` because it is important but secondary to solvency/liquidity.
- Interpretation:
  - `0-40`: weak overall health
  - `40-70`: developing/mixed
  - `70-85`: generally strong
  - `85-100`: very strong
- Direction: Higher is better.

### 8) Financial Stress Index (0-100)

- Formula:
  - `liquidity_stress = 100 - liquidity_score`
  - `diversification_stress = 100 - diversification_score`
  - `debt_stress = 100 - debt_income_score`
  - `financial_stress_index = 0.40 * liquidity_stress + 0.20 * diversification_stress + 0.40 * debt_stress`
- What it means:
  - A pressure/risk mirror of wellness.
  - Converts all "good" scores into "stress components" and combines them.
- Weight logic:
  - Debt and liquidity each at `40%` because they are strongest contributors to immediate financial strain.
  - Diversification at `20%` because concentration matters, but usually impacts medium-term risk more than immediate cash pressure.
- Interpretation:
  - `0-20`: low stress
  - `20-40`: manageable stress
  - `40-60`: moderate stress
  - `60-80`: high stress
  - `80-100`: severe stress
- Direction: Higher is worse.

## Output Fields Written Per User

- `wellness_metrics`
  - `liquidity_months`
  - `liquidity_score`
  - `diversification_hhi`
  - `diversification_score`
  - `debt_income_ratio`
  - `debt_income_score`
- `financial_wellness_score`
- `financial_stress_index`

## How To Run

- API server:
  - `venv\Scripts\python.exe -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000`
- Recompute and save via endpoint:
  - `GET http://127.0.0.1:8000/update/wellness`

## Recommendation Endpoints

- Rule-based:
  - `GET /users/{user_id}/recommendations?limit=3`
- GPT-wrapped:
  - `GET /users/{user_id}/recommendations/gpt?limit=3&model=gpt-4.1-mini`

## OpenAI Token Setup

Put your token in either:

1. Environment variable:
   - macOS/Linux: `export OPENAI_API_KEY=your_token_here`
2. Project root `.env` (recommended for this repo):
   - file: `FinTech/.env`
   - content: `OPENAI_API_KEY=your_token_here`

The GPT client also checks `backend/.env` for backward compatibility.
