# Team State

Branch: `zian`

## Active roster

- `manager`: active
  - responsibility: backlog, delegation, lifecycle, cap enforcement
- `developer_1`: active
  - ownership: `frontend/src`, `chrome-extension`
  - current task: baseline frontend and extension opportunities
- `developer_2`: active
  - ownership: `backend/app.py`, `backend/services`, `backend/tests`
  - current task: baseline backend opportunities and test seams
- `qa`: active
  - ownership: verification across frontend, backend, extension
  - current task: establish runnable baseline and identify regression gaps
- `researcher`: active
  - ownership: app-specific technology and product bets
  - current task: propose near-term upgrades that fit the current stack

Live team count: `5 / 7`

## First-cycle manager report

### Objective

Establish a branch baseline for continued development.

### What was verified

- Backend unit baseline passes:
  - `python3 -m unittest backend.tests.test_behavioral_resilience`
  - result: `6 tests`, `OK`
- Frontend production build passes:
  - `npm run build`
  - result: build succeeded

### Highest-value implementation opportunities

1. Unify runtime configuration across web app and extension.
   - frontend infers its API base from browser origin in `frontend/src/utils/api.js`
   - extension hardcodes a separate production API base and model in `chrome-extension/popup.js`
   - this is a high-value cleanup because local, preview, and production environments can drift silently

2. Reduce frontend bundle size and route cost.
   - the production build emits a large main bundle warning
   - `frontend/src/pages/Globe.jsx` is a very large, stateful page and is a strong candidate for route-level code-splitting and component extraction
   - this directly improves startup and iteration speed

3. Add tests around the highest-risk app workflows.
   - current committed test coverage appears concentrated in behavioral resilience only
   - key flows like screenshot import, API endpoints, and extension import behavior lack equivalent coverage
   - the repo needs focused backend API tests and at least one end-to-end import path check

### Highest-risk regressions or gaps

1. Configuration drift between surfaces.
   - `frontend/src/utils/api.js` and `chrome-extension/popup.js` do not share a single runtime configuration strategy
   - risk: extension and web app point at different backends or models without obvious visibility

2. Thin regression net outside one backend domain.
   - `backend/tests/test_behavioral_resilience.py` passes, but there is no comparable visible coverage for:
     - screenshot import
     - auth/login flows
     - market data endpoints
     - extension-to-backend integration

3. Dependency manifest encoding risk.
   - `requirements.txt` is UTF-16 little-endian with CRLF line endings
   - risk: some tooling and CI setups expect UTF-8 and may fail or behave inconsistently

### Researcher bets

1. Add a typed shared config contract for frontend, backend, and extension.
   - why here: this codebase already runs the same product across multiple clients with different runtime defaults
   - integration point: `frontend/src/utils/api.js`, `chrome-extension/popup.js`, backend env loading
   - adoption cost: low
   - risks: minimal
   - decision: prototype now

2. Introduce a retrieval and cache layer for market/news insight generation with explicit freshness metadata.
   - why here: backend insight services already mix live retrieval, model calls, and disk caching
   - integration point: `backend/services/insights_service.py`, `backend/services/insights_service_gpt.py`, cached JSON directories
   - adoption cost: medium
   - risks: cache invalidation and source consistency
   - decision: prototype later

3. Build a deterministic import-evaluation harness for screenshot ingestion.
   - why here: screenshot import is a differentiated feature and a likely source of silent errors
   - integration point: `backend/services/screenshot_importer.py`, `chrome-extension/popup.js`, fixture-based tests
   - adoption cost: medium
   - risks: needs fixture curation
   - decision: prototype now

## Next actions

1. Assign `developer_1` to unify client runtime configuration and reduce extension/web drift.
2. Assign `developer_2` to add backend tests around screenshot import and one critical API path.
3. Assign `qa` to define a baseline acceptance checklist for login, import, and market-data flows.
4. Keep `researcher` active for concrete proposals tied to import quality, caching, and observability.
