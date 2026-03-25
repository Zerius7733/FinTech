import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext.jsx'
import OtpCodeInput from '../components/OtpCodeInput.jsx'
import { API_BASE as API } from '../utils/api.js'

const initialRegisterState = {
  email: '',
  username: '',
  password: '',
  age: '',
  otp: '',
  pending: null,
}

const initialResetState = {
  identifier: '',
  email: '',
  otp: '',
  newPassword: '',
  pending: false,
}

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [tab, setTab] = useState('signin')
  const [mode, setMode] = useState('default')
  const [signinIdentifier, setSigninIdentifier] = useState('')
  const [signinPassword, setSigninPassword] = useState('')
  const [registerForm, setRegisterForm] = useState(initialRegisterState)
  const [resetForm, setResetForm] = useState(initialResetState)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  function resetMessages() {
    setError('')
    setNotice('')
  }

  function switchTab(nextTab) {
    setTab(nextTab)
    setMode('default')
    resetMessages()
  }

  async function handleSignIn(e) {
    e.preventDefault()
    resetMessages()
    setLoading(true)

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: signinIdentifier, password: signinPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.detail || 'Something went wrong.')
        return
      }
      login(data)
      navigate('/')
    } catch {
      setError('Cannot reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegisterStart(e) {
    e.preventDefault()
    resetMessages()
    setLoading(true)

    try {
      const parsedAge = Number(registerForm.age)
      if (!Number.isFinite(parsedAge) || parsedAge < 18 || parsedAge > 100) {
        setError('Please enter a valid age between 18 and 100.')
        return
      }

      const precheckRes = await fetch(`${API}/auth/register/precheck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: registerForm.username.trim(),
          email: registerForm.email.trim(),
          password: registerForm.password,
        }),
      })
      const precheckData = await precheckRes.json().catch(() => ({}))
      if (!precheckRes.ok) {
        setError(precheckData.detail || 'Unable to validate your registration details.')
        return
      }

      const registerRes = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: registerForm.username.trim(),
          email: precheckData?.email || registerForm.email.trim(),
          password: registerForm.password,
        }),
      })
      const registerData = await registerRes.json().catch(() => ({}))
      if (!registerRes.ok) {
        setError(registerData.detail || 'Unable to send a verification code.')
        return
      }

      setRegisterForm((current) => ({
        ...current,
        email: registerData.email || current.email.trim(),
        otp: '',
        pending: registerData,
      }))
      setMode('verify-signup')
      setNotice(`We sent a ${registerData.otp_length || 6}-digit code to ${registerData.email_masked || registerData.email}.`)
    } catch {
      setError('Cannot reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegisterVerify(e) {
    e.preventDefault()
    resetMessages()
    setLoading(true)

    try {
      const verifyRes = await fetch(`${API}/auth/register/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registerForm.email.trim(),
          otp_code: registerForm.otp.trim(),
        }),
      })
      const verifyData = await verifyRes.json().catch(() => ({}))
      if (!verifyRes.ok) {
        setError(verifyData.detail || 'Unable to verify that code.')
        return
      }

      const profileRes = await fetch(`${API}/users/survey/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: verifyData.user_id,
          first_name: registerForm.username.trim(),
          username: registerForm.username.trim(),
          email: registerForm.email.trim(),
          age: Number(registerForm.age),
        }),
      })
      const profileData = await profileRes.json().catch(() => ({}))
      if (!profileRes.ok) {
        setError(profileData.detail || 'Account verified, but profile setup failed.')
        return
      }

      login(verifyData)
      navigate('/')
    } catch {
      setError('Cannot reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegisterResend() {
    resetMessages()
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/register/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registerForm.email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.detail || 'Unable to resend your verification code.')
        return
      }
      setRegisterForm((current) => ({ ...current, pending: data, otp: '' }))
      setNotice(`A new verification code was sent to ${data.email_masked || data.email}.`)
    } catch {
      setError('Cannot reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetStart(e) {
    e.preventDefault()
    resetMessages()
    setLoading(true)

    try {
      const res = await fetch(`${API}/auth/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: resetForm.identifier.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.detail || 'Unable to send a password reset code.')
        return
      }
      setResetForm((current) => ({
        ...current,
        email: data.email || current.identifier.trim(),
        otp: '',
        newPassword: '',
        pending: true,
      }))
      setMode('reset-password')
      setNotice(data.email_masked ? `We sent a reset code to ${data.email_masked}.` : 'If the account exists, a reset code has been sent.')
    } catch {
      setError('Cannot reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetVerify(e) {
    e.preventDefault()
    resetMessages()
    setLoading(true)

    try {
      const res = await fetch(`${API}/auth/password-reset/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetForm.email.trim(),
          otp_code: resetForm.otp.trim(),
          new_password: resetForm.newPassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.detail || 'Unable to reset your password.')
        return
      }
      setResetForm(initialResetState)
      setMode('default')
      setSigninIdentifier(resetForm.email.trim())
      setSigninPassword('')
      setNotice('Password updated. You can sign in now.')
    } catch {
      setError('Cannot reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const showingSignupOtp = tab === 'register' && mode === 'verify-signup'
  const showingReset = tab === 'signin' && mode === 'reset-password'

  return (
    <div style={S.backdrop}>
      <div style={S.blob1} />
      <div style={S.blob2} />

      <div style={S.card}>
        <div style={S.logoRow}>
          <img src="/logo.png" alt="Logo" style={S.logoImage} />
          <span style={S.logoText}>Unova</span>
        </div>

        <div style={S.tabs}>
          {['signin', 'register'].map((item) => (
            <button
              key={item}
              onClick={() => switchTab(item)}
              style={{ ...S.tab, ...(tab === item ? S.tabActive : {}) }}
              type="button"
            >
              {item === 'signin' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <p style={S.subtitle}>
          {tab === 'signin'
            ? showingReset
              ? 'Reset your password with a one-time email code.'
              : 'Welcome back. Sign in to your account.'
            : showingSignupOtp
              ? 'Enter the code from your email to finish creating your account.'
              : 'Create a new account with verified email access.'}
        </p>

        {tab === 'signin' && mode === 'default' && (
          <form onSubmit={handleSignIn} style={S.form}>
            <label style={S.label}>
              Email / Username
              <input
                style={S.input}
                type="text"
                autoComplete="username"
                placeholder="e.g. alice@example.com or Alice"
                value={signinIdentifier}
                onChange={(e) => setSigninIdentifier(e.target.value)}
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
                value={signinPassword}
                onChange={(e) => setSigninPassword(e.target.value)}
                required
              />
            </label>

            {error && <p style={S.error}>{error}</p>}
            {notice && <p style={S.notice}>{notice}</p>}

            <button type="submit" style={S.submit} disabled={loading}>
              {loading ? 'Please wait…' : 'Sign In'}
            </button>

            <button
              type="button"
              style={S.linkButton}
              onClick={() => {
                setMode('reset-password')
                resetMessages()
                setResetForm((current) => ({ ...current, identifier: signinIdentifier.trim() }))
              }}
            >
              Forgot your password?
            </button>
          </form>
        )}

        {tab === 'signin' && showingReset && (
          <form onSubmit={resetForm.pending ? handleResetVerify : handleResetStart} style={S.form}>
            {!resetForm.pending ? (
              <label style={S.label}>
                Email / Username
                <input
                  style={S.input}
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your email or username"
                  value={resetForm.identifier}
                  onChange={(e) => setResetForm((current) => ({ ...current, identifier: e.target.value }))}
                  required
                />
              </label>
            ) : (
              <>
                <label style={S.label}>
                  Email
                  <input style={S.input} type="email" value={resetForm.email} disabled />
                </label>
            <label style={S.label}>
              OTP Code
              <OtpCodeInput
                value={resetForm.otp}
                onChange={(nextValue) => setResetForm((current) => ({ ...current, otp: nextValue }))}
              />
            </label>
                <label style={S.label}>
                  New Password
                  <input
                    style={S.input}
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 chars, upper/lower/number/symbol"
                    value={resetForm.newPassword}
                    onChange={(e) => setResetForm((current) => ({ ...current, newPassword: e.target.value }))}
                    required
                  />
                </label>
              </>
            )}

            {error && <p style={S.error}>{error}</p>}
            {notice && <p style={S.notice}>{notice}</p>}

            <button type="submit" style={S.submit} disabled={loading}>
              {loading ? 'Please wait…' : resetForm.pending ? 'Update Password' : 'Send Reset Code'}
            </button>

            <button
              type="button"
              style={S.linkButton}
              onClick={() => {
                setMode('default')
                setResetForm(initialResetState)
                resetMessages()
              }}
            >
              Back to sign in
            </button>
          </form>
        )}

        {tab === 'register' && !showingSignupOtp && (
          <form onSubmit={handleRegisterStart} style={S.form}>
            <label style={S.label}>
              Email
              <input
                style={S.input}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={registerForm.email}
                onChange={(e) => setRegisterForm((current) => ({ ...current, email: e.target.value }))}
                required
              />
            </label>

            <label style={S.label}>
              Username
              <input
                style={S.input}
                type="text"
                autoComplete="username"
                placeholder="Choose a username"
                value={registerForm.username}
                onChange={(e) => setRegisterForm((current) => ({ ...current, username: e.target.value }))}
                required
              />
            </label>

            <label style={S.label}>
              Password
              <input
                style={S.input}
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 chars, upper/lower/number/symbol"
                value={registerForm.password}
                onChange={(e) => setRegisterForm((current) => ({ ...current, password: e.target.value }))}
                required
              />
            </label>

            <label style={S.label}>
              Age
              <input
                style={S.input}
                type="number"
                min="18"
                max="100"
                placeholder="e.g. 30"
                value={registerForm.age}
                onChange={(e) => setRegisterForm((current) => ({ ...current, age: e.target.value }))}
                required
              />
            </label>

            {error && <p style={S.error}>{error}</p>}
            {notice && <p style={S.notice}>{notice}</p>}

            <button type="submit" style={S.submit} disabled={loading}>
              {loading ? 'Please wait…' : 'Send Verification Code'}
            </button>
          </form>
        )}

        {tab === 'register' && showingSignupOtp && (
          <form onSubmit={handleRegisterVerify} style={S.form}>
            <label style={S.label}>
              Email
              <input style={S.input} type="email" value={registerForm.email} disabled />
            </label>

            <label style={S.label}>
              OTP Code
              <OtpCodeInput
                value={registerForm.otp}
                onChange={(nextValue) => setRegisterForm((current) => ({ ...current, otp: nextValue }))}
              />
            </label>

            {error && <p style={S.error}>{error}</p>}
            {notice && <p style={S.notice}>{notice}</p>}

            <button type="submit" style={S.submit} disabled={loading}>
              {loading ? 'Please wait…' : 'Verify and Create Account'}
            </button>

            <button type="button" style={S.linkButton} onClick={handleRegisterResend} disabled={loading}>
              Resend code
            </button>
          </form>
        )}

        <p style={S.switchHint}>
          {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <span style={S.switchLink} onClick={() => switchTab(tab === 'signin' ? 'register' : 'signin')}>
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
    maxWidth: 440,
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
    fontSize: '0.82rem',
    padding: 0,
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
