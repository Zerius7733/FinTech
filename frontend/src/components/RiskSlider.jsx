import { useState, useRef, useCallback, useEffect } from 'react'

const DEBT_WEIGHT = 30

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v))
}

function levelFromPct(pct) {
  if (pct <= 33.33) return { key: 'conservative', name: 'Conservative', color: 'var(--green)' }
  if (pct <= 66.66) return { key: 'balanced', name: 'Balanced', color: 'var(--gold)' }
  return { key: 'aggressive', name: 'Aggressive', color: 'var(--red)' }
}

function buildPayload(pct) {
  const value = clamp(Math.round(pct))
  const level = levelFromPct(value)
  const diversification = Number((0.7 * value).toFixed(1))
  const liquidity = Number((70 - diversification).toFixed(1))
  const debt = DEBT_WEIGHT
  const diversificationTarget = Number((1.0 - (0.3 * (value / 100))).toFixed(3))
  return { ...level, value, pct: value, liquidity, diversification, debt, diversificationTarget }
}

export default function RiskSlider({ initialPct = 50, onChange }) {
  const [pct, setPct] = useState(clamp(initialPct))
  const trackRef = useRef(null)
  const dragging = useRef(false)
  const payload = buildPayload(pct)

  useEffect(() => {
    setPct(clamp(initialPct))
  }, [initialPct])

  useEffect(() => {
    onChange?.(buildPayload(pct))
  }, [pct, onChange])

  const updatePct = useCallback((clientX) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const next = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
    setPct(next)
  }, [])

  const onMouseDown = (e) => {
    dragging.current = true
    e.preventDefault()
    const onMove = (e2) => { if (dragging.current) updatePct(e2.clientX) }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div>
      <div style={s.labels}>
        <span>Conservative</span><span>Balanced</span><span>Aggressive</span>
      </div>
      <div ref={trackRef} style={s.track} onClick={(e) => updatePct(e.clientX)}>
        <div style={{ ...s.fill, width: `${pct}%`, background: `linear-gradient(90deg, var(--green), ${payload.color})` }} />
        <div
          style={{ ...s.thumb, left: `${pct}%`, border: `3px solid ${payload.color}`, boxShadow: `0 0 14px ${payload.color}80` }}
          onMouseDown={onMouseDown}
        />
      </div>

      <div style={s.scoreRow}>
        <span style={s.scoreLabel}>Risk Score</span>
        <span style={{ ...s.scoreValue, color: payload.color }}>{payload.value}/100</span>
      </div>

      <div style={s.detail}>
        <div style={s.detailLeft}>
          <div style={s.detailTitle}>{payload.name} Portfolio</div>
          <div style={s.detailDesc}>
            Wellness ratio: Diversification {payload.diversification}% / Liquidity {payload.liquidity}% / Debt-Income {payload.debt}%
          </div>
        </div>
        <div style={s.impactRow}>
          {[
            { label: 'DIVERSIFICATION', val: `${payload.diversification}%`, color: 'var(--gold)' },
            { label: 'LIQUIDITY', val: `${payload.liquidity}%`, color: 'var(--blue)' },
            { label: 'DEBT', val: `${payload.debt}%`, color: 'var(--teal)' },
          ].map((x, idx) => (
            <div key={`${x.label}-${idx}`} style={s.impactItem}>
              <span style={{ ...s.impactVal, color: x.color }}>{x.val}</span>
              <span style={s.impactLbl}>{x.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const s = {
  labels: {
    display: 'flex', justifyContent: 'space-between',
    fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
    textTransform: 'uppercase', letterSpacing: '0.1em',
    color: 'var(--text-faint)', marginBottom: 8,
  },
  track: {
    position: 'relative', height: 10,
    background: 'var(--surface2)', borderRadius: 5,
    marginBottom: 4, cursor: 'pointer',
  },
  fill: {
    position: 'absolute', top: 0, left: 0,
    height: '100%', borderRadius: 5, pointerEvents: 'none',
    transition: 'width 0.05s',
  },
  thumb: {
    position: 'absolute', top: '50%',
    transform: 'translate(-50%,-50%)',
    width: 26, height: 26, borderRadius: '50%',
    background: 'var(--bg2)',
    cursor: 'grab', zIndex: 2,
    transition: 'border 0.3s, box-shadow 0.3s',
  },
  scoreRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12,
  },
  scoreLabel: {
    fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
    color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em',
  },
  scoreValue: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem',
  },
  detail: {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '18px 20px',
    display: 'flex', gap: 20, alignItems: 'center', marginTop: 16,
    flexWrap: 'wrap',
  },
  detailLeft: { flex: 1 },
  detailTitle: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 },
  detailDesc: { fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.6 },
  impactRow: {
    display: 'flex', gap: 20,
  },
  impactItem: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
  },
  impactVal: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem',
  },
  impactLbl: {
    fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
    color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em',
  },
}
