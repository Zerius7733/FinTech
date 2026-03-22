import { useEffect, useState } from 'react'

import { API_BASE } from '../utils/api.js'

const insightsCache = new Map()

function fmtPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '-'
  const pct = Number(value)
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}

function fmtNumber(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })
}


function narrativeToBullets(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(])/)
    .map(v => v.trim())
    .filter(Boolean)
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
    return { type: 'commodity', symbol: raw.replace(/-USD$/, '') }
  }

  return { type: 'stock', symbol: raw }
}

export function getCachedInsight(assetType, symbol, months = 3) {
  const target = normalizeInsightTarget(assetType, symbol)
  const cacheKey = `${target.type}:${target.symbol}:${months}`
  return insightsCache.get(cacheKey) || null
}

export default function AssetInsightsPanel({ assetType, symbol, months = 3, compact = false, userId = '', onInsightLoaded = null, prefaceText = '' }) {
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
      const cached = insightsCache.get(cacheKey)
      setState({ loading: false, error: '', data: cached })
      if (typeof onInsightLoaded === 'function') onInsightLoaded(cached)
      return
    }

    let cancelled = false
    setState({ loading: true, error: '', data: null })

    fetch(`${API_BASE}/api/insights?type=${encodeURIComponent(target.type)}&symbol=${encodeURIComponent(target.symbol)}&months=${months}&user_id=${encodeURIComponent(userId || 'anonymous')}`)
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
        if (typeof onInsightLoaded === 'function') onInsightLoaded(data)
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
        <style>{`@keyframes insightSpin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={S.label}>Market Insight</div>
          <button onClick={() => setRequested(false)} style={S.ghostBtn}>Hide</button>
        </div>
        <NarrativeContext text={prefaceText} />
        <div style={S.loadingRow}>
          <span style={S.loadingSpinner} />
          <span style={S.loadingText}>Generating market insight...</span>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: i === 1 ? 16 : 12, width: i === 1 ? '38%' : `${88 - i * 12}%`, borderRadius: 6, background: 'var(--surface3)' }} />
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
        <NarrativeContext text={prefaceText} />
        <div style={{ fontSize: '0.84rem', color: 'var(--text-faint)', lineHeight: 1.7 }}>
          {state.error || 'Insight data is unavailable for this asset right now.'}
        </div>
      </div>
    )
  }

  const insight = state.data
  const metrics = insight.metrics || {}
  const notableMoves = Array.isArray(insight.notable_moves) ? insight.notable_moves.slice(0, compact ? 2 : 4) : []
  const drivers = Array.isArray(insight.drivers) ? insight.drivers : []
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
      <NarrativeContext text={prefaceText} />

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
            {drivers.map((driver, idx) => (
              <a
                key={`${driver.date}-${driver.url}`}
                href={driver.url}
                target="_blank"
                rel="noreferrer"
                style={S.linkCard}
              >
                <div style={S.driverCardHeader}>
                  <div style={S.driverNumber}>{idx + 1}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text)' }}>{driver.headline || 'Source item'}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 4 }}>{driver.date || ''}</div>
                  </div>
                </div>
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

function NarrativeContext({ text }) {
  const bullets = narrativeToBullets(text)
  if (!bullets.length) return null
  return (
    <div style={S.prefaceBox}>
      <div style={S.prefaceTitle}>Context</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {bullets.map((line, idx) => (
          <div key={`${idx}-${line.slice(0, 24)}`} style={S.bulletRow}>
            <span style={S.dot} />
            <span style={S.prefaceText}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
const S = {
  card: {
    background: 'linear-gradient(180deg, var(--surface), var(--surface2))',
    border: '1px solid var(--border-act)',
    borderRadius: 18,
    padding: 20,
    boxShadow: '0 18px 36px rgba(0,0,0,0.18)',
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
    border: '1px solid var(--border-act)',
    borderRadius: 14,
    background: 'var(--surface)',
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
    border: '1px solid var(--border-act)',
    borderRadius: 14,
    background: 'var(--surface)',
    padding: '12px 14px',
  },
  linkCard: {
    display: 'block',
    border: '1px solid var(--border-act)',
    borderRadius: 14,
    background: 'var(--surface)',
    padding: '12px 14px',
    textDecoration: 'none',
  },
  driverCardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  },
  driverNumber: {
    width: 24,
    height: 24,
    borderRadius: 999,
    border: '1px solid var(--border-act)',
    background: 'var(--surface2)',
    color: 'var(--teal)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
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
    background: 'var(--btn-primary-bg)',
    border: '1px solid color-mix(in srgb, var(--btn-primary-bg) 72%, white 10%)',
    color: 'var(--btn-primary-text)',
    padding: '10px 16px',
    borderRadius: 10,
    fontFamily: 'var(--font-display)',
    fontSize: '0.82rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(17,24,39,0.16), inset 0 1px 0 rgba(255,255,255,0.12)',
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
    background: 'var(--surface2)',
    border: '1px solid var(--border-act)',
    color: 'var(--text)',
    padding: '8px 12px',
    borderRadius: 10,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    cursor: 'pointer',
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  loadingSpinner: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: '2px solid rgba(42,184,163,0.28)',
    borderTopColor: 'var(--teal)',
    animation: 'insightSpin 0.8s linear infinite',
    flexShrink: 0,
  },
  loadingText: {
    fontSize: '0.8rem',
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.03em',
  },
  prefaceBox: {
    border: '1px solid var(--border-act)',
    background: 'var(--surface)',
    borderRadius: 12,
    padding: '10px 12px',
    marginBottom: 12,
  },
  prefaceTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.62rem',
    color: 'var(--text-faint)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 6,
  },
  prefaceText: {
    fontSize: '0.84rem',
    color: 'var(--text-dim)',
    lineHeight: 1.7,
  },
}

