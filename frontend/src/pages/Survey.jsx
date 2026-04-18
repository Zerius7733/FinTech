import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import OtpCodeInput from '../components/OtpCodeInput.jsx'
import RiskSlider from '../components/RiskSlider.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { API_BASE as API } from '../utils/api.js'
import { buildOtpDeliveryMessage, buildOtpInputPrompt } from '../utils/authOtp.js'

// ─── CONFIG ──────────────────────────────────────────────────────────────────

// Paste your OpenAI API key here. In production, proxy this through your backend.
const OPENAI_API_KEY = ''   // ← e.g. 'sk-...'

// ─── GPT-4o Vision call ───────────────────────────────────────────────────────
async function extractPortfolioFromImage(base64Image, mimeType) {
  if (!OPENAI_API_KEY) throw new Error('NO_KEY')

  const prompt = `You are a financial data extraction assistant.
The user has uploaded a screenshot or photo of their investment portfolio.
Extract every holding and return ONLY a valid JSON array. No prose, no markdown.

Each item:
{
  "ticker":  string,   // symbol e.g. "AAPL","BTC". Use "UNKNOWN" if unreadable
  "name":    string,   // full name e.g. "Apple Inc."
  "shares":  number,   // quantity held. 0 if not visible
  "price":   number,   // price per unit USD. 0 if not visible
  "change":  number,   // daily % change as number e.g. 2.14. 0 if not visible
  "dir":     "up"|"dn",
  "type":    "equity"|"crypto"|"etf"|"bond"|"commodity"|"reit"|"unknown"
}
Return ONLY the raw JSON array.`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2000,
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' } },
      ]}],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `OpenAI HTTP ${res.status}`)
  }

  const data  = await res.json()
  const text  = data.choices?.[0]?.message?.content?.trim() ?? '[]'
  const clean = text.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```$/,'').trim()
  try {
    const parsed = JSON.parse(clean)
    if (!Array.isArray(parsed)) throw new Error('Not an array')
    return parsed
  } catch { throw new Error('Could not parse GPT response. Please try again.') }
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload  = () => res(r.result.split(',')[1])
    r.onerror = () => rej(new Error('Failed to read file'))
    r.readAsDataURL(file)
  })
}

const STEPS = [
  { title:'Your Profile',      desc:'Name, age, and account setup.' },
  { title:'Risk Tolerance',    desc:'Set your comfort with volatility.' },
  { title:'Asset Preferences', desc:'Which asset classes do you hold?' },
  { title:'Financial Goals',   desc:'Define what you\'re building toward.' },
  { title:'Import Portfolio',  desc:'Upload a screenshot to auto-extract holdings.' },
]

const ASSET_CLASSES = [
  { icon:'📈', name:'Equities',      desc:'Stocks, ETFs, and equity funds.',              color:'#60a5fa', bg:'rgba(96,165,250,0.08)'  },
  { icon:'🏛️', name:'Fixed Income',  desc:'Government & corporate bonds.',                color:'#a78bfa', bg:'rgba(167,139,250,0.08)' },
  { icon:'🏠', name:'Real Estate',   desc:'Direct property and REITs.',                   color:'#c9a84c', bg:'rgba(201,168,76,0.08)'  },
  { icon:'₿',  name:'Digital Assets',desc:'Crypto, DeFi, and tokenised assets.',          color:'#2dd4bf', bg:'rgba(45,212,191,0.08)'  },
  { icon:'🪙', name:'Commodities',   desc:'Gold, silver, oil, and resources.',            color:'#fbbf24', bg:'rgba(251,191,36,0.08)'  },
  { icon:'🔐', name:'Private Assets',desc:'PE, venture, hedge funds.',                    color:'#f87171', bg:'rgba(248,113,113,0.08)' },
]
const GOALS = [
  { icon:'🌱', title:'Wealth Growth',        desc:'Compound and grow wealth aggressively.' },
  { icon:'🏖️', title:'Retirement Planning',  desc:'Build a nest egg for financial independence.' },
  { icon:'💰', title:'Passive Income',       desc:'Generate regular cash flow from yields.' },
  { icon:'🏠', title:'Property Purchase',    desc:'Save and invest toward buying real estate.' },
  { icon:'🛡️', title:'Capital Preservation', desc:'Protect wealth against inflation and loss.' },
  { icon:'🎓', title:'Education / Legacy',   desc:'Fund education or create a legacy.' },
]
const HORIZONS = [{ num:'1–2', label:'Short Term' },{ num:'3–5', label:'Medium Term' },{ num:'5–10', label:'Long Term' },{ num:'10+', label:'Generational' }]

const TYPE_COLOR = { equity:'#60a5fa', crypto:'#2dd4bf', etf:'#a78bfa', bond:'#f0abfc', commodity:'#fbbf24', reit:'#c9a84c', unknown:'#94a3b8' }
const EMPTY_HOLDING = { ticker:'', name:'', shares:0, price:0, change:0, dir:'up', type:'equity' }

function normalizeHoldingType(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'unknown'
  if (raw === 'stocks') return 'equity'
  if (raw === 'cryptos') return 'crypto'
  if (raw === 'commodities') return 'commodity'
  if (raw === 'stock') return 'equity'
  if (raw === 'fixed_income') return 'bond'
  if (raw === 'real_estate') return 'reit'
  if (['equity', 'crypto', 'etf', 'bond', 'commodity', 'reit', 'unknown'].includes(raw)) return raw
  return 'unknown'
}

function toBackendAssetClass(assetClassOrType, symbol = '') {
  const raw = String(assetClassOrType || '').trim().toLowerCase()
  if (['stock', 'stocks', 'equity', 'equities', 'etf', 'bond', 'reit'].includes(raw)) return 'stocks'
  if (['crypto', 'cryptos', 'digital_asset', 'digital_assets'].includes(raw)) return 'cryptos'
  if (['commodity', 'commodities'].includes(raw)) return 'commodities'
  const upperSymbol = String(symbol || '').toUpperCase()
  if (upperSymbol.endsWith('-USD')) return 'cryptos'
  if (upperSymbol.endsWith('=F')) return 'commodities'
  return 'stocks'
}

function normalizeParsedHolding(raw) {
  if (!raw || typeof raw !== 'object') return null
  const backendClass = toBackendAssetClass(raw.asset_class ?? raw.type, raw.symbol ?? raw.ticker)
  const type = normalizeHoldingType(raw.type ?? raw.asset_class)
  const shares = Number(raw.shares ?? raw.qty ?? raw.quantity ?? 0) || 0
  const price = Number(raw.price ?? raw.current_price ?? raw.avg_price ?? 0) || 0
  const change = Number(raw.change ?? raw.change_pct ?? raw.price_change_pct ?? 0) || 0
  const dir = String(raw.dir || '').toLowerCase() === 'dn' ? 'dn' : (change < 0 ? 'dn' : 'up')
  return {
    ...EMPTY_HOLDING,
    ticker: String(raw.ticker ?? raw.symbol ?? '').trim(),
    symbol: String(raw.symbol ?? raw.ticker ?? '').trim(),
    name: String(raw.name ?? raw.asset_name ?? raw.ticker ?? raw.symbol ?? '').trim(),
    shares,
    qty: shares,
    price,
    avg_price: Number(raw.avg_price ?? raw.price ?? 0) || 0,
    current_price: Number(raw.current_price ?? raw.price ?? 0) || 0,
    market_value: Number(raw.market_value ?? (shares * price) ?? 0) || 0,
    change,
    dir,
    type,
    asset_class: backendClass,
  }
}

// ─── EDITABLE ROW ─────────────────────────────────────────────────────────────
function HoldingRow({ holding, index, onChange, onDelete }) {
  const [focused, setFocused] = useState(false)
  const col = TYPE_COLOR[holding.type] ?? '#94a3b8'
  const field = (key, type='text') => (
    <input type={type} value={holding[key] ?? ''} onChange={e => onChange(index, key, type==='number' ? parseFloat(e.target.value)||0 : e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={es.cell} />
  )
  return (
    <div style={{ ...es.row, background: focused ? 'rgba(255,255,255,0.04)' : 'transparent' }}>
      <div style={{ width:3, background:col, borderRadius:2, flexShrink:0, alignSelf:'stretch' }} />
      <div style={{ flex:1, display:'grid', gridTemplateColumns:'80px 1fr 90px 90px 80px 100px 36px', gap:8, alignItems:'center', padding:'8px 12px' }}>
        {field('ticker')}
        {field('name')}
        {field('shares','number')}
        {field('price','number')}
        <div onClick={() => onChange(index,'dir',holding.dir==='up'?'dn':'up')}
          style={{ ...es.cell, textAlign:'center', cursor:'pointer', background: holding.dir==='up' ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)', color: holding.dir==='up' ? 'var(--green)' : 'var(--red)', fontWeight:700 }}>
          {holding.dir==='up' ? '▲ up' : '▼ dn'}
        </div>
        <select value={holding.type ?? 'unknown'} onChange={e => onChange(index,'type',e.target.value)}
          style={{ ...es.cell, padding:'6px 8px', background:'var(--surface2)' }}>
          {Object.keys(TYPE_COLOR).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => onDelete(index)} style={es.deleteBtn} title="Remove">✕</button>
      </div>
    </div>
  )
}

const es = {
  row:       { display:'flex', alignItems:'stretch', borderBottom:'1px solid rgba(255,255,255,0.05)', transition:'background 0.15s' },
  cell:      { background:'var(--surface2)', border:'1px solid var(--border-act)', borderRadius:8, padding:'6px 8px', color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:'0.76rem', outline:'none', width:'100%' },
  deleteBtn: { background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.24)', borderRadius:8, color:'var(--red)', cursor:'pointer', fontFamily:'var(--font-mono)', fontSize:'0.8rem', padding:'4px 8px' },
}

// ─── STEP 5 COMPONENT ─────────────────────────────────────────────────────────
function PortfolioImportStep({ onBack, onComplete }) {
  const { user } = useAuth();
  const [phase,    setPhase]    = useState('upload')
  const [preview,  setPreview]  = useState(null)
  const [fileData, setFileData] = useState(null)
  const [holdings, setHoldings] = useState([])
  const [importId, setImportId] = useState('')
  const [error,    setError]    = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  const handleFile = async (file) => {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file (PNG, JPG, WEBP).'); return }
    setError(null)
    setImportId('')
    setPreview(URL.createObjectURL(file))
    setFileData({ base64: await fileToBase64(file), mimeType: file.type })
  }

  const onDrop = useCallback(e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }, [])

  // Parse image using backend endpoint
  const parse = async () => {
    if (!fileData) return setError('No file selected');
    setPhase('parsing'); setError(null);
    try {
      const parseUrl = user?.user_id
        ? `${API}/users/${user.user_id}/imports/screenshot/parse`
        : `${API}/imports/screenshot/parse`
      const res = await fetch(parseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: fileData.base64,
          model: 'gpt-4o',
          page_text: null,
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `Parse failed: ${res.status}`)
      }
      const data = await res.json();
      const parsedHoldings = data?.parsed?.holdings
      if (!Array.isArray(parsedHoldings)) throw new Error('No holdings found');
      const normalizedHoldings = parsedHoldings
        .map(normalizeParsedHolding)
        .filter(Boolean)
      setImportId(data?.import_id || '')
      setHoldings(normalizedHoldings);
      setPhase('review');
    } catch (e) {
      setError(e.message || 'Parse error');
      setPhase('upload');
    }
  }

  // Confirm holdings using backend endpoint
  const confirm = async () => {
    if (!user?.user_id) {
      onComplete(holdings)
      return
    }
    if (!importId) return setError('Missing import id. Please parse the screenshot again.');
    setError(null);
    try {
      const res = await fetch(`${API}/users/${user.user_id}/imports/screenshot/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          import_id: importId,
          holdings,
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `Confirm failed: ${res.status}`)
      }
      onComplete(holdings);
    } catch (e) {
      setError(e.message || 'Confirm error');
    }
  }

  // ── Upload ──────────────────────────────────────────────
  const updateHolding = (index, key, value) => {
    setHoldings(prev => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)))
  }

  const deleteHolding = (index) => {
    setHoldings(prev => prev.filter((_, i) => i !== index))
  }

  const addHolding = () => {
    setHoldings(prev => [...prev, { ...EMPTY_HOLDING }])
  }
  if (phase === 'upload') return (
    <div style={cs.stepPage}>
      <div style={cs.eyebrow}>Step 5 of 5 · Optional</div>
      <h1 style={cs.heading}>Import your <em style={{ fontStyle:'normal', color:'var(--teal)' }}>portfolio</em></h1>
      <p style={cs.subtext}>Upload a screenshot from your brokerage, bank, or crypto exchange. GPT-4o Vision will read your holdings automatically.</p>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{ ...imp.dropzone, borderColor: dragging ? 'var(--teal)' : preview ? 'rgba(45,212,191,0.4)' : 'var(--border)', background: dragging ? 'rgba(45,212,191,0.06)' : preview ? 'rgba(45,212,191,0.03)' : 'var(--surface)' }}
      >
        <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        {preview ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
            <img src={preview} alt="Preview" style={{ maxHeight:220, maxWidth:'100%', borderRadius:12, border:'1px solid var(--border)', boxShadow:'0 8px 32px rgba(0,0,0,0.4)' }} />
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--teal)' }}>✓ Image loaded — click to replace</span>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
            <div style={imp.uploadIcon}>📸</div>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1rem' }}>{dragging ? 'Drop it here' : 'Drag & drop or click to upload'}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-faint)' }}>PNG · JPG · WEBP</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
              {['Brokerage app','Bank statement','Crypto exchange','Spreadsheet'].map(t => (
                <span key={t} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:20, padding:'4px 12px', fontFamily:'var(--font-mono)', fontSize:'0.67rem', color:'var(--text-faint)' }}>{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={imp.tipBox}>
        <span style={{ fontSize:'1rem' }}>💡</span>
        <div style={{ fontSize:'0.77rem', color:'var(--text-dim)', lineHeight:1.6 }}>
          <strong style={{ color:'var(--text)', display:'block', marginBottom:2 }}>Better results tip</strong>
          Screenshots with visible ticker symbols, quantities, and prices give the most accurate extractions.
        </div>
      </div>

      {error && <div style={imp.errorBox}>{error}</div>}

      <div style={{ display:'flex', justifyContent:'space-between', marginTop:32, paddingTop:24, borderTop:'1px solid var(--border)' }}>
        <button style={cs.btnBack} onClick={onBack}>← Back</button>
        <div style={{ display:'flex', gap:12 }}>
          <button style={{ ...cs.btnBack, color:'var(--text-faint)' }} onClick={() => onComplete([])}>Skip for now</button>
          <button style={{ ...cs.btnNext, opacity: preview ? 1 : 0.4, cursor: preview ? 'pointer' : 'not-allowed' }} onClick={() => preview && parse()}>
            Extract Holdings →
          </button>
        </div>
      </div>
    </div>
  )

  // ── Parsing ─────────────────────────────────────────────
  if (phase === 'parsing') return (
    <div style={{ ...cs.stepPage, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:400, gap:28 }}>
      <div style={imp.spinner} />
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1.2rem', marginBottom:8 }}>Reading your portfolio…</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.76rem', color:'var(--text-faint)' }}>GPT-4o Vision is scanning for tickers, quantities and prices</div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10, width:300 }}>
        {['Uploading image to GPT-4o…','Detecting portfolio table…','Extracting holdings data…','Structuring JSON output…'].map((t,i) => (
          <div key={t} style={{ display:'flex', alignItems:'center', gap:10, animation:`fadeUp 0.4s ease ${i*0.3}s both` }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--teal)', animation:`pulse 1.2s ease-in-out ${i*0.3}s infinite` }} />
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-dim)' }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Review ──────────────────────────────────────────────
  if (phase === 'review') return (
    <div style={{ ...cs.stepPage, maxWidth:'100%' }}>
      <div style={cs.eyebrow}>Step 5 of 5 · Review & Edit</div>
      <h1 style={{ ...cs.heading, fontSize:'clamp(1.4rem,2vw,2rem)' }}>
        <em style={{ fontStyle:'normal', color:'var(--green)' }}>{holdings.length}</em> holdings extracted
      </h1>
      <p style={{ ...cs.subtext, marginBottom:16 }}>Click any cell to edit, toggle ▲/▼ direction, or add/remove rows before confirming.</p>

      {preview && (
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18, padding:'10px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
          <img src={preview} alt="" style={{ width:52, height:40, objectFit:'cover', borderRadius:6, border:'1px solid var(--border)' }} />
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--teal)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Source image</div>
            <div style={{ fontSize:'0.8rem', color:'var(--text-dim)' }}>GPT-4o extraction · {holdings.length} items found</div>
          </div>
          <button onClick={() => { setPhase('upload'); setHoldings([]) }} style={{ ...cs.btnBack, marginLeft:'auto', padding:'6px 14px', fontSize:'0.76rem' }}>Re-upload</button>
        </div>
      )}

      {/* Column headers */}
      <div style={{ display:'grid', gridTemplateColumns:'3px 1fr', marginBottom:4 }}>
        <div />
        <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 90px 90px 80px 100px 36px', gap:8, padding:'0 12px', fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.1em' }}>
          <span>Ticker</span><span>Name</span><span>Shares</span><span>Price $</span><span>Dir</span><span>Type</span><span />
        </div>
      </div>

      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', maxHeight:360, overflowY:'auto', marginBottom:14 }}>
        {holdings.length === 0
          ? <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--text-faint)', fontFamily:'var(--font-mono)', fontSize:'0.8rem' }}>No holdings — add rows below</div>
          : holdings.map((h,i) => <HoldingRow key={i} holding={h} index={i} onChange={updateHolding} onDelete={deleteHolding} />)
        }
      </div>

      <button onClick={addHolding} style={imp.addRowBtn}>+ Add holding manually</button>

      {/* Summary strip */}
      <div style={{ display:'flex', gap:0, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', marginBottom:16 }}>
        {[
          { label:'Holdings',  val: holdings.length },
          { label:'Equities',  val: holdings.filter(h => ['equity','etf'].includes(h.type)).length },
          { label:'Crypto',    val: holdings.filter(h => h.type==='crypto').length },
          { label:'Other',     val: holdings.filter(h => !['equity','etf','crypto'].includes(h.type)).length },
          { label:'Est. value',val: '$' + holdings.reduce((s,h) => s+(h.shares||0)*(h.price||0),0).toLocaleString('en-US',{maximumFractionDigits:0}) },
        ].map(({ label, val }) => (
          <div key={label} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'12px 8px', borderRight:'1px solid var(--border)' }}>
            <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1rem', color:'var(--gold)' }}>{val}</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.1em' }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', paddingTop:24, borderTop:'1px solid var(--border)' }}>
        <button style={cs.btnBack} onClick={() => setPhase('upload')}>← Re-upload</button>
        <div style={{ display:'flex', gap:12 }}>
          <button style={{ ...cs.btnBack, color:'var(--text-faint)' }} onClick={() => onComplete([])}>Skip import</button>
          <button style={cs.btnNext} onClick={confirm}>
            Confirm & Launch ✦
          </button>
        </div>
      </div>
    </div>
  )

  return null
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function Survey() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)
  const [importedHoldings, setImportedHoldings] = useState([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState('Singapore')
  const [age,            setAge]            = useState('')
  const [selectedAssets, setSelectedAssets] = useState(new Set(['Equities','Fixed Income']))
  const [selectedGoals,  setSelectedGoals]  = useState(new Set(['Wealth Growth']))
  const [horizon,        setHorizon]        = useState('3–5')
  const [riskLevel,      setRiskLevel]      = useState(50)
  const [submitErr, setSubmitErr] = useState('')
  const [isValidatingProfileStep, setIsValidatingProfileStep] = useState(false)
  const [registrationOtp, setRegistrationOtp] = useState('')
  const [registrationPending, setRegistrationPending] = useState(null)
  const [isFinalizingSetup, setIsFinalizingSetup] = useState(false)

  const goNext = () => step < 5 ? setStep(s => s+1) : null
  const goBack = () => setStep(s => s-1)
  const progress = done ? 100 : (step/5)*100
  const toggleSet = (set, setter, val) => setter(prev => { const n=new Set(prev); n.has(val)?n.delete(val):n.add(val); return n })
  const goNextFromProfile = async () => {
    if (!firstName.trim() || !username.trim() || !email.trim() || !password.trim()) {
      setSubmitErr('First name, username, email, and password are required.')
      return
    }
    const parsedAge = Number(age)
    if (!Number.isFinite(parsedAge) || parsedAge < 18 || parsedAge > 100) {
      setSubmitErr('Please enter a valid age between 18 and 100.')
      return
    }
    setIsValidatingProfileStep(true)
    try {
      const normalizedUsername = username.trim()
      const normalizedEmail = email.trim()
      const normalizedPassword = password.trim()
      const res = await fetch(`${API}/auth/register/precheck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: normalizedUsername,
          email: normalizedEmail,
          password: normalizedPassword,
          user_id: user?.user_id || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `validation failed (${res.status})`)
      }
      const data = await res.json().catch(() => ({}))
      const verifiedEmail = data?.email || normalizedEmail
      if (data?.email) setEmail(data.email)

      if (!user?.user_id) {
        if (!registrationPending) {
          const registerRes = await fetch(`${API}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: normalizedUsername,
              password: normalizedPassword,
              email: verifiedEmail,
            }),
          })
          const registerData = await registerRes.json().catch(() => ({}))
          if (!registerRes.ok) {
            throw new Error(registerData?.detail || `register failed (${registerRes.status})`)
          }
          setRegistrationPending(registerData)
          setRegistrationOtp('')
          setSubmitErr(buildOtpDeliveryMessage(registerData, verifiedEmail))
          return
        }

        if (!registrationOtp.trim()) {
          throw new Error(buildOtpInputPrompt(registrationPending))
        }

        const verifyRes = await fetch(`${API}/auth/register/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: verifiedEmail,
            otp_code: registrationOtp.trim(),
          }),
        })
        const verifyData = await verifyRes.json().catch(() => ({}))
        if (!verifyRes.ok) {
          throw new Error(verifyData?.detail || `verification failed (${verifyRes.status})`)
        }
        const authUser = {
          user_id: verifyData?.user_id || verifyData?.data?.user_id,
          username: verifyData?.username || normalizedUsername,
          created_at: verifyData?.created_at || null,
        }
        if (!authUser.user_id) throw new Error('verification did not return user_id')
        login(authUser)
        setRegistrationPending(null)
        setRegistrationOtp('')
      }

      setSubmitErr('')
      goNext()
    } catch (err) {
      setSubmitErr(err?.message || 'Unable to validate your details right now.')
    } finally {
      setIsValidatingProfileStep(false)
    }
  }

  const handleImportComplete = (holdings) => { setImportedHoldings(holdings); setDone(true) }

  const finalizeOnboarding = async (activeUser) => {
    const finalUsername = (username || '').trim()
    const finalAge = Number(age)

    if (!Number.isFinite(finalAge) || finalAge < 18 || finalAge > 100) {
      throw new Error('Please enter a valid age between 18 and 100.')
    }

    const profileRes = await fetch(`${API}/users/survey/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: activeUser.user_id,
        first_name: firstName,
        last_name: lastName,
        username: finalUsername,
        email,
        country,
        age: finalAge,
      }),
    })
    if (!profileRes.ok) {
      const profileErr = await profileRes.json().catch(() => ({}))
      throw new Error(profileErr?.detail || `profile update failed (${profileRes.status})`)
    }

    const riskRes = await fetch(`${API}/users/risk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: activeUser.user_id, risk_profile: Number(riskLevel ?? 50) }),
    })
    if (!riskRes.ok) {
      const riskErr = await riskRes.json().catch(() => ({}))
      throw new Error(riskErr?.detail || `risk update failed (${riskRes.status})`)
    }

    if (importedHoldings.length > 0) {
      const normalizedHoldings = importedHoldings.map((h) => ({
        asset_class: toBackendAssetClass(h.asset_class || h.type, h.symbol || h.ticker),
        symbol: h.symbol || h.ticker || '',
        qty: Number(h.qty ?? h.shares ?? 0),
        avg_price: Number(h.avg_price ?? h.price ?? 0),
        current_price: Number(h.current_price ?? h.price ?? 0),
        market_value: Number(h.market_value ?? ((Number(h.qty ?? h.shares ?? 0) || 0) * (Number(h.current_price ?? h.price ?? 0) || 0))),
        name: h.name || h.ticker || h.symbol || '',
        confidence: h.confidence == null ? undefined : Number(h.confidence),
      })).filter((h) => h.symbol && h.asset_class)

      if (normalizedHoldings.length > 0) {
        const mergeRes = await fetch(`${API}/users/${activeUser.user_id}/imports/screenshot/merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ holdings: normalizedHoldings }),
        })
        if (!mergeRes.ok) {
          const mergeErr = await mergeRes.json().catch(() => ({}))
          throw new Error(mergeErr?.detail || `holdings merge failed (${mergeRes.status})`)
        }
      }
    }
  }

  const handleLaunch = async () => {
    setSubmitErr('')
    setIsFinalizingSetup(true)
    try {
      const activeUser = user
      if (!activeUser?.user_id) throw new Error('Verify your email in step 1 before continuing.')
      await finalizeOnboarding(activeUser)
      navigate('/')
    } catch (err) {
      setSubmitErr(err?.message || 'Failed to complete setup. Please try again.')
    } finally {
      setIsFinalizingSetup(false)
    }
  }

  const handleResendRegistrationOtp = async () => {
    setSubmitErr('')
    setIsFinalizingSetup(true)
    try {
      const res = await fetch(`${API}/auth/register/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.detail || `resend failed (${res.status})`)
      }
      setRegistrationPending(data)
      setRegistrationOtp('')
      setSubmitErr(buildOtpDeliveryMessage(data, email.trim(), { resend: true }))
    } catch (err) {
      setSubmitErr(err?.message || 'Unable to resend the verification code.')
    } finally {
      setIsFinalizingSetup(false)
    }
  }

  if (done) return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', maxWidth:520, padding:40, animation:'fadeUp 0.5s ease' }}>
        <div style={cs.completeRing}>✦</div>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800, marginBottom:12 }}>
          You're all set, <span style={{ color:'var(--green)' }}>{firstName || user?.username || 'Investor'}</span>
        </h2>
        <p style={{ color:'var(--text-dim)', fontSize:'0.92rem', lineHeight:1.7, marginBottom:20 }}>Your Unova is calibrated. Your personalised globe awaits.</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginBottom:16 }}>
          {[['Age', age ? `${age}` : '-'],['Risk',`${riskLevel}/100`],['Assets',`${importedHoldings.length}`],['Horizon',`${horizon}yr`]].map(([k,v]) => (
            <div key={k} style={cs.pill}>{k}: <span style={{ color:'var(--gold)' }}>{v}</span></div>
          ))}
        </div>
        {importedHoldings.length > 0 && (
          <div style={{ background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.25)', borderRadius:14, padding:'14px 20px', marginBottom:24, display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:'1.2rem' }}>📂</span>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.88rem', color:'var(--green)', marginBottom:2 }}>{importedHoldings.length} holdings imported</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--text-faint)' }}>
                {importedHoldings.slice(0,4).map(h=>h.ticker).join(' · ')}{importedHoldings.length>4?` + ${importedHoldings.length-4} more`:''}
              </div>
            </div>
          </div>
        )}
        <button style={cs.btnLaunch} onClick={handleLaunch} disabled={isFinalizingSetup}>
          {isFinalizingSetup ? 'Please wait…' : 'Enter My Unova →'}
        </button>
        {submitErr && <div style={{ color:'var(--red)', fontFamily:'var(--font-mono)', fontSize:'0.74rem', margin:'12px 0 0' }}>{submitErr}</div>}
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'grid', gridTemplateColumns:'360px 1fr' }}>
      <div style={cs.progressBar}><div style={{ ...cs.progressFill, width:`${progress}%` }} /></div>
      <div style={cs.bgGrid} />

      <aside style={cs.leftPanel}>
        <div style={cs.logo}>
          <img src="/logo.png" alt="Logo" style={cs.logoImage} />
          <span style={cs.logoText}>Unova</span>
        </div>
        <nav style={{ flex:1 }}>
          {STEPS.map((s,i) => {
            const n=i+1, isActive=n===step, isDone=n<step, isAI=n===5
            return (
              <div key={n}>
                <div style={{ ...cs.stepItem, ...(isActive?cs.stepActive:{}), ...(isDone||isActive?{}:cs.stepInactive) }} onClick={() => isDone && setStep(n)}>
                  <div style={{ ...cs.stepBullet, ...(isActive?cs.bulletActive:{}), ...(isDone?cs.bulletDone:{}) }}>{isDone?'✓':n}</div>
                  <div>
                    <div style={cs.stepTitle}>
                      {s.title}
                      {isAI && <span style={{ marginLeft:6, fontFamily:'var(--font-mono)', fontSize:'0.6rem', background:'rgba(45,212,191,0.12)', border:'1px solid rgba(45,212,191,0.3)', borderRadius:8, padding:'1px 6px', color:'var(--teal)', verticalAlign:'middle' }}>AI</span>}
                    </div>
                    <div style={cs.stepDesc}>{s.desc}</div>
                  </div>
                </div>
                {n<5 && <div style={cs.connector} />}
              </div>
            )
          })}
        </nav>
        <div style={cs.leftFooter}>Already have an account?{' '}<span style={{ color:'var(--teal)', cursor:'pointer' }} onClick={() => navigate('/')}>Sign in →</span></div>
      </aside>

      <main style={cs.rightPanel}>

        {step===1 && (
          <div style={cs.stepPage}>
            <div style={cs.eyebrow}>Step 1 of 5</div>
            <h1 style={cs.heading}>Tell us about <em style={{ fontStyle:'normal', color:'var(--gold)' }}>yourself</em></h1>
            <p style={cs.subtext}>This helps us benchmark your portfolio against peers and tailor your wellness insights.</p>
            <div style={cs.formGrid}>
              <div>
                <label style={cs.formLabel}>First Name</label>
                <input style={cs.formInput} placeholder="Alex" value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div>
                <label style={cs.formLabel}>Last Name</label>
                <input style={cs.formInput} placeholder="Chen" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={cs.formLabel}>Email Address</label>
                <input style={cs.formInput} placeholder="alex@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <label style={cs.formLabel}>Username</label>
                <input style={cs.formInput} placeholder="alex123" value={username} onChange={e => setUsername(e.target.value)} />
              </div>
              <div>
                <label style={cs.formLabel}>Password</label>
                <input type="password" style={cs.formInput} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <div>
                <label style={cs.formLabel}>Country</label>
                <select style={cs.formInput} value={country} onChange={e => setCountry(e.target.value)}>
                  {['Singapore','United Kingdom','United States','Australia','Japan'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            {submitErr && <div style={{ color:'var(--red)', fontFamily:'var(--font-mono)', fontSize:'0.74rem', margin:'-8px 0 10px' }}>{submitErr}</div>}
            <div style={cs.formLabel}>Age</div>
            <input
              type="number"
              min="18"
              max="100"
              style={{ ...cs.formInput, maxWidth: 220 }}
              placeholder="30"
              value={age}
              onChange={e => setAge(e.target.value)}
            />
            {!user?.user_id && registrationPending && (
              <div style={cs.otpPanel}>
                <div style={cs.otpCopy}>
                  Enter the {registrationPending?.otp_length || 6}-digit code sent to {registrationPending?.email_masked || email.trim()}.
                </div>
                <div style={cs.otpRow}>
                  <OtpCodeInput
                    value={registrationOtp}
                    onChange={setRegistrationOtp}
                  />
                  <button type="button" style={cs.btnGhost} onClick={handleResendRegistrationOtp} disabled={isValidatingProfileStep}>
                    Resend code
                  </button>
                </div>
              </div>
            )}
            <Footer onNext={goNextFromProfile} showBack={false} nextLabel={isValidatingProfileStep ? 'Checking...' : registrationPending ? 'Verify email & continue' : 'Continue →'} disableNext={isValidatingProfileStep} />
          </div>
        )}

        {step===2 && (
          <div style={cs.stepPage}>
            <div style={cs.eyebrow}>Step 2 of 5</div>
            <h1 style={cs.heading}>Your <em style={{ fontStyle:'normal', color:'var(--gold)' }}>risk horizon</em></h1>
            <p style={cs.subtext}>Drag the slider or choose a preset. This shapes every recommendation you receive.</p>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:28, marginBottom:24 }}>
              <RiskSlider initialPct={50} onChange={(l) => setRiskLevel(Number(l.value ?? 50))} />
            </div>
            <Footer onNext={goNext} onBack={goBack} />
          </div>
        )}

        {step===3 && (
          <div style={cs.stepPage}>
            <div style={cs.eyebrow}>Step 3 of 5</div>
            <h1 style={cs.heading}>Your <em style={{ fontStyle:'normal', color:'var(--gold)' }}>asset universe</em></h1>
            <p style={cs.subtext}>Select all asset classes you hold or plan to track.</p>
            <div style={cs.assetGrid}>
              {ASSET_CLASSES.map(a => {
                const sel = selectedAssets.has(a.name)
                return (
                  <div key={a.name} style={{ ...cs.assetCard, ...(sel?{borderColor:a.color,background:a.bg}:{}) }} onClick={() => toggleSet(selectedAssets,setSelectedAssets,a.name)}>
                    <div style={{ ...cs.assetCheck, ...(sel?{background:a.color,borderColor:a.color,color:'#fff'}:{}) }}>✓</div>
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

        {step===4 && (
          <div style={cs.stepPage}>
            <div style={cs.eyebrow}>Step 4 of 5</div>
            <h1 style={cs.heading}>Define your <em style={{ fontStyle:'normal', color:'var(--gold)' }}>goals</em></h1>
            <p style={cs.subtext}>What are you ultimately building toward?</p>
            <div style={cs.goalGrid}>
              {GOALS.map(g => {
                const sel = selectedGoals.has(g.title)
                return (
                  <div key={g.title} style={{ ...cs.goalCard, ...(sel?cs.goalCardActive:{}) }} onClick={() => toggleSet(selectedGoals,setSelectedGoals,g.title)}>
                    <div style={{ ...cs.goalIcon, ...(sel?{background:'rgba(45,212,191,0.15)'}:{}) }}>{g.icon}</div>
                    <div>
                      <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.88rem', marginBottom:3 }}>{g.title}</div>
                      <div style={{ fontSize:'0.76rem', color:'var(--text-dim)', lineHeight:1.5 }}>{g.desc}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.67rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:14 }}>Primary Goals</div>
            <div style={cs.horizonRow}>
              {HORIZONS.map(h => (
                <div key={h.num} style={{ ...cs.horizonBtn, ...(horizon===h.num?cs.horizonActive:{}) }} onClick={() => setHorizon(h.num)}>
                  <span style={{ fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.2rem', display:'block', marginBottom:2, color:horizon===h.num?'var(--teal)':'var(--text)' }}>{h.num}</span>
                  {h.label}
                </div>
              ))}
            </div>
            <Footer onNext={goNext} onBack={goBack} />
          </div>
        )}

        {step===5 && <PortfolioImportStep onBack={goBack} onComplete={handleImportComplete} />}

      </main>
    </div>
  )
}

function Footer({ onNext, onBack, showBack=true, nextLabel='Continue →', disableNext=false }) {
  return (
    <div style={{ display:'flex', justifyContent:showBack?'space-between':'flex-end', marginTop:36, paddingTop:24, borderTop:'1px solid var(--border)' }}>
      {showBack && <button style={cs.btnBack} onClick={onBack}>← Back</button>}
      <button style={{ ...cs.btnNext, opacity: disableNext ? 0.7 : 1 }} onClick={onNext} disabled={disableNext}>{nextLabel}</button>
    </div>
  )
}

const cs = {
  progressBar:  { position:'fixed', top:0, left:0, right:0, height:3, background:'var(--surface2)', zIndex:100 },
  progressFill: { height:'100%', background:'linear-gradient(90deg,var(--teal),var(--gold))', boxShadow:'0 0 8px rgba(45,212,191,0.5)', transition:'width 0.5s cubic-bezier(0.4,0,0.2,1)' },
  bgGrid: { position:'fixed', inset:0, pointerEvents:'none', zIndex:0, backgroundImage:'linear-gradient(rgba(45,212,191,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(45,212,191,0.03) 1px,transparent 1px)', backgroundSize:'60px 60px' },
  leftPanel: { background:'var(--surface)', borderRight:'1px solid var(--border)', padding:'48px 36px', display:'flex', flexDirection:'column', position:'sticky', top:0, height:'100vh', overflow:'hidden', zIndex:1 },
  logo: { display:'flex', alignItems:'center', gap:10, justifyContent:'flex-start', marginBottom:48 },
  logoImage: { height:40, width:'auto', objectFit:'contain', background:'transparent' },
  logoText: { fontFamily:'var(--font-display)', fontWeight:900, fontSize:'1.2rem', background:'linear-gradient(135deg,var(--gold-light),var(--gold))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' },
  stepItem: { display:'flex', alignItems:'flex-start', gap:14, marginBottom:8, cursor:'pointer', padding:'8px 4px', borderRadius:10 },
  stepActive: {}, stepInactive: { opacity:0.35 },
  stepBullet: { width:34, height:34, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono)', fontSize:'0.78rem', border:'1.5px solid var(--border)', background:'var(--surface2)', color:'var(--text-faint)', flexShrink:0, marginTop:2 },
  bulletActive: { background:'var(--gold)', borderColor:'transparent', color:'var(--btn-text-on-gold)', fontWeight:700, boxShadow:'0 8px 18px rgba(17,24,39,0.18)' },
  bulletDone:   { background:'rgba(52,211,153,0.12)', borderColor:'var(--green)', color:'var(--green)' },
  stepTitle: { fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.88rem', marginBottom:2 },
  stepDesc:  { fontSize:'0.76rem', color:'var(--text-dim)', lineHeight:1.5 },
  connector: { width:1.5, height:20, background:'var(--border)', margin:'-4px 0 -4px 17px' },
  leftFooter: { paddingTop:20, borderTop:'1px solid var(--border)', fontSize:'0.77rem', color:'var(--text-faint)' },
  rightPanel: { padding:'64px 64px', display:'flex', flexDirection:'column', justifyContent:'center', minHeight:'100vh', overflowY:'auto', zIndex:1, position:'relative' },
  stepPage: { animation:'fadeInRight 0.4s ease', maxWidth:600 },
  eyebrow:  { fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--teal)', textTransform:'uppercase', letterSpacing:'0.18em', marginBottom:10 },
  heading:  { fontFamily:'var(--font-display)', fontSize:'clamp(1.8rem,2.5vw,2.5rem)', fontWeight:800, lineHeight:1.1, marginBottom:8 },
  subtext:  { color:'var(--text-dim)', fontSize:'0.9rem', lineHeight:1.7, marginBottom:32, maxWidth:460 },
  formGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:28 },
  formLabel:{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:6 },
  formInput:{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'11px 14px', color:'var(--text)', fontSize:'0.9rem', outline:'none', width:'100%' },
  otpPanel: { marginTop:18, marginBottom:10, padding:'14px 16px', borderRadius:14, border:'1px solid rgba(20,184,166,0.18)', background:'linear-gradient(180deg, rgba(20,184,166,0.06), rgba(32,201,151,0.04))' },
  otpCopy: { fontSize:'0.78rem', color:'var(--text-dim)', lineHeight:1.6, marginBottom:10 },
  otpRow: { display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center' },
  ageGrid:  { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:28, marginTop:10 },
  ageCard:  { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:12, padding:'14px 10px', textAlign:'center', cursor:'pointer', transition:'all 0.2s' },
  ageCardActive: { borderColor:'var(--gold)', background:'rgba(201,168,76,0.08)' },
  assetGrid:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:28 },
  assetCard:{ background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:16, padding:'18px 16px', cursor:'pointer', transition:'all 0.25s', position:'relative' },
  assetCheck:{ position:'absolute', top:12, right:12, width:20, height:20, borderRadius:'50%', background:'var(--surface2)', border:'1.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem', color:'transparent', transition:'all 0.2s' },
  goalGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:24 },
  goalCard: { background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:16, padding:'18px 16px', cursor:'pointer', transition:'all 0.25s', display:'flex', alignItems:'flex-start', gap:12 },
  goalCardActive: { borderColor:'var(--teal)', background:'rgba(45,212,191,0.05)' },
  goalIcon: { width:40, height:40, borderRadius:10, background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', flexShrink:0 },
  horizonRow:{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 },
  horizonBtn:{ background:'var(--surface)', border:'1.5px solid var(--border)', borderRadius:10, padding:'14px 8px', textAlign:'center', cursor:'pointer', transition:'all 0.2s', fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-dim)' },
  horizonActive: { borderColor:'var(--teal)', color:'var(--teal)', background:'rgba(45,212,191,0.07)' },
  btnBack:  { background:'var(--surface2)', border:'1px solid var(--border-act)', color:'var(--text)', padding:'11px 22px', borderRadius:10, fontFamily:'var(--font-display)', fontSize:'0.87rem', fontWeight:600, cursor:'pointer', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.04)' },
  btnNext:  { background:'var(--btn-primary-bg)', border:'1px solid color-mix(in srgb, var(--btn-primary-bg) 72%, white 10%)', color:'var(--btn-primary-text)', padding:'12px 32px', borderRadius:10, fontFamily:'var(--font-display)', fontSize:'0.88rem', fontWeight:700, boxShadow:'0 10px 24px rgba(17,24,39,0.16), inset 0 1px 0 rgba(255,255,255,0.12)', cursor:'pointer' },
  btnGhost: { background:'transparent', border:'1px solid var(--border-act)', color:'var(--gold)', padding:'10px 18px', borderRadius:10, fontFamily:'var(--font-display)', fontSize:'0.8rem', fontWeight:600, cursor:'pointer' },
  completeRing: { width:110, height:110, borderRadius:'50%', background:'linear-gradient(135deg,rgba(52,211,153,0.15),rgba(45,212,191,0.1))', border:'2px solid rgba(52,211,153,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2.8rem', margin:'0 auto 28px', boxShadow:'0 0 40px rgba(52,211,153,0.2)', animation:'pulseScale 2s ease-in-out infinite' },
  pill:     { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:24, padding:'7px 16px', fontFamily:'var(--font-mono)', fontSize:'0.73rem', color:'var(--text-dim)' },
  btnLaunch:{ background:'var(--gold)', border:'none', color:'var(--btn-text-on-gold)', padding:'15px 44px', borderRadius:12, fontFamily:'var(--font-display)', fontSize:'0.98rem', fontWeight:700, boxShadow:'0 12px 28px rgba(17,24,39,0.18)', cursor:'pointer' },
}

const imp = {
  dropzone:  { border:'2px dashed', borderRadius:18, padding:'36px 28px', cursor:'pointer', textAlign:'center', transition:'all 0.25s', marginBottom:20, minHeight:200, display:'flex', alignItems:'center', justifyContent:'center' },
  uploadIcon:{ width:64, height:64, borderRadius:18, background:'rgba(45,212,191,0.1)', border:'1px solid rgba(45,212,191,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.8rem', margin:'0 auto' },
  tipBox:    { background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.2)', borderRadius:14, padding:'14px 18px', display:'flex', gap:14, alignItems:'flex-start', marginBottom:16 },
  errorBox:  { background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:10, padding:'12px 16px', fontFamily:'var(--font-mono)', fontSize:'0.76rem', color:'var(--red)', marginBottom:16 },
  spinner:   { width:44, height:44, border:'3px solid rgba(255,255,255,0.08)', borderTopColor:'var(--teal)', borderRadius:'50%', animation:'spin 0.8s linear infinite' },
  addRowBtn: { background:'var(--surface2)', border:'1.5px dashed var(--border-act)', borderRadius:10, padding:'10px 20px', color:'var(--text-dim)', fontFamily:'var(--font-mono)', fontSize:'0.76rem', cursor:'pointer', width:'100%', marginBottom:16, boxShadow:'inset 0 1px 0 rgba(255,255,255,0.04)' },
}
