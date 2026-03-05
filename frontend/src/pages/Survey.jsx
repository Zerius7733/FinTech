import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RiskSlider from '../components/RiskSlider.jsx'

const STEPS = [
  { title:'Your Profile',      desc:'Name, age group, and investor type to personalise your experience.' },
  { title:'Risk Tolerance',    desc:'Set your comfort with volatility. This drives your wellness scoring.' },
  { title:'Asset Preferences', desc:'Which asset classes do you currently hold or plan to invest in?' },
  { title:'Financial Goals',   desc:'Define what you\'re building toward and your investment horizon.' },
]

const AGE_GROUPS = [
  { emoji:'🌱', label:'18–29' },
  { emoji:'📈', label:'30–44' },
  { emoji:'🏦', label:'45–59' },
  { emoji:'🌅', label:'60+' },
]

const ASSET_CLASSES = [
  { icon:'📈', name:'Equities',      desc:'Stocks, ETFs, and equity funds.',              color:'#60a5fa', bg:'rgba(96,165,250,0.08)'  },
  { icon:'🏛️', name:'Fixed Income',  desc:'Government & corporate bonds.',                color:'#a78bfa', bg:'rgba(167,139,250,0.08)' },
  { icon:'🏠', name:'Real Estate',   desc:'Direct property and REITs.',                   color:'#c9a84c', bg:'rgba(201,168,76,0.08)'  },
  { icon:'₿',  name:'Digital Assets',desc:'Crypto, DeFi, and tokenised assets.',          color:'#2dd4bf', bg:'rgba(45,212,191,0.08)'  },
  { icon:'🪙', name:'Commodities',   desc:'Gold, silver, oil, and resources.',            color:'#fbbf24', bg:'rgba(251,191,36,0.08)'  },
  { icon:'🔐', name:'Private Assets',desc:'PE, venture, hedge funds, illiquid holdings.', color:'#f87171', bg:'rgba(248,113,113,0.08)' },
]

const GOALS = [
  { icon:'🌱', title:'Wealth Growth',       desc:'Compound and grow wealth aggressively.' },
  { icon:'🏖️', title:'Retirement Planning', desc:'Build a nest egg for financial independence.' },
  { icon:'💰', title:'Passive Income',      desc:'Generate regular cash flow from yields.' },
  { icon:'🏠', title:'Property Purchase',   desc:'Save and invest toward buying real estate.' },
  { icon:'🛡️', title:'Capital Preservation',desc:'Protect wealth against inflation and loss.' },
  { icon:'🎓', title:'Education / Legacy',  desc:'Fund education or create a legacy.' },
]

const HORIZONS = [
  { num:'1–2',  label:'Short Term' },
  { num:'3–5',  label:'Medium Term' },
  { num:'5–10', label:'Long Term' },
  { num:'10+',  label:'Generational' },
]

export default function Survey() {
  const navigate = useNavigate()
  const [step, setStep]         = useState(1)
  const [done, setDone]         = useState(false)
  const [ageGroup, setAgeGroup] = useState('30–44')
  const [selectedAssets, setSelectedAssets] = useState(new Set(['Equities','Fixed Income']))
  const [selectedGoals,  setSelectedGoals]  = useState(new Set(['Wealth Growth']))
  const [horizon, setHorizon]   = useState('3–5')
  const [riskLevel, setRiskLevel] = useState('balanced')

  const goNext = () => step < 4 ? setStep(s => s + 1) : setDone(true)
  const goBack = () => setStep(s => s - 1)
  const progress = done ? 100 : (step / 4) * 100

  const toggleSet = (set, setter, val) => {
    setter(prev => {
      const next = new Set(prev)
      next.has(val) ? next.delete(val) : next.add(val)
      return next
    })
  }

  if (done) {
    return (
      <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center', maxWidth:480, padding:40, animation:'fadeUp 0.5s ease' }}>
          <div style={cs.completeRing}>✦</div>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800, marginBottom:12 }}>
            You're all set, <span style={{ color:'var(--green)' }}>Alex</span>
          </h2>
          <p style={{ color:'var(--text-dim)', fontSize:'0.92rem', lineHeight:1.7, marginBottom:28 }}>
            Your WealthSphere is calibrated and ready. Your personalised globe awaits.
          </p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginBottom:32 }}>
            {[['Age', ageGroup], ['Risk', riskLevel], ['Assets', `${selectedAssets.size} classes`], ['Horizon', `${horizon}yr`]].map(([k,v]) => (
              <div key={k} style={cs.pill}>{k}: <span style={{ color:'var(--gold)' }}>{v}</span></div>
            ))}
          </div>
          <button style={cs.btnLaunch} onClick={() => navigate('/')}>Enter My WealthSphere →</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'grid', gridTemplateColumns:'360px 1fr' }}>
      {/* Progress bar */}
      <div style={cs.progressBar}><div style={{ ...cs.progressFill, width:`${progress}%` }} /></div>

      {/* BG decoration */}
      <div style={cs.bgGrid} />

      {/* Left panel */}
      <aside style={cs.leftPanel}>
        <div style={cs.logo}>
          <div style={cs.logoDot} />
          WealthSphere
        </div>

        <nav style={{ flex:1 }}>
          {STEPS.map((s, i) => {
            const n = i + 1
            const isActive = n === step
            const isDone   = n < step
            return (
              <div key={n}>
                <div
                  style={{ ...cs.stepItem, ...(isActive ? cs.stepActive : {}), ...(isDone || isActive ? {} : cs.stepInactive) }}
                  onClick={() => isDone && setStep(n)}
                >
                  <div style={{ ...cs.stepBullet, ...(isActive ? cs.bulletActive : {}), ...(isDone ? cs.bulletDone : {}) }}>
                    {isDone ? '✓' : n}
                  </div>
                  <div>
                    <div style={cs.stepTitle}>{s.title}</div>
                    <div style={cs.stepDesc}>{s.desc}</div>
                  </div>
                </div>
                {n < 4 && <div style={cs.connector} />}
              </div>
            )
          })}
        </nav>

        <div style={cs.leftFooter}>
          Already have an account?{' '}
          <span style={{ color:'var(--teal)', cursor:'pointer' }} onClick={() => navigate('/')}>Sign in →</span>
        </div>
      </aside>

      {/* Right panel */}
      <main style={cs.rightPanel}>

        {/* STEP 1 */}
        {step === 1 && (
          <div style={cs.stepPage}>
            <div style={cs.eyebrow}>Step 1 of 4</div>
            <h1 style={cs.heading}>Tell us about <em style={{ fontStyle:'normal', color:'var(--gold)' }}>yourself</em></h1>
            <p style={cs.subtext}>This helps us benchmark your portfolio against peers and tailor your wellness insights.</p>

            <div style={cs.formGrid}>
              {[['First Name','Alex'],['Last Name','Chen'],['Email Address','alex@example.com']].map(([label, ph]) => (
                <div key={label} style={{ ...(label === 'Email Address' ? { gridColumn:'1/-1' } : {}) }}>
                  <label style={cs.formLabel}>{label}</label>
                  <input style={cs.formInput} placeholder={ph} />
                </div>
              ))}
              {[['Investor Type',['Individual Investor','HNWI','Family Office','Institutional']],
                ['Primary Currency',['SGD — Singapore Dollar','USD — US Dollar','GBP — British Pound']],
                ['Country',['Singapore','United Kingdom','United States','Australia','Japan']],
              ].map(([label, opts]) => (
                <div key={label}>
                  <label style={cs.formLabel}>{label}</label>
                  <select style={cs.formInput}>
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div style={cs.formLabel}>Age Group</div>
            <div style={cs.ageGrid}>
              {AGE_GROUPS.map(a => (
                <div key={a.label}
                  style={{ ...cs.ageCard, ...(ageGroup === a.label ? cs.ageCardActive : {}) }}
                  onClick={() => setAgeGroup(a.label)}>
                  <div style={{ fontSize:'1.5rem', marginBottom:6 }}>{a.emoji}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color: ageGroup === a.label ? 'var(--gold)' : 'var(--text-dim)' }}>{a.label}</div>
                </div>
              ))}
            </div>

            <Footer onNext={goNext} showBack={false} />
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div style={cs.stepPage}>
            <div style={cs.eyebrow}>Step 2 of 4</div>
            <h1 style={cs.heading}>Your <em style={{ fontStyle:'normal', color:'var(--gold)' }}>risk horizon</em></h1>
            <p style={cs.subtext}>Drag the slider or choose a preset. This shapes every recommendation you receive.</p>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:28, marginBottom:24 }}>
              <RiskSlider initialPct={50} onChange={(l) => setRiskLevel(l.key)} />
            </div>
            <Footer onNext={goNext} onBack={goBack} />
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div style={cs.stepPage}>
            <div style={cs.eyebrow}>Step 3 of 4</div>
            <h1 style={cs.heading}>Your <em style={{ fontStyle:'normal', color:'var(--gold)' }}>asset universe</em></h1>
            <p style={cs.subtext}>Select all asset classes you hold or plan to track.</p>
            <div style={cs.assetGrid}>
              {ASSET_CLASSES.map(a => {
                const sel = selectedAssets.has(a.name)
                return (
                  <div key={a.name}
                    style={{ ...cs.assetCard, ...(sel ? { borderColor:a.color, background:a.bg } : {}) }}
                    onClick={() => toggleSet(selectedAssets, setSelectedAssets, a.name)}>
                    <div style={{ ...cs.assetCheck, ...(sel ? { background:a.color, borderColor:a.color, color:'#fff' } : {}) }}>✓</div>
                    <div style={{ fontSize:'1.8rem', marginBottom:10 }}>{a.icon}</div>
                    <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.88rem', marginBottom:4 }}>{a.name}</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--text-dim)', lineHeight:1.5 }}>{a.desc}</div>
                  </div>
                )
              })}
            </div>
            <Footer onNext={goNext} onBack={goBack} />
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div style={cs.stepPage}>
            <div style={cs.eyebrow}>Step 4 of 4</div>
            <h1 style={cs.heading}>Define your <em style={{ fontStyle:'normal', color:'var(--gold)' }}>goals</em></h1>
            <p style={cs.subtext}>What are you ultimately building toward?</p>

            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.67rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:14 }}>
              Primary Goals
            </div>
            <div style={cs.goalGrid}>
              {GOALS.map(g => {
                const sel = selectedGoals.has(g.title)
                return (
                  <div key={g.title}
                    style={{ ...cs.goalCard, ...(sel ? cs.goalCardActive : {}) }}
                    onClick={() => toggleSet(selectedGoals, setSelectedGoals, g.title)}>
                    <div style={{ ...cs.goalIcon, ...(sel ? { background:'rgba(45,212,191,0.15)' } : {}) }}>{g.icon}</div>
                    <div>
                      <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.88rem', marginBottom:3 }}>{g.title}</div>
                      <div style={{ fontSize:'0.76rem', color:'var(--text-dim)', lineHeight:1.5 }}>{g.desc}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.67rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:12 }}>
              Investment Horizon
            </div>
            <div style={cs.horizonRow}>
              {HORIZONS.map(h => (
                <div key={h.num}
                  style={{ ...cs.horizonBtn, ...(horizon === h.num ? cs.horizonActive : {}) }}
                  onClick={() => setHorizon(h.num)}>
                  <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.2rem', display:'block', marginBottom:2, color: horizon === h.num ? 'var(--teal)' : 'var(--text)' }}>{h.num}</span>
                  {h.label}
                </div>
              ))}
            </div>

            <Footer onNext={goNext} onBack={goBack} isLast />
          </div>
        )}
      </main>
    </div>
  )
}

function Footer({ onNext, onBack, showBack = true, isLast = false }) {
  return (
    <div style={{ display:'flex', justifyContent: showBack ? 'space-between' : 'flex-end', marginTop:36, paddingTop:24, borderTop:'1px solid var(--border)' }}>
      {showBack && (
        <button style={cs.btnBack} onClick={onBack}>← Back</button>
      )}
      <button
        style={{ ...cs.btnNext, ...(isLast ? { background:'linear-gradient(135deg,var(--green),#059669)', boxShadow:'0 4px 20px rgba(52,211,153,0.3)' } : {}) }}
        onClick={onNext}
      >
        {isLast ? 'Launch Dashboard ✦' : 'Continue →'}
      </button>
    </div>
  )
}

const cs = {
  progressBar: { position:'fixed', top:0, left:0, right:0, height:3, background:'var(--surface2)', zIndex:100 },
  progressFill: { height:'100%', background:'linear-gradient(90deg, var(--teal), var(--gold))', boxShadow:'0 0 8px rgba(45,212,191,0.5)', transition:'width 0.5s cubic-bezier(0.4,0,0.2,1)' },
  bgGrid: {
    position:'fixed', inset:0, pointerEvents:'none', zIndex:0,
    backgroundImage:'linear-gradient(rgba(45,212,191,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.03) 1px, transparent 1px)',
    backgroundSize:'60px 60px',
  },
  leftPanel: {
    background:'var(--surface)', borderRight:'1px solid var(--border)',
    padding:'48px 36px', display:'flex', flexDirection:'column',
    position:'sticky', top:0, height:'100vh', overflow:'hidden', zIndex:1,
  },
  logo: {
    fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.2rem',
    background:'linear-gradient(135deg, var(--gold-light), var(--gold))',
    WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
    display:'flex', alignItems:'center', gap:10, marginBottom:48,
  },
  logoDot: {
    width:24, height:24, borderRadius:'50%',
    background:'linear-gradient(135deg, var(--gold), var(--teal))',
    flexShrink:0, boxShadow:'0 0 14px rgba(201,168,76,0.4)',
  },
  stepItem: { display:'flex', alignItems:'flex-start', gap:14, marginBottom:8, cursor:'pointer', padding:'8px 4px', borderRadius:10 },
  stepActive: {},
  stepInactive: { opacity:0.35 },
  stepBullet: {
    width:34, height:34, borderRadius:'50%',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:'var(--font-mono)', fontSize:'0.78rem',
    border:'1.5px solid var(--border)', background:'var(--surface2)',
    color:'var(--text-faint)', flexShrink:0, marginTop:2,
  },
  bulletActive: { background:'linear-gradient(135deg, var(--gold), #b8922e)', borderColor:'transparent', color:'#080c14', fontWeight:700, boxShadow:'0 4px 14px rgba(201,168,76,0.4)' },
  bulletDone:   { background:'rgba(52,211,153,0.12)', borderColor:'var(--green)', color:'var(--green)' },
  stepTitle: { fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.88rem', marginBottom:2 },
  stepDesc:  { fontSize:'0.76rem', color:'var(--text-dim)', lineHeight:1.5 },
  connector: { width:1.5, height:20, background:'var(--border)', margin:'-4px 0 -4px 17px' },
  leftFooter: { paddingTop:20, borderTop:'1px solid var(--border)', fontSize:'0.77rem', color:'var(--text-faint)' },
  rightPanel: { padding:'64px 64px', display:'flex', flexDirection:'column', justifyContent:'center', minHeight:'100vh', overflowY:'auto', zIndex:1, position:'relative' },
  stepPage: { animation:'fadeInRight 0.4s ease', maxWidth:600 },
  eyebrow: { fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--teal)', textTransform:'uppercase', letterSpacing:'0.18em', marginBottom:10 },
  heading: { fontFamily:'var(--font-display)', fontSize:'clamp(1.8rem,2.5vw,2.5rem)', fontWeight:800, lineHeight:1.1, marginBottom:8 },
  subtext: { color:'var(--text-dim)', fontSize:'0.9rem', lineHeight:1.7, marginBottom:32, maxWidth:460 },
  formGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:28 },
  formLabel: { fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:6 },
  formInput: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:10, padding:'11px 14px', color:'var(--text)',
    fontSize:'0.9rem', outline:'none', width:'100%',
    transition:'border-color 0.2s',
  },
  ageGrid: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:28, marginTop:10 },
  ageCard: {
    background:'var(--surface)', border:'1.5px solid var(--border)',
    borderRadius:12, padding:'14px 10px', textAlign:'center', cursor:'pointer', transition:'all 0.2s',
  },
  ageCardActive: { borderColor:'var(--gold)', background:'rgba(201,168,76,0.08)' },
  assetGrid: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:28 },
  assetCard: {
    background:'var(--surface)', border:'1.5px solid var(--border)',
    borderRadius:16, padding:'18px 16px', cursor:'pointer',
    transition:'all 0.25s', position:'relative',
  },
  assetCheck: {
    position:'absolute', top:12, right:12, width:20, height:20,
    borderRadius:'50%', background:'var(--surface2)', border:'1.5px solid var(--border)',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:'0.65rem', color:'transparent', transition:'all 0.2s',
  },
  goalGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:24 },
  goalCard: {
    background:'var(--surface)', border:'1.5px solid var(--border)',
    borderRadius:16, padding:'18px 16px', cursor:'pointer',
    transition:'all 0.25s', display:'flex', alignItems:'flex-start', gap:12,
  },
  goalCardActive: { borderColor:'var(--teal)', background:'rgba(45,212,191,0.05)' },
  goalIcon: {
    width:40, height:40, borderRadius:10,
    background:'var(--surface2)', display:'flex', alignItems:'center',
    justifyContent:'center', fontSize:'1.2rem', flexShrink:0, transition:'background 0.2s',
  },
  horizonRow: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 },
  horizonBtn: {
    background:'var(--surface)', border:'1.5px solid var(--border)',
    borderRadius:10, padding:'14px 8px', textAlign:'center', cursor:'pointer',
    transition:'all 0.2s', fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-dim)',
  },
  horizonActive: { borderColor:'var(--teal)', color:'var(--teal)', background:'rgba(45,212,191,0.07)' },
  btnBack: {
    background:'transparent', border:'1px solid var(--border)',
    color:'var(--text-dim)', padding:'11px 22px', borderRadius:10,
    fontFamily:'var(--font-display)', fontSize:'0.87rem', fontWeight:600,
  },
  btnNext: {
    background:'linear-gradient(135deg, var(--gold), #b8922e)',
    border:'none', color:'#080c14',
    padding:'12px 32px', borderRadius:10,
    fontFamily:'var(--font-display)', fontSize:'0.88rem', fontWeight:700,
    boxShadow:'0 4px 20px rgba(201,168,76,0.3)', cursor:'pointer',
  },
  completeRing: {
    width:110, height:110, borderRadius:'50%',
    background:'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(45,212,191,0.1))',
    border:'2px solid rgba(52,211,153,0.4)',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:'2.8rem', margin:'0 auto 28px',
    boxShadow:'0 0 40px rgba(52,211,153,0.2)',
    animation:'pulseScale 2s ease-in-out infinite',
  },
  pill: {
    background:'var(--surface)', border:'1px solid var(--border)',
    borderRadius:24, padding:'7px 16px',
    fontFamily:'var(--font-mono)', fontSize:'0.73rem', color:'var(--text-dim)',
  },
  btnLaunch: {
    background:'linear-gradient(135deg, var(--gold), #b8922e)',
    border:'none', color:'#080c14',
    padding:'15px 44px', borderRadius:12,
    fontFamily:'var(--font-display)', fontSize:'0.98rem', fontWeight:700,
    boxShadow:'0 6px 28px rgba(201,168,76,0.4)', cursor:'pointer',
  },
}
