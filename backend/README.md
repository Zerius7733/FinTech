# Financial Metrics Reference

This backend computes user-level financial metrics from `backend/json_data/user.json`.

## Hosted Backend

- API docs: https://fintech-production-d308.up.railway.app/docs#/
- Production frontend consuming this backend: https://frontend-production-6554.up.railway.app/profile

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

## User Profile Inputs

Set a user's age:

- `POST /users/age`
- Body:

```json
{
  "user_id": "u001",
  "age": 30
}
```

## Retirement Planning

Build a retirement plan using the stored user age and current portfolio, while passing monthly spending inputs per request:

- `POST /users/{user_id}/retirement`
- Body:

```json
{
  "retirement_age": 60,
  "monthly_expenses": 3200,
  "essential_monthly_expenses": 2200
}
```

Input meanings:

- `monthly_expenses`
  - The user's estimated total monthly spending across normal life.
  - This should include rent or mortgage, bills, groceries, transport, insurance, debt payments, and usual discretionary spending.
  - The retirement planner uses this as the main lifestyle-spend anchor when estimating the retirement fund target.

- `essential_monthly_expenses`
  - The user's minimum monthly cost to stay afloat.
  - This should include only survival and fixed necessities such as housing, utilities, basic food, insurance, minimum debt obligations, and other non-optional bills.
  - The retirement planner uses this to size the recommended cash reserve and to keep the allocation from becoming too aggressive when the user needs a larger safety buffer.

Why these inputs are on the retirement request instead of stored in the user profile:

- They are planning assumptions, not stable identity fields.
- They may change often depending on scenario:
  - current lifestyle
  - post-retirement downsizing
  - different housing assumptions
  - conservative vs aggressive planning runs
- Passing them per request lets the frontend run multiple retirement scenarios for the same user without mutating saved profile data.

Response includes:

- current age and years to retirement
- current investable assets
- monthly and essential monthly expense inputs
- essential cash reserve target
- target retirement fund
- required annual and monthly contribution
- projected retirement value
- recommended vehicle mix with target weights and amounts

## Portfolio Impact

Get a deterministic impact readout for a user:

- `GET /users/{user_id}/impact?horizon_years=5`

What it returns:

- `latent_growth_potential`
  - Forward-looking scenario estimate of how much additional value the portfolio could capture over the chosen horizon if the current mix moved closer to the app's profile-based recommended allocation.

- `estimated_growth_per_year`
  - Annualized version of the latent growth estimate over the chosen horizon.

Why this is framed as an estimate:

- `latent_growth_potential` is a scenario calculation using asset-class return assumptions, not a guaranteed result.
- The endpoint is intended to support product messaging like:
  - detected latent growth
  - portfolio may be under-positioned
  - current mix vs recommended mix

How the recommended mix is determined:

- The endpoint uses the user's stored `risk_profile`:
  - `Low`
  - `Moderate`
  - `High`

- Each profile maps to a fixed base allocation:
  - `Low`: `30% equities`, `50% bonds`, `18% cash`, `2% commodities`, `0% crypto`
  - `Moderate`: `50% equities`, `25% bonds`, `15% cash`, `5% commodities`, `5% crypto`
  - `High`: `55% equities`, `10% bonds`, `10% cash`, `5% commodities`, `20% crypto`

- The base allocation is then adjusted using `financial_stress_index`:
  - higher stress increases cash
  - higher stress reduces equity and crypto exposure

- The endpoint compares:
  - the user's current mix
  - the app's recommended mix

- It projects using fixed asset-class return assumptions:
  - `equities`: `8%`
  - `bonds`: `4%`
  - `cash`: `2%`
  - `commodities`: `5%`
  - `crypto`: `12%`

So the recommendation is currently based on suitability rules and wellness posture, not market timing or stock-picking forecasts.

## Stock Market Pipeline

The stock endpoint now follows this pipeline:

- market data provider
- ingestion service
- stored snapshot / rankings files
- precomputed rankings
- frontend API

Current implementation:

- Provider: `yfinance`
- Ingestion service: `backend/services/stock_market_pipeline.py`
- Universe file: `backend/knowledge_base/stocks_symbols/large_cap_us.txt`
- Stored snapshot: `backend/json_data/stock_market_snapshot.json`
- Precomputed rankings: `backend/json_data/stock_market_rankings.json`
- Frontend API: `GET /api/market/stocks`

Endpoints:

- `GET /update/market/stocks`
  - Fetches the stock universe from `yfinance`
  - Writes a raw market snapshot file
  - Rebuilds the precomputed market-cap ranking file
  - This same refresh also runs automatically when the server starts

- `GET /api/market/stocks?page=1&per_page=50`
  - Reads from the precomputed rankings file
  - If the rankings file is missing or stale, it triggers a refresh before serving

Automatic refresh behavior:

- when the backend process starts, it runs one stock market refresh immediately
- while the backend stays live, it runs the stock market refresh again every 30 minutes

## Commodity Market Pipeline

The commodity endpoint uses the same stored-ranking pattern as stocks:

- Provider: `yfinance`
- Ingestion service: `backend/services/commodity_market_pipeline.py`
- Stored snapshot: `backend/json_data/commodity_market_snapshot.json`
- Precomputed rankings: `backend/json_data/commodity_market_rankings.json`
- Frontend API: `GET /api/market/commodities`

Endpoints:

- `GET /update/market/commodities`
  - Fetches the configured commodity contracts from `yfinance`
  - Writes a raw commodity snapshot file
  - Rebuilds the precomputed commodity ranking file

- `GET /api/market/commodities?page=1&per_page=50`
  - Reads from the precomputed rankings file
  - If the rankings file is missing or stale, it triggers a refresh before serving

Commodities do not have market cap in the same way stocks do, so the ranking is based on `total_volume`.

Automatic refresh behavior:

- when the backend process starts, it runs one commodity market refresh immediately
- while the backend stays live, it runs the commodity market refresh again every 30 minutes

Legacy cache endpoints still exist, but they are not the primary stock listing path anymore.

## OpenAI Token Setup

Put your token in either:

1. Environment variable:
   - macOS/Linux: `export OPENAI_API_KEY=your_token_here`
2. Project root `.env` (recommended for this repo):
   - file: `FinTech/.env`
   - content: `OPENAI_API_KEY=your_token_here`

The GPT client also checks `backend/.env` for backward compatibility.

## News Provider Setup

The insights pipeline searches recent news before sending results to the local Ollama model.
Ollama summarizes; it does not fetch the news itself.

Current provider order:

- Query search: `NewsAPI` if `NEWSAPI_KEY` is set, then `Marketaux` if `MARKETAUX_API_KEY` is set, then `GDELT`, then Google News RSS
- Symbol fallback: `NewsAPI` if configured, then `Alpha Vantage` if `ALPHAVANTAGE_API_KEY` is set, then `Marketaux` if `MARKETAUX_API_KEY` is set, then `FMP` if `FMP_API_KEY` is set, then `GDELT`, then Google News RSS, then `yfinance`

Optional keys:

1. `NEWSAPI_KEY`
   - Enables article search via NewsAPI for recent query-based lookups.
2. `ALPHAVANTAGE_API_KEY`
   - Enables market-news lookup by ticker symbol.
3. `MARKETAUX_API_KEY`
   - Enables finance-focused article search and symbol filtering.
4. `FMP_API_KEY`
   - Enables Financial Modeling Prep stock news and press-release fallback.

Free no-key sources already enabled:

- `GDELT`
- Google News RSS
- `yfinance` news fallback for stocks

Example `.env` additions:

```env
NEWSAPI_KEY=your_newsapi_key
ALPHAVANTAGE_API_KEY=your_alpha_vantage_key
MARKETAUX_API_KEY=your_marketaux_key
FMP_API_KEY=your_fmp_key
```

## Screenshot Import (No Login, user_id only)

Parse screenshot into candidate holdings:

- `POST /users/{user_id}/imports/screenshot/parse`
- Body:
  - `image_base64`: image data URL or raw base64
  - `model` (optional): default `gpt-4.1-mini`

Confirm and merge holdings into user portfolio:

- `POST /users/{user_id}/imports/screenshot/confirm`
- Body:
  - `import_id` (from parse response)
  - `holdings` (optional override array for user-edited values)

`confirm` merges by `asset_class + symbol` and adds quantities (e.g., existing `3 SPY` + imported `10 SPY` => `13 SPY`).

## Compatibility Endpoint

Evaluate a target asset against the user's full profile:

- `GET /users/{user_id}/compatibility?target_type=stock|crypto|commodity&symbol=...`

Response includes:

- `compatibility_score` and `rating`
- factor scores:
  - `risk_fit` (user risk vs asset risk)
  - `liquidity_fit` (user buffer vs asset volatility)
  - `concentration_impact` (whether adding target may worsen concentration)
  - `stress_guardrail` (penalty/block if stress is elevated)
- `already_in_portfolio` and `existing_position`
- guardrail disclaimer:
  - `CMC-style guardrail: AI can make mistakes. Please DYOR. Not financial advice.`

Import records are stored in `backend/json_data/screenshot_imports.json` as a temporary confirmation queue:

- `pending` imports auto-expire after 24 hours
- `confirmed` imports are deleted immediately after successful confirm/merge

## Commodity Support

You can now query commodity prices via:

- `GET /market/quote?query=COMMODITY,%20GOLD`
- `GET /market/quote?query=COMMODITY,%20SILVER`

Commodity portfolio-only endpoint:

- `GET /portfolio/{user_id}/commodities`
- `GET /portfolio/{user_id}/cryptos`
- `GET /portfolio/{user_id}/stocks`

To store commodities in a user portfolio, add positions like:

```json
{
  "symbol": "GC=F",
  "asset_type": "COMMODITY",
  "qty": 1.5,
  "avg_price": 2300.0
}
```

Supported commodity aliases for quote lookup include:

- `GOLD -> GC=F`
- `SILVER -> SI=F`
- `OIL -> CL=F`
