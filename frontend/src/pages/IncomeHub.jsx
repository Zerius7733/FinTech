import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLoginModal } from '../context/LoginModalContext.jsx'
import { API_BASE as API } from '../utils/api.js'

function fmtCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function countryLabel(value) {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'SG') return 'Singapore'
  if (normalized === 'US') return 'United States'
  return normalized || 'Singapore'
}

export default function IncomeHub() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { setLoginModalOpen } = useLoginModal()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(Boolean(user?.user_id))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user?.user_id) {
      setProfile(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`${API}/users/${encodeURIComponent(user.user_id)}/financials`)
      .then(async res => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload?.detail || `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then(payload => {
        if (cancelled) return
        setProfile(payload?.user || null)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message || 'Could not load income details.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [user?.user_id])

  const incomeSummary = profile?.income_summary || null
  const streams = incomeSummary?.streams || []
  const cpf = incomeSummary?.cpf || null
  const isSingapore = String(incomeSummary?.country || profile?.country || 'SG').toUpperCase() === 'SG'

  const heroStats = useMemo(() => ([
    { label: 'Monthly gross', value: fmtCurrency(incomeSummary?.monthly_gross || 0) },
    { label: 'Monthly take-home', value: fmtCurrency(incomeSummary?.monthly_net || 0) },
    { label: 'Monthly tax', value: fmtCurrency(incomeSummary?.monthly_tax || 0) },
    { label: 'Annual gross', value: fmtCurrency(incomeSummary?.annual_gross || 0) },
  ]), [incomeSummary])

  return (
    <div style={styles.page}>
      <Navbar />
      <main style={styles.shell}>
        <section style={styles.hero}>
          <div>
            <div style={styles.eyebrow}>Income</div>
            <h1 style={styles.title}>Know what you earn, keep, and route.</h1>
            <p style={styles.copy}>
              View gross income, take-home cashflow, tax drag, and CPF treatment in one place. Singapore and US planning logic are supported first.
            </p>
          </div>
          <div style={styles.badge}>{countryLabel(incomeSummary?.country || profile?.country)}</div>
        </section>

        {!user?.user_id ? (
          <section style={styles.emptyCard}>
            <div style={styles.emptyTitle}>Sign in to view your income breakdown.</div>
            <div style={styles.emptyCopy}>The income tab shows gross vs take-home, stream-level metadata, and CPF account flows.</div>
            <button type="button" onClick={() => setLoginModalOpen(true)} style={styles.primaryBtn}>Sign in</button>
          </section>
        ) : loading ? (
          <section style={styles.emptyCard}>
            <div style={styles.emptyTitle}>Loading income details…</div>
          </section>
        ) : error ? (
          <section style={styles.emptyCard}>
            <div style={styles.emptyTitle}>Could not load this page.</div>
            <div style={styles.emptyCopy}>{error}</div>
          </section>
        ) : (
          <>
            <section style={styles.statsGrid}>
              {heroStats.map(item => (
                <div key={item.label} style={styles.statCard}>
                  <div style={styles.statLabel}>{item.label}</div>
                  <div style={styles.statValue}>{item.value}</div>
                </div>
              ))}
            </section>

            <section style={styles.contentGrid}>
              <div style={styles.card}>
                <div style={styles.sectionEyebrow}>Streams</div>
                <div style={styles.sectionTitle}>Income breakdown</div>
                <div style={styles.streamList}>
                  {streams.map((stream, index) => (
                    <div key={stream.id || `${stream.label}-${index}`} style={styles.streamCard}>
                      <div>
                        <div style={styles.streamTitle}>{stream.label}</div>
                        <div style={styles.streamMeta}>
                          {countryLabel(stream.tax_country)} · {String(stream.income_type || 'salary').replace(/^\w/, c => c.toUpperCase())}
                          {stream.cpf_applicable ? ' · CPF' : ''}
                        </div>
                      </div>
                      <div style={styles.streamValues}>
                        <div style={styles.streamGross}>{fmtCurrency(stream.gross_monthly_amount || stream.monthly_amount || 0)}</div>
                        <div style={styles.streamNet}>take-home {fmtCurrency(stream.monthly_amount || 0)}</div>
                      </div>
                    </div>
                  ))}
                  {!streams.length && (
                    <div style={styles.emptyInline}>No income streams yet. Add them from your financial manager in Profile.</div>
                  )}
                </div>
              </div>

              <div style={styles.card}>
                <div style={styles.sectionEyebrow}>{isSingapore ? 'CPF' : 'Tax profile'}</div>
                <div style={styles.sectionTitle}>{isSingapore ? 'CPF account flow' : 'US take-home view'}</div>
                {isSingapore && cpf ? (
                  <>
                    <div style={styles.cpfGrid}>
                      {[
                        ['Employee CPF', cpf.employee_monthly],
                        ['Employer CPF', cpf.employer_monthly],
                        ['OA', cpf.accounts_monthly?.ordinary],
                        ['SA', cpf.accounts_monthly?.special],
                        ['MA', cpf.accounts_monthly?.medisave],
                      ].map(([label, value]) => (
                        <div key={label} style={styles.cpfCard}>
                          <div style={styles.statLabel}>{label}</div>
                          <div style={{ ...styles.statValue, fontSize: '1.2rem', color: 'var(--teal)' }}>{fmtCurrency(value)}</div>
                        </div>
                      ))}
                    </div>
                    <div style={styles.note}>
                      CPF is estimated using current age-band contribution rates and a simplified OA/SA/MA allocation model. Use this as a planning layer, not a statutory payroll statement.
                    </div>
                  </>
                ) : (
                  <div style={styles.note}>
                    US income view currently models federal tax plus payroll tax at a simplified single-filer baseline. State tax and advanced deductions can be added later.
                  </div>
                )}
                <div style={styles.secondaryActions}>
                  <button type="button" onClick={() => navigate('/profile')} style={styles.secondaryBtn}>Open Profile</button>
                  <button type="button" onClick={() => navigate('/pricing?source=income')} style={styles.primaryBtn}>Compare decision layers</button>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'transparent',
  },
  shell: {
    width: 'min(1200px, calc(100vw - 48px))',
    margin: '0 auto',
    padding: '132px 0 88px',
  },
  hero: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 24,
    marginBottom: 28,
  },
  eyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 10,
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(2.3rem, 5vw, 4.6rem)',
    lineHeight: 0.96,
    color: 'var(--text)',
    maxWidth: 760,
  },
  copy: {
    maxWidth: 760,
    margin: '18px 0 0',
    color: 'var(--text-dim)',
    fontSize: '1.1rem',
    lineHeight: 1.75,
  },
  badge: {
    padding: '12px 18px',
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'color-mix(in srgb, var(--surface) 82%, transparent)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.74rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    whiteSpace: 'nowrap',
    boxShadow: '0 12px 28px rgba(15,23,42,0.06)',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    padding: 22,
    borderRadius: 26,
    background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
    border: '1px solid var(--border)',
    boxShadow: '0 24px 44px rgba(16,24,40,0.07)',
    backdropFilter: 'blur(14px)',
  },
  statLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 10,
  },
  statValue: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.5rem',
    fontWeight: 700,
    color: 'var(--text)',
  },
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.9fr)',
    gap: 18,
  },
  card: {
    padding: 24,
    borderRadius: 30,
    background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
    border: '1px solid var(--border)',
    boxShadow: '0 28px 54px rgba(15,23,42,0.08)',
    backdropFilter: 'blur(14px)',
  },
  sectionEyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.55rem',
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: 16,
  },
  streamList: {
    display: 'grid',
    gap: 12,
  },
  streamCard: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'flex-start',
    padding: 18,
    borderRadius: 20,
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
  },
  streamTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: 6,
  },
  streamMeta: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    letterSpacing: '0.08em',
    color: 'var(--text-faint)',
  },
  streamValues: {
    textAlign: 'right',
    minWidth: 140,
  },
  streamGross: {
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: 4,
  },
  streamNet: {
    fontSize: '0.82rem',
    color: 'var(--text-dim)',
  },
  cpfGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 12,
    marginBottom: 16,
  },
  cpfCard: {
    padding: 16,
    borderRadius: 18,
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
  },
  note: {
    color: 'var(--text-dim)',
    lineHeight: 1.75,
    fontSize: '0.96rem',
  },
  secondaryActions: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 18,
  },
  primaryBtn: {
    border: 'none',
    borderRadius: 999,
    padding: '12px 20px',
    background: 'var(--ink)',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryBtn: {
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '12px 20px',
    background: 'color-mix(in srgb, var(--surface) 78%, transparent)',
    color: 'var(--text)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  emptyCard: {
    padding: 28,
    borderRadius: 30,
    background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
    border: '1px solid var(--border)',
    boxShadow: '0 24px 44px rgba(15,23,42,0.07)',
    backdropFilter: 'blur(14px)',
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.4rem',
    fontWeight: 700,
    color: 'var(--text)',
  },
  emptyCopy: {
    color: 'var(--text-dim)',
    lineHeight: 1.75,
    margin: '10px 0 16px',
  },
  emptyInline: {
    color: 'var(--text-faint)',
    fontSize: '0.95rem',
  },
}
