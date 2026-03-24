import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Globe   from './pages/Globe.jsx'
import Survey  from './pages/Survey.jsx'
import Profile from './pages/Profile.jsx'
import Stocks from './pages/Stocks.jsx'
import Bonds from './pages/Bonds.jsx'
import RealAssets from './pages/RealAssets.jsx'
import Commodities from './pages/Commodities.jsx'
import Crypto  from './pages/Crypto.jsx'
import Login   from './pages/Login.jsx'
import Theme   from './pages/Theme.jsx'
import LoginModal from './components/LoginModal.jsx'
import SurveyModal from './components/SurveyModal.jsx'
import { useLoginModal } from './context/LoginModalContext.jsx'

const Pricing = lazy(() => import('./pages/Pricing.jsx'))

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.routeFallback}>
          <div style={styles.routeFallbackCard}>
            <div style={styles.routeFallbackEyebrow}>Route unavailable</div>
            <div style={styles.routeFallbackTitle}>This page could not be opened.</div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function RouteFallback() {
  return (
    <div style={styles.routeFallback}>
      <div style={styles.routeFallbackCard}>
        <div style={styles.routeFallbackEyebrow}>Loading</div>
        <div style={styles.routeFallbackTitle}>Opening page…</div>
      </div>
    </div>
  )
}

export default function App() {
  const { loginModalOpen, setLoginModalOpen, surveyModalOpen, setSurveyModalOpen } = useLoginModal()

  return (
    <>
      <Routes>
        <Route path="/"         element={<Globe />} />
        <Route path="/login"    element={<Login />} />
        <Route path="/survey"   element={<Survey />} />
        <Route path="/profile"  element={<Profile />} />
        <Route path="/stocks"   element={<Stocks />} />
        <Route path="/bonds"    element={<Bonds />} />
        <Route path="/real-assets" element={<RealAssets />} />
        <Route path="/commodities" element={<Commodities />} />
        <Route path="/crypto"   element={<Crypto />} />
        <Route path="/theme"    element={<Theme />} />
        <Route
          path="/pricing"
          element={(
            <RouteErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
                <Pricing />
              </Suspense>
            </RouteErrorBoundary>
          )}
        />
        <Route path="*"         element={<Navigate to="/" replace />} />
      </Routes>

      <LoginModal
        open={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onOpenSurvey={() => setSurveyModalOpen(true)}
      />
      <SurveyModal
        open={surveyModalOpen}
        onClose={() => setSurveyModalOpen(false)}
      />
    </>
  )
}

const styles = {
  routeFallback: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: `
      radial-gradient(circle at top left, rgba(109,141,247,0.08), transparent 30%),
      linear-gradient(180deg, #f7f8fb 0%, #f3f5f8 100%)
    `,
  },
  routeFallbackCard: {
    width: 'min(420px, 100%)',
    padding: '28px 30px',
    borderRadius: 24,
    background: 'rgba(255,255,255,0.88)',
    border: '1px solid rgba(15,23,42,0.08)',
    boxShadow: '0 20px 40px rgba(15,23,42,0.06)',
    textAlign: 'center',
  },
  routeFallbackEyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.68rem',
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: 'var(--text-faint)',
    marginBottom: 10,
  },
  routeFallbackTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.25rem',
    fontWeight: 700,
    color: 'var(--text)',
  },
}
