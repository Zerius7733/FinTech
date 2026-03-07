import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as THREE from 'three'
import TickerBar from '../components/TickerBar.jsx'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { MOCK_NODES, genPriceSeries, genSparkline } from '../data.js'

const API = 'http://localhost:8000'

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
function latLngToVec3(lat, lng, r = 1.03) {
  const phi   = (90 - lat)  * Math.PI / 180
  const theta = (lng + 180) * Math.PI / 180
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  )
}

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
      {/* Glass panel */}
      <div style={{
        background: 'linear-gradient(145deg,rgba(10,16,28,0.94),rgba(17,24,39,0.97))',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: `1px solid rgba(255,255,255,0.1)`,
        borderTop: `1px solid rgba(255,255,255,0.2)`,
        borderRadius: 18,
        padding: '16px 18px 14px',
        boxShadow: `0 24px 60px rgba(0,0,0,0.55), 0 0 0 0.5px ${hex}33, inset 0 1px 0 rgba(255,255,255,0.08)`,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Colour accent top bar */}
        <div style={{
          position: 'absolute', top: 0, left: '10%', right: '10%', height: 2,
          background: `linear-gradient(90deg,transparent,${hex},transparent)`,
          borderRadius: 99,
        }} />

        {/* Header row */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color: hex, textTransform:'uppercase', letterSpacing:'0.16em', marginBottom: 3 }}>
              {node.region}
            </div>
            <div style={{ fontFamily:'var(--font-display)', fontWeight: 800, fontSize:'0.95rem', lineHeight: 1.2 }}>
              {node.flag} {node.label}
            </div>
          </div>
          <div style={{
            background: isPos ? 'rgba(52,211,153,0.14)' : 'rgba(248,113,113,0.14)',
            border: `1px solid ${isPos ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.35)'}`,
            borderRadius: 8, padding: '3px 8px',
            fontFamily: 'var(--font-mono)', fontSize:'0.72rem',
            color: isPos ? 'var(--green)' : 'var(--red)', fontWeight: 600,
            flexShrink: 0, marginLeft: 8,
          }}>
            {isPos ? '+' : ''}{node.mtd}%
          </div>
        </div>

        {/* Sparkline */}
        <div style={{ margin: '8px 0', height: 28 }}>
          <svg viewBox="0 0 160 24" style={{ width:'100%', height:28 }} preserveAspectRatio="none">
            <defs>
              <linearGradient id={`sg_${node.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isPos ? '#34d399' : '#f87171'} stopOpacity="0.25" />
                <stop offset="100%" stopColor={isPos ? '#34d399' : '#f87171'} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={sparkPath + ' L160,24 L0,24 Z'} fill={`url(#sg_${node.id})`} />
            <path d={sparkPath} stroke={isPos ? '#34d399' : '#f87171'} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          background: 'rgba(255,255,255,0.04)', borderRadius: 10,
          overflow: 'hidden', marginBottom: 10,
        }}>
          {[
            { label: 'AUM',      val: `$${(node.aum/1000).toFixed(0)}K` },
            { label: 'Wellness', val: `${node.wellness}` },
            { label: 'Holdings', val: `${node.holdings.length}` },
          ].map((s, i) => (
            <div key={s.label} style={{
              padding: '7px 4px', textAlign: 'center',
              borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}>
              <div style={{ fontFamily:'var(--font-display)', fontWeight: 700, fontSize:'0.82rem' }}>{s.val}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.07em', marginTop:1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* CTA hint */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: hex,
          borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10,
        }}>
          <div style={{ width: 6, height: 6, borderRadius:'50%', background: hex, animation:'gcPulse 1.5s ease-in-out infinite' }} />
          Click to fly in →
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

function PriceChart({ mtd, nodeColor }) {
  const hex  = '#' + (nodeColor || 0x2dd4bf).toString(16).padStart(6,'0')
  const pts  = genPriceSeries(mtd)
  const path = pts.map((v, i) => `${i===0?'M':'L'}${(i/(pts.length-1))*800},${110-v*100}`).join(' ')
  const area = path + ' L800,110 L0,110 Z'
  return (
    <svg viewBox="0 0 800 110" style={{ width:'100%', height:100 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`pg_${nodeColor}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hex} stopOpacity="0.3" />
          <stop offset="100%" stopColor={hex} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#pg_${nodeColor})`} />
      <path d={path} stroke={hex} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function WellnessRing({ score, size = 84 }) {
  const r     = size * 0.42
  const circ  = 2 * Math.PI * r
  const color = score >= 75 ? '#34d399' : score >= 55 ? '#c9a84c' : '#f87171'
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
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - score/100)} />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:size*0.24, color:'var(--gold)', lineHeight:1 }}>{score}</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:size*0.11, color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.07em', marginTop:2 }}>score</span>
      </div>
    </div>
  )
}

function BentoDashboard({ node, show, onClose }) {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (show) { const t = setTimeout(() => setEntered(true), 30); return () => clearTimeout(t) }
    else setEntered(false)
  }, [show])

  if (!node) return null
  const hex   = '#' + node.color.toString(16).padStart(6,'0')
  const isPos = node.mtd >= 0

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
          background: 'rgba(4,8,16,0.82)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px 16px',
          opacity: entered ? 1 : 0,
          transition: 'opacity 0.35s ease',
        }}
      >
        {/* ── Panel ── */}
        <div style={{
          width: '100%', maxWidth: 980,
          maxHeight: '92vh', overflowY: 'auto',
          background: 'linear-gradient(155deg,rgba(13,18,32,0.99),rgba(8,12,20,1))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTop: `2px solid ${hex}`,
          borderRadius: 24,
          boxShadow: `0 50px 130px rgba(0,0,0,0.75), 0 0 80px ${hex}20, inset 0 1px 0 rgba(255,255,255,0.05)`,
          transform: entered ? 'scale(1) translateY(0)' : 'scale(0.86) translateY(50px)',
          transition: 'transform 0.45s cubic-bezier(0.16,1,0.3,1)',
          overflow: 'hidden',
        }}>
          {/* Shimmer top bar */}
          <div style={{
            height: 2, width:'100%',
            background: `linear-gradient(90deg,transparent,${hex},var(--teal),${hex},transparent)`,
            backgroundSize:'200% 100%',
            animation:'dashShimmer 2.5s ease-in-out infinite',
          }} />

          <div style={{ padding: '28px 32px 32px' }}>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28 }}>
              <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                <div style={{
                  width:56, height:56, borderRadius:16,
                  background:`linear-gradient(135deg,${hex}22,${hex}10)`,
                  border:`1px solid ${hex}44`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:'1.9rem', flexShrink:0,
                  boxShadow:`0 0 24px ${hex}28`,
                }}>
                  {node.flag}
                </div>
                <div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:hex, textTransform:'uppercase', letterSpacing:'0.18em', marginBottom:4 }}>
                    {node.region} · Portfolio Dashboard
                  </div>
                  <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.65rem', lineHeight:1.1, marginBottom:5 }}>
                    {node.label}
                  </div>
                  <div style={{ fontSize:'0.83rem', color:'var(--text-dim)' }}>
                    {node.holdings.length} positions · ${node.aum.toLocaleString()} AUM ·{' '}
                    <span style={{ color: isPos ? 'var(--green)':'var(--red)', fontWeight:600 }}>
                      {isPos?'+':''}{node.mtd}% MTD
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={onClose} style={{
                background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                color:'var(--text-faint)', width:38, height:38, borderRadius:10,
                fontSize:'1rem', display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'pointer', transition:'all 0.2s', flexShrink:0,
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(248,113,113,0.5)'; e.currentTarget.style.color='var(--red)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'; e.currentTarget.style.color='var(--text-faint)' }}
              >✕</button>
            </div>

            {/* ════ BENTO GRID ════ */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gridTemplateRows:'auto auto', gap:14, marginBottom:14 }}>

              {/* Cell A — Price chart (2 cols) */}
              <div style={{ ...BC, gridColumn:'1/3' }}>
                <div style={BL}>
                  <span>Portfolio Value — 6M</span>
                  <span style={{ fontFamily:'var(--font-display)', fontSize:'0.88rem', letterSpacing:0, color: isPos?'var(--green)':'var(--red)' }}>
                    {node.returnPct} total return
                  </span>
                </div>
                <PriceChart mtd={node.mtd} nodeColor={node.color} />
              </div>

              {/* Cell B — Wellness ring */}
              <div style={{ ...BC, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, background:`linear-gradient(135deg,${hex}10,rgba(13,18,32,0.95))` }}>
                <WellnessRing score={node.wellness} size={90} />
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.82rem', marginBottom:3 }}>Wellness Score</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.64rem', color:'var(--text-faint)' }}>
                    {node.wellness >= 75 ? 'Excellent' : node.wellness >= 55 ? 'Good' : 'Needs attention'}
                  </div>
                </div>
              </div>

              {/* Cell C — Allocation bars (2 cols) */}
              <div style={{ ...BC, gridColumn:'1/3' }}>
                <div style={BL}><span>Asset Allocation</span></div>
                {node.alloc.map(a => (
                  <div key={a.label} style={{ marginBottom: 11 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', color:'var(--text-dim)', marginBottom:5 }}>
                      <span>{a.label}</span>
                      <span style={{ fontFamily:'var(--font-mono)', color:'var(--text)' }}>{a.pct}%</span>
                    </div>
                    <div style={{ height:5, background:'rgba(255,255,255,0.06)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{
                        height:'100%', width:`${a.pct}%`,
                        background: `linear-gradient(90deg,${a.color}aa,${a.color})`,
                        borderRadius:3, boxShadow:`0 0 6px ${a.color}55`,
                        transition:'width 0.9s cubic-bezier(0.4,0,0.2,1)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Cell D — P&L summary */}
              <div style={{ ...BC, background:`linear-gradient(135deg,rgba(52,211,153,0.07),rgba(13,18,32,0.95))` }}>
                <div style={BL}><span>P&L Summary</span></div>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.7rem', color: isPos?'var(--green)':'var(--red)', lineHeight:1, marginBottom:4 }}>
                  {isPos?'+':''}{node.mtd}%
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--text-faint)', marginBottom:14 }}>Month to date</div>
                {[
                  ['Total Return', node.returnPct, isPos?'var(--green)':'var(--red)'],
                  ['AUM',          `$${node.aum.toLocaleString()}`, 'var(--gold)'],
                  ['Positions',    node.holdings.length,            'var(--teal)'],
                ].map(([k,v,c]) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', marginBottom:6 }}>
                    <span style={{ color:'var(--text-dim)' }}>{k}</span>
                    <span style={{ fontFamily:'var(--font-mono)', color:c, fontWeight:600 }}>{v}</span>
                  </div>
                ))}
              </div>

            </div>

            {/* Holdings grid */}
            <div style={BL}><span>Holdings</span></div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(195px,1fr))', gap:12 }}>
              {node.holdings.map(h => {
                const hc  = h.change >= 0 ? 'var(--green)' : 'var(--red)'
                const dir = h.dir || (h.change >= 0 ? 'up' : 'dn')
                return (
                  <div key={h.ticker} style={{
                    background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)',
                    borderRadius:14, padding:'15px 17px', cursor:'pointer', transition:'all 0.2s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(201,168,76,0.35)'; e.currentTarget.style.transform='translateY(-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'; e.currentTarget.style.transform='translateY(0)' }}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', background:'rgba(45,212,191,0.12)', padding:'2px 8px', borderRadius:6, color:'var(--teal)' }}>
                        {h.ticker}
                      </span>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:hc }}>
                        {h.change >= 0 ? '+' : ''}{h.change}%
                      </span>
                    </div>
                    <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.88rem', marginBottom:3 }}>{h.name}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'1rem', marginBottom:8 }}>${h.price.toLocaleString()}</div>
                    <Sparkline dir={dir} color={hc} h={30} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// Bento shared styles
const BC = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16, padding: '18px 20px',
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
  { min:0,  max:33, icon:'🛡️', title:'Conservative Portfolio', desc:'Factor: 1.0 · Capital preservation focus. 30% equities, 60% bonds, 10% alternatives.', color:'var(--green)' },
  { min:34, max:66, icon:'⚖️', title:'Balanced Portfolio',     desc:'Factor: 0.7 · Moderate growth with managed volatility. 60% equities, 30% bonds, 10% alternatives.', color:'var(--gold)' },
  { min:67, max:100,icon:'🚀', title:'Aggressive Portfolio',   desc:'Factor: 0.5 · Growth-oriented. 90% equities, 5% bonds, 5% alternatives.', color:'var(--red)' },
]

// ── Zone definitions — used for texture drawing AND hover detection ─────────
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

export default function Globe() {
  const navigate    = useNavigate()
  const { user: authUser } = useAuth()
  const canvasRef   = useRef(null)
  const globeRef    = useRef(null)   // THREE globe mesh
  const nodeObjsRef = useRef([])
  const isDragRef   = useRef(false)
  const cameraRef   = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef    = useRef(null)
  const animIdRef   = useRef(null)

  // UI state
  const [aum,           setAum]         = useState(0)
  const [pl,            setPl]          = useState(0)
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
  const riskLevel = RISK_DEFS.find(r => riskPct >= r.min && riskPct <= r.max) || RISK_DEFS[1]
  const riskTrackRef  = useRef(null)
  const riskDragRef   = useRef(false)

  // Wellness score for logged-in hero
  const [userProfile, setUserProfile] = useState(null)
  useEffect(() => {
    if (!authUser?.user_id) return
    fetch(`${API}/users/${authUser.user_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setUserProfile(d.user))
      .catch(() => {})
  }, [authUser?.user_id])

  // Animated counters
  useEffect(() => {
    setTimeout(() => {
      animateCount(setAum, 1096150, 2000)   // sum of all 12 type-based nodes
      animateCount(setPl,   21840,  1800)
    }, 400)
  }, [])

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

  // Open dashboard — animate camera zoom then show dashboard
  const openDashboard = useCallback((node) => {
    setCardLocked(false)
    setHoverNode(null)
    setFlyingIn(true)

    // Camera zoom-in animation (pure Three.js)
    const camera = cameraRef.current
    if (camera) {
      const startZ = camera.position.z
      const targetZ = 1.35
      const duration = 420
      let startTs = null
      const zoomStep = ts => {
        if (!startTs) startTs = ts
        const p = Math.min((ts - startTs) / duration, 1)
        const ease = 1 - Math.pow(1 - p, 3)
        camera.position.z = startZ + (targetZ - startZ) * ease
        if (p < 1) requestAnimationFrame(zoomStep)
        else {
          // zoom back out & show dashboard
          setTimeout(() => {
            const backDuration = 280
            let backTs = null
            const backStep = ts2 => {
              if (!backTs) backTs = ts2
              const p2 = Math.min((ts2 - backTs) / backDuration, 1)
              camera.position.z = targetZ + (2.6 - targetZ) * (1 - Math.pow(1 - p2, 2))
              if (p2 < 1) requestAnimationFrame(backStep)
              else camera.position.z = 2.6
            }
            requestAnimationFrame(backStep)
          }, 80)
          setFlyingIn(false)
          setDashNode(node)
          setDashShow(true)
        }
      }
      requestAnimationFrame(zoomStep)
    } else {
      setFlyingIn(false)
      setDashNode(node)
      setDashShow(true)
    }
  }, [])

  const closeDashboard = useCallback(() => {
    setDashShow(false)
    setTimeout(() => setDashNode(null), 420)
  }, [])

  // ═══ THREE.JS GLOBE SETUP ═════════════════════════════════
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const container = canvas.parentElement
    if (!container) return

    // ── Build the 2D texture FIRST (before any WebGL context is created) ──
    const texCanvas = document.createElement('canvas')
    texCanvas.width = 2048; texCanvas.height = 1024
    const ctx = texCanvas.getContext('2d')
    if (!ctx) { console.error('WealthSphere: could not get 2D context for globe texture'); return }

    // Pure space background — no ocean, no geography
    const og = ctx.createLinearGradient(0, 0, 0, 1024)
    og.addColorStop(0, '#020409'); og.addColorStop(0.5, '#03060f'); og.addColorStop(1, '#040810')
    ctx.fillStyle = og; ctx.fillRect(0, 0, 2048, 1024)

    // ── Abstract dot grid (no geographic meaning) ──────────────────────────
    for (let gx = 0; gx < 2048; gx += 52) {
      for (let gy = 0; gy < 1024; gy += 52) {
        ctx.beginPath(); ctx.arc(gx, gy, 0.9, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(45,212,191,0.10)'; ctx.fill()
      }
    }

    // ── ABSTRACT INVESTMENT TYPE ZONES ─────────────────────────────────────
    const ZONES = GLOBE_ZONES

    ZONES.forEach(z => {
      // Outer soft glow
      const halo = ctx.createRadialGradient(z.cx, z.cy, z.rx * 0.4, z.cx, z.cy, z.rx * 1.8)
      halo.addColorStop(0, `rgba(${z.dr},${z.dg},${z.db},0.38)`)
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.save()
      ctx.beginPath(); ctx.ellipse(z.cx, z.cy, z.rx * 1.8, z.ry * 1.8, 0, 0, Math.PI * 2)
      ctx.fillStyle = halo; ctx.fill(); ctx.restore()

      // Layered zone fills — darker opacities
      z.core.forEach((s, i) => {
        ctx.save()
        ctx.translate(s.cx, s.cy); ctx.rotate(s.rot)
        ctx.beginPath(); ctx.ellipse(0, 0, s.rx, s.ry, 0, 0, Math.PI * 2); ctx.clip()
        const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(s.rx, s.ry))
        if (i === 0) {
          fg.addColorStop(0,   `rgba(${z.dr},${z.dg},${z.db},0.92)`)
          fg.addColorStop(0.5, `rgba(${z.dr},${z.dg},${z.db},0.72)`)
          fg.addColorStop(1,   `rgba(${z.dr},${z.dg},${z.db},0.18)`)
        } else {
          fg.addColorStop(0,   `rgba(${z.lr},${z.lg},${z.lb},0.28)`)
          fg.addColorStop(0.6, `rgba(${z.dr},${z.dg},${z.db},0.22)`)
          fg.addColorStop(1,   'rgba(0,0,0,0)')
        }
        ctx.fillStyle = fg
        ctx.fillRect(-s.rx - 2, -s.ry - 2, (s.rx + 2) * 2, (s.ry + 2) * 2)
        ctx.restore()
      })

      // Outer dashed border
      ctx.save()
      ctx.beginPath(); ctx.ellipse(z.cx, z.cy, z.rx, z.ry, 0, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${z.lr},${z.lg},${z.lb},0.80)`
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
      ctx.fillStyle = `rgba(${z.lr},${z.lg},${z.lb},0.92)`
      ctx.textAlign = 'center'
      ctx.shadowColor = `rgba(${z.lr},${z.lg},${z.lb},0.65)`
      ctx.shadowBlur = 12
      ctx.fillText(z.label.toUpperCase(), z.cx, z.cy - z.ry * 0.52)
      ctx.restore()
    })

    // ── Now create the WebGL renderer ──────────────────────
    const W = container.offsetWidth  || 580
    const H = container.offsetHeight || 580

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true })
    } catch(e) {
      console.error('WealthSphere: WebGL renderer failed', e); return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(W, H)
    renderer.setClearColor(0x000000, 0)
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, W/H, 0.1, 1000)
    camera.position.z = 2.6
    cameraRef.current = camera

    // ── LAYER 0 — 3D particle star field (slow drift) ──────
    const starCount = 1200
    const sPos = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const r     = 7 + Math.random() * 12
      sPos[i*3]   = r * Math.sin(phi) * Math.cos(theta)
      sPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta)
      sPos[i*3+2] = r * Math.cos(phi)
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3))
    const starPoints = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.038, sizeAttenuation: true,
      transparent: true, opacity: 0.75,
    }))
    scene.add(starPoints)

    // ── Lighting ───────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x334466, 1.3))
    const sun = new THREE.DirectionalLight(0x6699ff, 1.5)
    sun.position.set(3, 2, 4); scene.add(sun)
    const gold = new THREE.PointLight(0xc9a84c, 0.7, 7)
    gold.position.set(-2, 1, 2); scene.add(gold)
    const teal = new THREE.PointLight(0x2dd4bf, 0.35, 6)
    teal.position.set(2, -1, -2); scene.add(teal)

    // ── LAYER 1 — Globe mesh (texture already built above) ──
    const tex = new THREE.CanvasTexture(texCanvas)
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 72, 72),
      new THREE.MeshPhongMaterial({ map:tex, transparent:true, opacity:0.98, shininess:32, specular:new THREE.Color(0x224488) })
    )
    scene.add(globe)
    globeRef.current = globe

    // Atmosphere layers
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.04, 64, 64),
      new THREE.MeshPhongMaterial({ color:0x2244aa, transparent:true, opacity:0.09, side:THREE.FrontSide })
    ))
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.09, 64, 64),
      new THREE.MeshPhongMaterial({ color:0x1133cc, transparent:true, opacity:0.035, side:THREE.BackSide })
    ))

    // ── LAYER 2 — Portfolio markers (children of globe, rotate with it) ───
    const nodeObjs = MOCK_NODES.map(node => {
      // Position at r=1 (on the sphere surface), not r=1.03, because we parent to globe
      const pos = latLngToVec3(node.lat, node.lng, 1.0)
      // Surface normal direction for ring orientation
      const normal = pos.clone().normalize()

      const mkRing = (r0, r1, opacity) => {
        const m = new THREE.Mesh(
          new THREE.RingGeometry(r0, r1, 32),
          new THREE.MeshBasicMaterial({ color:node.color, transparent:true, opacity, side:THREE.DoubleSide })
        )
        m.position.copy(pos)
        // Orient ring to face outward from sphere centre
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), normal)
        globe.add(m)   // ← child of globe
        return m
      }

      // Core dot — lifted off the surface so it sits fully above the globe
      const dotRadius = 0.044
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(dotRadius, 16, 16),
        new THREE.MeshBasicMaterial({ color: node.color })
      )
      // Offset outward by dot radius so the bottom edge just kisses the globe surface
      dot.position.copy(pos).addScaledVector(normal, dotRadius)
      globe.add(dot)   // ← child of globe

      // Soft glow halo — same centre as the dot so it wraps it symmetrically
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.068, 16, 16),
        new THREE.MeshBasicMaterial({ color:node.color, transparent:true, opacity:0.28 })
      )
      halo.position.copy(dot.position)
      globe.add(halo)  // ← child of globe

      const ring   = mkRing(0.060, 0.092, 0.70)
      const ring2  = mkRing(0.100, 0.120, 0.25)
      const pulseA = mkRing(0.092, 0.132, 0.0)
      const pulseB = mkRing(0.136, 0.168, 0.0)
      pulseA._phase = Math.random() * Math.PI * 2
      pulseB._phase = pulseA._phase + Math.PI

      return { node, dot, halo, ring, ring2, pulseA, pulseB, pos, normal }
    })
    nodeObjsRef.current = nodeObjs

    // ── Drag rotation + momentum ──────────────────────────
    let isDrag = false, prev = {x:0,y:0}
    let velY = 0, velX = 0, lastDx = 0, lastDy = 0
    const onDown = e => { isDrag=true; isDragRef.current=true; prev={x:e.clientX,y:e.clientY}; velY=0; velX=0 }
    const onUp   = () => {
      isDrag=false; isDragRef.current=false
      // carry the last frame's drag velocity into momentum
      velY = lastDx * 0.004
      velX = lastDy * 0.004
    }
    const onMove = e => {
      if (!isDrag) return
      const dx=e.clientX-prev.x, dy=e.clientY-prev.y
      globe.rotation.y += dx*0.004; globe.rotation.x += dy*0.004
      lastDx=dx; lastDy=dy
      prev={x:e.clientX,y:e.clientY}
    }
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mousemove', onMove)

    // ── Raycaster helpers ────────────────────────────────────
    const ray  = new THREE.Raycaster()
    const m2d  = new THREE.Vector2()
    const getHit = (cx, cy) => {
      const rect = canvas.getBoundingClientRect()
      m2d.x =  ((cx - rect.left) / rect.width)  * 2 - 1
      m2d.y = -((cy - rect.top)  / rect.height) * 2 + 1
      ray.setFromCamera(m2d, camera)
      const hits = ray.intersectObjects(nodeObjs.map(n => n.dot))
      if (!hits.length) return null
      return nodeObjs.find(n => n.dot === hits[0].object) || null
    }
    // Zone hover: raycast the sphere surface, read UV, map to texture space
    const getZoneHit = (cx, cy) => {
      if (!globeRef.current) return null
      const rect = canvas.getBoundingClientRect()
      m2d.x =  ((cx - rect.left) / rect.width)  * 2 - 1
      m2d.y = -((cy - rect.top)  / rect.height) * 2 + 1
      ray.setFromCamera(m2d, camera)
      const hits = ray.intersectObject(globeRef.current, false)
      if (!hits.length || !hits[0].uv) return null
      const tx = hits[0].uv.x * 2048
      const ty = (1 - hits[0].uv.y) * 1024
      for (const z of GLOBE_ZONES) {
        const ex = (tx - z.cx) / z.rx
        const ey = (ty - z.cy) / z.ry
        if (ex*ex + ey*ey <= 1) return z.label
      }
      return null
    }

    // ── LAYER 3 — Hover → glass card ────────────────────────
    canvas.addEventListener('mousemove', e => {
      if (isDrag) { setHoverNode(null); setHoverZone(null); return }
      const hit = getHit(e.clientX, e.clientY)
      if (hit) {
        const rect = canvas.getBoundingClientRect()
        setHoverPos({ x:e.clientX-rect.left+18, y:e.clientY-rect.top-30 })
        setHoverNode(hit.node)
        setHoverZone(null)
        canvas.style.cursor = 'pointer'
      } else {
        if (!cardLockedRef.current) setHoverNode(null)
        const zone = getZoneHit(e.clientX, e.clientY)
        setHoverZone(zone)
        if (zone) {
          const rect = canvas.getBoundingClientRect()
          setZonePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        }
        canvas.style.cursor = 'grab'
      }
    })

    // ── LAYER 4 — Click → portal → dashboard ────────────────
    let clickMoved = false
    canvas.addEventListener('mousedown', () => { clickMoved = false })
    canvas.addEventListener('mousemove', () => { clickMoved = true }, { passive:true })
    canvas.addEventListener('click', e => {
      if (clickMoved) return
      const hit = getHit(e.clientX, e.clientY)
      if (hit) openDashboard(hit.node)
    })

    // ── Animation loop ───────────────────────────────────────
    let t = 0
    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate)
      t += 0.01

      // Layer 0 — star drift
      starPoints.rotation.y += 0.00012
      starPoints.rotation.x += 0.000045

      // Layer 1 — momentum spin-to-stop
      if (!isDragRef.current) {
        globe.rotation.y += 0.0008005 + velY
        globe.rotation.x += velX
        velY *= 0.91
        velX *= 0.91
        if (Math.abs(velY) < 0.00005) velY = 0
        if (Math.abs(velX) < 0.00005) velX = 0
      }

      // Layer 2 — pulse markers (no manual rotation sync needed — parented to globe)
      nodeObjs.forEach(n => {
        const phA = n.pulseA._phase + t * 1.7
        const phB = n.pulseB._phase + t * 1.7
        n.pulseA.material.opacity = Math.max(0, Math.sin(phA)) * 0.55
        n.pulseA.scale.setScalar(1 + Math.sin(phA) * 0.42)
        n.pulseB.material.opacity = Math.max(0, Math.sin(phB)) * 0.32
        n.pulseB.scale.setScalar(1 + Math.sin(phB) * 0.6)
        n.halo.material.opacity = 0.18 + Math.sin(t*1.4 + n.pulseA._phase) * 0.12
      })

      // Light drift
      gold.position.x = -2 + Math.sin(t*0.28)*0.6
      gold.position.y =  1 + Math.cos(t*0.2)*0.35

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(animIdRef.current)
      canvas.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('mousemove', onMove)
      renderer.dispose()
    }
  }, [openDashboard]) // eslint-disable-line

  // ═══ RENDER ═══════════════════════════════════════════════
  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', overflowX:'hidden', position:'relative' }}>

      {/* Fixed top ticker */}
      {/* <TickerBar style={{ position:'fixed', top:0, left:0, right:0, zIndex:102 }} /> */}

      {/* ── NAV ── */}
      <Navbar />

      {/* ── DOM star layer (CSS, complements WebGL) ── */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0 }} aria-hidden>
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

        {/* Hero text */}
        <div style={S.heroText}>
          {authUser ? (
            /* ── LOGGED-IN HERO ── */
            <>
              <div style={S.eyebrow}>
                <div style={S.eyeLine} /> Financial Wellness <div style={S.eyeLine} />
              </div>
              <h1 style={{ ...S.heroTitle, marginBottom: 10 }}>
                Welcome back,{' '}
                <em style={{ fontStyle:'normal', background:'linear-gradient(135deg,var(--gold-light),var(--gold))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                  {userProfile?.name?.split(' ')[0] ?? authUser.username}
                </em>
                <span style={{ display:'block', fontFamily:'var(--font-mono)', fontSize:'0.75rem', fontWeight:400, color:'var(--text-faint)', letterSpacing:'0.15em', textTransform:'uppercase', marginTop:6 }}>
                  Financial Wellness Score
                </span>
              </h1>

              {/* Score badge */}
              {(() => {
                const score = userProfile?.financial_wellness_score ?? null
                const stress = userProfile?.financial_stress_index ?? null
                const status = score == null ? null
                  : score >= 75 ? { label:'Excellent', color:'var(--green)',  glow:'rgba(52,211,153,0.35)' }
                  : score >= 55 ? { label:'On Track',  color:'var(--gold)',   glow:'rgba(201,168,76,0.35)' }
                  : score >= 35 ? { label:'Needs Work', color:'var(--orange)', glow:'rgba(251,146,60,0.35)' }
                  :               { label:'At Risk',    color:'var(--red)',    glow:'rgba(248,113,113,0.35)' }
                return (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:20, marginBottom:18 }}>
                    {/* Big score ring */}
                    <div style={{ position:'relative', width:96, height:96, flexShrink:0 }}>
                      <svg viewBox="0 0 96 96" width={96} height={96} style={{ transform:'rotate(-90deg)' }}>
                        <circle cx={48} cy={48} r={38} fill="none" stroke="var(--surface2)" strokeWidth={8} />
                        <circle cx={48} cy={48} r={38} fill="none"
                          stroke={status?.color ?? 'var(--gold)'} strokeWidth={8}
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 38}
                          strokeDashoffset={2 * Math.PI * 38 * (1 - (score ?? 0) / 100)}
                          style={{ filter:`drop-shadow(0 0 6px ${status?.glow ?? 'rgba(201,168,76,0.4)'})`, transition:'stroke-dashoffset 1s ease' }}
                        />
                      </svg>
                      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                        <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.5rem', color: status?.color ?? 'var(--gold)' }}>
                          {score != null ? Math.round(score) : '—'}
                        </span>
                        <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.52rem', color:'var(--text-faint)', textTransform:'uppercase' }}>/ 100</span>
                      </div>
                    </div>
                    {/* Status label + breakdown */}
                    <div style={{ textAlign:'left' }}>
                      {status && (
                        <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:`${status.color}18`, border:`1px solid ${status.color}44`, borderRadius:20, padding:'4px 12px', marginBottom:8 }}>
                          <div style={{ width:6, height:6, borderRadius:'50%', background:status.color, boxShadow:`0 0 6px ${status.color}` }} />
                          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:status.color, fontWeight:600 }}>{status.label}</span>
                        </div>
                      )}
                      <p style={{ fontFamily:'var(--font-body)', fontSize:'0.8rem', color:'var(--text-dim)', lineHeight:1.5, margin:0 }}>
                        {score != null
                          ? `Your portfolio is ${status?.label === 'Excellent' ? 'performing strongly' : status?.label === 'On Track' ? 'on a healthy trajectory' : 'showing areas to improve'}.`
                          : 'Loading your financial data…'}
                        {stress != null && (
                          <span style={{ display:'block', marginTop:4, color:'var(--text-faint)', fontSize:'0.74rem' }}>
                            Stress Index: <span style={{ color: stress > 70 ? 'var(--red)' : stress > 45 ? 'var(--orange)' : 'var(--green)', fontWeight:600 }}>{Math.round(stress)}</span> / 100
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )
              })()}

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
              <div style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap' }}>
                <button style={S.btnCta}     onClick={() => navigate('/survey')}>Start Your Journey</button>
                <button style={S.btnOutline} onClick={() => navigate('/profile')}>View Portfolio</button>
              </div>
              <p style={{ marginTop:10, fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-faint)' }}>
                ↓ Hover any glowing marker · Click to fly in
              </p>
            </>
          )}
        </div>

        {/* ── Globe container — Layers 0-3 ── */}
        <div style={{ ...S.globeWrap, filter: flyingIn ? 'brightness(1.4)' : 'brightness(1)', transition:'filter 0.3s' }}>
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
              background:'radial-gradient(circle,rgba(45,212,191,0.35) 0%,transparent 70%)',
              animation:'flyFlash 0.5s ease forwards',
              pointerEvents:'none',
            }} />
          )}
        </div>

        {/* Legend — highlights on zone hover */}
        <div style={S.legend}>
          {GLOBE_ZONES.map(z => {
            const active = hoverZone === z.label
            return (
              <div key={z.label} style={{
                display:'flex', alignItems:'center', gap:7,
                fontFamily:'var(--font-mono)',
                fontSize: active ? '0.76rem' : '0.7rem',
                fontWeight: active ? 700 : 400,
                color: active ? '#fff' : 'var(--text-dim)',
                textShadow: active ? `0 0 16px ${z.color}, 0 0 6px ${z.color}` : 'none',
                transition:'all 0.18s ease',
              }}>
                <div style={{
                  width: active ? 10 : 8, height: active ? 10 : 8,
                  borderRadius:'50%', background:z.color,
                  boxShadow: active ? `0 0 14px 4px ${z.color}` : `0 0 5px ${z.color}`,
                  transition:'all 0.18s ease', flexShrink:0,
                }} />
                {z.label}
              </div>
            )
          })}
        </div>

        {/* Stats bar */}
        <div style={S.statsBar}>
          {[
            { label:'Total AUM',     val:`$${aum.toLocaleString()}`, sub:'across 5 asset types', c:'var(--gold)'  },
            { label:'Day P&L',       val:`+$${pl.toLocaleString()}`, sub:'+2.14% today',          c:'var(--green)' },
            { label:'Wellness Score',val:'73 / 100',                 sub:'diversification',        c:'var(--teal)'  },
            { label:'Active Positions',val:'40',                    sub:'across 12 portfolios',   c:'var(--gold)'  },
          ].map((s,i) => (
            <div key={s.label} style={{ ...S.statItem, borderRight: i<3 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:4 }}>{s.label}</div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.15rem', color:s.c }}>{s.val}</div>
              <div style={{ fontSize:'0.7rem', color:'var(--text-faint)', marginTop:2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════ */}
      {/* BOTTOM TICKER                                     */}
      {/* ══════════════════════════════════════════════════ */}
      {/* <TickerBar /> */}

      {/* ══════════════════════════════════════════════════ */}
      {/* FEATURES SECTION                                  */}
      {/* ══════════════════════════════════════════════════ */}
      <section style={{ position:'relative', zIndex:3, padding:'100px 48px', maxWidth:1200, margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:64 }}>
          <div style={S.sectionEyebrow}>Platform Features</div>
          <h2 style={S.sectionTitle}>Everything in <em style={{ fontStyle:'normal', color:'var(--gold)' }}>one orbit</em></h2>
          <p style={S.sectionDesc}>From fragmented ecosystems to a unified command centre. WealthSphere turns financial complexity into clear, actionable intelligence.</p>
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

      {/* ══════════════════════════════════════════════════ */}
      {/* RISK SURVEY SECTION                               */}
      {/* ══════════════════════════════════════════════════ */}
      <section style={{ padding:'80px 48px', maxWidth:900, margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:48 }}>
          <div style={S.sectionEyebrow}>Onboarding</div>
          <h2 style={S.sectionTitle}>Define your <em style={{ fontStyle:'normal', color:'var(--gold)' }}>risk horizon</em></h2>
        </div>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:40, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:'-50%', right:'-10%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(45,212,191,0.06),transparent 70%)', pointerEvents:'none' }} />
          <p style={{ color:'var(--text-dim)', fontSize:'0.9rem', marginBottom:28, maxWidth:480 }}>
            Before we map your world, we calibrate to you. Drag to set your risk appetite — this shapes every recommendation you receive.
          </p>
          <div style={{ marginBottom:28 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:20 }}>
              <span>Conservative</span><span>Balanced</span><span>Aggressive</span>
            </div>
            <div
              ref={riskTrackRef}
              style={{ position:'relative', height:8, background:'var(--surface2)', borderRadius:4, cursor:'pointer' }}
              onClick={e => { const r=riskTrackRef.current.getBoundingClientRect(); setRiskPct(Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100))) }}
            >
              <div style={{ position:'absolute', top:0, left:0, height:'100%', borderRadius:4, width:`${riskPct}%`, background:`linear-gradient(90deg,var(--green),${riskLevel.color})`, transition:'width 0.15s' }} />
              <div
                style={{ position:'absolute', top:'50%', left:`${riskPct}%`, transform:'translate(-50%,-50%)', width:24, height:24, borderRadius:'50%', background:'var(--bg2)', border:`3px solid ${riskLevel.color}`, boxShadow:`0 0 16px ${riskLevel.color}80`, cursor:'grab', transition:'border-color 0.3s,box-shadow 0.3s' }}
                onMouseDown={e => { riskDragRef.current=true; e.preventDefault() }}
              />
            </div>
          </div>
          <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 20px', display:'flex', alignItems:'center', gap:16, marginBottom:28 }}>
            <div style={{ width:48, height:48, borderRadius:12, background:'rgba(201,168,76,0.15)', border:'1px solid rgba(201,168,76,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.4rem', flexShrink:0 }}>
              {riskLevel.icon}
            </div>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.95rem', marginBottom:4 }}>{riskLevel.title}</div>
              <div style={{ fontSize:'0.8rem', color:'var(--text-dim)' }}>{riskLevel.desc}</div>
            </div>
          </div>
          <button style={{ background:'var(--gold)', border:'none', color:'#ffffff', padding:'12px 32px', borderRadius:10, fontFamily:'var(--font-display)', fontSize:'0.9rem', fontWeight:700, cursor:'pointer', boxShadow:'0 10px 24px rgba(17,24,39,0.16)' }} onClick={() => navigate('/survey')}>
            Continue to Full Onboarding →
          </button>
        </div>
      </section>

      {/* ── Second ticker + Footer ── */}
      {/* <TickerBar /> */}
      <footer style={{ padding:'40px 48px', display:'flex', alignItems:'center', justifyContent:'space-between', borderTop:'1px solid var(--border)', color:'var(--text-faint)', fontSize:'0.8rem' }}>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:700, color:'var(--gold)', fontSize:'1rem' }}>WealthSphere</div>
        <div>© 2025 WealthSphere · Schroders Hackathon Prototype</div>
        <div>Built with Three.js · Open Finance APIs</div>
      </footer>

      {/* ══ LAYER 4 — BENTO DASHBOARD ══ */}
      <BentoDashboard node={dashNode} show={dashShow} onClose={closeDashboard} />

      {/* Global keyframes */}
      <style>{`
        @keyframes gcPulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.4)} }
        @keyframes dashShimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes flyFlash { 0%{opacity:0} 30%{opacity:1} 100%{opacity:0} }
        @keyframes starTwinkle { 0%,100%{opacity:var(--so,0.1)} 50%{opacity:calc(var(--so,0.1)*3)} }
        @keyframes globePulse { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.7} 50%{transform:translate(-50%,-50%) scale(1.08);opacity:1} }
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
    position:'relative', overflow:'hidden', paddingTop:130, paddingBottom:48,
  },
  globeGlow: {
    position:'absolute', width:720, height:720, borderRadius:'50%',
    background:'radial-gradient(circle,rgba(45,212,191,0.09) 0%,rgba(201,168,76,0.07) 40%,transparent 70%)',
    top:'50%', left:'50%', transform:'translate(-50%,-50%)',
    zIndex:1, pointerEvents:'none', animation:'globePulse 6s ease-in-out infinite',
  },
  heroText: {
    position:'relative', zIndex:3, textAlign:'center',
    maxWidth:680, marginBottom:32, animation:'fadeUp 1s ease both',
  },
  eyebrow: {
    fontFamily:'var(--font-mono)', fontSize:'0.72rem', letterSpacing:'0.2em',
    color:'var(--teal)', textTransform:'uppercase', marginBottom:16,
    display:'flex', alignItems:'center', justifyContent:'center', gap:10,
  },
  eyeLine: { width:32, height:1, background:'var(--teal)', opacity:0.5 },
  heroTitle: {
    fontFamily:'var(--font-display)', fontSize:'clamp(2.8rem,5vw,4.2rem)',
    fontWeight:800, lineHeight:1.05, marginBottom:20,
  },
  heroSub: {
    fontSize:'1rem', lineHeight:1.7, color:'var(--text-dim)', fontWeight:300,
    maxWidth:520, margin:'0 auto 32px',
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
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:14, overflow:'hidden', marginTop:36,
    animation:'fadeUp 1s ease 0.4s both',
    boxShadow:'0 8px 40px rgba(0,0,0,0.3)',
  },
  statItem: { padding:'16px 28px', textAlign:'center' },
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
