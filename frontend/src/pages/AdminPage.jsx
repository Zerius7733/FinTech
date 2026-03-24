import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { API_BASE } from '../utils/api.js'
import { getAdminHeaders, hasAdminAccess, setAdminKey, clearAdminKey } from '../utils/adminAccess.js'

async function fetchWithTimeout(input, init = {}, timeoutMs = 6000) {
  const controller = new AbortController()
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timerId)
  }
}

export default function AdminPage() {
  const navigate = useNavigate()
  const [adminKeyDraft, setAdminKeyDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (hasAdminAccess()) {
    return <Navigate to="/admin/team" replace />
  }

  async function handleUnlock(event) {
    event.preventDefault()
    const trimmedKey = String(adminKeyDraft || '').trim()
    if (!trimmedKey) {
      setError('Enter the admin key to continue.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const response = await fetchWithTimeout(`${API_BASE}/team/state`, {
        headers: getAdminHeaders({ 'X-Unova-Admin-Key': trimmedKey }),
      }, 6000)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail || 'Admin access was rejected.')
      }
      setAdminKey(trimmedKey)
      navigate('/admin/team', { replace: true })
    } catch (err) {
      clearAdminKey()
      if (err?.name === 'AbortError') {
        setError('Admin unlock timed out. Check that the backend is running and that the admin key matches the server.')
      } else {
        setError(err.message || 'Admin access was rejected.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.page}>
      <Navbar />
      <main style={styles.shell}>
        <section style={styles.hero}>
          <div style={styles.eyebrow}>Admin access</div>
          <h1 style={styles.title}>Open the branch control room.</h1>
          <p style={styles.copy}>
            This admin area is for operating the software team on this branch: who is active, what is running now, what is queued next, and what has already landed.
          </p>
          <div style={styles.infoGrid}>
            <article style={styles.infoCard}>
              <div style={styles.infoTitle}>What this page is for</div>
              <div style={styles.infoText}>Use it to safely pause work, resume after review, assign new tasks, and inspect the current workload without digging through raw state.</div>
            </article>
            <article style={styles.infoCard}>
              <div style={styles.infoTitle}>What you will see</div>
              <div style={styles.infoText}>Active team members, live work, queued jobs, completed jobs, and the current branch objective in one operator view.</div>
            </article>
          </div>
        </section>

        <section style={styles.accessCard}>
          <div style={styles.accessHeader}>
            <div>
              <div style={styles.eyebrow}>Unlock</div>
              <div style={styles.accessTitle}>Enter the admin key</div>
            </div>
            <div style={styles.adminTag}>private surface</div>
          </div>

          <form style={styles.form} onSubmit={handleUnlock}>
            <input
              type="password"
              value={adminKeyDraft}
              onChange={event => setAdminKeyDraft(event.target.value)}
              placeholder="Admin key"
              autoComplete="current-password"
              style={styles.input}
            />
            <button type="submit" disabled={submitting} style={{ ...styles.primaryButton, opacity: submitting ? 0.7 : 1 }}>
              Open admin console
            </button>
          </form>

          <div style={styles.hint}>
            Local default admin key is <strong>unova-admin</strong> unless the backend was started with a different <code>TEAM_ADMIN_KEY</code>.
          </div>
          {error ? <div style={styles.error}>{error}</div> : null}
        </section>
      </main>
    </div>
  )
}

const card = {
  background: 'rgba(255,255,255,0.84)',
  border: '1px solid rgba(15,23,42,0.08)',
  borderRadius: 28,
  boxShadow: '0 24px 56px rgba(15,23,42,0.08)',
  backdropFilter: 'blur(18px)',
}

const styles = {
  page: {
    minHeight: '100vh',
    background: `
      radial-gradient(circle at top left, rgba(109,141,247,0.08), transparent 28%),
      radial-gradient(circle at right center, rgba(42,184,163,0.06), transparent 24%),
      linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)
    `,
  },
  shell: {
    maxWidth: 1040,
    margin: '0 auto',
    padding: '112px 20px 72px',
  },
  hero: {
    ...card,
    padding: '40px 38px',
  },
  eyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.68rem',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 14,
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(2.4rem, 4vw, 4.25rem)',
    lineHeight: 0.94,
    letterSpacing: '-0.06em',
    maxWidth: 720,
  },
  copy: {
    marginTop: 18,
    maxWidth: 720,
    color: 'var(--text-dim)',
    lineHeight: 1.75,
    fontSize: '1rem',
  },
  infoGrid: {
    marginTop: 28,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 14,
  },
  infoCard: {
    background: 'rgba(246,248,251,0.92)',
    border: '1px solid rgba(15,23,42,0.06)',
    borderRadius: 22,
    padding: '20px 20px 22px',
  },
  infoTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1rem',
    fontWeight: 700,
    marginBottom: 8,
  },
  infoText: {
    color: 'var(--text-dim)',
    lineHeight: 1.68,
  },
  accessCard: {
    ...card,
    marginTop: 18,
    padding: '28px 30px',
  },
  accessHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  accessTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.45rem',
    fontWeight: 700,
    letterSpacing: '-0.03em',
  },
  adminTag: {
    borderRadius: 999,
    padding: '8px 12px',
    border: '1px solid rgba(15,23,42,0.08)',
    background: 'rgba(255,255,255,0.72)',
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.64rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  form: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 12,
    marginTop: 20,
  },
  input: {
    width: '100%',
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 18,
    background: 'rgba(246,248,251,0.92)',
    color: 'var(--text)',
    padding: '15px 16px',
    fontFamily: 'var(--font-body)',
    fontSize: '0.96rem',
    outline: 'none',
    boxSizing: 'border-box',
  },
  primaryButton: {
    border: 'none',
    borderRadius: 999,
    background: 'var(--btn-primary-bg)',
    color: '#fff',
    padding: '14px 18px',
    fontFamily: 'var(--font-display)',
    fontSize: '0.92rem',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  error: {
    marginTop: 14,
    color: 'var(--red)',
    fontSize: '0.92rem',
  },
  hint: {
    marginTop: 14,
    color: 'var(--text-faint)',
    fontSize: '0.88rem',
    lineHeight: 1.6,
  },
}
