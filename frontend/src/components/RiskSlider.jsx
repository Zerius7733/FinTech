import { useState, useRef, useCallback } from 'react'

const LEVELS = [
  {
    min: 0,
    max: 33,
    pct: 16.5,
    key: 'conservative',
    name: 'Conservative',
    icon: '🛡️',
    color: 'var(--green)',
    desc: 'Liquidity 50% + Debt 35% + Diversification 15%',
    liquidity: '50%',
    diversification: '15%',
    debtIncome: '35%',
    equity: '30%',
    bonds: '60%',
    vol: 'Low',
  },
  {
    min: 34,
    max: 66,
    pct: 50,
    key: 'balanced',
    name: 'Balanced',
    icon: '⚖️',
    color: 'var(--gold)',
    desc: 'Liquidity 35% + Debt 35% + Diversification 30%',
    liquidity: '35%',
    diversification: '30%',
    debtIncome: '35%',
    equity: '60%',
    bonds: '30%',
    vol: 'Medium',
  },
  {
    min: 67,
    max: 100,
    pct: 83.5,
    key: 'aggressive',
    name: 'Aggressive',
    icon: '🚀',
    color: 'var(--red)',
    desc: 'Liquidity 20% + Debt 30% + Diversification 50%',
    liquidity: '20%',
    diversification: '50%',
    debtIncome: '30%',
    equity: '90%',
    bonds: '5%',
    vol: 'High',
  },
]

function levelFromPct(pct) {
  return LEVELS.find(l => pct <= l.max) ?? LEVELS[2]
}

export default function RiskSlider({ initialPct = 50, onChange }) {
  const [pct, setPct] = useState(initialPct)
  const trackRef = useRef(null)
  const dragging = useRef(false)
  const level = levelFromPct(pct)

  const updatePct = useCallback((clientX) => {
    const rect = trackRef.current.getBoundingClientRect()
    const next = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
    setPct(next)
    onChange?.(levelFromPct(next))
  }, [onChange])

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
        <div style={{ ...s.fill, width: `${pct}%`, background: `linear-gradient(90deg, var(--green), ${level.color})` }} />
        <div
          style={{ ...s.thumb, left: `${pct}%`, border: `3px solid ${level.color}`, boxShadow: `0 0 14px ${level.color}80` }}
          onMouseDown={onMouseDown}
        />
      </div>

      <div style={s.presets}>
        {LEVELS.map(l => (
          <div
            key={l.key}
            style={{ ...s.preset, ...(level.key === l.key ? s.presetActive : {}) }}
            onClick={() => { setPct(l.pct); onChange?.(l) }}
          >
            <div style={s.presetIcon}>{l.icon}</div>
            <div style={s.presetName}>{l.name}</div>
          </div>
        ))}
      </div>

      <div style={s.detail}>
        <div style={s.detailLeft}>
          <div style={s.detailTitle}>{level.name} Portfolio</div>
          <div style={s.detailDesc}>{level.desc}</div>
        </div>
        <div style={s.impactRow}>
          {[
            { label: 'LIQUIDITY', val: level.liquidity, color: 'var(--blue)' },
            { label: 'DEBT', val: level.debtIncome, color: 'var(--teal)' },
            { label: 'DIVERSIFICATION', val: level.diversification, color: 'var(--gold)' },
          ].map((x, idx) => (
            <div key={`${x.val}-${idx}`} style={s.impactItem}>
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
  presets: {
    display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
    gap: 12, marginTop: 20,
  },
  preset: {
    background: 'var(--surface2)', border: '1.5px solid var(--border)',
    borderRadius: 14, padding: '16px 12px',
    textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
  },
  presetActive: {
    border: '1.5px solid var(--gold)', background: 'rgba(201,168,76,0.07)',
  },
  presetIcon: { fontSize: '1.5rem', marginBottom: 6 },
  presetName: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', marginBottom: 2 },
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
