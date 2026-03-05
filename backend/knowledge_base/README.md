# Knowledge Base (Recommendations)

This folder stores rule-driven recommendation documents used by:
- `GET /users/{user_id}/recommendations`
- `GET /users/{user_id}/recommendations/gpt`

## Location
- Docs: `backend/knowledge_base/docs/*.json`
- Engine: `backend/services/recommendation/engine.py`

## Doc format
Each JSON file should include:
- `id`: unique string
- `title`: recommendation title
- `category`: e.g. liquidity/debt/diversification/risk_profile/stress
- `priority`: higher number appears earlier
- `conditions`: trigger conditions
- `actions`: list of suggested actions
- `rationale`: explanation text
- `source`: citation label
- `source_url`: citation URL

## Supported conditions
- `metric_lt`: metric must be `< threshold`
- `metric_lte`: metric must be `<= threshold`
- `metric_gt`: metric must be `> threshold`
- `metric_gte`: metric must be `>= threshold`
- `risk_profile_in`: list of accepted risk profiles

Metrics can reference:
- `wellness_metrics` fields (`liquidity_months`, `diversification_score`, `debt_income_ratio`, etc.)
- top-level fields (`financial_wellness_score`, `financial_stress_index`)
