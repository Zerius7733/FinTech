import { useEffect, useState } from 'react'
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

// CompareBar removed — Peer Benchmarking is a Future Upgrade

// ─────────────────────────────────────────────────────────────────────────────
export default function Profile() {
  const navigate = useNavigate()
  const { user: authUser } = useAuth()

  const [profile,   setProfile]   = useState(null)
  const [portfolio, setPortfolio] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  // Best practice: fetch on mount, keyed to user_id.
  // useEffect with [authUser?.user_id] means it re-fetches if the logged-in
  // account changes (e.g. sign out → sign in as someone else).
  // A cleanup flag prevents stale setState calls if the component unmounts
  // before the request finishes (e.g. user navigates away quickly).
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
        if (profRes.ok)  { const d = await profRes.json();  setProfile(d.user) }
        if (portRes.ok)  { const d = await portRes.json();  setPortfolio(d.portfolio) }
      } catch { if (!cancelled) setError('Could not reach the server. Is the backend running?') }
      finally  { if (!cancelled) setLoading(false) }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [authUser?.user_id])

  // ── Derived ───────────────────────────────────────────────────────────────
  const stocks  = portfolio?.stocks  ?? []
  const cryptos = portfolio?.cryptos ?? []
  const allHoldings = [
    ...stocks.map(h  => ({ ...h, type:'Stock' })),
    ...cryptos.map(h => ({ ...h, type:'Crypto' })),
  ]
  const stocksValue   = stocks.reduce((s,h)  => s + (h.market_value ?? 0), 0)
  const cryptosValue  = cryptos.reduce((s,h) => s + (h.market_value ?? 0), 0)
  const portfolioValue = stocksValue + cryptosValue
  const totalAUM      = portfolioValue + (profile?.cash_balance ?? 0)
  const positionCount = stocks.length + cryptos.length

  const wellness      = profile?.wellness_metrics ?? {}
  const wellnessScore = profile?.financial_wellness_score ?? 0
  const stressIndex   = profile?.financial_stress_index   ?? null

  const COMPOSITION_REAL = [
    portfolioValue > 0 && { icon:'📈', name:'Equities (Stocks)', pct:Math.round(stocksValue  / portfolioValue * 100), val:fmt$(stocksValue),  color:'var(--blue)' },
    portfolioValue > 0 && { icon:'₿',  name:'Digital Assets',    pct:Math.round(cryptosValue / portfolioValue * 100), val:fmt$(cryptosValue), color:'var(--teal)' },
  ].filter(Boolean)
  const COMPOSITION_FUTURE = [
    { icon:'🏠', name:'Real Estate',  color:'var(--gold)' },
    { icon:'🏛️', name:'Fixed Income', color:'var(--purple)' },
    { icon:'🪙', name:'Commodities',  color:'#fbbf24' },
  ]

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
      <TickerBar style={{ position:'fixed', top:0, left:0, right:0, zIndex:102 }} />
      <Navbar />

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
  topbar: { display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:36, flexWrap:'wrap', gap:16 },
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
  userName: { fontFamily:'var(--font-display)', fontSize:'1.45rem', fontWeight:800, marginBottom:6 },
  twoCol: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:22, marginBottom:22 },
  card: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:24 },
  secLabel: {
    fontFamily:'var(--font-mono)', fontSize:'0.67rem',
    color:'var(--text-faint)', textTransform:'uppercase',
    letterSpacing:'0.13em', marginBottom:16,
    display:'flex', justifyContent:'space-between', alignItems:'center',
  },
}
