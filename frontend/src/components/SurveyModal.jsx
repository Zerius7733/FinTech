import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import OtpCodeInput from './OtpCodeInput.jsx'
import RiskSlider from './RiskSlider.jsx'
import { API_BASE as API } from '../utils/api.js'
import { buildOtpDeliveryMessage, buildOtpInputPrompt } from '../utils/authOtp.js'
const OPENAI_API_KEY = ''

async function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload  = () => res(r.result.split(',')[1])
    r.onerror = () => rej(new Error('Failed to read file'))
    r.readAsDataURL(file)
  })
}

const STEPS = [
  { title:'Your Profile',      desc:'Name, age group, and investor type.' },
  { title:'Risk Tolerance',    desc:'Set your comfort with volatility.' },
  { title:'Asset Preferences', desc:'Which asset classes do you hold?' },
  { title:'Financial Goals',   desc:'Define what you\'re building toward.' },
  { title:'Import Portfolio',  desc:'Upload a screenshot to auto-extract holdings.' },
]

const AGE_GROUPS = [
  { emoji:'18-29', label:'18-29' },
  { emoji:'30-44', label:'30-44' },
  { emoji:'45-59', label:'45-59' },
  { emoji:'60+', label:'60+' }
]

const ASSET_CLASSES = [
  { icon:'EQ', name:'Equities', desc:'Stocks, ETFs, and equity funds.', color:'#60a5fa', bg:'rgba(96,165,250,0.08)' },
  { icon:'FI', name:'Fixed Income', desc:'Government & corporate bonds.', color:'#a78bfa', bg:'rgba(167,139,250,0.08)' },
  { icon:'RE', name:'Real Estate', desc:'Direct property and REITs.', color:'#c9a84c', bg:'rgba(201,168,76,0.08)' },
  { icon:'CR', name:'Digital Assets', desc:'Crypto, DeFi, and tokenised assets.', color:'#2dd4bf', bg:'rgba(45,212,191,0.08)' },
  { icon:'CM', name:'Commodities', desc:'Gold, silver, oil, and resources.', color:'#fbbf24', bg:'rgba(251,191,36,0.08)' },
  { icon:'PA', name:'Private Assets', desc:'PE, venture, hedge funds.', color:'#f87171', bg:'rgba(248,113,113,0.08)' },
]

const GOALS = [
  { icon:'WG', title:'Wealth Growth', desc:'Compound and grow wealth aggressively.' },
  { icon:'RT', title:'Retirement Planning', desc:'Build a nest egg for financial independence.' },
  { icon:'PI', title:'Passive Income', desc:'Generate regular cash flow from yields.' },
  { icon:'PP', title:'Property Purchase', desc:'Save and invest toward buying real estate.' },
  { icon:'CP', title:'Capital Preservation', desc:'Protect wealth against inflation and loss.' },
  { icon:'EL', title:'Education / Legacy', desc:'Fund education or create a legacy.' },
]

const HORIZONS = [
  { num:'1-2', label:'Short Term' },
  { num:'3-5', label:'Medium Term' },
  { num:'5-10', label:'Long Term' },
  { num:'10+', label:'Generational' }
]

const TYPE_COLOR = { equity:'#60a5fa', crypto:'#2dd4bf', etf:'#a78bfa', bond:'#f0abfc', commodity:'#fbbf24', reit:'#c9a84c', unknown:'#94a3b8' }
const EMPTY_HOLDING = { ticker:'', name:'', shares:0, price:0, change:0, dir:'up', type:'equity' }

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
          {holding.dir==='up' ? '^ up' : 'v dn'}
        </div>
        <select value={holding.type ?? 'unknown'} onChange={e => onChange(index,'type',e.target.value)}
          style={{ ...es.cell, padding:'6px 8px', background:'var(--surface2)' }}>
          {Object.keys(TYPE_COLOR).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => onDelete(index)} style={es.deleteBtn} title="Remove">x</button>
      </div>
    </div>
  )
}

const es = {
  row: { display:'flex', alignItems:'stretch', borderBottom:'1px solid rgba(255,255,255,0.05)', transition:'background 0.15s' },
  cell: { background:'var(--surface2)', border:'1px solid var(--border-act)', borderRadius:8, padding:'6px 8px', color:'var(--text)', fontFamily:'var(--font-mono)', fontSize:'0.76rem', outline:'none', width:'100%' },
  deleteBtn: { background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.24)', borderRadius:8, color:'var(--red)', cursor:'pointer', fontFamily:'var(--font-mono)', fontSize:'0.8rem', padding:'4px 8px' },
}

function PortfolioImportStep({ onBack, onComplete }) {
  const { user } = useAuth()
  const [phase, setPhase] = useState('upload')
  const [preview, setPreview] = useState(null)
  const [fileData, setFileData] = useState(null)
  const [holdings, setHoldings] = useState([])
  const [importId, setImportId] = useState('')
  const [error, setError] = useState(null)
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
      const normalizedHoldings = parsedHoldings.map(normalizeParsedHolding).filter(Boolean)
      setImportId(data?.import_id || '')
      setHoldings(normalizedHoldings);
      setPhase('review');
    } catch (e) {
      setError(e.message || 'Parse error');
      setPhase('upload');
    }
  }

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
        body: JSON.stringify({ import_id: importId, holdings })
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
    <div style={{ width:'100%', maxWidth:'100%', overflow:'auto' }}>
      <div style={cs.eyebrow}>Step 5 of 5 | Optional</div>
      <h3 style={{ ...cs.heading, fontSize:'1.4rem' }}>Import your <em style={{ fontStyle:'normal', color:'var(--teal)' }}>portfolio</em></h3>
      <p style={{ ...cs.subtext, fontSize:'0.8rem' }}>Upload a screenshot from your brokerage. Our System will process your image for you.</p>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{ ...imp.dropzone, borderColor: dragging ? 'var(--teal)' : preview ? 'rgba(45,212,191,0.4)' : 'var(--border)', background: dragging ? 'rgba(45,212,191,0.06)' : preview ? 'rgba(45,212,191,0.03)' : 'var(--surface)' }}
      >
        <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        {preview ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
            <img src={preview} alt="Preview" style={{ maxHeight:150, maxWidth:'100%', borderRadius:10, border:'1px solid var(--border)' }} />
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--teal)' }}>Loaded</span>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
            <div style={imp.uploadIcon}></div>
            <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.95rem' }}>Drag & drop or click</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-faint)' }}>PNG | JPG | WEBP</div>
          </div>
        )}
      </div>

      {error && <div style={imp.errorBox}>{error}</div>}

      <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginTop:20 }}>
        <button style={S.btnBack} onClick={onBack}>Back</button>
        <div style={{ display:'flex', gap:8 }}>
          <button style={{ ...S.btnBack, color:'var(--text-faint)', fontSize:'0.78rem', padding:'8px 16px' }} onClick={() => onComplete([])}>Skip</button>
          <button style={{ ...S.submit, opacity: preview ? 1 : 0.4, cursor: preview ? 'pointer' : 'not-allowed', fontSize:'0.78rem', padding:'8px 16px' }} onClick={() => preview && parse()}>
            Extract {'->'}
          </button>
        </div>
      </div>
    </div>
  )

  if (phase === 'parsing') return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20 }}>
      <div style={imp.spinner} />
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1rem', marginBottom:6 }}>Reading portfolio...</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--text-faint)' }}>Scanning for holdings...</div>
      </div>
    </div>
  )

  if (phase === 'review') return (
    <div style={{ width:'100%', maxWidth:'100%' }}>
      <div style={cs.eyebrow}>Step 5 of 5 | Review</div>
      <h3 style={{ ...cs.heading, fontSize:'1.2rem', marginBottom:12 }}><em style={{ fontStyle:'normal', color:'var(--green)' }}>{holdings.length}</em> holdings</h3>

      {preview && (
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, padding:'8px 12px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10 }}>
          <img src={preview} alt="" style={{ width:40, height:30, objectFit:'cover', borderRadius:6 }} />
          <div style={{ flex:1, fontSize:'0.75rem', color:'var(--text-dim)' }}>Extracted {holdings.length} items</div>
          <button onClick={() => { setPhase('upload'); setHoldings([]) }} style={{ ...cs.btnBack, padding:'4px 10px', fontSize:'0.7rem' }}>Re-upload</button>
        </div>
      )}

      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', maxHeight:240, overflowY:'auto', marginBottom:12 }}>
        {holdings.length === 0
          ? <div style={{ padding:'20px', textAlign:'center', color:'var(--text-faint)', fontSize:'0.75rem' }}>No holdings</div>
          : holdings.map((h,i) => <HoldingRow key={i} holding={h} index={i} onChange={updateHolding} onDelete={deleteHolding} />)
        }
      </div>

      <button onClick={addHolding} style={{ ...imp.addRowBtn, padding:'6px 12px', fontSize:'0.7rem', marginBottom:12 }}>+ Add row</button>

        <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
          <button style={cs.btnBack} onClick={() => setPhase('upload')}>Back</button>
          <div style={{ display:'flex', gap:8 }}>
            <button style={{ ...cs.btnBack, color:'var(--text-faint)', fontSize:'0.78rem', padding:'8px 16px' }} onClick={() => onComplete([])}>Skip</button>
          <button style={cs.btnNext} onClick={confirm}>
            Confirm *
          </button>
        </div>
      </div>
    </div>
  )

  return null
}

export default function SurveyModal({ open, onClose }) {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const { activeTheme } = useTheme()
  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)
  const [importedHoldings, setImportedHoldings] = useState([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [country, setCountry] = useState('Singapore')
  const [age, setAge] = useState('')
  const [ageGroup, setAgeGroup] = useState('30-44')
  const [selectedAssets, setSelectedAssets] = useState(new Set(['Equities','Fixed Income']))
  const [selectedGoals, setSelectedGoals] = useState(new Set(['Wealth Growth']))
  const [horizon, setHorizon] = useState('3-5')
  const [riskLevel, setRiskLevel] = useState(50)
  const [submitErr, setSubmitErr] = useState('')
  const [isValidatingProfileStep, setIsValidatingProfileStep] = useState(false)
  const [registrationOtp, setRegistrationOtp] = useState('')
  const [registrationPending, setRegistrationPending] = useState(null)
  const [isFinalizingSetup, setIsFinalizingSetup] = useState(false)
  const headingAccentColor = activeTheme?.id === 'silent-night' ? '#e9dfcf' : 'var(--gold)'

  useEffect(() => {
    if (!open) return
    setStep(1)
    setDone(false)
    setImportedHoldings([])
    setFirstName('')
    setLastName('')
    setUsername('')
    setEmail('')
    setPassword('')
    setShowPassword(false)
    setCountry('Singapore')
    setAge('')
    setAgeGroup('30-44')
    setSelectedAssets(new Set(['Equities', 'Fixed Income']))
    setSelectedGoals(new Set(['Wealth Growth']))
    setHorizon('3-5')
    setRiskLevel(50)
    setSubmitErr('')
    setIsValidatingProfileStep(false)
    setRegistrationOtp('')
    setRegistrationPending(null)
    setIsFinalizingSetup(false)
  }, [open])

  const completionInitials = (() => {
    const first = String(firstName || '').trim()
    const last = String(lastName || '').trim()
    if (first && last) return `${first[0].toUpperCase()}.${last[0].toUpperCase()}.`

    const fallbackSource = String(first || username || email || user?.username || '').replace(/[^a-zA-Z0-9]/g, '')
    if (fallbackSource.length >= 2) return `${fallbackSource[0].toUpperCase()}.${fallbackSource[1].toUpperCase()}.`
    if (fallbackSource.length === 1) return `${fallbackSource[0].toUpperCase()}.`
    return '?'
  })()

  if (!open) return null

  const goNext = () => step < 5 ? setStep(s => s+1) : null
  const goBack = () => setStep(s => s-1)
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
    if (parsedAge <= 29) setAgeGroup('18-29')
    else if (parsedAge <= 44) setAgeGroup('30-44')
    else if (parsedAge <= 59) setAgeGroup('45-59')
    else setAgeGroup('60+')
    setIsValidatingProfileStep(true)
    try {
      const normalizedEmail = email.trim()
      const normalizedUsername = username.trim()
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
              email: verifiedEmail,
              password: normalizedPassword,
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
    const profileRes = await fetch(`${API}/users/survey/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: activeUser.user_id,
        first_name: firstName,
        last_name: lastName,
        username: username.trim(),
        email,
        country,
        age: Number(age),
        age_group: ageGroup,
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
      onClose()
      navigate('/profile')
    } catch (err) {
      setSubmitErr(err?.message || 'Failed. Please try again.')
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
    <div style={S.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.card, maxWidth:500, maxHeight:'90vh', overflowY:'auto' }}>
        <button onClick={onClose} style={S.closeBtn} type="button">x</button>
        <div style={{ textAlign:'center', animation:'fadeUp 0.5s ease' ,paddingTop:50, paddingBottom:50 }}>
          <div style={S.completeRing}>{completionInitials}</div>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', fontWeight:800, marginBottom:10 }}>
            You're set, <span style={{ color:'var(--green)' }}>{firstName || user?.username}</span>
          </h2>
          <p style={{ color:'var(--text-dim)', fontSize:'0.85rem', lineHeight:1.6, marginBottom:16 }}>Your WealthSphere is calibrated.</p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', marginBottom:16 }}>
            {[['Age', ageGroup], ['Risk', `${riskLevel}/100`], ['Assets', `${importedHoldings.length}`], ['Horizon', `${horizon}y`]].map(([k,v]) => (
              <div key={k} style={{ ...S.pill, fontSize:'0.7rem' }}>{k}: <span style={{ color:'var(--gold)' }}>{v}</span></div>
            ))}
          </div>
          {importedHoldings.length > 0 && (
            <div style={{ background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.25)', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:'0.75rem', color:'var(--green)' }}>
               {importedHoldings.length} holdings imported
            </div>
          )}
          <button style={{ ...S.launchBtn, opacity:isFinalizingSetup ? 0.8 : 1 }} onClick={handleLaunch} disabled={isFinalizingSetup}>
            {isFinalizingSetup ? 'Please wait…' : 'Launch WealthSphere'}
          </button>
          {submitErr && <div style={{ color:'var(--red)', fontSize:'0.7rem', marginTop:10 }}>{submitErr}</div>}
        </div>
      </div>
    </div>
  )

  return (
    <div style={S.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.card, maxWidth:720, maxHeight:'90vh', overflowY:'auto', padding:'38px 43px 34px' }}>
        <button onClick={onClose} style={S.closeBtn} type="button">x</button>

        {step === 1 && (
          <div>
            <div style={cs.eyebrow}>Step 1 of 5</div>
            <h3 style={{ ...cs.heading, fontSize:'1.3rem' }}>Tell us about <em style={{ fontStyle:'normal', color: headingAccentColor }}>yourself</em></h3>
            <p style={{ ...cs.subtext, fontSize:'0.82rem' }}>This helps us tailor your experience.</p>
            <div style={cs.formGrid}>
              <div>
                <label style={cs.formLabel}>First Name</label>
                <input style={cs.formInput} placeholder="Alex" value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
              </div>
              <div>
                <label style={cs.formLabel}>Last Name</label>
                <input style={cs.formInput} placeholder="Chen" value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
              </div>
              <div>
                <label style={cs.formLabel}>Username</label>
                <input style={cs.formInput} placeholder="alex123" value={username} onChange={e => setUsername(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
              </div>
              <div>
                <label style={cs.formLabel}>Email</label>
                <input style={cs.formInput} placeholder="alex@example.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={cs.formLabel}>Password</label>
                <div style={cs.passwordWrap}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    style={{ ...cs.formInput, paddingRight: 44 }}
                    placeholder="Enter password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={cs.passwordToggle}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div>
                <label style={cs.formLabel}>Country</label>
                <select style={cs.formInput} value={country} onChange={e => setCountry(e.target.value)} autoComplete="off">
                  {['Singapore','United Kingdom','United States','Australia','Japan'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div style={cs.formLabel}>Age</div>
            <input
              type="number"
              min="18"
              max="100"
              style={{ ...cs.formInput, maxWidth: 220, marginBottom:24 }}
              placeholder="30"
              value={age}
              onChange={e => setAge(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
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
                  <button
                    type="button"
                    style={{ ...S.resendBtn, opacity:isValidatingProfileStep ? 0.7 : 1, cursor:isValidatingProfileStep ? 'not-allowed' : 'pointer' }}
                    onClick={handleResendRegistrationOtp}
                    disabled={isValidatingProfileStep}
                  >
                    Resend code
                  </button>
                </div>
              </div>
            )}
            {submitErr && <div style={{ color:'var(--red)', fontSize:'0.73rem', marginBottom:12 }}>{submitErr}</div>}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button style={S.btnBack} onClick={onClose}>Cancel</button>
              <button style={{ ...S.submit, opacity: isValidatingProfileStep ? 0.7 : 1 }} onClick={goNextFromProfile} disabled={isValidatingProfileStep}>
                {isValidatingProfileStep ? 'Checking...' : registrationPending ? 'Verify email & continue' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={cs.eyebrow}>Step 2 of 5</div>
            <h3 style={{ ...cs.heading, fontSize:'1.3rem' }}>Your <em style={{ fontStyle:'normal', color:'var(--gold)' }}>risk horizon</em></h3>
            <p style={{ ...cs.subtext, fontSize:'0.82rem' }}>Shapes your recommendations.</p>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:20, marginBottom:24 }}>
              <RiskSlider initialPct={50} onChange={(l) => setRiskLevel(Number(l.value ?? 50))} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
              <button style={S.btnBack} onClick={goBack}>Back</button>
              <button style={S.submit} onClick={goNext}>Continue</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={cs.eyebrow}>Step 3 of 5</div>
            <h3 style={{ ...cs.heading, fontSize:'1.3rem' }}>Your <em style={{ fontStyle:'normal', color:'var(--gold)' }}>assets</em></h3>
            <p style={{ ...cs.subtext, fontSize:'0.82rem' }}>Which classes do you hold?</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:24 }}>
              {ASSET_CLASSES.map(a => {
                const sel = selectedAssets.has(a.name)
                return (
                  <div key={a.name} style={{ ...S.assetCard, ...(sel?{borderColor:a.color,background:a.bg}:{}) }} onClick={() => toggleSet(selectedAssets,setSelectedAssets,a.name)}>
                    <div style={{ ...S.assetCheck, ...(sel?{background:a.color,borderColor:a.color,color:'#fff'}:{}) }}>{sel ? 'v' : ''}</div>
                    <div style={{ fontSize:'1.3rem', marginBottom:6 }}>{a.icon}</div>
                    <div style={{ fontWeight:700, fontSize:'0.8rem', marginBottom:2 }}>{a.name}</div>
                    <div style={{ fontSize:'0.7rem', color:'var(--text-dim)', lineHeight:1.4 }}>{a.desc}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
              <button style={S.btnBack} onClick={goBack}>Back</button>
              <button style={S.submit} onClick={goNext}>Continue</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <div style={cs.eyebrow}>Step 4 of 5</div>
            <h3 style={{ ...cs.heading, fontSize:'1.3rem' }}>Your <em style={{ fontStyle:'normal', color:'var(--gold)' }}>goals</em></h3>
            <p style={{ ...cs.subtext, fontSize:'0.82rem' }}>What are you building toward?</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:10, marginBottom:20, maxHeight:300, overflowY:'auto' }}>
              {GOALS.map(g => {
                const sel = selectedGoals.has(g.title)
                return (
                  <div key={g.title} style={{ ...S.goalCard, ...(sel?S.goalCardActive:{}) }} onClick={() => toggleSet(selectedGoals,setSelectedGoals,g.title)}>
                    <div style={{ ...S.goalIcon, ...(sel?{background:'rgba(45,212,191,0.15)'}:{}) }}>{g.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:'0.8rem', marginBottom:2 }}>{g.title}</div>
                      <div style={{ fontSize:'0.7rem', color:'var(--text-dim)', lineHeight:1.4 }}>{g.desc}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={cs.formLabel}>Time Horizon</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                {HORIZONS.map(h => (
                  <div key={h.num} style={{ ...S.horizonBtn, ...(horizon===h.num?S.horizonActive:{}) }} onClick={() => setHorizon(h.num)}>
                    <span style={{ fontWeight:800, fontSize:'1rem', display:'block' }}>{h.num}</span>
                    <span style={{ fontSize:'0.65rem' }}>{h.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
              <button style={S.btnBack} onClick={goBack}>Back</button>
              <button style={S.submit} onClick={goNext}>Continue</button>
            </div>
          </div>
        )}

        {step === 5 && <PortfolioImportStep onBack={goBack} onComplete={handleImportComplete} />}
      </div>
    </div>
  )
}

const S = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1001,
    backdropFilter: 'blur(3px)',
  },
  card: {
    position: 'relative',
    width: '100%',
    background: 'var(--surface)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 'var(--r-xl)',
    boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
    animation: 'fadeUp 0.4s ease',
  },
  closeBtn: {
    position: 'absolute',
    top: 19,
    right: 19,
    width: 38,
    height: 38,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'var(--text-dim)',
    fontSize: '1.2rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  ageCard: {
    background: 'var(--surface)',
    border: '1.5px solid var(--border)',
    borderRadius: 12,
    padding: '14px 10px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  ageCardActive: { borderColor: 'var(--gold)', background: 'rgba(201,168,76,0.08)' },
  assetCard: {
    background: 'var(--surface)',
    border: '1.5px solid var(--border)',
    borderRadius: 14,
    padding: '17px',
    cursor: 'pointer',
    transition: 'all 0.25s',
    position: 'relative',
  },
  assetCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'var(--surface2)',
    border: '1.5px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.72rem',
    color: 'transparent',
    transition: 'all 0.2s',
  },
  goalCard: {
    background: 'var(--surface)',
    border: '1.5px solid var(--border)',
    borderRadius: 12,
    padding: '14px',
    cursor: 'pointer',
    transition: 'all 0.25s',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  },
  goalCardActive: { borderColor: 'var(--teal)', background: 'rgba(45,212,191,0.05)' },
  goalIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: 'var(--surface2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.04rem',
    flexShrink: 0,
  },
  horizonBtn: {
    background: 'var(--surface)',
    border: '1.5px solid var(--border)',
    borderRadius: 10,
    padding: '12px 7px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8rem',
    color: 'var(--text-dim)',
  },
  horizonActive: { borderColor: 'var(--teal)', color: 'var(--teal)', background: 'rgba(45,212,191,0.07)' },
  btnBack: {
    background: 'var(--surface2)',
    border: '1px solid var(--border-act)',
    color: 'var(--text)',
    padding: '10px 22px',
    borderRadius: 10,
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  submit: {
    padding: '12px 29px',
    background: 'var(--btn-primary-bg)',
    border: '1px solid color-mix(in srgb, var(--btn-primary-bg) 72%, white 10%)',
    borderRadius: 10,
    color: 'var(--btn-primary-text)',
    fontWeight: 700,
    fontSize: '0.96rem',
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.12)',
    transition: 'opacity 0.2s, filter 0.2s',
  },
  pill: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '6px 12px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-dim)',
  },
  completeRing: {
    width: 96,
    height: 96,
    borderRadius: '50%',
    background: 'linear-gradient(135deg,rgba(52,211,153,0.15),rgba(45,212,191,0.1))',
    border: '2px solid rgba(52,211,153,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2.2rem',
    fontWeight: 800,
    color: 'var(--green)',
    margin: '0 auto 19px',
    boxShadow: '0 0 32px rgba(52,211,153,0.2)',
  },
  launchBtn: {
    minWidth: 240,
    padding: '13px 30px',
    background: 'linear-gradient(135deg,#20c997,#14b8a6)',
    border: '1px solid rgba(45,212,191,0.55)',
    borderRadius: 12,
    color: '#ffffff',
    fontWeight: 800,
    fontSize: '1rem',
    letterSpacing: '0.01em',
    cursor: 'pointer',
    boxShadow: '0 14px 28px rgba(20,184,166,0.32), inset 0 1px 0 rgba(255,255,255,0.18)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease',
  },
  resendBtn: {
    minWidth: 150,
    padding: '10px 18px',
    borderRadius: 999,
    border: '1px solid rgba(32,201,151,0.28)',
    background: 'linear-gradient(180deg, rgba(32,201,151,0.12), rgba(20,184,166,0.08))',
    color: '#11967c',
    fontFamily: 'var(--font-display)',
    fontSize: '0.84rem',
    fontWeight: 700,
    letterSpacing: '0.01em',
    boxShadow: '0 8px 20px rgba(20,184,166,0.12), inset 0 1px 0 rgba(255,255,255,0.35)',
  },
}

const cs = {
  eyebrow: { fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 12 },
  heading: { fontFamily: 'var(--font-display)', fontWeight: 800, lineHeight: 1.1, marginBottom: 10 },
  subtext: { color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 24 },
  otpPanel: {
    marginBottom: 18,
    padding: '12px 14px',
    borderRadius: 14,
    border: '1px solid rgba(20,184,166,0.18)',
    background: 'linear-gradient(180deg, rgba(20,184,166,0.06), rgba(32,201,151,0.04))',
  },
  otpCopy: {
    fontSize: '0.76rem',
    color: 'var(--text-dim)',
    lineHeight: 1.6,
    marginBottom: 10,
  },
  otpRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 10,
    alignItems: 'center',
  },
  btnBack: {
    background: 'var(--surface2)',
    border: '1px solid var(--border-act)',
    color: 'var(--text)',
    padding: '10px 22px',
    borderRadius: 10,
    fontFamily: 'var(--font-display)',
    fontSize: '0.87rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
  },
  btnNext: {
    background: 'var(--btn-primary-bg)',
    border: '1px solid color-mix(in srgb, var(--btn-primary-bg) 72%, white 10%)',
    color: 'var(--btn-primary-text)',
    padding: '10px 18px',
    borderRadius: 10,
    fontFamily: 'var(--font-display)',
    fontSize: '0.78rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.12)',
  },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 },
  formLabel: { fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 },
  formInput: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text)', fontSize: '0.96rem', outline: 'none', width: '100%' },
  passwordWrap: { position: 'relative' },
  passwordToggle: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 30,
    height: 30,
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.85rem',
    lineHeight: 1,
    padding: 0,
  },
}

const imp = {
  dropzone: { border: '2px dashed', borderRadius: 14, padding: '28px 20px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.25s', marginBottom: 16, minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  uploadIcon: { width: 48, height: 48, borderRadius: 12, background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' },
  errorBox: { background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.73rem', color: 'var(--red)', marginBottom: 12 },
  spinner: { width: 36, height: 36, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--teal)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  addRowBtn: { background: 'var(--surface2)', border: '1.5px dashed var(--border-act)', borderRadius: 10, padding: '8px 12px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', cursor: 'pointer', width: '100%', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' },
}
