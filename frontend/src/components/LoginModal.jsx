import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

const API = 'http://localhost:8000'

export default function LoginModal({ open, onClose, onSuccess, onRegisterSuccess, onOpenSurvey }) {
  const { login } = useAuth()
  const [tab, setTab] = useState('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'Something went wrong.')
      } else {
        login(data)
        setUsername('')
        setPassword('')
        setError('')
        onSuccess?.()
        onClose()
      }
    } catch {
      setError('Cannot reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div style={S.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.card}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={S.closeBtn}
          type="button"
        >
          ✕
        </button>

        {/* Logo */}
        <div style={S.logoRow}>
          <div style={S.logoDot}>◉</div>
          <span style={S.logoText}>WealthSphere</span>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {['signin', 'register'].map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError('') }}
              style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}
              type="button"
            >
              {t === 'signin' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {/* Subtitle */}
        <p style={S.subtitle}>
          {tab === 'signin'
            ? 'Welcome back. Sign in to your account.'
            : 'Create a new account to get started.'}
        </p>

        {/* Form or Register Prompt */}
        {tab === 'signin' ? (
          <form onSubmit={handleSubmit} style={S.form}>
            <label style={S.label}>
              Username
              <input
                style={S.input}
                type="text"
                autoComplete="username"
                placeholder="e.g. Alice"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
              />
            </label>

            <label style={S.label}>
              Password
              <input
                style={S.input}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </label>

            {error && <p style={S.error}>{error}</p>}

            <button type="submit" style={S.submit} disabled={loading}>
              {loading ? 'Please wait…' : 'Sign In'}
            </button>
          </form>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <p style={{ fontSize:'0.9rem', color:'var(--text-dim)', lineHeight:1.6, margin:0 }}>
              Start by setting up your investor profile. We'll learn about your goals, risk tolerance, and asset preferences to personalize your WealthSphere.
            </p>
            <button 
              type="button"
              style={S.submit}
              onClick={() => {
                onClose()
                onOpenSurvey?.()
              }}
            >
              Continue to Setup →
            </button>
          </div>
        )}

        {/* Switch tab hint */}
        <p style={S.switchHint}>
          {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <span
            style={S.switchLink}
            onClick={() => {
              if (tab === 'signin') {
                onClose()
                onOpenSurvey?.()
              } else {
                setTab('signin')
                setError('')
              }
            }}
          >
            {tab === 'signin' ? 'Register' : 'Sign In'}
          </span>
        </p>
      </div>
    </div>
  )
}

const S = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(3px)',
  },
  card: {
    position: 'relative',
    width: '100%',
    maxWidth: 504,
    background: 'var(--surface)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 'var(--r-xl)',
    padding: '48px 48px 38px',
    boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
    animation: 'fadeUp 0.4s ease',
  },
  closeBtn: {
    position: 'absolute',
    top: 19,
    right: 19,
    width: 43,
    height: 43,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'var(--text-dim)',
    fontSize: '1.44rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 34,
    justifyContent: 'center',
  },
  logoDot: {
    width: 41,
    height: 41,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--gold), var(--teal))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.08rem',
    boxShadow: '0 0 24px rgba(201,168,76,0.35)',
    color: '#fff',
  },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.5rem',
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: 'var(--text)',
  },
  tabs: {
    display: 'flex',
    background: 'var(--bg2)',
    borderRadius: 'var(--r-md)',
    padding: 5,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    border: 'none',
    borderRadius: 'var(--r-sm)',
    background: 'transparent',
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-body)',
    fontSize: '1.02rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabActive: {
    background: 'var(--surface)',
    color: 'var(--btn-primary-bg)',
    boxShadow: '0 0 0 1px var(--border-act)',
  },
  subtitle: {
    fontSize: '1rem',
    color: 'var(--text-dim)',
    textAlign: 'center',
    marginBottom: 29,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 19,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  input: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '13px 17px',
    color: 'var(--text)',
    fontSize: '1.08rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  error: {
    fontSize: '0.96rem',
    color: 'var(--red)',
    background: 'rgba(248,113,113,0.08)',
    border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: 10,
    padding: '10px 14px',
    margin: 0,
  },
  submit: {
    marginTop: 5,
    padding: '16px 0',
    background: 'var(--btn-primary-bg)',
    border: '1px solid var(--btn-primary-bg)',
    borderRadius: 10,
    color: 'var(--btn-primary-text)',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '1.08rem',
    cursor: 'pointer',
    letterSpacing: '0.02em',
    transition: 'opacity 0.2s',
  },
  switchHint: {
    paddingTop: 24,
    marginTop: 24,
    textAlign: 'center',
    fontSize: '0.96rem',
    color: 'var(--text-dim)',
    margin: 0,
  },
  switchLink: {
    color: 'var(--gold)',
    cursor: 'pointer',
    fontWeight: 600,
  },
}
