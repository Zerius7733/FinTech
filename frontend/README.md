# WealthSphere — React App

> Schroders Hackathon · Wealth Wellness Hub

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev
# → open http://localhost:5173

# 3. Build for production
npm run build
```

---

## Project Structure

```
wealthsphere/
│
├── index.html                    ← Vite entry HTML
├── vite.config.js
├── package.json
│
└── src/
    ├── main.jsx                  ← ReactDOM.createRoot + BrowserRouter
    ├── App.jsx                   ← <Routes> — all route definitions here
    ├── index.css                 ← Global CSS variables & resets
    ├── data.js                   ← Mock data + helper functions
    │
    ├── components/
    │   ├── Sidebar.jsx           ← Icon sidebar with useNavigate links
    │   ├── TickerBar.jsx         ← Scrolling market ticker tape
    │   └── RiskSlider.jsx        ← Draggable risk slider (reused in Survey + Settings)
    │
    └── pages/
        ├── Globe.jsx             ← / — Three.js globe + portfolio modal
        ├── Survey.jsx            ← /survey — 4-step onboarding wizard
        ├── Profile.jsx           ← /profile — Portfolio overview + peer benchmarks
        └── Settings.jsx          ← /settings — Risk editor, accounts, prefs
```

---

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `Globe` | Hero landing with interactive 3D globe. Click any node to drill into a region dashboard. |
| `/survey` | `Survey` | 4-step onboarding: Profile → Risk → Assets → Goals. Navigates to `/` on completion. |
| `/profile` | `Profile` | Portfolio composition, wellness scoring, peer age benchmarking (MoM). |
| `/settings` | `Settings` | Risk profile editor, connected accounts, notifications, appearance, security. |
| `*` | Redirect | Any unknown path redirects to `/`. |

---

## Shared Components

### `<Sidebar />`
Used on `/profile` and `/settings`. Uses `useLocation()` to highlight the active route and `useNavigate()` for navigation. No props required.

### `<TickerBar />`
Accepts an optional `style` prop for positioning (e.g. `position: 'fixed'`). Reads from `MOCK_TICKERS` in `data.js` — swap the import for a live API call.

### `<RiskSlider />`
Props:
- `initialPct` — starting slider position (0–100), default `50`
- `onChange(level)` — called with `{ key, name, factor, color, … }` on every change

Used in both `Survey.jsx` (step 2) and `Settings.jsx` (risk section).

---

## Connecting Your Backend

All mock data lives in `src/data.js`. Each exported constant has a comment showing the API endpoint it mirrors:

```js
// Shape mirrors GET /api/portfolio/nodes
export const MOCK_NODES = [ ... ]
```

To wire up the real API, create a `src/api.js` service file and replace the direct imports in each page:

```js
// Before (mock)
import { MOCK_NODES } from '../data.js'

// After (real API)
import { getPortfolioNodes } from '../api.js'
const nodes = await getPortfolioNodes()
```

### Expected endpoints

| Method | Endpoint | Used by |
|--------|----------|---------|
| `GET` | `/api/portfolio/nodes` | Globe markers |
| `GET` | `/api/portfolio/nodes/:id` | Region drill-down modal |
| `GET` | `/api/portfolio/wellness` | Wellness score card |
| `GET` | `/api/market/tickers` | Ticker marquee |
| `GET` | `/api/user/profile` | Profile hero card |
| `PATCH` | `/api/user/risk` | Settings — risk save |
| `GET` | `/api/benchmark/peers?ageGroup=` | Age cohort comparison |
| `POST` | `/api/auth/survey` | Onboarding completion |

---

## Risk Levels Reference

| Key | Factor | Equity | Bonds | Alt |
|-----|--------|--------|-------|-----|
| `conservative` | `1.0` | 30% | 60% | 10% |
| `balanced` | `0.7` | 60% | 30% | 10% |
| `aggressive` | `0.5` | 90% | 5% | 5% |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | React 18 |
| Routing | React Router DOM v6 |
| 3D Globe | Three.js |
| Build | Vite |
| Styling | Inline styles + CSS custom properties |
| Fonts | Google Fonts (Syne, DM Sans, DM Mono) |
