import { useEffect, useState } from 'react'

const INSIGHTS_API = 'http://localhost:8000'
const insightsCache = new Map()

function fmtPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const pct = Number(value)
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}

function fmtNumber(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })
}

function normalizeInsightTarget(assetType, symbol) {
  const raw = String(symbol || '').trim().toUpperCase()
  if (!raw) return { type: assetType, symbol: raw }

  if (assetType === 'crypto') {
    return { type: 'crypto', symbol: raw.replace(/-USD$/, '') }
  }

  if (assetType === 'commodity') {
    if (['GLD', 'SLV', 'IAU', 'SIVR', 'PPLT', 'PALL'].includes(raw)) {
      return { type: 'stock', symbol: raw }
    }
    return { type: 'commodity', symbol: raw.replace(/=F$/, '').replace(/-USD$/, '') }
  }

  return { type: 'stock', symbol: raw }
}

export default function AssetInsightsPanel({ assetType, symbol, months = 3, compact = false, userId = '' }) {
  const [requested, setRequested] = useState(false)
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState({ loading: false, error: '', data: null })
  const hasUserContext = Boolean(userId)

  useEffect(() => {
    if (hasUserContext) return
    setRequested(false)
    setRequestVersion(0)
    setState({ loading: false, error: '', data: null })
  }, [hasUserContext])

  if (!hasUserContext) {
    return (
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={S.label}>Market Insight</div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-dim)', lineHeight: 1.7, marginTop: 10, maxWidth: 620 }}>
              Sign in to generate a personalised market insight for this asset.
            </div>
          </div>
          <div style={S.lockedPill}>Sign In Required</div>
        </div>
      </div>
    )
  }

  useEffect(() => {
    if (!requested) {
      setState({ loading: false, error: '', data: null })
      return
    }
    const target = normalizeInsightTarget(assetType, symbol)
    const cacheKey = `${target.type}:${target.symbol}:${months}`
    if (insightsCache.has(cacheKey)) {
      setState({ loading: false, error: '', data: insightsCache.get(cacheKey) })
      return
    }

    let cancelled = false
    setState({ loading: true, error: '', data: null })

    fetch(`${INSIGHTS_API}/api/insights?type=${encodeURIComponent(target.type)}&symbol=${encodeURIComponent(target.symbol)}&months=${months}&user_id=${encodeURIComponent(userId || 'anonymous')}`)
      .then(async res => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload?.detail || `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then(data => {
        if (cancelled) return
        insightsCache.set(cacheKey, data)
        setState({ loading: false, error: '', data })
      })
      .catch(error => {
        if (cancelled) return
        setState({ loading: false, error: error.message || 'Unable to load insights.', data: null })
      })

    return () => { cancelled = true }
  }, [assetType, symbol, months, requested, userId, requestVersion])

  if (!requested) {
    return (
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={S.label}>Market Insight</div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-dim)', lineHeight: 1.7, marginTop: 10, maxWidth: 620 }}>
              Generate an on-demand analyst brief for this asset. This call is rate-limited because insight generation is more expensive than standard market data.
            </div>
          </div>
          <button onClick={() => { setRequested(true); setRequestVersion(v => v + 1) }} style={S.triggerBtn}>
            Generate Market Insight
          </button>
        </div>
      </div>
    )
  }

  if (state.loading) {
    return (
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={S.label}>Market Insight</div>
          <button onClick={() => setRequested(false)} style={S.ghostBtn}>Hide</button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: i === 1 ? 16 : 12, width: i === 1 ? '38%' : `${88 - i * 12}%`, borderRadius: 6, background: 'rgba(15,23,42,0.06)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (state.error || !state.data) {
    return (
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={S.label}>Market Insight</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setRequested(false)} style={S.ghostBtn}>Hide</button>
            <button onClick={() => setRequestVersion(v => v + 1)} style={S.triggerBtn}>Retry</button>
          </div>
        </div>
        <div style={{ fontSize: '0.84rem', color: 'var(--text-faint)', lineHeight: 1.7 }}>
          {state.error || 'Insight data is unavailable for this asset right now.'}
        </div>
      </div>
    )
  }

  const insight = state.data
  const metrics = insight.metrics || {}
  const notableMoves = Array.isArray(insight.notable_moves) ? insight.notable_moves.slice(0, compact ? 2 : 4) : []
  const drivers = Array.isArray(insight.drivers) ? insight.drivers.slice(0, compact ? 2 : 3) : []
  const tldr = Array.isArray(insight.tldr) ? insight.tldr.slice(0, compact ? 2 : 3) : []
  const warnings = Array.isArray(insight.warnings) ? insight.warnings : []

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={S.label}>Market Insight</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {insight.period?.months ?? months} month window
          </div>
          <button onClick={() => setRequested(false)} style={S.ghostBtn}>Hide</button>
        </div>
      </div>

      {tldr.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={S.subhead}>Analyst Brief</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {tldr.map(point => (
              <div key={point} style={S.bulletRow}>
                <span style={S.dot} />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={S.metricsGrid}>
        {[
          ['Period return', fmtPct(metrics.return_pct)],
          ['Volatility', fmtNumber(metrics.volatility_annualized, 3)],
          ['Max drawdown', fmtPct(metrics.max_drawdown_pct)],
          ['Volume change', fmtPct(metrics.volume_change_pct)],
        ].map(([label, value]) => (
          <div key={label} style={S.metric}>
            <div style={S.metricLabel}>{label}</div>
            <div style={S.metricValue}>{value}</div>
          </div>
        ))}
      </div>

      {notableMoves.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={S.subhead}>Notable Moves</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {notableMoves.map(move => (
              <div key={`${move.date}-${move.tag}`} style={S.row}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{move.date}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-faint)', textTransform: 'capitalize' }}>
                    {String(move.tag || '').replace(/_/g, ' ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', color: Number(move.move_pct) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                    {fmtPct(move.move_pct)}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-faint)' }}>Close {fmtNumber(move.close)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {drivers.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={S.subhead}>Possible Drivers</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {drivers.map(driver => (
              <a
                key={`${driver.date}-${driver.url}`}
                href={driver.url}
                target="_blank"
                rel="noreferrer"
                style={S.linkCard}
              >
                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text)' }}>{driver.headline || 'Source item'}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 4 }}>{driver.date || ''}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {insight.conclusion && (
        <div style={{ marginTop: 18 }}>
          <div style={S.subhead}>Bottom Line</div>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>{insight.conclusion}</div>
        </div>
      )}

      {warnings[0] && (
        <div style={S.warningBox}>
          {warnings[0]}
        </div>
      )}
    </div>
  )
}

const S = {
  card: {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.98))',
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 18,
    padding: 20,
    boxShadow: '0 14px 28px rgba(15,23,42,0.06)',
  },
  label: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.65rem',
    color: 'var(--text-faint)',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
  },
  subhead: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '0.9rem',
    marginBottom: 10,
  },
  bulletRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    fontSize: '0.84rem',
    color: 'var(--text-dim)',
    lineHeight: 1.7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--teal)',
    marginTop: 8,
    flexShrink: 0,
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
    marginTop: 6,
  },
  metric: {
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.72)',
    padding: '14px 14px 12px',
  },
  metricLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.62rem',
    color: 'var(--text-faint)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 6,
  },
  metricValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '1rem',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.72)',
    padding: '12px 14px',
  },
  linkCard: {
    display: 'block',
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.72)',
    padding: '12px 14px',
    textDecoration: 'none',
  },
  warningBox: {
    marginTop: 18,
    background: 'rgba(249,115,22,0.08)',
    border: '1px solid rgba(249,115,22,0.18)',
    color: 'var(--orange)',
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: '0.78rem',
    lineHeight: 1.6,
  },
  triggerBtn: {
    background: 'var(--gold)',
    border: 'none',
    color: '#ffffff',
    padding: '10px 16px',
    borderRadius: 10,
    fontFamily: 'var(--font-display)',
    fontSize: '0.82rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(17,24,39,0.16)',
  },
  lockedPill: {
    border: '1px solid rgba(148,163,184,0.18)',
    background: 'rgba(148,163,184,0.08)',
    color: 'var(--text-faint)',
    borderRadius: 999,
    padding: '10px 14px',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.68rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  ghostBtn: {
    background: 'rgba(255,255,255,0.72)',
    border: '1px solid rgba(15,23,42,0.08)',
    color: 'var(--text-dim)',
    padding: '8px 12px',
    borderRadius: 10,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    cursor: 'pointer',
  },
}
