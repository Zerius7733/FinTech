import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLoginModal } from '../context/LoginModalContext.jsx'
import { API_BASE } from '../utils/api.js'

const PLANS = [
  {
    id: 'free',
    label: 'Free',
    price: '$0',
    cadence: '/month',
    description: 'For tracking your money, understanding your baseline, and previewing the next decision to make.',
    features: [
      'Portfolio tracking across stocks, bonds, real assets, crypto, and commodities',
      'Wellness scoring, resilience insights, and income breakdowns',
      'Retirement planning tools',
      'Singapore CPF and US tax-aware income views',
      'One scenario-lab preview with shared-goal tracking',
      'Screenshot import and holdings sync',
      'Live market tables and watchlists',
    ],
  },
  {
    id: 'premium',
    label: 'Premium',
    price: '$14',
    cadence: '/month',
    description: 'For richer decision support, deeper planning, and premium intelligence layered on top of the core product.',
    features: [
      'Everything in Free',
      'Premium market insights for tracked assets',
      'Full scenario lab with downside, rates, and retirement what-ifs',
      'Analyst-style decision briefs and richer next-best-action guidance',
      'Priority growth guidance surfaces',
      'Expanded household planning and partner-aware goals',
    ],
  },
]

export default function Pricing() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { setLoginModalOpen } = useLoginModal()
  const [subscription, setSubscription] = useState({ loading: Boolean(user?.user_id), plan: 'free', label: 'Free' })
  const [updatingPlan, setUpdatingPlan] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user?.user_id) {
      setSubscription({ loading: false, plan: 'free', label: 'Free' })
      return
    }

    let cancelled = false
    setSubscription(current => ({ ...current, loading: true }))

    fetch(`${API_BASE}/users/${encodeURIComponent(user.user_id)}`)
      .then(async res => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload?.detail || `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then(payload => {
        if (cancelled) return
        const nextPlan = payload?.subscription?.plan || payload?.user?.subscription_plan || 'free'
        const nextLabel = payload?.subscription?.label || payload?.user?.subscription_label || 'Free'
        setSubscription({ loading: false, plan: nextPlan, label: nextLabel })
      })
      .catch(err => {
        if (cancelled) return
        setSubscription({ loading: false, plan: 'free', label: 'Free' })
        setError(err.message || 'Could not load your subscription.')
      })

    return () => { cancelled = true }
  }, [user?.user_id])

  async function switchPlan(plan) {
    if (!user?.user_id) {
      setLoginModalOpen(true)
      return
    }
    setUpdatingPlan(plan)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/users/${encodeURIComponent(user.user_id)}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.detail || `HTTP ${response.status}`)
      }
      const payload = await response.json()
      setSubscription({
        loading: false,
        plan: payload?.subscription?.plan || 'free',
        label: payload?.subscription?.label || 'Free',
      })
    } catch (err) {
      setError(err.message || 'Could not update your subscription.')
    } finally {
      setUpdatingPlan('')
    }
  }

  const source = searchParams.get('source')

  return (
    <div style={styles.page}>
      <Navbar />

      <main style={styles.shell}>
        <section style={styles.hero}>
          <div style={styles.eyebrow}>Pricing</div>
          <h1 style={styles.heroTitle}>Choose the depth you need.</h1>
          <p style={styles.heroCopy}>
            Free gives you a useful wealth baseline. Premium turns that baseline into a clearer decision layer when you want help choosing what to do next.
          </p>
          {source ? (
            <div style={styles.contextPill}>Opened from {source.replace(/-/g, ' ')}</div>
          ) : null}
          {user?.user_id ? (
            <div style={styles.planStatus}>Current plan: {subscription.loading ? 'Loading...' : subscription.label}</div>
          ) : (
            <div style={styles.planStatus}>Sign in to activate a plan on this branch.</div>
          )}
        </section>

        {error ? <div style={styles.errorBanner}>{error}</div> : null}

        <section style={styles.planGrid}>
          {PLANS.map(plan => {
            const active = subscription.plan === plan.id
            const isPremium = plan.id === 'premium'
            return (
              <article key={plan.id} style={{ ...styles.planCard, ...(isPremium ? styles.planCardFeatured : null) }}>
                <div style={styles.planHeader}>
                  <div>
                    <div style={styles.planLabel}>{plan.label}</div>
                    <div style={styles.planPriceRow}>
                      <span style={styles.planPrice}>{plan.price}</span>
                      <span style={styles.planCadence}>{plan.cadence}</span>
                    </div>
                  </div>
                  {isPremium ? <span style={styles.planChip}>Best for insights</span> : null}
                </div>
                <p style={styles.planDescription}>{plan.description}</p>
                <div style={styles.featureList}>
                  {plan.features.map(feature => (
                    <div key={feature} style={styles.featureRow}>
                      <span style={styles.featureDot} />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  style={{
                    ...styles.planButton,
                    ...(active ? styles.planButtonMuted : isPremium ? styles.planButtonPrimary : styles.planButtonSecondary),
                    opacity: updatingPlan === plan.id ? 0.7 : 1,
                  }}
                  onClick={() => switchPlan(plan.id)}
                  disabled={subscription.loading || updatingPlan === plan.id || active}
                >
                  {active ? 'Current plan' : user?.user_id ? `Switch to ${plan.label}` : 'Sign in to choose'}
                </button>
              </article>
            )
          })}
        </section>

        <section style={styles.compareCard}>
          <div style={styles.compareEyebrow}>Free vs Premium</div>
          <div style={styles.compareTitle}>Premium adds depth while Free keeps the core product useful.</div>
          <div style={styles.compareGrid}>
            <div style={styles.compareItem}>
              <div style={styles.compareLabel}>Free keeps</div>
              <div style={styles.compareCopy}>
                Portfolio tracking, wellness scoring, CPF-aware income views, shared-goal tracking, screenshot import, and live market tables.
              </div>
            </div>
            <div style={styles.compareItem}>
              <div style={styles.compareLabel}>Premium adds</div>
              <div style={styles.compareCopy}>
                Decision support depth: premium market insights, richer scenario outcomes, and more opinionated guidance when the choice matters.
              </div>
            </div>
            <div style={styles.compareItem}>
              <div style={styles.compareLabel}>Free preview</div>
              <div style={styles.compareCopy}>
                See your baseline, one scenario preview, and enough context to understand where the pressure is.
              </div>
            </div>
            <div style={styles.compareItem}>
              <div style={styles.compareLabel}>Premium depth</div>
              <div style={styles.compareCopy}>
                Compare multiple scenarios, get deeper market context, and receive next-step guidance with clearer tradeoffs.
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'transparent',
    color: 'var(--text)',
  },
  shell: {
    width: 'min(1160px, calc(100vw - 40px))',
    margin: '0 auto',
    padding: '112px 0 72px',
  },
  hero: {
    padding: '8px 0 28px',
    maxWidth: 760,
  },
  eyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.7rem',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 14,
  },
  heroTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(2.8rem, 5vw, 4.4rem)',
    lineHeight: 0.96,
    letterSpacing: '-0.06em',
    margin: 0,
  },
  heroCopy: {
    marginTop: 18,
    color: 'var(--text-dim)',
    fontSize: '1rem',
    lineHeight: 1.8,
    maxWidth: 660,
  },
  contextPill: {
    marginTop: 18,
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 12px',
    borderRadius: 999,
    background: 'color-mix(in srgb, var(--surface) 84%, transparent)',
    border: '1px solid var(--border)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.66rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--text-dim)',
  },
  planStatus: {
    marginTop: 16,
    color: 'var(--text-faint)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  errorBanner: {
    marginBottom: 18,
    padding: '16px 18px',
    borderRadius: 20,
    background: 'color-mix(in srgb, var(--surface) 88%, rgba(248,113,113,0.12))',
    border: '1px solid color-mix(in srgb, var(--red) 24%, var(--border))',
    color: '#ef4444',
    fontWeight: 600,
  },
  planGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  planCard: {
    background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
    border: '1px solid var(--border)',
    borderRadius: 24,
    padding: '28px 24px',
    boxShadow: 'var(--glow-gold)',
    backdropFilter: 'blur(16px)',
  },
  planCardFeatured: {
    borderColor: 'var(--border-act)',
    boxShadow: 'var(--glow-gold)',
  },
  planHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  planLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.18rem',
    fontWeight: 700,
  },
  planPriceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 10,
  },
  planPrice: {
    fontFamily: 'var(--font-display)',
    fontSize: '2.4rem',
    letterSpacing: '-0.05em',
    fontWeight: 800,
  },
  planCadence: {
    color: 'var(--text-faint)',
  },
  planChip: {
    borderRadius: 999,
    padding: '8px 12px',
    background: 'color-mix(in srgb, var(--surface2) 92%, transparent)',
    border: '1px solid var(--border)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.62rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--text-dim)',
  },
  planDescription: {
    marginTop: 16,
    color: 'var(--text-dim)',
    lineHeight: 1.75,
    minHeight: 72,
  },
  featureList: {
    display: 'grid',
    gap: 10,
    marginTop: 18,
    marginBottom: 22,
  },
  featureRow: {
    display: 'flex',
    gap: 10,
    color: 'var(--text)',
    lineHeight: 1.6,
  },
  featureDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--teal)',
    marginTop: 9,
    flexShrink: 0,
  },
  planButton: {
    width: '100%',
    borderRadius: 999,
    padding: '14px 18px',
    fontFamily: 'var(--font-display)',
    fontSize: '0.92rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  planButtonPrimary: {
    border: 'none',
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
  },
  planButtonSecondary: {
    border: '1px solid var(--border)',
    background: 'color-mix(in srgb, var(--surface) 84%, transparent)',
    color: 'var(--text)',
  },
  planButtonMuted: {
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text-faint)',
    cursor: 'default',
  },
  compareCard: {
    background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
    border: '1px solid var(--border)',
    borderRadius: 24,
    padding: '24px 24px 26px',
    boxShadow: 'var(--glow-gold)',
  },
  compareEyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.66rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 8,
  },
  compareTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.24rem',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    marginBottom: 16,
  },
  compareGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 14,
  },
  compareItem: {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    padding: '18px 16px',
  },
  compareLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: '1rem',
    fontWeight: 700,
    marginBottom: 8,
  },
  compareCopy: {
    color: 'var(--text-dim)',
    lineHeight: 1.7,
  },
}
