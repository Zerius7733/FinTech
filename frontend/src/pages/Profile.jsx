import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import { MOCK_USER, MOCK_BENCHMARK } from '../data.js'

// ── small chart helpers ───────────────────────────────────────────────────────
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
        <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.6rem', background:'linear-gradient(135deg,var(--gold-light),var(--gold))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>{score}</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.58rem', color:'var(--text-faint)', textTransform:'uppercase' }}>/ 100</span>
      </div>
    </div>
  )
}

function CompareBar({ label, youVal, youPct, peerVal, peerPct }) {
  const barRef = useRef(null)
  useEffect(() => {
    setTimeout(() => {
      if (barRef.current) {
        barRef.current.querySelectorAll('[data-w]').forEach(el => {
          el.style.width = el.dataset.w
        })
      }
    }, 200)
  }, [])
  return (
    <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }} ref={barRef}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.67rem', color:'var(--text-dim)', width:110, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</div>
      <div style={{ flex:1, position:'relative', height:28 }}>
        <div style={{ position:'absolute', top:'50%', transform:'translateY(-50%)', width:'100%', height:8, background:'var(--surface2)', borderRadius:4 }} />
        <div data-w={`${youPct}%`} style={{ position:'absolute', top:'50%', transform:'translateY(-50%)', width:'0%', height:8, borderRadius:4, background:'linear-gradient(90deg,var(--gold),var(--gold-light))', boxShadow:'0 0 8px rgba(201,168,76,0.4)', transition:'width 1s cubic-bezier(0.4,0,0.2,1)' }} />
        <div data-w={`${peerPct}%`} style={{ position:'absolute', top:'50%', transform:'translateY(-50%)', width:'0%', height:4, borderRadius:2, background:'rgba(45,212,191,0.5)', transition:'width 1s 0.2s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>
      <div style={{ textAlign:'right', minWidth:90 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:'var(--gold)' }}>{youVal}</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'rgba(45,212,191,0.7)' }}>{peerVal} median</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Profile() {
  const navigate  = useNavigate()
  const user      = MOCK_USER
  const benchmark = MOCK_BENCHMARK

  const WELLNESS = [
    { label:'Diversification',      val:81, color:'var(--green)' },
    { label:'Liquidity',            val:68, color:'var(--gold)' },
    { label:'Behavioural Resilience',val:74, color:'var(--teal)' },
    { label:'Currency Exposure',    val:55, color:'var(--orange)' },
    { label:'Volatility Buffer',    val:70, color:'var(--blue)' },
  ]

  const COMPOSITION = [
    { icon:'📈', name:'Equities',      pct:48, aum:'$325K', color:'var(--blue)' },
    { icon:'🏠', name:'Real Estate',   pct:30, aum:'$203K', color:'var(--gold)' },
    { icon:'₿',  name:'Digital Assets',pct:12, aum:'$81K',  color:'var(--teal)' },
    { icon:'🏛️', name:'Fixed Income',  pct:6,  aum:'$41K',  color:'var(--purple)' },
    { icon:'🪙', name:'Commodities',   pct:4,  aum:'$27K',  color:'#fbbf24' },
  ]

  const ACTIVITY = [
    { dot:'var(--green)',  title:'Bought 15 shares NVDA',         meta:'US Equity · $875.25/share · 2 days ago',      badge:'+$13,128', badgeColor:'var(--green)' },
    { dot:'var(--teal)',   title:'Risk profile updated',          meta:'Aggressive → Balanced · 1 week ago',          badge:'Settings',  badgeColor:'var(--teal)' },
    { dot:'var(--blue)',   title:'Sold 0.12 BTC',                 meta:'Digital Assets · $67,420/BTC · 2 weeks ago',  badge:'−$8,090',  badgeColor:'var(--blue)' },
    { dot:'var(--gold)',   title:'Wellness score milestone',      meta:'Score crossed 70 for the first time · 3 weeks ago', badge:'🏆 Achievement', badgeColor:'var(--gold)' },
    { dot:'var(--purple)', title:'Ascendas REIT dividend received',meta:'SG Real Estate · SGD 452 · 1 month ago',    badge:'Income',    badgeColor:'var(--purple)' },
  ]

  const INSIGHTS = [
    { icon:'📈', bg:'rgba(52,211,153,0.1)',  title:'Above-average growth trajectory', body:'Your YTD return of +18.4% exceeds 76% of your peer cohort. Your tech-heavy US equity position has been the primary driver.', tag:'Positive Signal', tagColor:'var(--green)', tagBg:'rgba(52,211,153,0.1)' },
    { icon:'⚠️', bg:'rgba(251,191,36,0.1)', title:'Currency concentration risk',      body:'68% of your portfolio is USD-denominated. SGD appreciation could erode returns. Consider hedging or adding SGD-native assets.', tag:'Action Suggested', tagColor:'#fbbf24', tagBg:'rgba(251,191,36,0.1)' },
    { icon:'🎯', bg:'rgba(96,165,250,0.1)',  title:'On track for 3–5yr horizon',      body:'At current growth rate, your wealth goal projection is on track. Increasing contributions by 8% would accelerate by 14 months.', tag:'Goal Tracking', tagColor:'var(--blue)', tagBg:'rgba(96,165,250,0.1)' },
  ]

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <Sidebar />
      <main style={{ marginLeft:72, flex:1, padding:'40px 48px', maxWidth:1400 }}>

        {/* Topbar */}
        <div style={s.topbar}>
          <div style={s.pageTitle}>My Profile</div>
          <div style={{ display:'flex', gap:14, alignItems:'center' }}>
            <div style={s.badgePill}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', boxShadow:'0 0 6px var(--green)' }} />
              Data live · SGX 09:42
            </div>
            <div style={{ ...s.badgePill, borderColor:'rgba(201,168,76,0.25)', color:'var(--gold)' }}>
              Wellness {user.wellnessScore}/100
            </div>
          </div>
        </div>

        {/* Hero card */}
        <div style={s.heroCard}>
          <div style={s.avatarWrap}>
            <div style={s.avatar}>{user.initials}</div>
            <div style={s.avatarRing} />
          </div>
          <div style={{ flex:1 }}>
            <div style={s.userName}>{user.name}</div>
            <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:12 }}>
              {[['var(--teal)',user.investorType],['var(--gold)',`Age: ${user.ageGroup}`],['var(--purple)',user.country],['var(--green)',`Member since ${user.memberSince}`]].map(([c,t]) => (
                <span key={t} style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-dim)' }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:c }} />{t}
                </span>
              ))}
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {[['gold','⚖️ Balanced (0.7)'],['teal',`${user.horizon} Horizon`],['','Wealth Growth'],['','14 Positions']].map(([type, label]) => (
                <span key={label} style={{ background:'var(--surface2)', border:`1px solid ${type === 'gold' ? 'rgba(201,168,76,0.3)' : type === 'teal' ? 'rgba(45,212,191,0.3)' : 'var(--border)'}`, borderRadius:20, padding:'4px 12px', fontSize:'0.74rem', color: type === 'gold' ? 'var(--gold)' : type === 'teal' ? 'var(--teal)' : 'var(--text-dim)' }}>{label}</span>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', gap:28 }}>
            {[['$677K','Total AUM','var(--gold)'],['+18.4%','YTD Return','var(--green)']].map(([v,l,c]) => (
              <div key={l} style={{ textAlign:'right' }}>
                <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.4rem', color:c }}>{v}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Row 1: Wellness + Composition */}
        <div style={s.twoCol}>
          <div style={s.card}>
            <div style={s.secLabel}>Financial Wellness Score</div>
            <div style={{ display:'flex', alignItems:'center', gap:24 }}>
              <WellnessRing score={user.wellnessScore} />
              <div style={{ flex:1 }}>
                {WELLNESS.map(w => (
                  <div key={w.label} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', color:'var(--text-dim)', marginBottom:4 }}>
                      <span>{w.label}</span>
                      <span style={{ fontFamily:'var(--font-mono)', color:'var(--text)' }}>{w.val}</span>
                    </div>
                    <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${w.val}%`, background:w.color, borderRadius:3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.secLabel}>Portfolio Composition <span style={{ color:'var(--teal)', cursor:'pointer', fontSize:'0.7rem' }} onClick={() => navigate('/')}>View Globe →</span></div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {COMPOSITION.map(c => (
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
                    <div style={{ fontSize:'0.7rem', color:'var(--text-faint)' }}>{c.aum}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Peer Benchmarking */}
        <div style={{ ...s.card, marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div style={s.secLabel}>Peer Age Benchmarking</div>
            <div style={{ fontSize:'0.7rem', color:'var(--text-faint)', fontFamily:'var(--font-mono)' }}>{benchmark.source}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
            <div style={{ background:'rgba(201,168,76,0.1)', border:'1px solid rgba(201,168,76,0.3)', borderRadius:24, padding:'6px 14px', fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--gold)' }}>
              📊 Age Group: {benchmark.ageGroup}
            </div>
            <div style={{ fontSize:'0.82rem', color:'var(--text-dim)' }}>
              Comparing against <strong style={{ color:'var(--text)' }}>{benchmark.sampleSize.toLocaleString()} investors</strong> in your cohort.
            </div>
          </div>
          <div style={{ display:'flex', gap:20, marginBottom:20 }}>
            {[{c:'linear-gradient(90deg,var(--gold),var(--gold-light))',l:'You'},{c:'rgba(45,212,191,0.5)',l:'Peer Median'}].map(x => (
              <div key={x.l} style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.75rem', color:'var(--text-dim)' }}>
                <div style={{ width:28, height:4, borderRadius:2, background:x.c }} />{x.l}
              </div>
            ))}
          </div>
          <CompareBar label="Total AUM"      youVal="$677K"    youPct={68} peerVal="~$420K"   peerPct={42} />
          <CompareBar label="YTD Return"     youVal="+18.4%"   youPct={72} peerVal="+14.8%"  peerPct={58} />
          <CompareBar label="Diversification"youVal="81 / 100" youPct={81} peerVal="60 / 100" peerPct={60} />
          <CompareBar label="Asset Classes"  youVal="6 classes"youPct={60} peerVal="3"        peerPct={30} />
          <CompareBar label="Digital Alloc." youVal="12%"      youPct={36} peerVal="6%"       peerPct={18} />

          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginTop:20 }}>
            {[
              { n:'84th', l:'Percentile — AUM',     c:'var(--green)',  ctx:'Top 16% in your age group' },
              { n:'76th', l:'Percentile — Returns', c:'var(--teal)',   ctx:'+3.6% above median YTD' },
              { n:'91st', l:'Percentile — Diversity',c:'var(--gold)', ctx:'Top 9% by asset breadth' },
            ].map(p => (
              <div key={p.n} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:14, padding:'16px 14px', textAlign:'center', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background:p.c }} />
                <div style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.7rem', color:p.c, marginBottom:2 }}>{p.n}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{p.l}</div>
                <div style={{ fontSize:'0.74rem', color:'var(--text-dim)', marginTop:5 }}>{p.ctx}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Row 3: Insights + Activity */}
        <div style={s.twoCol}>
          <div style={s.card}>
            <div style={s.secLabel}>Personalised Insights</div>
            {INSIGHTS.map(ins => (
              <div key={ins.title} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:14, padding:'16px 18px', marginBottom:12, display:'flex', gap:14, cursor:'pointer', transition:'border-color 0.2s' }}>
                <div style={{ width:40, height:40, borderRadius:10, background:ins.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem', flexShrink:0 }}>{ins.icon}</div>
                <div>
                  <div style={{ fontWeight:600, fontSize:'0.88rem', marginBottom:3 }}>{ins.title}</div>
                  <div style={{ fontSize:'0.77rem', color:'var(--text-dim)', lineHeight:1.55, marginBottom:8 }}>{ins.body}</div>
                  <span style={{ background:ins.tagBg, color:ins.tagColor, fontFamily:'var(--font-mono)', fontSize:'0.65rem', padding:'3px 10px', borderRadius:8 }}>{ins.tag}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <div style={s.secLabel}>Recent Activity</div>
            {ACTIVITY.map(a => (
              <div key={a.title} style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:9, height:9, borderRadius:'50%', background:a.dot, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'0.85rem', fontWeight:500, marginBottom:2 }}>{a.title}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.67rem', color:'var(--text-faint)' }}>{a.meta}</div>
                </div>
                <div style={{ background:`${a.badgeColor}18`, color:a.badgeColor, fontFamily:'var(--font-mono)', fontSize:'0.68rem', padding:'4px 10px', borderRadius:10, flexShrink:0 }}>{a.badge}</div>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  )
}

const s = {
  topbar: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:36 },
  pageTitle: { fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.55rem' },
  badgePill: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:24, padding:'7px 14px',
    fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--text-dim)',
    display:'flex', alignItems:'center', gap:8,
  },
  heroCard: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:22, padding:'32px 36px', marginBottom:28,
    display:'flex', alignItems:'center', gap:28, position:'relative', overflow:'hidden',
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
