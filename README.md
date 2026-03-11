# FinTech Wellness Platform

This repository contains a personal wealth wellness platform built for a fintech hackathon. The solution helps users understand not just what they own, but whether their overall financial position is healthy, resilient, and aligned with their goals.

The platform combines three parts: a React frontend for portfolio and market exploration, a FastAPI backend for analytics and recommendations, and a Chrome extension that imports holdings from brokerage screenshots. Once a portfolio is captured, the backend evaluates liquidity, debt burden, diversification, financial stress, retirement readiness, and portfolio impact. It then turns those signals into personalized insights, peer benchmarking, and recommendation flows across stocks, crypto, and commodities.

This solves the problem statement by turning fragmented financial data into a single actionable experience. Instead of making users manually interpret balances, risk, and market information across different tools, the platform consolidates inputs, computes meaningful wellness metrics, and surfaces clear next steps that support better financial decision-making.

## Hosted Links  

- Frontend: https://frontend-production-6554.up.railway.app/
- Backend API docs: https://fintech-production-d308.up.railway.app/docs#/

## Technologies Used

### Frontend
- React 18
- Vite
- React Router DOM
- Three.js
- html2canvas
- jsPDF

### Backend
- Python
- FastAPI
- Uvicorn
- Pydantic
- Requests / HTTPX
- Pandas
- NumPy
- yfinance
- python-dotenv

### AI and Market Data
- OpenAI API
- Ollama
- Yahoo Finance via `yfinance`
- Public finance/news APIs including NewsAPI, Alpha Vantage, MarketAux, and FMP

### Browser Extension
- Chrome Extension Manifest V3
- Chrome Tabs API
- Chrome Storage API
- Chrome Scripting API

### Infrastructure and Deployment
- Docker
- Docker Compose
- Nginx
- Railway

## Metrics Used In The Project

### Wealth Wellness Metrics
- `Liquidity months`: Estimates how many months of financial runway a user has based on available liquid funds.
- `Liquidity score`: Converts liquidity coverage into a normalized 0-100 score.
- `Diversification HHI`: Measures portfolio concentration using the Herfindahl-Hirschman Index.
- `Diversification score`: Converts concentration into a diversification quality score.
- `Debt-to-income score`: Compares effective debt burden against annual income.
- `Housing score`: Evaluates how well estate value supports mortgage exposure.
- `Risk alignment score`: Measures whether the user’s portfolio mix aligns with their selected risk profile.
- `Behavioral resilience score`: Captures how robust the user looks under shock scenarios and structural weaknesses.
- `Financial wellness score`: Combines major wellness dimensions into a single headline score.
- `Financial stress index`: Estimates the level of financial strain, where higher values mean more stress.
- `Confidence score / confidence band`: Indicates how reliable or complete the underlying financial picture is.

### Financial Profile Metrics
- `Cash balance`: Tracks liquid cash available to the user.
- `Portfolio value`: Total current value of invested holdings across tracked asset classes.
- `Total balance`: Combined value of portfolio holdings and cash.
- `Net worth`: Total balance adjusted for liabilities and expenses.
- `Income`: User income used for affordability, debt, and retirement calculations.
- `Expenses`: Spending baseline used in liquidity, resilience, and retirement planning.
- `Mortgage`: Housing-related debt tracked separately from other liabilities.
- `Estate value`: Property or housing asset value used for housing cushion calculations.

### Portfolio and Asset Metrics
- `Asset allocation / portfolio composition`: Shows how capital is distributed across stocks, crypto, commodities, cash, and manual assets.
- `Current market value by holdings`: Marks each position to its latest available market value.
- `Unrealized profit and loss`: Measures gain or loss on current holdings relative to cost basis.
- `Profit and loss percentage versus average cost`: Expresses unrealized performance in percentage terms.
- `Concentration in each asset class`: Highlights overexposure to a particular bucket such as crypto or equities.
- `ATH change percentage`: Measures how far an asset is from its all-time high.

### Market Research Metrics
- `Period return`: Total price return across the selected analysis window.
- `Annualized volatility`: Estimates how volatile the asset has been on an annualized basis.
- `Maximum drawdown`: Captures the worst peak-to-trough decline over the selected period.
- `Volume change percentage`: Measures how trading activity changed over the analysis window.
- `Start price`: The price at the beginning of the selected research period.
- `End price`: The price at the end of the selected research period.
- `Notable price moves`: Flags major sessions or turning points that stand out in the time series.

### Compatibility Metrics
- `Risk fit`: Measures whether a target asset suits the user’s stated risk appetite.
- `Liquidity fit`: Evaluates whether the user’s cash buffer is sufficient for that asset’s volatility profile.
- `Concentration impact`: Assesses whether adding the asset would worsen diversification.
- `Stress guardrail`: Applies a penalty or block when the user’s financial stress is already elevated.
- `Overall compatibility score`: Aggregates the compatibility factors into a single suitability score.

### Peer Benchmarking Metrics
- `Income percentile versus age group`: Shows where the user’s income ranks relative to peers in the same age band.
- `Net worth percentile versus age group`: Shows where the user’s net worth ranks relative to peers in the same age band.
- `Age-band median income`: Provides the midpoint income benchmark for that cohort.
- `Age-band median net worth`: Provides the midpoint net worth benchmark for that cohort.

### Retirement Planning Metrics
- `Current age`: The user’s present age used as the retirement planning baseline.
- `Retirement age`: The target age at which the user plans to retire.
- `Years to retirement`: Remaining time horizon before retirement.
- `Current portfolio value`: Current invested wealth used as retirement planning capital.
- `Investable assets`: Portfolio value plus available cash that can compound over time.
- `Target retirement fund`: Estimated fund size required to sustain retirement spending.
- `Projected value at retirement`: Forecasted value of assets by retirement under the assumed growth rate.
- `Projected gap at retirement`: Difference between the target fund and projected outcome.
- `Required monthly contribution / top-up`: Monthly amount needed to close the projected retirement gap.
- `Essential cash reserve target`: Suggested emergency reserve before increasing investment exposure.
- `Suggested asset allocation mix`: Recommended retirement-oriented mix based on risk profile and years remaining.

### Portfolio Impact Metrics
- `Current positioning by asset class`: Shows how the portfolio is currently distributed across asset buckets.
- `Recommended positioning by asset class`: Shows the app’s profile-aligned target mix.
- `Expected portfolio return by mix`: Estimates return potential under the current and recommended allocations.
- `Projected portfolio value over time horizon`: Forecasts portfolio growth over a selected number of years.
- `Estimated missed opportunity / latent growth potential`: Quantifies how much value the user may leave on the table by staying in a suboptimal allocation.
