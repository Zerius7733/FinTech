import { useState } from 'react'

import { useAuth } from '../context/AuthContext.jsx'
import OtpCodeInput from './OtpCodeInput.jsx'
import { API_BASE as API } from '../utils/api.js'

export default function LoginModal({ open, onClose, onSuccess, onOpenSurvey }) {
  const { login } = useAuth()
  const [tab, setTab] = useState('signin')
  const [mode, setMode] = useState('default')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetOtp, setResetOtp] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier, password }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.detail || 'Something went wrong.')
      } else {
        login(data)
        setIdentifier('')
        setPassword('')
        setError('')
        setNotice('')
        setMode('default')
        onSuccess?.()
        onClose()
      }
    } catch {
      setError('Cannot reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetStart(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.detail || 'Unable to send a reset code.')
        return
      }
      setResetEmail(data.email || identifier.trim())
      setResetOtp('')
      setResetPassword('')
      setMode('reset')
      setNotice(data.email_masked ? `Reset code sent to ${data.email_masked}.` : 'If the account exists, a reset code has been sent.')
    } catch {
      setError('Cannot reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetVerify(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/password-reset/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail,
          otp_code: resetOtp,
          new_password: resetPassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.detail || 'Unable to reset your password.')
        return
      }
      setMode('default')
      setPassword('')
      setResetOtp('')
      setResetPassword('')
      setNotice('Password updated. Sign in with your new password.')
    } catch {
      setError('Cannot reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div style={S.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.card}>
        <button onClick={onClose} style={S.closeBtn} type="button">✕</button>

        <div style={S.logoRow}>
          <img src="/logo.png" alt="Unova" style={S.logoImage} />
          <span style={S.logoText}>Unova</span>
        </div>

        <div style={S.tabs}>
          {['signin', 'register'].map((item) => (
            <button
              key={item}
              onClick={() => { setTab(item); setMode('default'); setError(''); setNotice('') }}
              style={{ ...S.tab, ...(tab === item ? S.tabActive : {}) }}
              type="button"
            >
              {item === 'signin' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <p style={S.subtitle}>
          {tab === 'signin'
            ? mode === 'reset'
              ? 'Reset your password using the OTP in your email.'
              : 'Welcome back. Sign in to your account.'
            : 'Create your account through the guided setup with email verification.'}
        </p>

        {tab === 'signin' && mode === 'default' && (
          <form onSubmit={handleSubmit} style={S.form}>
            <label style={S.label}>
              Email / Username
              <input
                style={S.input}
                type="text"
                autoComplete="username"
                placeholder="e.g. alice@example.com or Alice"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
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
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            {error && <p style={S.error}>{error}</p>}
            {notice && <p style={S.notice}>{notice}</p>}

            <button type="submit" style={S.submit} disabled={loading}>
              {loading ? 'Please wait…' : 'Sign In'}
            </button>

            <button type="button" style={S.linkButton} onClick={handleResetStart} disabled={loading}>
              Forgot your password?
            </button>
          </form>
        )}

        {tab === 'signin' && mode === 'reset' && (
          <form onSubmit={handleResetVerify} style={S.form}>
            <label style={S.label}>
              Email
              <input style={S.input} type="email" value={resetEmail} disabled />
            </label>

            <label style={S.label}>
              OTP Code
              <OtpCodeInput
                value={resetOtp}
                onChange={setResetOtp}
              />
            </label>

            <label style={S.label}>
              New Password
              <input
                style={S.input}
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 chars, upper/lower/number/symbol"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                required
              />
            </label>

            {error && <p style={S.error}>{error}</p>}
            {notice && <p style={S.notice}>{notice}</p>}

            <button type="submit" style={S.submit} disabled={loading}>
              {loading ? 'Please wait…' : 'Update Password'}
            </button>

            <button type="button" style={S.linkButton} onClick={() => { setMode('default'); setError(''); setNotice('') }}>
              Back to sign in
            </button>
          </form>
        )}

        {tab === 'register' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-dim)', lineHeight: 1.6, margin: 0 }}>
              Start by setting up your investor profile. We&apos;ll collect your email, verify it with OTP, and use your goals to personalize your WealthSphere.
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

        <p style={S.switchHint}>
          {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <span
            style={S.switchLink}
            onClick={() => {
              if (tab === 'signin') {
                onClose()
                onOpenSurvey?.()
                return
              }
              setTab('signin')
              setMode('default')
              setError('')
              setNotice('')
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
  logoImage: {
    height: 40,
    width: 'auto',
    objectFit: 'contain',
    flexShrink: 0,
    borderRadius: 8,
  },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.5rem',
    fontWeight: 900,
    letterSpacing: '-0.02em',
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
    gap: 8,
    fontSize: '0.82rem',
    color: 'var(--text)',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 'var(--r-md)',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'var(--bg2)',
    color: 'var(--text)',
    fontSize: '0.92rem',
    outline: 'none',
    boxSizing: 'border-box',
  },
  error: {
    margin: 0,
    color: '#ff7b7b',
    fontSize: '0.8rem',
    lineHeight: 1.5,
  },
  notice: {
    margin: 0,
    color: 'var(--gold)',
    fontSize: '0.8rem',
    lineHeight: 1.5,
  },
  submit: {
    border: 'none',
    borderRadius: 'var(--r-md)',
    padding: '12px 16px',
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    fontWeight: 700,
    cursor: 'pointer',
  },
  linkButton: {
    border: 'none',
    background: 'transparent',
    color: 'var(--gold)',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left',
    fontSize: '0.82rem',
  },
  switchHint: {
    textAlign: 'center',
    fontSize: '0.82rem',
    color: 'var(--text-dim)',
    marginTop: 18,
    marginBottom: 0,
  },
  switchLink: {
    color: 'var(--gold)',
    cursor: 'pointer',
  },
}
