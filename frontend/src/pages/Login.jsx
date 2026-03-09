import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [tab, setTab]         = useState('signin')   // 'signin' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [age, setAge] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (tab === 'signin') {
        const res = await fetch(`${API}/auth/login`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ username, password }),
        })
        const data = await res.json()

        if (!res.ok) {
          setError(data.detail || 'Something went wrong.')
          return
        }

        login(data)
        navigate('/')
        return
      }

      const parsedAge = Number(age)
      if (!Number.isFinite(parsedAge) || parsedAge < 18 || parsedAge > 100) {
        setError('Please enter a valid age between 18 and 100.')
        return
      }

      const regRes = await fetch(`${API}/auth/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      })
      const regData = await regRes.json()

      if (!regRes.ok) {
        setError(regData.detail || 'Something went wrong.')
        return
      }

      const profileRes = await fetch(`${API}/users/survey/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: regData.user_id,
          first_name: username,
          age: parsedAge,
        }),
      })
      const profileData = await profileRes.json().catch(() => ({}))
      if (!profileRes.ok) {
        setError(profileData.detail || 'Account created, but profile setup failed.')
        return
      }

      login(regData)
      navigate('/')
    } catch {
      setError('Cannot reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.backdrop}>
      {/* Ambient glow blobs */}
      <div style={S.blob1} />
      <div style={S.blob2} />

      <div style={S.card}>
        {/* Logo */}
        <div style={S.logoRow}>
          <img src="/logo.png" alt="Logo" style={S.logoImage} />
          <span style={S.logoText}>Unova</span>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {['signin', 'register'].map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError('') }}
              style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}
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

        {/* Form */}
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
              autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>

          {tab === 'register' && (
            <label style={S.label}>
              Age
              <input
                style={S.input}
                type="number"
                min="18"
                max="100"
                placeholder="e.g. 30"
                value={age}
                onChange={e => setAge(e.target.value)}
                required
              />
            </label>
          )}

          {error && <p style={S.error}>{error}</p>}

          <button type="submit" style={S.submit} disabled={loading}>
            {loading ? 'Please wait…' : tab === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Switch tab hint */}
        <p style={S.switchHint}>
          {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <span
            style={S.switchLink}
            onClick={() => { setTab(tab === 'signin' ? 'register' : 'signin'); setError('') }}
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
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: 'var(--font-body)',
  },
  blob1: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(201,168,76,0.12) 0%, transparent 70%)',
    top: '-120px',
    left: '-160px',
    pointerEvents: 'none',
  },
  blob2: {
    position: 'absolute',
    width: 460,
    height: 460,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(45,212,191,0.1) 0%, transparent 70%)',
    bottom: '-140px',
    right: '-120px',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 420,
    background: 'var(--surface)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 'var(--r-xl)',
    padding: '40px 40px 32px',
    boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
    animation: 'fadeUp 0.4s ease',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
    justifyContent: 'center',
  },
  logoImage: {
    height: 50,
    width: 'auto',
    objectFit: 'contain',
    background: 'transparent',
  },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.25rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
    color: 'var(--text)',
  },
  tabs: {
    display: 'flex',
    background: 'var(--bg2)',
    borderRadius: 'var(--r-md)',
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    padding: '8px 0',
    border: 'none',
    borderRadius: 'var(--r-sm)',
    background: 'transparent',
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.85rem',
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
    fontSize: '0.82rem',
    color: 'var(--text-dim)',
    textAlign: 'center',
    marginBottom: 24,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: '0.78rem',
    fontWeight: 600,
    color: 'var(--text-dim)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  input: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    padding: '11px 14px',
    color: 'var(--text)',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  error: {
    fontSize: '0.8rem',
    color: 'var(--red)',
    background: 'rgba(248,113,113,0.08)',
    border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: 'var(--r-sm)',
    padding: '8px 12px',
  },
  submit: {
    marginTop: 4,
    padding: '13px 0',
    background: 'var(--btn-primary-bg)',
    border: '1px solid var(--btn-primary-bg)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--btn-primary-text)',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
    fontSize: '0.9rem',
    cursor: 'pointer',
    letterSpacing: '0.02em',
    transition: 'opacity 0.2s',
  },
  switchHint: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: '0.8rem',
    color: 'var(--text-dim)',
  },
  switchLink: {
    color: 'var(--gold)',
    cursor: 'pointer',
    fontWeight: 600,
  },
}
