# FinTech Frontend

## Hosted Frontend

- Live app: https://frontend-production-6554.up.railway.app/profile
- Production backend API docs: https://fintech-production-d308.up.railway.app/docs#/

A React-based financial wellness dashboard for portfolio management, market tracking, and personalized financial insights with AI-powered recommendations.

> Multi-asset portfolio management • Real-time market data • AI insights • Peer benchmarking

---

## 🚀 Quick Start

### With Docker (Recommended)

```powershell
cd ..  # Go to project root
docker-compose up --build
```

Frontend available at: **http://localhost:5173**
Production frontend: **https://frontend-production-6554.up.railway.app/profile**

See [../DOCKER.md](../DOCKER.md) for detailed Docker setup.

### Manual Setup (Development)

```bash
# 1. Install dependencies
npm install

# 2. Configure API endpoint
Copy-Item .env.example .env  # Edit VITE_API_URL

# 3. Start dev server
npm run dev
# → Open http://localhost:5173

# 4. Build for production
npm run build
```

---

## 📋 Project Structure

```
frontend/
├── index.html                          # Vite entry HTML
├── vite.config.js                      # Vite configuration
├── nginx.conf                          # Nginx config for production
├── package.json                        # Dependencies & scripts
├── Dockerfile                          # Container configuration
│
└── src/
    ├── main.jsx                        # React entry point + BrowserRouter
    ├── App.jsx                         # Route definitions
    ├── index.css                       # Global styles & CSS variables
    ├── data.js                         # Mock data & helper functions
    │
    ├── components/                     # Reusable UI components
    │   ├── Navbar.jsx                 # Top navigation bar
    │   ├── Sidebar.jsx                # Left sidebar with navigation
    │   ├── TickerBar.jsx              # Market ticker tape (scrolling)
    │   ├── RiskSlider.jsx             # Draggable risk profile selector
    │   ├── LoginModal.jsx             # Login form modal
    │   ├── SurveyModal.jsx            # Survey step modal
    │   ├── SettingsModal.jsx          # Settings panel
    │   ├── ThemeModal.jsx             # Theme selector
    │   ├── AssetInsightsPanel.jsx     # AI insights display
    │   └── MarketTablePage.jsx        # Asset table layout
    │
    ├── pages/                         # Route pages
    │   ├── Login.jsx                  # /login — User authentication
    │   ├── Globe.jsx                  # / — Interactive globe + portfolio
    │   ├── Profile.jsx                # /profile — Portfolio overview
    │   ├── Survey.jsx                 # /survey — Onboarding wizard
    │   ├── Settings.jsx               # /settings — User preferences
    │   ├── Stocks.jsx                 # /stocks — Stock market view
    │   ├── Crypto.jsx                 # /crypto — Cryptocurrency view
    │   ├── Commodities.jsx            # /commodities — Commodities view
    │   └── Theme.jsx                  # /theme — Theme management
    │
    ├── context/                       # React Context providers
    │   ├── AuthContext.jsx            # User authentication state
    │   ├── LoginModalContext.jsx      # Login modal visibility state
    │   └── ThemeContext.jsx           # Theme/appearance state
    │
    └── utils/                         # Utility functions
        ├── currency.js                # Currency conversion & formatting
        └── refreshPage.js             # Page refresh utilities
```

---

## 🔧 Environment Configuration

Create a `.env` file in the `frontend/` directory:

```env
# API Configuration
VITE_API_URL=http://localhost:8000
```

**For Production (Railway):**
```env
VITE_API_URL=https://fintech-production-d308.up.railway.app
```

Production frontend URL: `https://frontend-production-6554.up.railway.app/profile`

The environment variable is read at build time by Vite and embedded in the bundle.

---

## 📖 Routes & Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | `Login.jsx` | User login & registration page |
| `/` | `Globe.jsx` | Interactive 3D globe with portfolio visualization |
| `/profile` | `Profile.jsx` | Portfolio overview, analytics, wellness score |
| `/survey` | `Survey.jsx` | Onboarding wizard (4 steps) |
| `/settings` | `Settings.jsx` | User preferences, accounts, notifications |
| `/stocks` | `Stocks.jsx` | Stock market data and positions |
| `/crypto` | `Crypto.jsx` | Cryptocurrency holdings and prices |
| `/commodities` | `Commodities.jsx` | Commodity prices and positions |
| `/theme` | `Theme.jsx` | Theme selection and customization |
| `*` | Redirect | Unknown routes redirect to `/` |

---

## 🧩 Shared Components

### **Navbar** (`components/Navbar.jsx`)
Top navigation bar with:
- Logo/brand
- User menu
- Settings access
- Theme toggle

**Usage:**
```jsx
<Navbar />
```

### **Sidebar** (`components/Sidebar.jsx`)
Left navigation sidebar with icons and links.
Uses `useLocation()` for active route highlighting and `useNavigate()` for routing.

**Usage:**
```jsx
<Sidebar />
```

### **TickerBar** (`components/TickerBar.jsx`)
Scrolling market ticker tape displaying asset prices in real-time.

**Props:**
- `style` (optional) - CSS styling object

**Usage:**
```jsx
<TickerBar style={{ position: 'fixed', top: 0 }} />
```

### **RiskSlider** (`components/RiskSlider.jsx`)
Interactive slider for risk profile selection (Conservative, Balanced, Aggressive).

**Props:**
- `value` - Current risk level (0-100)
- `onChange(level)` - Callback function when slider changes

**Usage:**
```jsx
<RiskSlider 
  value={50} 
  onChange={(level) => console.log(level)} 
/>
```

### **LoginModal** (`components/LoginModal.jsx`)
Modal for user login and registration.

**Props:**
- `open` - Boolean to show/hide modal
- `onClose()` - Callback to close modal
- `onSuccess()` - Callback on successful login
- `onRegisterSuccess()` - Callback on successful registration

### **SurveyModal** (`components/SurveyModal.jsx`)
Step-by-step onboarding survey modal.

**Props:**
- `open` - Boolean to show/hide
- `onClose()` - Close callback
- `currentStep` - Current step number
- `onNext()` - Next step callback

### **SettingsModal** (`components/SettingsModal.jsx`)
Settings and preferences panel.

**Props:**
- `open` - Boolean to show/hide
- `onClose()` - Close callback

### **ThemeModal** (`components/ThemeModal.jsx`)
Theme selection and appearance customization.

**Props:**
- `open` - Boolean to show/hide
- `onClose()` - Close callback

### **AssetInsightsPanel** (`components/AssetInsightsPanel.jsx`)
Displays AI-powered insights for assets and portfolio recommendations.

**Props:**
- `data` - Insights data object
- `loading` - Boolean for loading state

### **MarketTablePage** (`components/MarketTablePage.jsx`)
Reusable table component for displaying market data (stocks, crypto, commodities).

**Props:**
- `title` - Table title
- `data` - Array of market data
- `columns` - Column definitions

---

## 🎨 Context & State Management

### **AuthContext** (`context/AuthContext.jsx`)

Provides user authentication state and methods.

**Hook:**
```jsx
import { useAuth } from '../context/AuthContext.jsx'

const { user, login, logout, isAuthenticated } = useAuth()
```

**Available Methods:**
- `login(username, password)` - User login
- `logout()` - User logout
- `register(username, password)` - User registration
- `isAuthenticated` - Boolean flag

### **LoginModalContext** (`context/LoginModalContext.jsx`)

Manages login modal visibility globally.

**Hook:**
```jsx
import { useLoginModal } from '../context/LoginModalContext.jsx'

const { isOpen, openLoginModal, closeLoginModal } = useLoginModal()
```

### **ThemeContext** (`context/ThemeContext.jsx`)

Manages application theme (light/dark mode).

**Hook:**
```jsx
import { useTheme } from '../context/ThemeContext.jsx'

const { theme, setTheme } = useTheme()
```

---

## 🛠️ Utility Functions

### **Currency Utilities** (`utils/currency.js`)

```jsx
import { convertCurrency, formatCurrency } from '../utils/currency.js'

// Convert between currencies
const converted = convertCurrency(1000, 'USD', 'SGD')

// Format currency for display
const formatted = formatCurrency(1000, 'USD', { 
  maximumFractionDigits: 2 
})
```

### **Page Refresh** (`utils/refreshPage.js`)

```jsx
import { refreshPage } from '../utils/refreshPage.js'

// Refresh page data
refreshPage()
```

---

## 🔌 API Integration

The frontend communicates with the backend API. The API URL is configured via environment variables:

```env
VITE_API_URL=http://localhost:8000  # Development
VITE_API_URL=https://...            # Production
```

All pages use this constant:
```jsx
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
```

### Expected API Endpoints

| Method | Endpoint | Used by |
|--------|----------|---------|
| `POST` | `/login` | Login page |
| `POST` | `/register` | Registration |
| `GET` | `/users/{id}/portfolio` | Profile page |
| `GET` | `/users/{id}/insights` | Insights panel |
| `GET` | `/market/stocks` | Stocks page |
| `GET` | `/market/crypto` | Crypto page |
| `GET` | `/market/commodities` | Commodities page |
| `GET` | `/users/{id}/benchmarks` | Peer comparison |
| `POST` | `/users/{id}/retirement` | Retirement planning |
| `GET` | `/users/{id}/wellness` | Wellness metrics |

See [../backend/README.md](../backend/README.md) for full API documentation.

---

## 📦 Build & Deployment

### Development Build

```bash
npm run dev
```

Serves on http://localhost:5173 with hot module reloading.

### Production Build

```bash
npm run build
```

Creates optimized bundle in `dist/` folder.

### Docker Build

```powershell
cd ..
docker-compose up --build frontend
```

Uses multi-stage build:
1. **Build stage:** Node.js to compile React + Vite
2. **Runtime stage:** Nginx to serve static files

---

## 🎯 Key Features

### 🌐 **Interactive Globe**
- 3D visualization of portfolio distribution
- Region-based portfolio drill-down
- Real-time data updates

### 📊 **Portfolio Dashboard**
- Multi-asset overview (stocks, crypto, commodities)
- Wellness scoring
- Peer benchmarking
- Historical performance charts

### 🤖 **AI Insights**
- GPT-4 powered recommendations
- Asset-specific analysis
- Personalized guidance

### 🎛️ **Risk Management**
- Interactive risk slider
- Automated rebalancing suggestions
- Stress testing

### 🔐 **Authentication**
- Secure login/registration
- Session management
- User profiles

### 📱 **Responsive Design**
- Mobile-friendly layout
- Touch-optimized controls
- Adaptive charts

---

## 🚀 Performance Optimization

### Code Splitting
Routes are lazy-loaded to reduce initial bundle size:

```jsx
const Profile = lazy(() => import('./pages/Profile.jsx'))
```

### Caching
Market data is cached to reduce API calls:

```jsx
const getCachedInsight = (key) => {
  // Return cached or fetch new
}
```

### Memoization
Components use `React.memo()` to prevent unnecessary re-renders:

```jsx
export default React.memo(MyComponent)
```

---

## 🧪 Testing

Run tests (if configured):

```bash
npm run test
```

Lint code:

```bash
npm run lint
```

---

## 🐛 Troubleshooting

### API Connection Issues

**Problem:** "Cannot reach API" or CORS errors

**Solution:** Check environment variable and backend status
```powershell
# Check .env file
cat .env

# Verify backend is running
curl http://localhost:8000/docs
```

### Module Not Found Errors

**Problem:** "Cannot find module" error

**Solution:** Reinstall dependencies
```bash
npm install
```

### Port Already in Use

**Problem:** Port 5173 is occupied

**Solution:** Either free the port or use a different one:
```bash
# Kill process on port 5173
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Or run on different port
npm run dev -- --port 3000
```

---

## 📚 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 18 |
| **Routing** | React Router DOM v6 |
| **Build Tool** | Vite |
| **Styling** | CSS + CSS Variables |
| **HTTP Client** | Axios |
| **3D Graphics** | Three.js |
| **Charts** | (Custom/SVG) |
| **State** | React Context |
| **Deployment** | Docker + Nginx |

---

## 📖 Additional Documentation

- **Main README:** [../README.md](../README.md)
- **Backend API:** [../backend/README.md](../backend/README.md)
- **Docker Setup:** [../DOCKER.md](../DOCKER.md)
- **Backend API Docs:** http://localhost:8000/docs (when running)

---

## 🎨 Styling

Global CSS variables are defined in `src/index.css`:

```css
:root {
  --primary: #8b5cf6;
  --secondary: #2ab8a3;
  --danger: #ef4444;
  --background: #0f1419;
  --text: #f1f5f9;
}
```

All components use these variables for consistent theming.

---

## 📝 Development Tips

1. **Hot Reload:** Changes to `.jsx` files auto-refresh in browser
2. **DevTools:** Install React DevTools extension for browser
3. **Network:** Open DevTools Network tab to monitor API calls
4. **Console:** Check browser console for errors and warnings
5. **Mobile Testing:** Use `npm run dev` then access via `http://<your-ip>:5173`

---

**Last Updated:** March 9, 2026  
**Current Status:** Active Development  
**Docker Status:** ✅ Fully Containerized
