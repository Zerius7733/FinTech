import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import TickerBar from '../components/TickerBar.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLoginModal } from '../context/LoginModalContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { MOCK_NODES, genPriceSeries, genSparkline } from '../data.js'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function animateCount(setter, target, duration = 1800) {
  let start = null
  const step = ts => {
    if (!start) start = ts
    const p = Math.min((ts - start) / duration, 1)
    setter(Math.round(target * (1 - Math.pow(1 - p, 3))))
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// ═══════════════════════════════════════════════════════════
// LAYER 3 — GLASSMORPHIC HOVER CARD
// ═══════════════════════════════════════════════════════════
function GlassCard({ node, x, y, visible, onMouseEnter, onMouseLeave, onClick }) {
  if (!node) return null
  const hex   = '#' + node.color.toString(16).padStart(6, '0')
  const isPos = node.mtd >= 0

  // mini sparkline inside card
  const sparkPts = genSparkline(isPos ? 'up' : 'dn')
  const sparkPath = sparkPts.map((v, i) =>
    `${i === 0 ? 'M' : 'L'}${(i / (sparkPts.length - 1)) * 160},${24 - v * 20}`
  ).join(' ')

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: Math.min(x, 560 - 230), top: Math.max(y - 10, 0),
        zIndex: 30, width: 220,
        opacity: visible ? 1 : 0,
        transform: visible
          ? 'translateY(0) scale(1)'
          : 'translateY(14px) scale(0.93)',
        transition: 'opacity 0.2s ease, transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        pointerEvents: visible ? 'auto' : 'none',
        cursor: 'pointer',
      }}
    >
      {/* Glass panel — theme-adaptive */}
      <div style={{
        background: 'var(--surface)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid var(--border)`,
        borderTop: `2px solid ${hex}66`,
        borderRadius: 18,
        padding: '16px 18px 14px',
        boxShadow: `0 20px 50px rgba(0,0,0,0.18), 0 0 0 0.5px ${hex}22`,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Colour accent top bar */}
        <div style={{
          position: 'absolute', top: 0, left: '10%', right: '10%', height: 2,
          background: `linear-gradient(90deg,transparent,${hex},transparent)`,
          borderRadius: 99,
        }} />
        {/* Subtle tinted bg wash */}
        <div style={{
          position:'absolute', inset:0, borderRadius:18, pointerEvents:'none',
          background:`radial-gradient(ellipse at top right, ${hex}12 0%, transparent 65%)`,
        }} />

        {/* Header row */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: 10, position:'relative' }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.55rem', color: hex, textTransform:'uppercase', letterSpacing:'0.16em', marginBottom: 2, fontWeight:600 }}>
              {node.flag} {node.region}
            </div>
            <div style={{ fontFamily:'var(--font-display)', fontWeight: 800, fontSize:'1rem', lineHeight: 1.15, color:'var(--text)' }}>
              {node.label}
            </div>
            {node.holdings[0]?.name && node.holdings[0].name !== node.label && (
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'var(--text-faint)', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {node.holdings[0].name}
              </div>
            )}
          </div>
          <div style={{
            background: isPos ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
            border: `1px solid ${isPos ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.35)'}`,
            borderRadius: 8, padding: '3px 8px',
            fontFamily: 'var(--font-mono)', fontSize:'0.72rem',
            color: isPos ? 'var(--green)' : 'var(--red)', fontWeight: 700,
            flexShrink: 0, marginLeft: 8,
          }}>
            {isPos ? '+' : ''}{node.mtd}%
          </div>
        </div>

        {/* Sparkline */}
        <div style={{ margin: '8px 0', height: 28, position:'relative' }}>
          <svg viewBox="0 0 160 24" style={{ width:'100%', height:28 }} preserveAspectRatio="none">
            <defs>
              <linearGradient id={`sg_${node.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isPos ? '#16a34a' : '#dc2626'} stopOpacity="0.22" />
                <stop offset="100%" stopColor={isPos ? '#16a34a' : '#dc2626'} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={sparkPath + ' L160,24 L0,24 Z'} fill={`url(#sg_${node.id})`} />
            <path d={sparkPath} stroke={isPos ? 'var(--green)' : 'var(--red)'} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        {/* Stats row — holding-specific */}
        {(() => {
          const h0 = node.holdings[0]
          const price = h0?.price ?? 0
          const qty   = h0?.shares ?? 0
          const val   = node.aum
          const stats = [
            { label: 'Price', val: price >= 1000 ? `$${(price/1000).toFixed(1)}K` : `$${price.toLocaleString()}`, c:'var(--text)' },
            { label: 'Qty',   val: qty >= 1000 ? `${(qty/1000).toFixed(1)}K` : `${qty.toLocaleString()}`,           c:'var(--text)' },
            { label: 'Value', val: val >= 1000 ? `$${(val/1000).toFixed(1)}K` : `$${val.toLocaleString()}`,         c: hex },
          ]
          return (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              background: 'var(--surface2)', borderRadius: 10,
              overflow: 'hidden', marginBottom: 10,
              border: '1px solid var(--border)',
            }}>
              {stats.map((s, i) => (
                <div key={s.label} style={{
                  padding: '7px 4px', textAlign: 'center',
                  borderRight: i < 2 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ fontFamily:'var(--font-display)', fontWeight: 700, fontSize:'0.82rem', color: s.c }}>{s.val}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.07em', marginTop:1 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* CTA hint */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: hex,
          borderTop: '1px solid var(--border)', paddingTop: 10,
          fontWeight: 600, position:'relative',
        }}>
          <div style={{ width: 6, height: 6, borderRadius:'50%', background: hex, animation:'gcPulse 1.5s ease-in-out infinite' }} />
          Click to open →
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// LAYER 4 — BENTO DRILL-DOWN DASHBOARD
// ═══════════════════════════════════════════════════════════
function Sparkline({ dir, color, h = 32 }) {
  const pts  = genSparkline(dir)
  const path = pts.map((v, i) => `${i===0?'M':'L'}${(i/(pts.length-1))*120},${h - v*(h-2)}`).join(' ')
  return (
    <svg viewBox={`0 0 120 ${h}`} style={{ width:'100%', height:h }} preserveAspectRatio="none">
      <path d={path} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function PriceChart({ mtd, nodeColor, points = null, hoveredIndex = null, onHoverIndexChange = null }) {
  const hex  = '#' + (nodeColor || 0x2dd4bf).toString(16).padStart(6,'0')
  const pts  = Array.isArray(points) && points.length > 1 ? points : genPriceSeries(mtd)
  const W = 800
  const H = 110
  const path = pts.map((v, i) => `${i===0?'M':'L'}${(i/(pts.length-1))*800},${110-v*100}`).join(' ')
  const area = path + ' L800,110 L0,110 Z'
  const activeIndex = typeof hoveredIndex === 'number'
    ? Math.min(Math.max(hoveredIndex, 0), pts.length - 1)
    : null
  const markerX = activeIndex != null ? (activeIndex / (pts.length - 1)) * W : null
  const markerY = activeIndex != null ? H - pts[activeIndex] * 100 : null
  const handlePointer = event => {
    if (typeof onHoverIndexChange !== 'function') return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width || 1)
    const idx = Math.round((x / Math.max(rect.width || 1, 1)) * (pts.length - 1))
    onHoverIndexChange(Math.min(Math.max(idx, 0), pts.length - 1))
  }
  return (
    <svg
      viewBox="0 0 800 110"
      style={{ width:'100%', height:100, cursor:'crosshair' }}
      preserveAspectRatio="none"
      onMouseMove={handlePointer}
      onMouseLeave={() => { if (typeof onHoverIndexChange === 'function') onHoverIndexChange(null) }}
    >
      <defs>
        <linearGradient id={`pg_${nodeColor}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.28" />
          <stop offset="100%" stopColor={hex} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#pg_${nodeColor})`} />
      <path d={path} stroke="#7c3aed" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {activeIndex != null && (
        <>
          <line x1={markerX} x2={markerX} y1={6} y2={106} stroke="rgba(124,58,237,0.28)" strokeWidth="1.2" strokeDasharray="4 4" />
          <circle cx={markerX} cy={markerY} r="4.6" fill="#fff" stroke="#7c3aed" strokeWidth="2.2" />
        </>
      )}
    </svg>
  )
}

function WellnessRing({ score, size = 84, centerText = null, subLabel = 'score' }) {
  const [animatedScore, setAnimatedScore] = useState(0)

  useEffect(() => {
    let frameId = 0
    let start = null
    const target = Math.max(0, Math.min(100, Number(score) || 0))
    const duration = 1400

    const tick = ts => {
      if (start == null) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedScore(Math.round(target * eased))
      if (progress < 1) frameId = requestAnimationFrame(tick)
    }

    setAnimatedScore(0)
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [score])

  const r     = size * 0.42
  const circ  = 2 * Math.PI * r
  const color = score <= 5 ? '#34d399' : score <= 20 ? '#c9a84c' : '#f87171'
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={`wg_${score}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.6" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={size*0.085} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`url(#wg_${score})`} strokeWidth={size*0.085}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - animatedScore/100)}
          style={{ transition: 'stroke-dashoffset 0.08s linear' }} />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:size*0.24, color:'var(--text)', lineHeight:1 }}>
          {centerText ?? animatedScore}
        </span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:size*0.11, color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.07em', marginTop:2 }}>
          {subLabel}
        </span>
      </div>
    </div>
  )
}

function BentoDashboard({ node, show, onClose, onPrev, onNext, canNavigate = false, themeId = 'default', layout = null }) {
  const [entered, setEntered] = useState(false)
  const [chartHoverIndex, setChartHoverIndex] = useState(null)
  const stableChartPts = useMemo(() => (
    node ? genPriceSeries(node.mtd) : []
  ), [node?.id, node?.mtd])
  useEffect(() => {
    if (show) { const t = setTimeout(() => setEntered(true), 30); return () => clearTimeout(t) }
    else setEntered(false)
  }, [show])
  useEffect(() => {
    setChartHoverIndex(null)
  }, [node?.id, show])
  useEffect(() => {
    if (!show) return
    const onKeyDown = (event) => {
      if (!canNavigate) return
      if (event.key === 'ArrowLeft') onPrev?.()
      if (event.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [show, canNavigate, onPrev, onNext])

  if (!node) return null
  const hex   = '#' + node.color.toString(16).padStart(6,'0')
  const isPos = node.mtd >= 0
  const isSilentNight = themeId === 'silent-night'
  const panelSurface = isSilentNight
    ? 'linear-gradient(180deg, rgba(18,20,24,0.97), rgba(12,14,18,0.98))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.98))'
  const panelBorder = isSilentNight ? '1px solid rgba(190,183,164,0.2)' : '1px solid rgba(15,23,42,0.08)'
  const panelShadow = isSilentNight
    ? '0 34px 90px rgba(0,0,0,0.58), 0 18px 40px rgba(0,0,0,0.36)'
    : '0 34px 90px rgba(15,23,42,0.18), 0 18px 40px rgba(15,23,42,0.1)'
  const cardSurface = isSilentNight
    ? 'linear-gradient(180deg, rgba(22,25,32,0.95), rgba(16,19,26,0.97))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.98))'
  const cardBorder = isSilentNight ? '1px solid rgba(190,183,164,0.16)' : '1px solid rgba(15,23,42,0.08)'
  const tileSurface = isSilentNight ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.5)'
  const tileBorder = isSilentNight ? '1px solid rgba(190,183,164,0.12)' : '1px solid rgba(15,23,42,0.06)'
  const chipSurface = isSilentNight ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)'
  const closeSurface = isSilentNight ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.86)'
  const closeBorder = isSilentNight ? '1px solid rgba(190,183,164,0.16)' : '1px solid rgba(15,23,42,0.08)'
  const isCompactViewport = layout?.mode === 'compact'
  const panelWidth = isCompactViewport
    ? '100%'
    : `${Math.round(layout?.panelWidth ?? 860)}px`
  const BC_LOCAL = {
    background: cardSurface,
    border: cardBorder,
    borderRadius: 16,
    padding: '18px 20px',
    boxShadow: isSilentNight ? '0 14px 28px rgba(0,0,0,0.24)' : '0 14px 28px rgba(15,23,42,0.06)',
  }
  const BL_LOCAL = {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.64rem',
    color: 'var(--text-faint)',
    textTransform: 'uppercase',
    letterSpacing: '0.13em',
    marginBottom: 14,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }

  return (
    <>
      {/* ── Portal flash overlay ── */}
      <div style={{
        position:'fixed', inset:0, zIndex:290, pointerEvents:'none',
        background: `radial-gradient(ellipse at center, ${hex}30 0%, rgba(4,8,16,0.0) 70%)`,
        opacity: show && !entered ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }} />

      {/* ── Backdrop ── */}
      <div
        onClick={e => e.target === e.currentTarget && onClose()}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'linear-gradient(90deg, rgba(8,12,22,0.22) 0%, rgba(8,12,22,0.1) 44%, rgba(8,12,22,0.03) 100%)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          padding: '20px 16px',
          opacity: entered ? 1 : 0,
          transition: 'opacity 0.35s ease',
        }}
      >
        <div style={{
          position: 'relative',
          width: panelWidth,
          marginLeft: isCompactViewport ? 0 : `${Math.round(layout?.panelLeft ?? 0)}px`,
          transition: 'margin-left 0.4s cubic-bezier(0.16,1,0.3,1), width 0.4s cubic-bezier(0.16,1,0.3,1)',
        }}>
        {/* ── Panel ── */}
        <div style={{
          width: '100%',
          maxHeight: '86vh', overflowY: 'auto',
          background: panelSurface,
          border: panelBorder,
          borderTop: `2px solid ${hex}`,
          borderRadius: 24,
          boxShadow: panelShadow,
          transform: entered ? 'scale(1) translateY(0)' : 'scale(0.86) translateY(50px)',
          transition: 'transform 0.45s cubic-bezier(0.16,1,0.3,1)',
          overflow: 'hidden',
        }}>
          {/* Accent top bar */}
          <div style={{
            height: 2, width:'100%',
            background: `linear-gradient(90deg,${hex},#7c3aed,${hex})`,
          }} />

          <div style={{ padding: '28px 32px 32px' }}>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28 }}>
              <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                <div style={{
                  width:56, height:56, borderRadius:16,
                  background: isSilentNight
                    ? `linear-gradient(135deg,rgba(255,255,255,0.08),${hex}18)`
                    : `linear-gradient(135deg,rgba(255,255,255,0.92),${hex}12)`,
                  border:`1px solid ${hex}30`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:'1.9rem', flexShrink:0,
                  boxShadow: isSilentNight ? '0 12px 24px rgba(0,0,0,0.28)' : '0 12px 24px rgba(15,23,42,0.08)',
                }}>
                  {node.flag}
                </div>
                <div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:hex, textTransform:'uppercase', letterSpacing:'0.18em', marginBottom:4 }}>
                    {node.region}
                  </div>
                  <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.65rem', lineHeight:1.1, marginBottom:3 }}>
                    {node.label}
                  </div>
                  {node.holdings.length === 1 && node.holdings[0].name !== node.label && (
                    <div style={{ fontSize:'0.82rem', color:'var(--text-dim)', marginBottom:4 }}>{node.holdings[0].name}</div>
                  )}
                  <div style={{ fontSize:'0.83rem', color:'var(--text-dim)' }}>
                    ${node.aum.toLocaleString()} market value ·{' '}
                    <span style={{ color: isPos ? 'var(--green)':'var(--red)', fontWeight:600 }}>
                      {isPos?'+':''}{node.mtd}% since avg cost
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {canNavigate && (
                  <>
                    <button
                      onClick={onPrev}
                      aria-label="Previous asset"
                      style={{
                        background: closeSurface,
                        border: closeBorder,
                        color: 'var(--text-faint)',
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        fontSize: '1.05rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(15,23,42,0.18)'; e.currentTarget.style.color='var(--text)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(15,23,42,0.08)'; e.currentTarget.style.color='var(--text-faint)' }}
                    >
                      ‹
                    </button>
                    <button
                      onClick={onNext}
                      aria-label="Next asset"
                      style={{
                        background: closeSurface,
                        border: closeBorder,
                        color: 'var(--text-faint)',
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        fontSize: '1.05rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(15,23,42,0.18)'; e.currentTarget.style.color='var(--text)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(15,23,42,0.08)'; e.currentTarget.style.color='var(--text-faint)' }}
                    >
                      ›
                    </button>
                  </>
                )}
                <button onClick={onClose} style={{
                  background: closeSurface, border: closeBorder,
                  color:'var(--text-faint)', width:38, height:38, borderRadius:10,
                  fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center',
                  cursor:'pointer', transition:'all 0.2s', flexShrink:0,
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(15,23,42,0.18)'; e.currentTarget.style.color='var(--text)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(15,23,42,0.08)'; e.currentTarget.style.color='var(--text-faint)' }}
                >✕</button>
              </div>
            </div>

            {/* ════ BENTO GRID ════ */}
            {(() => {
              const h0 = node.holdings[0]
              const chartPts = stableChartPts.length > 1 ? stableChartPts : genPriceSeries(node.mtd)
              // recalculate cost basis
              const costBasis = h0 ? h0.shares * (h0.price / (1 + node.mtd / 100)) : 0
              const gainAbs = node.aum - costBasis
              const lastPoint = chartPts.length ? chartPts[chartPts.length - 1] : 0
              const peakPoint = chartPts.length ? Math.max(...chartPts) : 0
              const currentPrice = Number(h0?.price || 0)
              const hoveredPoint = typeof chartHoverIndex === 'number'
                ? chartPts[Math.min(Math.max(chartHoverIndex, 0), chartPts.length - 1)]
                : lastPoint
              const hoveredPrice = currentPrice > 0 && lastPoint > 0 ? (currentPrice * hoveredPoint) / lastPoint : currentPrice
              const athPrice = currentPrice > 0 && lastPoint > 0 ? (currentPrice * peakPoint) / lastPoint : currentPrice
              const dropFromAthPct = athPrice > 0 ? Math.max(0, ((athPrice - hoveredPrice) / athPrice) * 100) : 0
              const latestDropFromAthPct = athPrice > 0 ? Math.max(0, ((athPrice - currentPrice) / athPrice) * 100) : 0
              const displayDropPct = dropFromAthPct < 0.005 ? 0 : dropFromAthPct
              const displayLatestDropPct = latestDropFromAthPct < 0.005 ? 0 : latestDropFromAthPct
              return (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gridTemplateRows:'auto auto', gap:14, marginBottom:14 }}>

              {/* Cell A — Price chart (2 cols) */}
                  <div style={{ ...BC_LOCAL, gridColumn:'1/3' }}>
                <div style={BL_LOCAL}>
                  <span>{h0?.name || node.label} — Price Trend</span>
                  <span style={{ fontFamily:'var(--font-display)', fontSize:'0.88rem', letterSpacing:0, color: isPos?'var(--green)':'var(--red)' }}>
                    {node.returnPct} return
                  </span>
                </div>
                <PriceChart
                  mtd={node.mtd}
                  nodeColor={node.color}
                  points={chartPts}
                  hoveredIndex={chartHoverIndex}
                  onHoverIndexChange={setChartHoverIndex}
                />
              </div>

              {/* Cell B — Return ring */}
               <div style={{ ...BC_LOCAL, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10 }}>
                <WellnessRing
                  score={Math.min(100, displayDropPct)}
                  centerText={`${displayDropPct.toFixed(1)}%`}
                  subLabel="below ATH"
                  size={90}
                />
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem', color:'var(--red)', marginBottom:2 }}>
                    {displayLatestDropPct > 0 ? `-${displayLatestDropPct.toFixed(2)}%` : '0.00%'}
                  </div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'var(--text-faint)' }}>
                    {athPrice > 0
                      ? `Latest $${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} vs ATH $${athPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : 'Latest price vs ATH unavailable'}
                  </div>
                </div>
              </div>

              {/* Cell C — Position details (2 cols) */}
               <div style={{ ...BC_LOCAL, gridColumn:'1/3' }}>
                <div style={BL_LOCAL}><span>Position Details</span></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  {[
                    { label:'Current Price', val: h0 ? `$${h0.price.toLocaleString()}` : '—', c: 'var(--text)' },
                    { label:'Market Value',  val: `$${node.aum.toLocaleString()}`,              c: 'var(--gold)' },
                    { label:'Quantity',      val: h0 ? h0.shares.toLocaleString() : '—',        c: 'var(--teal)' },
                    { label:'Unrealised P&L',val: `${gainAbs >= 0 ? '+' : ''}$${Math.round(gainAbs).toLocaleString()}`, c: gainAbs >= 0 ? 'var(--green)' : 'var(--red)' },
                  ].map(s => (
                    <div key={s.label} style={{ background: tileSurface, borderRadius:10, padding:'10px 14px', border: tileBorder }}>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5 }}>{s.label}</div>
                      <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1rem', color:s.c }}>{s.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cell D — P&L summary */}
               <div style={{ ...BC_LOCAL }}>
                <div style={BL_LOCAL}><span>Summary</span></div>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.7rem', color: isPos?'var(--green)':'var(--red)', lineHeight:1, marginBottom:4 }}>
                  {isPos?'+':''}{node.mtd}%
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--text-faint)', marginBottom:14 }}>since avg cost</div>
                {[
                  ['Type',     node.region,                          'var(--teal)'],
                  ['Value',    `$${node.aum.toLocaleString()}`,      'var(--gold)'],
                  ['P&L',      `${gainAbs >= 0?'+':''}$${Math.round(gainAbs).toLocaleString()}`, gainAbs>=0?'var(--green)':'var(--red)'],
                ].map(([k,v,c]) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', marginBottom:6 }}>
                    <span style={{ color:'var(--text-dim)' }}>{k}</span>
                    <span style={{ fontFamily:'var(--font-mono)', color:c, fontWeight:600 }}>{v}</span>
                  </div>
                ))}
              </div>

            </div>
              )
            })()}

            {/* Holdings grid */}
            <div style={BL_LOCAL}><span>Price Action</span><span style={{ letterSpacing:0, fontSize:'0.7rem', color:'var(--text-dim)' }}>{node.label}</span></div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(195px,1fr))', gap:12 }}>
              {node.holdings.map(h => {
                const hc  = h.change >= 0 ? 'var(--green)' : 'var(--red)'
                const dir = h.dir || (h.change >= 0 ? 'up' : 'dn')
                return (
                  <div key={h.ticker} style={{
                    background: cardSurface,
                    border: cardBorder,
                    borderRadius:14, padding:'15px 17px', cursor:'pointer', transition:'all 0.2s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor=isSilentNight ? 'rgba(190,183,164,0.28)' : 'rgba(15,23,42,0.16)'; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=isSilentNight ? '0 14px 28px rgba(0,0,0,0.26)' : '0 14px 28px rgba(15,23,42,0.08)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor=isSilentNight ? 'rgba(190,183,164,0.16)' : 'rgba(15,23,42,0.08)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', background: chipSurface, padding:'2px 8px', borderRadius:6, color:'var(--text-faint)' }}>
                        {h.ticker}
                      </span>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:hc }}>
                        {h.change >= 0 ? '+' : ''}{h.change}%
                      </span>
                    </div>
                    <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.88rem', marginBottom:3 }}>{h.name}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:'var(--text-dim)', marginBottom:10 }}>
                      {h.shares.toLocaleString()} units @ <span style={{ color:'var(--text)' }}>${h.price.toLocaleString()}</span>
                    </div>
                    <Sparkline dir={dir} color={hc} h={30} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        </div>
      </div>
    </>
  )
}

// Bento shared styles
const BC = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.98))',
  border: '1px solid rgba(15,23,42,0.08)',
  borderRadius: 16, padding: '18px 20px',
  boxShadow: '0 14px 28px rgba(15,23,42,0.06)',
}
const BL = {
  fontFamily: 'var(--font-mono)', fontSize: '0.64rem',
  color: 'var(--text-faint)', textTransform: 'uppercase',
  letterSpacing: '0.13em', marginBottom: 14,
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}

// ═══════════════════════════════════════════════════════════
// GLOBE PAGE
// ═══════════════════════════════════════════════════════════
const FEATURES = [
  { icon:'🌍', title:'Globe Portfolio View',       desc:'Place assets on an interactive 3D globe. Drill into any region to explore holdings, performance, and regional exposure at a glance.',         accent:'var(--teal)',   iconBg:'rgba(45,212,191,0.1)'  },
  { icon:'⚡', title:'Real-time Wellness Score',   desc:'Live metrics across diversification, liquidity, and behavioural resilience — your financial health in a single score, always up to date.',    accent:'var(--gold)',   iconBg:'rgba(201,168,76,0.1)'  },
  { icon:'🧠', title:'AI Scenario Advisor',        desc:'Personalised recommendations calibrated to your risk profile. Simulate macro scenarios and understand their impact on your wealth.',           accent:'var(--purple)', iconBg:'rgba(167,139,250,0.1)' },
  { icon:'🔗', title:'Unified Wealth Wallet',      desc:'Connect traditional accounts, brokerage APIs, and digital wallets. One secure hub for every asset class you own.',                            accent:'var(--blue)',   iconBg:'rgba(96,165,250,0.1)'  },
  { icon:'👥', title:'Peer Age Benchmarking',      desc:'See how your portfolio stacks up against your demographic cohort. Understand where you lead — and where to close the gap.',                   accent:'var(--green)',  iconBg:'rgba(52,211,153,0.1)'  },
  { icon:'🎯', title:'Risk-Calibrated Goals',      desc:'Set your tolerance once; receive a dynamically rebalanced roadmap that adapts as markets and life circumstances change.',                     accent:'var(--red)',    iconBg:'rgba(248,113,113,0.1)' },
]

const RISK_DEFS = [
  { min:0,  max:33, icon:'🛡️', title:'Conservative Portfolio', desc:'Capital preservation focus. 30% equities, 60% bonds, 10% alternatives.', color:'var(--green)' },
  { min:34, max:66, icon:'⚖️', title:'Balanced Portfolio',     desc:'Moderate growth with managed volatility. 60% equities, 30% bonds, 10% alternatives.', color:'var(--gold)' },
  { min:67, max:100,icon:'🚀', title:'Aggressive Portfolio',   desc:'Growth-oriented. 90% equities, 5% bonds, 5% alternatives.', color:'var(--red)' },
]

// ═══════════════════════════════════════════════════════════
// 2D GLOBE ENGINE
// ═══════════════════════════════════════════════════════════

// Sphere gradient colours per theme
const SPHERE_THEMES = {
  'default':      { s1:'#2a2d33', s2:'#18191e', s3:'#0a0b0d', land:'rgba(38,42,50,0.50)',   landStroke:'rgba(120,130,145,0.14)', rim:'#7a8899' },
  'earthy':       { s1:'#966336', s2:'#5c3a18', s3:'#2a1608', land:'rgba(120,80,40,0.45)', landStroke:'rgba(210,150,70,0.14)', rim:'#966336' },
  'moonlit':      { s1:'#22252c', s2:'#14161b', s3:'#08090b', land:'rgba(30,34,44,0.50)',   landStroke:'rgba(130,145,165,0.12)',rim:'#4a6fa5' },
  'silent-night': { s1:'#2e2518', s2:'#1a1510', s3:'#0a0a08', land:'rgba(40,32,20,0.50)',   landStroke:'rgba(190,183,164,0.12)',rim:'#beb7a4' },
}

// Simplified continent outlines [lat, lng]
const CONTINENT_POLYS = [
  [[70,-140],[72,-120],[68,-100],[60,-85],[50,-80],[45,-65],[40,-70],[25,-80],[20,-87],[15,-85],[10,-75],[8,-77],[10,-85],[20,-105],[22,-110],[30,-115],[35,-120],[40,-124],[48,-124],[54,-130],[60,-138],[68,-140]],
  [[10,-62],[8,-60],[5,-52],[0,-50],[-5,-35],[-10,-37],[-15,-39],[-23,-43],[-30,-50],[-34,-58],[-38,-62],[-42,-65],[-50,-68],[-55,-68],[-55,-65],[-50,-73],[-45,-75],[-40,-73],[-30,-71],[-20,-70],[-10,-75],[-5,-77],[0,-76],[5,-76],[8,-72]],
  [[36,10],[37,15],[40,18],[42,20],[45,15],[47,10],[48,2],[51,-2],[53,3],[57,10],[60,5],[62,6],[65,14],[68,20],[70,28],[68,30],[65,28],[62,30],[60,25],[58,22],[56,22],[54,20],[52,20],[50,18],[48,17],[44,18],[42,18],[40,20],[38,22],[36,23],[35,25],[36,28],[38,30],[40,36],[38,40],[36,37],[35,33],[35,28],[36,22]],
  [[37,10],[37,14],[33,12],[30,32],[22,37],[15,42],[12,44],[10,42],[4,40],[0,42],[-5,40],[-10,38],[-15,36],[-20,35],[-26,32],[-30,30],[-34,26],[-34,18],[-30,16],[-25,14],[-20,12],[-15,12],[-10,15],[-5,10],[0,10],[5,2],[5,-5],[10,-15],[15,-18],[20,-16],[25,-15],[30,-10],[36,-5],[38,8]],
  [[70,30],[73,60],[72,100],[68,130],[65,140],[60,140],[55,135],[50,130],[45,135],[40,130],[35,127],[30,122],[25,120],[20,110],[15,108],[10,104],[5,100],[10,77],[15,74],[20,73],[22,70],[25,67],[28,62],[30,58],[32,44],[35,36],[38,28],[40,30],[45,38],[50,40],[55,38],[60,30],[65,30]],
  [[-15,130],[-12,136],[-13,142],[-15,145],[-20,148],[-25,152],[-30,153],[-34,150],[-38,146],[-38,140],[-34,136],[-32,124],[-26,114],[-22,114],[-18,122]],
]

// ── 2D math helpers ──────────────────────────────────────────────────────────
function ll2xyz(lat, lng) {
  const phi   = (90 - lat)  * Math.PI / 180
  const theta = (lng + 180) * Math.PI / 180
  return { x: -Math.sin(phi) * Math.cos(theta), y: Math.cos(phi), z: Math.sin(phi) * Math.sin(theta) }
}
function rotP(p, ry, rx) {
  const x  =  p.x * Math.cos(ry) + p.z * Math.sin(ry)
  const z  = -p.x * Math.sin(ry) + p.z * Math.cos(ry)
  const y2 =  p.y * Math.cos(rx) - z   * Math.sin(rx)
  const z2 =  p.y * Math.sin(rx) + z   * Math.cos(rx)
  return { x, y: y2, z: z2 }
}
function proj2d(p, cx, cy, r) {
  return { sx: cx + p.x * r, sy: cy - p.y * r, z: p.z }
}
function randomSphere() {
  const theta = 2 * Math.PI * Math.random()
  const phi   = Math.acos(2 * Math.random() - 1)
  return { lat: 90 - phi * 180 / Math.PI, lng: theta * 180 / Math.PI - 180 }
}
function hexRgba(hex, a) {
  const h = (typeof hex === 'number' ? hex.toString(16).padStart(6,'0') : hex.replace('#',''))
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
  return `rgba(${r},${g},${b},${a})`
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function getRotationForLatLng(lat, lng) {
  return {
    rotY: wrapAngle((-90 - lng) * Math.PI / 180),
    rotX: Math.max(-0.5, Math.min(0.5, lat * Math.PI / 180)),
  }
}

// Kept only as ZONE_DEFS for hover detection — no longer used for canvas drawing
const GLOBE_ZONES = [
  {
    label:'Equities',    cx:360,  cy:330, rx:265, ry:198,
    core:[{cx:360,cy:330,rx:265,ry:198,rot:0.08},{cx:395,cy:348,rx:185,ry:140,rot:-0.05}],
    dr:10,  dg:38,  db:98,    // very dark blue fill
    lr:96,  lg:165, lb:250,   // light edge #60a5fa
    color:'#60a5fa',
  },
  {
    label:'Bonds',       cx:850,  cy:210, rx:188, ry:142,
    core:[{cx:850,cy:210,rx:188,ry:142,rot:0},{cx:875,cy:228,rx:132,ry:100,rot:0.07}],
    dr:48,  dg:20,  db:112,   // very dark purple
    lr:167, lg:139, lb:250,
    color:'#a78bfa',
  },
  {
    label:'Real Assets', cx:1250, cy:430, rx:202, ry:158,
    core:[{cx:1250,cy:430,rx:202,ry:158,rot:0.06},{cx:1272,cy:450,rx:148,ry:114,rot:-0.06}],
    dr:10,  dg:68,  db:48,    // very dark emerald
    lr:52,  lg:211, lb:153,   // light edge #34d399
    color:'#34d399',
  },
  {
    label:'Digital',     cx:1680, cy:280, rx:182, ry:152,
    core:[{cx:1680,cy:280,rx:182,ry:152,rot:-0.07},{cx:1660,cy:300,rx:128,ry:108,rot:0.05}],
    dr:6,   dg:68,  db:65,    // very dark teal
    lr:45,  lg:212, lb:191,
    color:'#2dd4bf',
  },
  {
    label:'Commodities', cx:1000, cy:730, rx:272, ry:148,
    core:[{cx:1000,cy:730,rx:272,ry:148,rot:0},{cx:1022,cy:752,rx:192,ry:108,rot:0.04}],
    dr:105, dg:62,  db:5,     // very dark amber
    lr:251, lg:191, lb:36,
    color:'#fbbf24',
  },
]

const ZONE_ROTATION_TARGETS = {
  Equities: getRotationForLatLng(38, -95),
  Bonds: getRotationForLatLng(52, -25),
  'Real Assets': getRotationForLatLng(18, 35),
  Digital: getRotationForLatLng(34, 118),
  Commodities: getRotationForLatLng(-18, 22),
}

const GLOBE_PREFS_KEY = 'ws_globe_prefs'
const GLOBE_PREFS_EVENT = 'ws:globe-prefs'

function readGlobePrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(GLOBE_PREFS_KEY) || '{}')
    return {
      rotationSpeed: Number.isFinite(parsed.rotationSpeed) ? parsed.rotationSpeed : 40,
      nodeScale: Number.isFinite(parsed.nodeScale) ? parsed.nodeScale : 50,
      labels: parsed.labels !== false,
      pulses: parsed.pulses !== false,
    }
  } catch {
    return { rotationSpeed: 40, nodeScale: 50, labels: true, pulses: true }
  }
}

function rotationSpeedToIdle(speedPct) {
  const value = Math.max(0, Math.min(100, Number(speedPct) || 0))
  return (value / 100) * 0.004
}

function nodeScaleFactor(scalePct) {
  const value = Math.max(0, Math.min(100, Number(scalePct) || 0))
  return 0.6 + (value / 100) * 0.8
}

// ─── Per-theme palette for the 2D canvas texture ────────────────────────────
// base: THREE hex integer used to tint the globe material colour
// bg:   CSS solid colour for the canvas texture fill
// dot:  CSS rgba for the grid dot overlay
const TEXTURE_THEMES = {
  'default': {
    base: 0x12244a,
    bg:   '#12244a',
    dot:  'rgba(45,212,191,0.18)',
  },
  'earthy': {
    base: 0x3d1e0a,
    bg:   '#3d1e0a',
    dot:  'rgba(180,130,55,0.22)',
  },
  'moonlit': {
    base: 0x22252c,
    bg:   '#22252c',
    dot:  'rgba(130,145,165,0.20)',
  },
  'silent-night': {
    base: 0x2e2518,
    bg:   '#2e2518',
    dot:  'rgba(200,192,165,0.22)',
  },
}

function paintGlobeCanvas(ctx, themeId) {
  const t = TEXTURE_THEMES[themeId] || TEXTURE_THEMES['default']
  ctx.clearRect(0, 0, 2048, 1024)

  // Solid base colour
  ctx.fillStyle = t.bg
  ctx.fillRect(0, 0, 2048, 1024)

  // Subtle dot grid
  for (let gx = 0; gx < 2048; gx += 52) {
    for (let gy = 0; gy < 1024; gy += 52) {
      ctx.beginPath(); ctx.arc(gx, gy, 1.2, 0, Math.PI * 2)
      ctx.fillStyle = t.dot; ctx.fill()
    }
  }

  // Zone dashed outlines + labels only — no fills, no halos
  GLOBE_ZONES.forEach(z => {
    // Outer dashed ring
    ctx.save()
    ctx.beginPath(); ctx.ellipse(z.cx, z.cy, z.rx, z.ry, 0, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${z.lr},${z.lg},${z.lb},0.72)`
    ctx.lineWidth = 2.2; ctx.setLineDash([11, 7]); ctx.stroke()
    ctx.setLineDash([]); ctx.restore()

    // Inner subtle ring
    ctx.save()
    ctx.beginPath(); ctx.ellipse(z.cx, z.cy, z.rx * 0.82, z.ry * 0.82, 0, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${z.lr},${z.lg},${z.lb},0.22)`
    ctx.lineWidth = 1; ctx.stroke(); ctx.restore()

    // Zone label
    ctx.save()
    ctx.font = 'bold 17px monospace'
    ctx.fillStyle = `rgba(${z.lr},${z.lg},${z.lb},0.90)`
    ctx.textAlign = 'center'
    ctx.shadowColor = `rgba(${z.lr},${z.lg},${z.lb},0.55)`
    ctx.shadowBlur = 10
    ctx.fillText(z.label.toUpperCase(), z.cx, z.cy - z.ry * 0.52)
    ctx.restore()
  })
}

// ═══════════════════════════════════════════════════════════
// Build live globe nodes — one node per individual holding
// Falls back to MOCK_NODES when no profile is available
// ═══════════════════════════════════════════════════════════

// Deterministic spread: place n items in a ring/spiral around a base lat/lng
function spreadPositions(n, baseLat, baseLng, latRadius, lngRadius) {
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2
    // two rings: inner half, outer half
    const ring = i < Math.ceil(n / 2) ? 0.45 : 0.9
    return {
      lat: baseLat + Math.sin(angle) * latRadius * ring,
      lng: baseLng + Math.cos(angle) * lngRadius * ring,
    }
  })
}

function buildGlobeNodes(profile) {
  if (!profile?.portfolio) return MOCK_NODES

  const fmt2 = n => Math.round(n * 100) / 100
  const { stocks = [], cryptos = [], commodities = [] } = profile.portfolio
  const wm = profile.wellness_metrics ?? {}

  const makeNode = (h, ep, lat, lng, color, region, flag) => {
    const mtd = h.avg_price > 0 ? fmt2((h.current_price - h.avg_price) / h.avg_price * 100) : 0
    const ticker = (h.symbol || '').replace('-USD', '').replace('.SI', '')
    const hexStr = '#' + color.toString(16).padStart(6, '0')
    return {
      id:       `node_${h.symbol}`,
      lat, lng,
      label:    ticker,
      flag,
      region,
      color,
      type:     ep === 'cryptos' ? 'crypto' : ep === 'commodities' ? 'commodity' : 'equity',
      aum:      Math.round(h.market_value ?? 0),
      mtd,
      holdings: [{
        ticker,
        name:   h.name || h.symbol,
        price:  h.current_price ?? 0,
        change: mtd,
        shares: h.qty,
        dir:    mtd >= 0 ? 'up' : 'dn',
      }],
      alloc: [{ label: ticker, pct: 100, color: hexStr }],
      wellness: Math.round(wm.diversification_score ?? 70),
      returnPct: `${mtd >= 0 ? '+' : ''}${mtd}%`,
    }
  }

  const nodes = []

  // Stocks — spread across North America / Atlantic
  const activeStocks = stocks.filter(h => (h.qty ?? 0) > 0)
  const stockPos = spreadPositions(activeStocks.length, 38, -95, 16, 28)
  activeStocks.forEach((h, i) =>
    nodes.push(makeNode(h, 'stocks', stockPos[i].lat, stockPos[i].lng, 0x60a5fa, 'Equities', '📈'))
  )

  // Crypto — spread across East Asia / Pacific
  const activeCryptos = cryptos.filter(h => (h.qty ?? 0) > 0)
  const cryptoPos = spreadPositions(activeCryptos.length, 32, 118, 14, 22)
  activeCryptos.forEach((h, i) =>
    nodes.push(makeNode(h, 'cryptos', cryptoPos[i].lat, cryptoPos[i].lng, 0x2dd4bf, 'Digital Assets', '₿'))
  )

  // Commodities — spread across Africa / Middle East
  const activeCommodities = commodities.filter(h => (h.qty ?? 0) > 0)
  const commPos = spreadPositions(activeCommodities.length, -18, 22, 14, 22)
  activeCommodities.forEach((h, i) =>
    nodes.push(makeNode(h, 'commodities', commPos[i].lat, commPos[i].lng, 0xfbbf24, 'Commodities', '🪙'))
  )

  return nodes.length ? nodes : MOCK_NODES
}

export default function Globe() {
  const navigate    = useNavigate()
  const { user } = useAuth()
  const { setLoginModalOpen, setSurveyModalOpen } = useLoginModal()
  const { activeTheme } = useTheme()
  const canvasRef   = useRef(null)
  const globeRef    = useRef(null)   // THREE globe mesh
  const globeWrapRef = useRef(null)
  // 2D canvas globe refs
  const isDragRef        = useRef(false)
  const animIdRef        = useRef(null)
  const clusterScreenRef = useRef({})      // screen pos of each node centre, updated each frame
  const activeThemeRef   = useRef(activeTheme)  // read inside rAF without stale closure
  const globeNodesRef     = useRef(MOCK_NODES)  // live portfolio nodes (updated when profile loads)
  const buildParticlesRef = useRef(null)         // exposed by canvas effect so profile effect can rebuild
  const globePrefsRef     = useRef(readGlobePrefs())

  // UI state
  const [aum,           setAum]         = useState(0)
  const [pl,            setPl]          = useState(0)
  const [plSign,        setPlSign]      = useState(1)   // 1 = gain, -1 = loss
  const [plPct,         setPlPct]       = useState(0)
  const [hoverNode,     setHoverNode]   = useState(null)
  const [hoverPos,      setHoverPos]    = useState({ x:0, y:0 })
  const cardLockedRef = useRef(false)
  const [cardLocked,    setCardLocked]  = useState(false)  // mouse on glass card
  const [dashNode,      setDashNode]    = useState(null)
  const [dashShow,      setDashShow]    = useState(false)
  const [flyingIn,      setFlyingIn]    = useState(false)  // camera zoom animation
  const [riskPct,       setRiskPct]     = useState(50)
  const [hoverZone,     setHoverZone]   = useState(null)
  const [zonePos,        setZonePos]     = useState({ x:0, y:0 })
  const [selectedZone, setSelectedZone] = useState(null)
  const [legendHoverZone, setLegendHoverZone] = useState(null)
  const [dashboardLayout, setDashboardLayout] = useState(null)
  const focusMode = dashShow
  const blurredUiStyle = focusMode
    ? { filter: 'blur(8px)', opacity: 0.35, transition: 'filter 0.28s ease, opacity 0.28s ease' }
    : { filter: 'none', opacity: 1, transition: 'filter 0.28s ease, opacity 0.28s ease' }
  const riskLevel = RISK_DEFS.find(r => riskPct >= r.min && riskPct <= r.max) || RISK_DEFS[1]
  const heroNameStyle = activeTheme?.id === 'silent-night'
    ? {
        fontStyle: 'normal',
        background: 'linear-gradient(135deg,#fefcf7,#e9dfcf 58%,#cdb89c)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }
    : {
        fontStyle: 'normal',
        background: 'linear-gradient(135deg,var(--gold-light),var(--gold))',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }
  const riskTrackRef  = useRef(null)
  const riskDragRef   = useRef(false)
  const rotationTargetRef = useRef(null)
  const rotateToNode = useCallback((node) => {
    if (!node) return
    rotationTargetRef.current = getRotationForLatLng(node.lat, node.lng)
    if (node.region) setSelectedZone(node.region)
  }, [])

  // Wellness score + portfolio nodes for logged-in hero
  const [userProfile, setUserProfile] = useState(null)
  useEffect(() => {
    if (!user?.user_id) return
    fetch(`${API}/users/${user.user_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setUserProfile(d.user))
      .catch(() => {})
  }, [user?.user_id])

  // Rebuild globe nodes whenever profile loads / changes
  useEffect(() => {
    globeNodesRef.current = (user && userProfile) ? buildGlobeNodes(userProfile) : MOCK_NODES
    buildParticlesRef.current?.()   // regenerate cluster particles for new node set
  }, [user, userProfile])

  // Count of active holdings across all asset classes
  const activePositions = (() => {
    if (!userProfile?.portfolio) return 40
    const { stocks = [], cryptos = [], commodities = [] } = userProfile.portfolio
    return [...stocks, ...cryptos, ...commodities].filter(h => (h.qty ?? 0) > 0).length
  })()

  // Animated counters — driven entirely by real profile data
  useEffect(() => {
    if (!userProfile) return
    const pv = userProfile.portfolio_value ?? userProfile.total_balance ?? 0
    animateCount(setAum, pv, 1200)
    // Compute total unrealised P&L: Σ (market_value - qty * avg_price)
    const { stocks = [], cryptos = [], commodities = [] } = userProfile.portfolio ?? {}
    const allHoldings = [...stocks, ...cryptos, ...commodities]
    const totalPL = allHoldings.reduce((sum, h) => {
      if ((h.qty ?? 0) === 0) return sum
      return sum + ((h.market_value ?? 0) - (h.qty * (h.avg_price ?? 0)))
    }, 0)
    animateCount(setPl, Math.round(Math.abs(totalPL)), 1200)
    setPlSign(totalPL >= 0 ? 1 : -1)
    // P&L %
    const costBasis = allHoldings.reduce((sum, h) => {
      if ((h.qty ?? 0) === 0) return sum
      return sum + h.qty * (h.avg_price ?? 0)
    }, 0)
    setPlPct(costBasis > 0 ? (totalPL / costBasis) * 100 : 0)
  }, [userProfile])

  // Risk slider drag
  useEffect(() => {
    const onMove = e => {
      if (!riskDragRef.current || !riskTrackRef.current) return
      const r = riskTrackRef.current.getBoundingClientRect()
      setRiskPct(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)))
    }
    const onUp = () => { riskDragRef.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // Keep activeThemeRef in sync so the rAF loop always reads the latest theme
  useEffect(() => { activeThemeRef.current = activeTheme }, [activeTheme])

  // Keep globe runtime preferences (rotation speed / node scaling) in sync.
  useEffect(() => {
    const onPrefs = (event) => {
      const detail = event?.detail
      if (detail && typeof detail === 'object') {
        globePrefsRef.current = {
          rotationSpeed: Number.isFinite(detail.rotationSpeed) ? detail.rotationSpeed : globePrefsRef.current.rotationSpeed,
          nodeScale: Number.isFinite(detail.nodeScale) ? detail.nodeScale : globePrefsRef.current.nodeScale,
          labels: typeof detail.labels === 'boolean' ? detail.labels : globePrefsRef.current.labels,
          pulses: typeof detail.pulses === 'boolean' ? detail.pulses : globePrefsRef.current.pulses,
        }
      } else {
        globePrefsRef.current = readGlobePrefs()
      }
    }
    const onStorage = (event) => {
      if (event.key === GLOBE_PREFS_KEY) {
        globePrefsRef.current = readGlobePrefs()
      }
    }
    window.addEventListener(GLOBE_PREFS_EVENT, onPrefs)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(GLOBE_PREFS_EVENT, onPrefs)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // Open dashboard
  const openDashboard = useCallback((node) => {
    setCardLocked(false)
    setHoverNode(null)
    setFlyingIn(true)
    setTimeout(() => {
      setFlyingIn(false)
      setDashNode(node)
      setDashShow(true)
      rotateToNode(node)
    }, 320)
  }, [rotateToNode])

  const closeDashboard = useCallback(() => {
    setDashShow(false)
    setTimeout(() => setDashNode(null), 420)
  }, [])

  const cycleDashboardNode = useCallback((step) => {
    if (!dashNode) return
    const nodes = globeNodesRef.current || []
    if (nodes.length < 2) return
    const currentIndex = nodes.findIndex(item => item.id === dashNode.id)
    const startIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (startIndex + step + nodes.length) % nodes.length
    const nextNode = nodes[nextIndex]
    setDashNode(nextNode)
    rotateToNode(nextNode)
  }, [dashNode, rotateToNode])

  const rotateToZone = useCallback((zoneLabel) => {
    const target = ZONE_ROTATION_TARGETS[zoneLabel]
    if (!target) return
    rotationTargetRef.current = target
    setSelectedZone(zoneLabel)
  }, [])

  useEffect(() => {
    if (!dashShow) {
      setDashboardLayout(null)
      return
    }

    const computeDashboardLayout = () => {
      const viewportWidth = window.innerWidth
      const globeRect = globeWrapRef.current?.getBoundingClientRect()
      const globeWidth = Math.round(globeRect?.width ?? 580)
      const idealPanelWidth = Math.min(860, Math.max(320, viewportWidth * 0.56))
      const gap = 32
      const sidePadding = 32
      const requiredWidth = idealPanelWidth + gap + globeWidth + sidePadding

      if (viewportWidth < requiredWidth) {
        setDashboardLayout({
          mode: 'compact',
          panelWidth: Math.max(320, viewportWidth - 32),
          panelLeft: 0,
          globeShiftX: 0,
        })
        return
      }

      const groupLeft = Math.max(16, (viewportWidth - (idealPanelWidth + gap + globeWidth)) / 2)
      const targetGlobeCenterX = groupLeft + idealPanelWidth + gap + globeWidth / 2
      const currentGlobeCenterX = globeRect
        ? globeRect.left + globeRect.width / 2
        : viewportWidth / 2

      setDashboardLayout({
        mode: 'split',
        panelWidth: idealPanelWidth,
        panelLeft: groupLeft,
        globeShiftX: targetGlobeCenterX - currentGlobeCenterX,
      })
    }

    computeDashboardLayout()
    window.addEventListener('resize', computeDashboardLayout)
    return () => window.removeEventListener('resize', computeDashboardLayout)
  }, [dashShow])

  // ═══ 2D CANVAS GLOBE ════════════════════════════════════════
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const container = canvas.parentElement
    if (!container) return

    // ── Rotation + velocity state (mutable, lives outside React)
    let rotY = 0.5, rotX = 0.12
    let velY = rotationSpeedToIdle(globePrefsRef.current.rotationSpeed), velX = 0
    let W = 0, H = 0, CX = 0, CY = 0, R = 0

    // ── Particle arrays
    let bgPts = [], clsPts = []

    const buildParticles = () => {
      bgPts = Array.from({ length: 320 }, () => {
        const { lat, lng } = randomSphere()
        return {
          lat, lng, baseLat: lat, baseLng: lng,
          dL: (Math.random() - 0.5) * 0.1, dN: (Math.random() - 0.5) * 0.14,
          ph: Math.random() * Math.PI * 2, per: 4000 + Math.random() * 9000,
          r: Math.random() * 1.6 + 0.3, alpha: Math.random() * 0.45 + 0.1,
        }
      })
      clsPts = []
      globeNodesRef.current.forEach(node => {
        const hex = '#' + node.color.toString(16).padStart(6, '0')
        for (let i = 0; i < 16; i++) {
          const spread = 4 + Math.random() * 5, angle = Math.random() * Math.PI * 2, dist = Math.random() * spread
          const lat = node.lat + Math.cos(angle) * dist
          const lng = node.lng + Math.sin(angle) * dist * 1.4
          clsPts.push({
            nid: node.id, lat, lng, baseLat: lat, baseLng: lng,
            dL: (Math.random() - 0.5) * 0.07, dN: (Math.random() - 0.5) * 0.09,
            ph: Math.random() * Math.PI * 2, per: 3000 + Math.random() * 6000,
            color: hex, r: Math.random() * 2.4 + 0.7, alpha: Math.random() * 0.75 + 0.2,
            twinkle: Math.random() * Math.PI * 2,
          })
        }
      })
      buildParticlesRef.current = buildParticles  // expose so profile effect can re-trigger
    }

    const resize = () => {
      W = canvas.width  = container.offsetWidth  || 560
      H = canvas.height = container.offsetHeight || 560
      CX = W / 2; CY = H / 2
      R = Math.min(W, H) * 0.40
      buildParticles()
    }

    // ── Render one frame
    const frame = now => {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, W, H)
      const th = SPHERE_THEMES[activeThemeRef.current?.id] || SPHERE_THEMES['default']

      // Sphere base radial gradient
      const sg = ctx.createRadialGradient(CX - R * 0.22, CY - R * 0.25, R * 0.07, CX, CY, R)
      sg.addColorStop(0, th.s1); sg.addColorStop(0.5, th.s2); sg.addColorStop(1, th.s3)
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2)
      ctx.fillStyle = sg; ctx.fill()

      // ── Collect all dots (bg + cluster), sort back→front
      const dots = []

      bgPts.forEach(p => {
        const t = now / p.per
        const lat = p.baseLat + Math.sin(t + p.ph) * 14 * p.dL
        const lng  = p.baseLng + Math.cos(t * 0.7 + p.ph) * 14 * p.dN
        const r3 = rotP(ll2xyz(lat, lng), rotY, rotX)
        if (r3.z < -0.08) return
        const { sx, sy } = proj2d(r3, CX, CY, R)
        const fade = Math.max(0, Math.min(1, (r3.z + 0.08) / 0.25))
        dots.push({ sx, sy, z: r3.z, r: p.r, alpha: p.alpha * fade, color: 'rgba(210,215,255', isCluster: false })
      })

      clsPts.forEach(p => {
        const t = now / p.per
        const lat = p.baseLat + Math.sin(t + p.ph) * 12 * p.dL
        const lng  = p.baseLng + Math.cos(t * 0.65 + p.ph) * 12 * p.dN
        const r3 = rotP(ll2xyz(lat, lng), rotY, rotX)
        if (r3.z < -0.06) return
        const { sx, sy } = proj2d(r3, CX, CY, R)
        const fade     = Math.max(0, Math.min(1, (r3.z + 0.06) / 0.2))
        const twk      = 0.6 + 0.4 * Math.sin(now * 0.003 + p.twinkle)
        const [pr, pg, pb] = [parseInt(p.color.slice(1,3),16), parseInt(p.color.slice(3,5),16), parseInt(p.color.slice(5,7),16)]
        dots.push({ sx, sy, z: r3.z, r: p.r, alpha: p.alpha * fade * twk, color: `rgba(${pr},${pg},${pb}`, isCluster: true, glowColor: p.color })
      })

      dots.sort((a, b) => a.z - b.z)
      const nodeScale = nodeScaleFactor(globePrefsRef.current.nodeScale)
      const showLabels = globePrefsRef.current.labels !== false
      const showPulses = globePrefsRef.current.pulses !== false

      dots.forEach(d => {
        ctx.save()
        if (d.isCluster && d.z > 0) { ctx.shadowBlur = 10; ctx.shadowColor = d.glowColor }
        ctx.beginPath()
        ctx.arc(d.sx, d.sy, Math.max(0.5, d.r * nodeScale * (0.4 + 0.6 * Math.max(0, d.z + 0.5))), 0, Math.PI * 2)
        ctx.fillStyle = d.color + `,${d.alpha})`
        ctx.fill()
        ctx.restore()
      })

      // ── Continent outlines (clipped to sphere)
      ctx.save()
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.clip()
      CONTINENT_POLYS.forEach(poly => {
        const pts = poly.map(([la, lo]) => proj2d(rotP(ll2xyz(la, lo), rotY, rotX), CX, CY, R))
        ctx.beginPath()
        pts.forEach((pt, i) => i ? ctx.lineTo(pt.sx, pt.sy) : ctx.moveTo(pt.sx, pt.sy))
        ctx.closePath()
        ctx.fillStyle   = th.land;       ctx.fill()
        ctx.strokeStyle = th.landStroke; ctx.lineWidth = 0.7; ctx.stroke()
      })
      ctx.restore()

      // ── Rim glow
      const rim = ctx.createRadialGradient(CX, CY, R * 0.72, CX, CY, R)
      rim.addColorStop(0, 'transparent'); rim.addColorStop(1, hexRgba(th.rim, 0.2))
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.fillStyle = rim; ctx.fill()
      ctx.beginPath(); ctx.arc(CX, CY, R + 1.5, 0, Math.PI * 2)
      ctx.strokeStyle = hexRgba(th.rim, 0.16); ctx.lineWidth = 1.5; ctx.stroke()
      ctx.beginPath(); ctx.arc(CX, CY, R + 6, 0, Math.PI * 2)
      ctx.strokeStyle = hexRgba(th.rim, 0.05); ctx.lineWidth = 4; ctx.stroke()

      // ── Sphere shine highlight
      const shine = ctx.createRadialGradient(CX - R * 0.28, CY - R * 0.30, 0, CX - R * 0.18, CY - R * 0.22, R * 0.65)
      shine.addColorStop(0, 'rgba(255,255,255,0.08)'); shine.addColorStop(1, 'transparent')
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.fillStyle = shine; ctx.fill()

      // ── Cluster centres — pulse rings + core dot + label
      globeNodesRef.current.forEach(node => {
        const r3 = rotP(ll2xyz(node.lat, node.lng), rotY, rotX)
        const { sx, sy } = proj2d(r3, CX, CY, R)
        const hex = '#' + node.color.toString(16).padStart(6, '0')
        // Use bright red for pulse rings if holdings are going down
        const pulseColor = node.mtd < 0 ? '#ff0000' : hex
        clusterScreenRef.current[node.id] = { x: sx, y: sy, vis: r3.z > 0.05 }
        if (r3.z < 0.05) return
        const fade = Math.min(1, (r3.z - 0.05) / 0.15)

        // Dual pulse rings — bigger
        if (showPulses) {
          for (let w = 0; w < 2; w++) {
            const tp = ((now + w * 1200) % 2400) / 2400
            ctx.save()
            ctx.beginPath(); ctx.arc(sx, sy, (14 + tp * 36) * nodeScale, 0, Math.PI * 2)
            ctx.strokeStyle = hexRgba(pulseColor, (1 - tp) * 0.65 * fade)
            ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore()
          }
        }

        // Core glow dot — bigger
        ctx.save()
        ctx.shadowBlur = 28; ctx.shadowColor = hex
        const cg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14 * nodeScale)
        cg.addColorStop(0, hexRgba(hex, fade)); cg.addColorStop(1, hexRgba(hex, 0))
        ctx.beginPath(); ctx.arc(sx, sy, (9 + 0.9 * Math.sin(now * 0.003)) * nodeScale, 0, Math.PI * 2)
        ctx.fillStyle = cg; ctx.fill()
        ctx.beginPath(); ctx.arc(sx, sy, 5.5 * nodeScale, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = fade * 0.92; ctx.fill()
        ctx.restore()

        // Label — always show ticker, show market value below
        if (showLabels && r3.z > 0.12) {
          ctx.save(); ctx.globalAlpha = fade * 0.92
          ctx.font = "bold 10px 'DM Mono',monospace"; ctx.fillStyle = hex
          ctx.fillText(node.label.toUpperCase(), sx + 16, sy + 1)
          ctx.globalAlpha = fade * 0.55
          ctx.font = "8px 'DM Mono',monospace"; ctx.fillStyle = '#c8cfe0'
          ctx.fillText('$' + (node.aum / 1000).toFixed(0) + 'K', sx + 16, sy + 12)
          ctx.restore()
        }
      })
    }

    // ── Animation loop
    const loop = now => {
      if (!isDragRef.current) {
        const target = rotationTargetRef.current
        if (target) {
          const dy = wrapAngle(target.rotY - rotY)
          const dx = target.rotX - rotX
          rotY = wrapAngle(rotY + dy * 0.09)
          rotX += dx * 0.09
          velY *= 0.82
          velX *= 0.82

          if (Math.abs(dy) < 0.003 && Math.abs(dx) < 0.003) {
            rotY = target.rotY
            rotX = target.rotX
            rotationTargetRef.current = null
          }
        } else {
          // Gradually ease velY back toward the idle spin rate after a drag
          const idleVelY = rotationSpeedToIdle(globePrefsRef.current.rotationSpeed)
          velY += (idleVelY - velY) * 0.012
          rotY = wrapAngle(rotY + velY)
          rotX += velX; velX *= 0.94
        }
        rotX = Math.max(-0.5, Math.min(0.5, rotX))
      }
      frame(now)
      animIdRef.current = requestAnimationFrame(loop)
    }

    // ── Drag + hover + click handlers
    let prev = { x: 0, y: 0 }, lastDx = 0, lastDy = 0
    const onDown = e => {
      isDragRef.current = true
      rotationTargetRef.current = null
      prev = { x: e.clientX, y: e.clientY }
      velY = 0; velX = 0
      canvas.style.cursor = 'grabbing'
    }
    const onUp = e => {
      isDragRef.current = false
      velY = lastDx * 0.004; velX = lastDy * 0.004
      canvas.style.cursor = 'grab'
      // click detection
      const dist = Math.hypot(e.clientX - prev.x, e.clientY - prev.y)
      if (dist < 5) {
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        const clickRadius = 44 * nodeScaleFactor(globePrefsRef.current.nodeScale)
        for (const node of globeNodesRef.current) {
          const p = clusterScreenRef.current[node.id]
          if (p && p.vis && Math.hypot(mx - p.x, my - p.y) < clickRadius) {
            openDashboard(node); break
          }
        }
      }
    }
    const onMove = e => {
      if (isDragRef.current) {
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y
        rotY = wrapAngle(rotY + dx * 0.004); rotX += dy * 0.004
        rotX = Math.max(-0.6, Math.min(0.6, rotX))
        lastDx = dx; lastDy = dy
        prev = { x: e.clientX, y: e.clientY }
        return
      }
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      let found = null
      const hoverRadius = 34 * nodeScaleFactor(globePrefsRef.current.nodeScale)
      for (const node of globeNodesRef.current) {
        const p = clusterScreenRef.current[node.id]
        if (p && p.vis && Math.hypot(mx - p.x, my - p.y) < hoverRadius) { found = node; break }
      }
      if (found) {
        setHoverNode(found)
        setHoverPos({ x: mx, y: my })
        canvas.style.cursor = 'pointer'
      } else {
        if (!cardLockedRef.current) setHoverNode(null)
        canvas.style.cursor = 'grab'
      }
    }

    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('mousemove', onMove)

    const ro = new ResizeObserver(resize)
    ro.observe(container)
    resize()
    animIdRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(animIdRef.current)
      canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('mousemove', onMove)
      ro.disconnect()
    }
  }, [openDashboard]) // eslint-disable-line

  // (theme changes are picked up inside the rAF loop via activeThemeRef)


  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', overflowX:'hidden', position:'relative' }}>

      {/* Fixed top ticker */}
      {/* <TickerBar style={{ position:'fixed', top:0, left:0, right:0, zIndex:102 }} /> */}

      {/* ── NAV ── */}
      <div style={blurredUiStyle}>
        <Navbar />
      </div>

      {/* ── DOM star layer (CSS, complements WebGL) ── */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, ...blurredUiStyle }} aria-hidden>
        {STARS.map((s, i) => (
          <div key={i} style={{
            position:'absolute', borderRadius:'50%', background:'white',
            width:s.size, height:s.size,
            top:`${s.top}%`, left:`${s.left}%`,
            opacity:s.op,
            animation:`starTwinkle ${s.d}s ease-in-out ${s.delay}s infinite`,
          }} />
        ))}
      </div>

      {/* ── HERO ── */}
      <section style={S.hero}>
        <div style={S.globeGlow} />

        {/* ── SPLIT ROW: text-left / globe-right ── */}
        <div style={S.heroSplit}>

          {/* ── LEFT column ── */}
          <div style={{ ...S.heroLeft, alignItems: user ? 'center' : 'flex-start', ...blurredUiStyle }}>

        {/* Hero text */}
        <div style={{ ...S.heroText, textAlign: user ? 'center' : 'left' }}>
          {user ? (
            /* ── LOGGED-IN HERO ── */
            <>
              <h1 style={{ ...S.heroTitle, marginBottom: 10 }}>
                <span style={{ whiteSpace:'nowrap' }}>Welcome back,</span>
                <br />
                <em style={heroNameStyle}>
                  {userProfile?.name?.split(' ')[0] ?? user.username}
                </em>
              </h1>

            </>
          ) : (
            /* ── LOGGED-OUT HERO ── */
            <>
              <div style={S.eyebrow}>
                <div style={S.eyeLine} /> Wealth Wellness Hub <div style={S.eyeLine} />
              </div>
              <h1 style={S.heroTitle}>
                One globe.<br />Every asset.<br />
                <em style={{ fontStyle:'normal', background:'linear-gradient(135deg,var(--gold-light),var(--gold),var(--teal))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                  Zero guesswork.
                </em>
              </h1>
              <p style={S.heroSub}>
                A living, breathing globe that visualises every asset you own — equities, digital, real estate — unified into one actionable financial health score.
              </p>
              <div style={{ display:'flex', gap:14, justifyContent:'flex-start', flexWrap:'wrap' }}>
                <button style={S.btnCta}     onClick={() => setSurveyModalOpen(true)}>Start Your Journey</button>
                <button style={S.btnOutline} onClick={() => setLoginModalOpen(true)}>Sign In</button>
              </div>
              <p style={{ marginTop:10, fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-faint)' }}>
                ↓ Hover any glowing marker · Click to fly in
              </p>
            </>
          )}
        </div>

          </div>{/* /heroLeft */}

          {/* ── RIGHT column ── */}
          <div style={{
            ...S.heroRight,
            transform: focusMode && dashboardLayout?.mode === 'split'
              ? `translateX(${dashboardLayout.globeShiftX}px)`
              : 'translateX(0)',
            transition: 'transform 0.45s cubic-bezier(0.16,1,0.3,1)',
          }}>

        {/* ── Globe container — Layers 0-3 ── */}
        <div
          ref={globeWrapRef}
          style={{ ...S.globeWrap, filter: flyingIn ? 'brightness(1.4)' : 'brightness(1)', transition:'filter 0.3s' }}
        >
          <canvas ref={canvasRef} style={{ width:'100%', height:'100%', borderRadius:'50%', cursor:'grab', display:'block' }} />

          {/* ── Layer 3 — Glassmorphic hover card ── */}
          <GlassCard
            node={hoverNode}
            x={hoverPos.x}
            y={hoverPos.y}
            visible={!!hoverNode}
            onMouseEnter={() => { setCardLocked(true); cardLockedRef.current = true }}
            onMouseLeave={() => { setCardLocked(false); cardLockedRef.current = false; setHoverNode(null) }}
            onClick={() => hoverNode && openDashboard(hoverNode)}
          />

          {/* Zone label chip — shown on zone hover */}
          {hoverZone && (() => {
            const z = GLOBE_ZONES.find(g => g.label === hoverZone)
            if (!z) return null
            return (
              <div style={{
                position:'absolute',
                left: zonePos.x,
                top:  zonePos.y - 56,
                transform:'translateX(-50%)',
                pointerEvents:'none',
                zIndex:20,
                display:'flex', flexDirection:'column', alignItems:'center', gap:4,
              }}>
                <div style={{
                  fontFamily:'var(--font-display)',
                  fontWeight:800,
                  fontSize:'1.05rem',
                  letterSpacing:'0.08em',
                  textTransform:'uppercase',
                  color: z.color,
                  textShadow: `0 0 18px ${z.color}, 0 0 34px ${z.color}88`,
                  background:'rgba(8,10,18,0.72)',
                  border:`1.5px solid ${z.color}88`,
                  borderRadius:8,
                  padding:'5px 14px',
                  backdropFilter:'blur(10px)',
                  whiteSpace:'nowrap',
                  boxShadow:`0 0 22px ${z.color}44, inset 0 0 12px ${z.color}18`,
                  animation:'fadeUp 0.18s ease',
                }}>
                  {z.label}
                </div>
                {/* pointer caret */}
                <div style={{
                  width:0, height:0,
                  borderLeft:'6px solid transparent',
                  borderRight:'6px solid transparent',
                  borderTop:`7px solid ${z.color}88`,
                }} />
              </div>
            )
          })()}

          {/* Fly-in vignette flash */}
          {flyingIn && (
            <div style={{
              position:'absolute', inset:0, borderRadius:'50%',
              background:'radial-gradient(circle,color-mix(in srgb,var(--teal) 35%,transparent) 0%,transparent 70%)',
              animation:'flyFlash 0.5s ease forwards',
              pointerEvents:'none',
            }} />
          )}
        </div>

        {/* Legend — highlights on zone hover */}
        <div style={S.legend}>
          {GLOBE_ZONES.map(z => {
            const active = (legendHoverZone ?? selectedZone) === z.label
            return (
              <button
                key={z.label}
                type="button"
                onClick={() => rotateToZone(z.label)}
                onMouseEnter={() => setLegendHoverZone(z.label)}
                onMouseLeave={() => setLegendHoverZone(null)}
                style={{
                background:'transparent',
                border:'none',
                padding:0,
                display:'flex', alignItems:'center', gap:7,
                fontFamily:'var(--font-mono)',
                fontSize: active ? '0.76rem' : '0.7rem',
                fontWeight: active ? 700 : 400,
                color: active ? '#fff' : 'var(--text-dim)',
                textShadow: active ? `0 0 16px ${z.color}, 0 0 6px ${z.color}` : 'none',
                transition:'all 0.18s ease',
                cursor:'pointer',
              }}>
                <div style={{
                  width: active ? 10 : 8, height: active ? 10 : 8,
                  borderRadius:'50%', background:z.color,
                  boxShadow: active ? `0 0 14px 4px ${z.color}` : `0 0 5px ${z.color}`,
                  transition:'all 0.18s ease', flexShrink:0,
                }} />
                {z.label}
              </button>
            )
          })}
        </div>

          </div>{/* /heroRight */}
        </div>{/* /heroSplit */}

        {/* Stats bar */}
        <div style={{ ...S.statsBar, ...blurredUiStyle }}>
          {[
            { label:'Total Portfolio', val:`$${aum.toLocaleString()}`,
              sub: (() => {
                if (!userProfile?.portfolio) return 'loading…'
                const { stocks=[], cryptos=[], commodities=[] } = userProfile.portfolio
                const types = [
                  stocks.some(h => h.qty > 0) && 'Stocks',
                  cryptos.some(h => h.qty > 0) && 'Crypto',
                  commodities.some(h => h.qty > 0) && 'Commodities',
                ].filter(Boolean)
                return `${types.length} asset class${types.length !== 1 ? 'es' : ''} · ${types.join(', ')}`
              })(),
              c:'var(--gold)' },
            { label:'Unrealised P&L',
              val: userProfile ? `${plSign >= 0 ? '+' : '-'}$${pl.toLocaleString()}` : '—',
              sub: userProfile ? `${plSign >= 0 ? '+' : ''}${plPct.toFixed(2)}% vs avg cost` : 'loading…',
              c:   userProfile ? (plSign >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-faint)' },
            { label:'Wellness Score',
              val: userProfile?.financial_wellness_score != null ? `${Math.round(userProfile.financial_wellness_score)} / 100` : '— / 100',
              sub: userProfile?.financial_wellness_score != null ? (userProfile.financial_wellness_score>=75?'Excellent':userProfile.financial_wellness_score>=55?'On Track':userProfile.financial_wellness_score>=35?'Needs Work':'At Risk') : 'diversification',
              c:   userProfile?.financial_wellness_score != null ? (userProfile.financial_wellness_score>=75?'var(--green)':userProfile.financial_wellness_score>=55?'#d4a63a':userProfile.financial_wellness_score>=35?'var(--orange)':'var(--red)') : 'var(--teal)' },
            { label:'Active Positions', val: String(activePositions), sub: userProfile ? `${activePositions} holdings` : 'across 12 portfolios', c:'var(--gold)' },
          ].map((s,i) => (
            <div key={s.label} style={{ ...S.statItem, borderRight: i<3 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:6 }}>{s.label}</div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.15rem', color:s.c, minHeight:50, display:'flex', alignItems:'center', justifyContent:'center' }}>{s.val}</div>
              <div style={{ fontSize:'0.64rem', color:'var(--text-faint)', marginTop:0, maxWidth:200, marginInline:'auto', lineHeight:1.35 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════ */}
      {/* BOTTOM TICKER                                     */}
      {/* ══════════════════════════════════════════════════ */}
      {/* <TickerBar /> */}

      {/* ══════════════════════════════════════════════════ */}
      {/* FEATURES SECTION  (guests only)                   */}
      {/* ══════════════════════════════════════════════════ */}
      {!user && (
      <section style={{ position:'relative', zIndex:3, padding:'100px 48px', maxWidth:1200, margin:'0 auto', ...blurredUiStyle }}>
        <div style={{ textAlign:'center', marginBottom:64 }}>
          <div style={S.sectionEyebrow}>Platform Features</div>
          <h2 style={S.sectionTitle}>Everything in <em style={{ fontStyle:'normal', color:'var(--gold)' }}>one orbit</em></h2>
          <p style={S.sectionDesc}>From fragmented ecosystems to a unified command centre. Unova turns financial complexity into clear, actionable intelligence.</p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
          {FEATURES.map(f => (
            <div
              key={f.title}
              style={S.featureCard}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-5px)'
                e.currentTarget.style.borderColor = 'rgba(201,168,76,0.22)'
                e.currentTarget.querySelector('[data-accent]').style.transform = 'scaleX(1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.querySelector('[data-accent]').style.transform = 'scaleX(0)'
              }}
            >
              <div data-accent="1" style={{ position:'absolute', top:0, left:0, right:0, height:2, background:f.accent, transform:'scaleX(0)', transformOrigin:'left', transition:'transform 0.3s', borderRadius:'16px 16px 0 0' }} />
              <div style={{ width:44, height:44, borderRadius:12, background:f.iconBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.3rem', marginBottom:18 }}>{f.icon}</div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1rem', marginBottom:10 }}>{f.title}</div>
              <div style={{ fontSize:'0.85rem', color:'var(--text-dim)', lineHeight:1.65 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
      )} {/* /!user features */}
      {/* ══ LAYER 4 — BENTO DASHBOARD ══ */}
      <BentoDashboard
        node={dashNode}
        show={dashShow}
        onClose={closeDashboard}
        onPrev={() => cycleDashboardNode(-1)}
        onNext={() => cycleDashboardNode(1)}
        canNavigate={(globeNodesRef.current?.length || 0) > 1}
        themeId={activeTheme?.id}
        layout={dashboardLayout}
      />

      {/* Global keyframes */}
      <style>{`
        @keyframes gcPulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.4)} }
        @keyframes dashShimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes flyFlash { 0%{opacity:0} 30%{opacity:1} 100%{opacity:0} }
        @keyframes starTwinkle { 0%,100%{opacity:var(--so,0.1)} 50%{opacity:calc(var(--so,0.1)*3)} }
        @keyframes globePulse { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.7} 50%{transform:translate(-50%,-50%) scale(1.08);opacity:1} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}

// Pre-generate stable star positions (not re-created per render)
const STARS = Array.from({ length: 110 }, () => ({
  size:  Math.random() * 2 + 0.4,
  top:   Math.random() * 100,
  left:  Math.random() * 100,
  op:    Math.random() * 0.3 + 0.05,
  d:     (Math.random() * 3 + 2).toFixed(1),
  delay: (Math.random() * 6).toFixed(1),
}))

// ── Shared styles ─────────────────────────────────────────────────────────────
const S = {
  hero: {
    minHeight:'100vh', display:'flex', flexDirection:'column',
    alignItems:'center', justifyContent:'center',
    position:'relative', overflow:'hidden', paddingTop:80, paddingBottom:48,
  },
  heroSplit: {
    display:'flex', flexDirection:'row', alignItems:'center',
    width:'100%', maxWidth:1400, flex:1, minHeight:'72vh',
  },
  heroLeft: {
    flex:'0 0 44%', display:'flex', flexDirection:'column',
    justifyContent:'center', alignItems:'flex-start',
    paddingLeft:'6%', paddingRight:'3%', zIndex:3,
  },
  heroRight: {
    flex:1, display:'flex', flexDirection:'column',
    alignItems:'center', justifyContent:'center', position:'relative',
  },
  globeGlow: {
    position:'absolute', width:720, height:720, borderRadius:'50%',
    background:'radial-gradient(circle,color-mix(in srgb,var(--teal) 9%,transparent) 0%,color-mix(in srgb,var(--gold-light) 6%,transparent) 40%,transparent 70%)',
    top:'50%', left:'50%', transform:'translate(-50%,-50%)',
    zIndex:1, pointerEvents:'none', animation:'globePulse 6s ease-in-out infinite',
  },
  heroText: {
    position:'relative', zIndex:3, textAlign:'left',
    maxWidth:560, marginBottom:32, animation:'fadeUp 1s ease both',
  },
  eyebrow: {
    fontFamily:'var(--font-mono)', fontSize:'0.72rem', letterSpacing:'0.2em',
    color:'var(--teal)', textTransform:'uppercase', marginBottom:16,
    display:'flex', alignItems:'center', justifyContent:'flex-start', gap:10,
  },
  eyeLine: { width:32, height:1, background:'var(--teal)', opacity:0.5 },
  heroTitle: {
    fontFamily:'var(--font-display)', fontSize:'clamp(2.8rem,5vw,4.2rem)',
    fontWeight:800, lineHeight:1.05, marginBottom:20,
  },
  heroSub: {
    fontSize:'1rem', lineHeight:1.7, color:'var(--text-dim)', fontWeight:300,
    maxWidth:520, margin:'0 0 32px',
  },
  btnCta: {
    background:'var(--gold)',
    border:'none', color:'#ffffff', padding:'14px 36px', borderRadius:10,
    fontFamily:'var(--font-display)', fontSize:'0.95rem', fontWeight:700,
    cursor:'pointer', boxShadow:'0 12px 28px rgba(17,24,39,0.18)',
  },
  btnOutline: {
    background:'transparent', border:'1px solid rgba(45,212,191,0.4)',
    color:'var(--teal)', padding:'14px 32px', borderRadius:10,
    fontFamily:'var(--font-display)', fontSize:'0.95rem', fontWeight:600, cursor:'pointer',
  },
  globeWrap: {
    position:'relative', zIndex:2, width:580, height:580,
    animation:'fadeUp 1.2s ease 0.2s both',
  },
  legend: {
    display:'flex', gap:16, flexWrap:'wrap', justifyContent:'center',
    zIndex:3, marginTop:14,
  },
  statsBar: {
    display:'flex', zIndex:3,
    alignItems:'stretch',
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:14, overflow:'hidden', marginTop:36,
    animation:'fadeUp 1s ease 0.4s both',
    boxShadow:'0 8px 40px rgba(0,0,0,0.3)',
  },
  statItem: {
    flex:1,
    minWidth:0,
    padding:'12px 22px',
    textAlign:'center',
    display:'flex',
    flexDirection:'column',
    justifyContent:'center',
    alignItems:'center',
  },
  sectionEyebrow: {
    fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--teal)',
    textTransform:'uppercase', letterSpacing:'0.2em', marginBottom:14,
  },
  sectionTitle: {
    fontFamily:'var(--font-display)', fontSize:'clamp(1.8rem,3vw,2.8rem)',
    fontWeight:800, marginBottom:16,
  },
  sectionDesc: { color:'var(--text-dim)', maxWidth:520, margin:'0 auto', lineHeight:1.7, fontSize:'0.95rem' },
  featureCard: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:16, padding:28, transition:'all 0.3s',
    position:'relative', overflow:'hidden',
  },
}
