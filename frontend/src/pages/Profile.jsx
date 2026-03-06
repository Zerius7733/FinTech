import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import TickerBar from '../components/TickerBar.jsx'
import Navbar from '../components/Navbar.jsx'

const API = 'http://localhost:8000'

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt$(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 }).format(n)
}
function fmtPct(n) { return n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` }
function initials(name) {
  if (!name) return '??'
  return name.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0,2).join('')
}
function gainPct(current, avg) {
  if (!avg || !current) return null
  return ((current - avg) / avg) * 100
}

function FutureTag() {
  return (
    <span style={{ background:'rgba(96,165,250,0.1)', color:'var(--blue)', fontFamily:'var(--font-mono)', fontSize:'0.6rem', padding:'2px 8px', borderRadius:6, border:'1px solid rgba(96,165,250,0.2)', marginLeft:6 }}>
      Future Upgrade
    </span>
  )
}

function FutureBar({ label }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', color:'var(--text-faint)', marginBottom:4 }}>
        <span>{label} <FutureTag /></span>
        <span style={{ fontFamily:'var(--font-mono)' }}>—</span>
      </div>
      <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
        <div style={{ height:'100%', width:'40%', background:'rgba(96,165,250,0.25)', borderRadius:3 }} />
      </div>
    </div>
  )
}

function LoadingPulse() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {[100, 85, 92, 70].map((w, i) => (
        <div key={i} style={{ height:14, width:`${w}%`, background:'var(--surface2)', borderRadius:6 }} />
      ))}
    </div>
  )
}

// Inline spinner used in buttons
function Spinner({ size = 16, color = 'var(--teal)' }) {
  return (
    <div style={{
      width:size, height:size,
      border:`2px solid rgba(255,255,255,0.12)`,
      borderTopColor:color, borderRadius:'50%',
      animation:'profileSpin 0.7s linear infinite',
      flexShrink:0,
    }} />
  )
}

// ── small chart helper ────────────────────────────────────────────────────────
function WellnessRing({ score }) {
  const r = 42, circ = 2 * Math.PI * r
  return (
    <div style={{ position:'relative', width:100, height:100, flexShrink:0 }}>
      <svg viewBox="0 0 100 100" width={100} height={100} style={{ transform:'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="wg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#c9a84c" />
          </linearGradient>
        </defs>
        <circle cx={50} cy={50} r={r} fill="none" stroke="var(--surface2)" strokeWidth={9} />
        <circle cx={50} cy={50} r={r} fill="none" stroke="url(#wg)" strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - score / 100)} />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.6rem', background:'linear-gradient(135deg,var(--gold-light),var(--gold))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>{Math.round(score)}</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'var(--text-faint)', textTransform:'uppercase' }}>/ 100</span>
      </div>
    </div>
  )
}

// ── Risk option definitions ───────────────────────────────────────────────────
const RISK_OPTIONS = [
  { key:'Low', label:'Low', icon:'🛡️', desc:'Capital preservation. Low volatility, steady income.',       color:'#34d399', glow:'rgba(52,211,153,0.35)'  },
  { key:'Medium',     label:'Medium',     icon:'⚖️', desc:'Mix of growth and stability. Moderate risk tolerance.',      color:'#c9a84c', glow:'rgba(201,168,76,0.35)'  },
  { key:'High',   label:'High',   icon:'🚀', desc:'Maximum growth. High volatility accepted for high returns.', color:'#f87171', glow:'rgba(248,113,113,0.35)' },
]

// ── Rec card shared between sections 2 & 3 ───────────────────────────────────
const REC_ICON  = { buy:'📈', sell:'📉', hold:'⏸', rebalance:'🔄', warning:'⚠️' }
const REC_COLOR = { buy:'var(--green)', sell:'var(--red)', hold:'var(--gold)', rebalance:'var(--teal)', warning:'#fbbf24' }

function RecCard({ rec, i, tint = false }) {
  const type  = rec.type?.toLowerCase()
  const color = REC_COLOR[type] ?? (tint ? 'var(--teal)' : 'var(--text-dim)')
  const icon  = REC_ICON[type]  ?? (tint ? '🤖' : '💡')
  return (
    <div style={{
      background: tint ? 'rgba(45,212,191,0.04)' : 'var(--surface2)',
      border: `1px solid ${tint ? 'rgba(45,212,191,0.14)' : 'var(--border)'}`,
      borderRadius:12, padding:'16px 18px', display:'flex', gap:14, alignItems:'flex-start',
      animation:'profileFadeUp 0.3s ease',
    }}>
      <div style={{ width:38, height:38, borderRadius:10, background:`${color}18`, border:`1px solid ${color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>
        {icon}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5, flexWrap:'wrap' }}>
          <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.88rem' }}>
            {rec.title ?? rec.symbol ?? rec.asset ?? `Recommendation ${i + 1}`}
          </span>
          {rec.type && (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', padding:'2px 8px', borderRadius:6, background:`${color}18`, color, border:`1px solid ${color}30`, textTransform:'uppercase', letterSpacing:'0.07em' }}>
              {rec.type}
            </span>
          )}
          {rec.priority && (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', padding:'2px 8px', borderRadius:6, background:'rgba(255,255,255,0.05)', color:'var(--text-faint)', border:'1px solid var(--border)' }}>
              {rec.priority}
            </span>
          )}
        </div>
        <div style={{ fontSize:'0.8rem', color:'var(--text-dim)', lineHeight:1.65 }}>
          {rec.message ?? rec.description ?? rec.reason ?? rec.body ?? JSON.stringify(rec)}
        </div>
        {rec.symbol && rec.title && (
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--teal)', marginTop:6 }}>{rec.symbol}</div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Profile() {
  const navigate = useNavigate()
  const { user: authUser } = useAuth()

  const [profile,   setProfile]   = useState(null)
  const [portfolio, setPortfolio] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  // ── Section 1: Risk profile update state ─────────────────────────────────
  const [selectedRisk, setSelectedRisk] = useState('')
  const [riskSaving,   setRiskSaving]   = useState(false)
  const [riskSaved,    setRiskSaved]    = useState(false)
  const [riskError,    setRiskError]    = useState('')

  // ── GPT recommendations state ─────────────────────────────────────────────
  const [gptRecs,    setGptRecs]    = useState(null)
  const [gptLoading, setGptLoading] = useState(false)
  const [gptError,   setGptError]   = useState('')

  // ── Initial data fetch ────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser?.user_id) { setLoading(false); return }
    let cancelled = false
    async function fetchAll() {
      setLoading(true); setError('')
      try {
        const [profRes, portRes] = await Promise.all([
          fetch(`${API}/users/${authUser.user_id}`),
          fetch(`${API}/portfolio/${authUser.user_id}`),
        ])
        if (cancelled) return
        if (profRes.ok) {
          const d = await profRes.json()
          setProfile(d.user)
          // Pre-select the user's current risk profile in the UI
          if (d.user?.risk_profile) setSelectedRisk(d.user.risk_profile.toLowerCase())
        }
        if (portRes.ok) { const d = await portRes.json(); setPortfolio(d.portfolio) }
      } catch { if (!cancelled) setError('Could not reach the server. Is the backend running?') }
      finally  { if (!cancelled) setLoading(false) }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [authUser?.user_id])

  // ── Section 1: PATCH /users/risk ─────────────────────────────────────────
  const saveRiskProfile = useCallback(async () => {
    if (!selectedRisk || !authUser?.user_id) return
    setRiskSaving(true); setRiskError(''); setRiskSaved(false)
    try {
      const res = await fetch(`${API}/users/risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: authUser.user_id, risk_profile: selectedRisk }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.detail ?? `HTTP ${res.status}`) }
      // Optimistically update hero card without a re-fetch
      setProfile(prev => prev ? { ...prev, risk_profile: selectedRisk } : prev)
      setRiskSaved(true)
      setTimeout(() => setRiskSaved(false), 3500)
    } catch (e) { setRiskError(e.message) }
    finally     { setRiskSaving(false) }
  }, [selectedRisk, authUser?.user_id])

  // ── GET /users/:id/recommendations/gpt?limit=3&model=gpt-4.1-mini ───────────
  const fetchGptRecs = useCallback(async () => {
    if (!authUser?.user_id) return
    setGptLoading(true); setGptError(''); setGptRecs(null)
    try {
      const res = await fetch(`${API}/users/${authUser.user_id}/recommendations/gpt?limit=3&model=gpt-4.1-mini`)
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.detail ?? `HTTP ${res.status}`) }
      setGptRecs(await res.json())
    } catch (e) { setGptError(e.message) }
    finally     { setGptLoading(false) }
  }, [authUser?.user_id])

  // ── Derived values ────────────────────────────────────────────────────────
  const stocks         = portfolio?.stocks  ?? []
  const cryptos        = portfolio?.cryptos ?? []
  const allHoldings    = [...stocks.map(h => ({ ...h, type:'Stock' })), ...cryptos.map(h => ({ ...h, type:'Crypto' }))]
  const stocksValue    = stocks.reduce((s,h)  => s + (h.market_value ?? 0), 0)
  const cryptosValue   = cryptos.reduce((s,h) => s + (h.market_value ?? 0), 0)
  const portfolioValue = stocksValue + cryptosValue
  const totalAUM       = portfolioValue + (profile?.cash_balance ?? 0)
  const positionCount  = stocks.length + cryptos.length
  const wellness       = profile?.wellness_metrics ?? {}
  const wellnessScore  = profile?.financial_wellness_score ?? 0
  const stressIndex    = profile?.financial_stress_index   ?? null

  const COMPOSITION_REAL = [
    portfolioValue > 0 && { icon:'📈', name:'Equities (Stocks)', pct:Math.round(stocksValue  / portfolioValue * 100), val:fmt$(stocksValue),  color:'var(--blue)' },
    portfolioValue > 0 && { icon:'₿',  name:'Digital Assets',    pct:Math.round(cryptosValue / portfolioValue * 100), val:fmt$(cryptosValue), color:'var(--teal)' },
  ].filter(Boolean)
  const COMPOSITION_FUTURE = [
    { icon:'🏠', name:'Real Estate',  color:'var(--gold)'   },
    { icon:'🏛️', name:'Fixed Income', color:'var(--purple)' },
    { icon:'🪙', name:'Commodities',  color:'#fbbf24'       },
  ]

  // Normalise GPT response — could be string, { message }, { recommendations: [] }, etc.
  const gptArray = gptRecs && Array.isArray(gptRecs.recommendations) ? gptRecs.recommendations : null
  const gptText  = gptRecs && !gptArray
    ? (typeof gptRecs === 'string' ? gptRecs
        : gptRecs.message ?? gptRecs.recommendation ?? gptRecs.content ?? JSON.stringify(gptRecs, null, 2))
    : null

  // Is current selection different from what's saved?
  const riskChanged = selectedRisk && selectedRisk !== (profile?.risk_profile ?? '').toLowerCase()

  if (!authUser) {
    return (
      <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <p style={{ color:'var(--text-dim)', marginBottom:16 }}>Sign in to view your portfolio.</p>
          <button style={{ background:'var(--gold)', border:'none', borderRadius:8, padding:'10px 24px', fontWeight:700, cursor:'pointer', color:'#0d0d0d' }} onClick={() => navigate('/login')}>Sign In</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)' }}>
      {/* <TickerBar style={{ position:'fixed', top:0, left:0, right:0, zIndex:102 }} /> */}
      <Navbar />

      {/* Keyframes injected once */}
      <style>{`
        @keyframes profileSpin    { to { transform: rotate(360deg) } }
        @keyframes profileFadeUp  { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes profilePulse   { 0%,100% { opacity:0.4 } 50% { opacity:1 } }
        @keyframes spinSlow       { to { transform: rotate(360deg) } }
      `}</style>

      <main style={{ paddingTop:110, paddingBottom:60, paddingLeft:48, paddingRight:48, maxWidth:1400, margin:'0 auto' }}>

        {/* Page header */}
        <div style={s.topbar}>
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--teal)', textTransform:'uppercase', letterSpacing:'0.2em', marginBottom:8, display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:24, height:1, background:'var(--teal)', opacity:0.5 }}/>Personal Finance<div style={{ width:24, height:1, background:'var(--teal)', opacity:0.5 }}/>
            </div>
            <div style={s.pageTitle}>My <span style={{ background:'linear-gradient(135deg,var(--gold-light),var(--gold),var(--teal))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Portfolio</span></div>
          </div>
          <div style={{ display:'flex', gap:14, alignItems:'center' }}>
            <div style={s.badgePill}>
              <div style={{ width:7, height:7, borderRadius:'50%', background: loading ? 'var(--text-faint)' : 'var(--green)', boxShadow: loading ? 'none' : '0 0 6px var(--green)' }} />
              {loading ? 'Loading…' : 'Live Data · Backend'}
            </div>
            {!loading && profile && <div style={{ ...s.badgePill, borderColor:'rgba(201,168,76,0.25)', color:'var(--gold)' }}>Wellness {Math.round(wellnessScore)}/100</div>}
            {!loading && stressIndex != null && <div style={{ ...s.badgePill, borderColor:'rgba(248,113,113,0.25)', color:'var(--red)' }}>Stress {Math.round(stressIndex)}</div>}
          </div>
        </div>

        {error && (
          <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:12, padding:'14px 20px', color:'var(--red)', marginBottom:24, fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{error}</div>
        )}

        {/* Hero card */}
        <div style={s.heroCard}>
          <div style={s.avatarWrap}>
            <div style={s.avatar}>{profile ? initials(profile.name) : initials(authUser.username)}</div>
            <div style={s.avatarRing} />
          </div>
          <div style={{ flex:1 }}>
            <div style={s.userName}>{profile?.name ?? authUser.username}</div>
            <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:12 }}>
              {[['var(--teal)','Individual Investor'],['var(--gold)', profile?.risk_profile ? `Risk: ${profile.risk_profile}` : 'Risk: —'],['var(--purple)',`ID: ${authUser.user_id}`]].map(([c,t]) => (
                <span key={t} style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-dim)' }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:c }}/>{t}
                </span>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {profile?.risk_profile && <span style={{ background:'var(--surface2)', border:'1px solid rgba(201,168,76,0.3)', borderRadius:20, padding:'4px 12px', fontSize:'0.74rem', color:'var(--gold)' }}>⚖️ {profile.risk_profile} Risk</span>}
              <span style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:20, padding:'4px 12px', fontSize:'0.74rem', color:'var(--text-dim)' }}>{positionCount} Position{positionCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:28, flexWrap:'wrap' }}>
            {[
              [loading ? '…' : fmt$(totalAUM),                               'Total AUM',       'var(--gold)'],
              [loading ? '…' : fmt$(profile?.portfolio_value ?? portfolioValue),'Portfolio Value','var(--green)'],
              [loading ? '…' : fmt$(profile?.cash_balance),                   'Cash Balance',   'var(--teal)'],
            ].map(([v,l,c]) => (
              <div key={l} style={{ textAlign:'right' }}>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.15rem', color:c }}>{v}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
              </div>
            ))}
            <div style={{ textAlign:'right', opacity:0.45 }}>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.15rem', color:'var(--text-faint)' }}>—</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.08em', display:'flex', alignItems:'center', gap:4 }}>YTD Return<FutureTag /></div>
            </div>
          </div>
        </div>

        {/* Row 1: Wellness + Composition */}
        <div style={s.twoCol}>
          <div style={s.card}>
            <div style={s.secLabel}>Financial Wellness Score</div>
            {loading ? <LoadingPulse /> : (
              <div style={{ display:'flex', alignItems:'center', gap:24 }}>
                <WellnessRing score={wellnessScore} />
                <div style={{ flex:1 }}>
                  {[
                    { label:'Diversification', val:wellness.diversification_score, color:'var(--green)' },
                    { label:'Liquidity',        val:wellness.liquidity_score,       color:'var(--gold)' },
                    { label:'Debt / Income',    val:wellness.debt_income_score,     color:'var(--orange)' },
                  ].map(w => (
                    <div key={w.label} style={{ marginBottom:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', color:'var(--text-dim)', marginBottom:4 }}>
                        <span>{w.label}</span>
                        <span style={{ fontFamily:'var(--font-mono)', color:'var(--text)' }}>{w.val != null ? Math.round(w.val) : '—'}</span>
                      </div>
                      <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.min(w.val ?? 0, 100)}%`, background:w.color, borderRadius:3 }} />
                      </div>
                    </div>
                  ))}
                  <FutureBar label="Behavioural Resilience" />
                  <FutureBar label="Currency Exposure" />
                  <FutureBar label="Volatility Buffer" />
                </div>
              </div>
            )}
          </div>

          <div style={s.card}>
            <div style={s.secLabel}>Portfolio Composition</div>
            {loading ? <LoadingPulse /> : (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {COMPOSITION_REAL.map(c => (
                  <div key={c.name} style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:`${c.color}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>{c.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:500, fontSize:'0.87rem', marginBottom:4 }}>{c.name}</div>
                      <div style={{ height:4, background:'var(--surface2)', borderRadius:2, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${c.pct}%`, background:c.color, borderRadius:2 }} />
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem' }}>{c.pct}%</div>
                      <div style={{ fontSize:'0.7rem', color:'var(--text-faint)' }}>{c.val}</div>
                    </div>
                  </div>
                ))}
                {COMPOSITION_FUTURE.map(c => (
                  <div key={c.name} style={{ display:'flex', alignItems:'center', gap:12, opacity:0.4 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:`${c.color}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', flexShrink:0 }}>{c.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:500, fontSize:'0.87rem', marginBottom:4, display:'flex', alignItems:'center' }}>{c.name}<FutureTag /></div>
                      <div style={{ height:4, background:'var(--surface2)', borderRadius:2 }} />
                    </div>
                    <div style={{ textAlign:'right' }}><div style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:'var(--text-faint)' }}>—</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Holdings Table */}
        <div style={{ ...s.card, marginBottom:24 }}>
          <div style={s.secLabel}>Live Holdings</div>
          {loading ? <LoadingPulse /> : allHoldings.length === 0 ? (
            <p style={{ color:'var(--text-faint)', fontSize:'0.85rem' }}>No holdings found for this account.</p>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'var(--font-mono)', fontSize:'0.8rem' }}>
                <thead>
                  <tr style={{ color:'var(--text-faint)', textTransform:'uppercase', fontSize:'0.65rem', letterSpacing:'0.08em' }}>
                    {['Symbol','Type','Qty','Avg Cost','Current Price','Market Value','Gain / Loss'].map((h,i) => (
                      <th key={h} style={{ textAlign: i===0 ? 'left' : 'right', padding:'8px 12px', borderBottom:'1px solid var(--border)', fontWeight:500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allHoldings.map((h,i) => {
                    const gain = gainPct(h.current_price, h.avg_price)
                    const gainColor = gain == null ? 'var(--text-faint)' : gain >= 0 ? 'var(--green)' : 'var(--red)'
                    return (
                      <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}
                        onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        <td style={{ padding:'12px 12px', color:'var(--text)', fontWeight:600 }}>{h.symbol}</td>
                        <td style={{ padding:'12px 12px', textAlign:'right' }}>
                          <span style={{ background: h.type==='Stock' ? 'rgba(96,165,250,0.1)' : 'rgba(45,212,191,0.1)', color: h.type==='Stock' ? 'var(--blue)' : 'var(--teal)', padding:'2px 8px', borderRadius:6, fontSize:'0.65rem' }}>{h.type}</span>
                        </td>
                        <td style={{ padding:'12px 12px', textAlign:'right', color:'var(--text-dim)' }}>{h.qty}</td>
                        <td style={{ padding:'12px 12px', textAlign:'right', color:'var(--text-dim)' }}>{fmt$(h.avg_price)}</td>
                        <td style={{ padding:'12px 12px', textAlign:'right', color:'var(--text)' }}>{fmt$(h.current_price)}</td>
                        <td style={{ padding:'12px 12px', textAlign:'right', color:'var(--gold)', fontWeight:600 }}>{fmt$(h.market_value)}</td>
                        <td style={{ padding:'12px 12px', textAlign:'right', color:gainColor, fontWeight:600 }}>{gain != null ? fmtPct(gain) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop:'1px solid var(--border)' }}>
                    <td colSpan={5} style={{ padding:'12px 12px', color:'var(--text-faint)', fontSize:'0.7rem', textTransform:'uppercase', letterSpacing:'0.08em' }}>Total Portfolio Value</td>
                    <td style={{ padding:'12px 12px', textAlign:'right', color:'var(--gold)', fontWeight:700, fontSize:'0.9rem' }}>{fmt$(portfolioValue)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 1 — Risk Profile Update
            PATCH /users/risk  { user_id, risk_profile }
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{ ...s.card, marginBottom:24 }}>
          <div style={s.secLabel}>
            Risk Profile
            {profile?.risk_profile && (
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--gold)', background:'rgba(201,168,76,0.08)', border:'1px solid rgba(201,168,76,0.25)', borderRadius:8, padding:'2px 10px' }}>
                Saved: {profile.risk_profile}
              </span>
            )}
          </div>

          <p style={{ fontSize:'0.83rem', color:'var(--text-dim)', lineHeight:1.65, marginBottom:20 }}>
            Your risk profile shapes every recommendation and wellness calculation. Select the tolerance level that best matches your investment approach, then save to update the backend.
          </p>

          {/* Three option cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:22 }}>
            {RISK_OPTIONS.map(opt => {
              const active = selectedRisk === opt.key
              return (
                <div
                  key={opt.key}
                  onClick={() => { setSelectedRisk(opt.key); setRiskSaved(false); setRiskError('') }}
                  style={{
                    border:      active ? `1.5px solid ${opt.glow}` : '1.5px solid var(--border)',
                    background:  active ? `${opt.color}12` : 'var(--surface2)',
                    borderRadius:14, padding:'18px 16px', cursor:'pointer',
                    transition:'all 0.2s', position:'relative',
                  }}
                >
                  {/* Selected dot */}
                  <div style={{ position:'absolute', top:12, right:12, width:10, height:10, borderRadius:'50%', background: active ? opt.color : 'var(--border)', boxShadow: active ? `0 0 8px ${opt.color}` : 'none', transition:'all 0.2s' }} />
                  <div style={{ fontSize:'1.6rem', marginBottom:10 }}>{opt.icon}</div>
                  <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.92rem', marginBottom:4, color: active ? opt.color : 'var(--text)' }}>{opt.label}</div>
                  <div style={{ fontSize:'0.76rem', color:'var(--text-dim)', lineHeight:1.55 }}>{opt.desc}</div>
                </div>
              )
            })}
          </div>

          {/* Save row */}
          <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            <button
              onClick={saveRiskProfile}
              disabled={riskSaving || !riskChanged}
              style={{
                ...s.btnGold,
                opacity: (riskSaving || !riskChanged) ? 0.4 : 1,
                cursor:  (riskSaving || !riskChanged) ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', gap:8,
              }}
            >
              {riskSaving
                ? <><Spinner size={14} color="#080c14" /> Saving…</>
                : riskSaved ? '✓ Saved' : 'Update Risk Profile'}
            </button>
            {riskSaved && (
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.74rem', color:'var(--green)', animation:'profileFadeUp 0.3s ease' }}>
                Risk profile updated successfully
              </span>
            )}
            {riskError && (
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.74rem', color:'var(--red)' }}>⚠ {riskError}</span>
            )}
          </div>

          {/* Live payload preview */}
          {/* <div style={{ marginTop:16, background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-faint)' }}>
            <span style={{ color:'var(--teal)' }}>POST</span>{' '}/users/risk
            {' → { '}
            <span style={{ color:'var(--text-dim)' }}>"user_id"</span>: "<span style={{ color:'var(--teal)' }}>{authUser.user_id}</span>",{' '}
            <span style={{ color:'var(--text-dim)' }}>"risk_profile"</span>: "<span style={{ color:'var(--gold)' }}>{selectedRisk || '…'}</span>"
            {' }'}
          </div> */}
        </div>
        {/* ══════════════════════════════════════════════════════════════════
            GPT Recommendations
            POST /users/:id/recommendations/gpt
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{ ...s.card, marginBottom:24 }}>
          <div style={s.secLabel}>
            <span style={{ display:'flex', alignItems:'center', gap:8 }}>
              AI-Powered Recommendations
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', padding:'2px 8px', borderRadius:6, background:'rgba(45,212,191,0.1)', color:'var(--teal)', border:'1px solid rgba(45,212,191,0.25)' }}>GPT</span>
            </span>
            <button
              onClick={fetchGptRecs}
              disabled={gptLoading}
              style={{ ...s.btnTeal, display:'flex', alignItems:'center', gap:6, opacity: gptLoading ? 0.6 : 1 }}
            >
              {gptLoading
                ? <><Spinner size={12} color="#080c14" /> Generating…</>
                : gptRecs ? '↻ Regenerate' : '✦ Generate with GPT'}
            </button>
          </div>

          <p style={{ fontSize:'0.83rem', color:'var(--text-dim)', lineHeight:1.65, marginBottom:20 }}>
            Sends your full portfolio context — holdings, risk profile, wellness score — to GPT for personalised investment guidance.
          </p>

          {gptError && <div style={s.errBox}>⚠ {gptError}</div>}

          {/* Thinking state */}
          {gptLoading && (
            <div style={{ background:'rgba(45,212,191,0.04)', border:'1px solid rgba(45,212,191,0.14)', borderRadius:14, padding:'24px 20px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <Spinner size={18} color="var(--teal)" />
                <span style={{ fontFamily:'var(--font-display)', fontWeight:600, fontSize:'0.9rem', color:'var(--teal)' }}>GPT is analysing your portfolio…</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                {['Reading holdings and risk profile…','Evaluating portfolio composition…','Generating personalised recommendations…'].map((t,i) => (
                  <div key={t} style={{ display:'flex', alignItems:'center', gap:8, animation:`profilePulse 1.5s ease-in-out ${i*0.4}s infinite` }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--teal)', flexShrink:0 }} />
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-dim)' }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty / prompt state */}
          {!gptLoading && !gptError && gptRecs === null && (
            <div style={{ textAlign:'center', padding:'36px 20px' }}>
              <div style={{ fontSize:'2.2rem', marginBottom:12 }}>✦</div>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.95rem', marginBottom:8 }}>GPT-Powered Portfolio Analysis</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.76rem', color:'var(--text-faint)', maxWidth:380, margin:'0 auto', lineHeight:1.7 }}>
                Hit "Generate with GPT" for a personalised AI analysis based on your current holdings and risk profile.
              </div>
            </div>
          )}

          {/* Result — structured array */}
          {!gptLoading && gptArray && (
            <div style={{ display:'flex', flexDirection:'column', gap:12, animation:'profileFadeUp 0.4s ease' }}>
              {gptArray.map((rec, i) => <RecCard key={i} rec={rec} i={i} tint />)}
            </div>
          )}

          {/* Result — free-text / markdown */}
          {!gptLoading && gptText && (
            <div style={{ animation:'profileFadeUp 0.4s ease' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, padding:'10px 14px', background:'rgba(45,212,191,0.05)', border:'1px solid rgba(45,212,191,0.15)', borderRadius:10 }}>
                <span>🤖</span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--teal)' }}>
                  GPT Analysis · {authUser.user_id} · {new Date().toLocaleTimeString()}
                </span>
              </div>
              <div style={{ fontSize:'0.86rem', color:'var(--text-dim)', lineHeight:1.85, whiteSpace:'pre-wrap', background:'var(--surface2)', borderRadius:12, padding:'18px 20px', border:'1px solid var(--border)' }}>
                {gptText}
              </div>
            </div>
          )}
        </div>

        {/* Peer Benchmarking — Future Upgrade overlay */}
        <div style={{ ...s.card, marginBottom:24, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(8,12,20,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2, borderRadius:18 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'2rem', marginBottom:8 }}>📊</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:'var(--blue)', marginBottom:6 }}>Peer Age Benchmarking</div>
              <FutureTag />
            </div>
          </div>
          <div style={{ opacity:0.1, pointerEvents:'none' }}>
            <div style={s.secLabel}>Peer Age Benchmarking</div>
            <div style={{ height:160, background:'var(--surface2)', borderRadius:10 }} />
          </div>
        </div>

        {/* Insights + Activity — Future Upgrade */}
        <div style={s.twoCol}>
          {[{ icon:'💡', label:'Personalised Insights' }, { icon:'🕒', label:'Recent Activity' }].map(item => (
            <div key={item.label} style={{ ...s.card, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', inset:0, background:'rgba(8,12,20,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2, borderRadius:18 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'1.8rem', marginBottom:6 }}>{item.icon}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:'var(--blue)', marginBottom:6 }}>{item.label}</div>
                  <FutureTag />
                </div>
              </div>
              <div style={{ opacity:0.1, pointerEvents:'none' }}>
                <div style={s.secLabel}>{item.label}</div>
                <div style={{ height:140, background:'var(--surface2)', borderRadius:10 }} />
              </div>
            </div>
          ))}
        </div>

      </main>
    </div>
  )
}

const s = {
  topbar:    { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:36, flexWrap:'wrap', gap:16 },
  pageTitle: { fontFamily:'var(--font-display)', fontWeight:800, fontSize:'clamp(1.8rem,3vw,2.6rem)', lineHeight:1.1, marginBottom:6 },
  badgePill: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:24, padding:'7px 14px',
    fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--text-dim)',
    display:'flex', alignItems:'center', gap:8,
  },
  heroCard: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:22, padding:'32px 36px', marginBottom:28,
    display:'flex', alignItems:'center', gap:28, position:'relative', overflow:'hidden', flexWrap:'wrap',
  },
  avatarWrap: { position:'relative', flexShrink:0 },
  avatar: {
    width:86, height:86, borderRadius:'50%',
    background:'linear-gradient(135deg, #3b5bdb 0%, #6e48c7 50%, #2dd4bf 100%)',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:'var(--font-display)', fontSize:'1.8rem', fontWeight:800,
    border:'3px solid var(--gold)', boxShadow:'0 0 22px rgba(201,168,76,0.3)',
  },
  avatarRing: {
    position:'absolute', inset:-6, borderRadius:'50%',
    border:'1.5px dashed rgba(201,168,76,0.4)',
    animation:'spinSlow 20s linear infinite', pointerEvents:'none',
  },
  userName:  { fontFamily:'var(--font-display)', fontSize:'1.45rem', fontWeight:800, marginBottom:6 },
  twoCol:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:22, marginBottom:22 },
  card:      { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:24 },
  secLabel:  {
    fontFamily:'var(--font-mono)', fontSize:'0.67rem',
    color:'var(--text-faint)', textTransform:'uppercase',
    letterSpacing:'0.13em', marginBottom:16,
    display:'flex', justifyContent:'space-between', alignItems:'center',
  },
  errBox: {
    background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.2)',
    borderRadius:10, padding:'11px 15px', color:'var(--red)',
    fontFamily:'var(--font-mono)', fontSize:'0.76rem', marginBottom:16,
  },
  btnGold: {
    background:'linear-gradient(135deg,var(--gold),#b8922e)',
    border:'none', color:'#080c14', padding:'10px 22px', borderRadius:10,
    fontFamily:'var(--font-display)', fontSize:'0.84rem', fontWeight:700,
    boxShadow:'0 4px 16px rgba(201,168,76,0.22)', cursor:'pointer', transition:'opacity 0.2s',
  },
  btnTeal: {
    background:'linear-gradient(135deg,var(--teal),#0e9f84)',
    border:'none', color:'#080c14', padding:'8px 18px', borderRadius:8,
    fontFamily:'var(--font-display)', fontSize:'0.78rem', fontWeight:700,
    boxShadow:'0 4px 14px rgba(45,212,191,0.22)', cursor:'pointer', transition:'opacity 0.2s',
  },
}