import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext.jsx'
import RiskSlider from './RiskSlider.jsx'
import { API_BASE as API } from '../utils/api.js'
import { refreshPage } from '../utils/refreshPage.js'
const GLOBE_PREFS_KEY = 'ws_globe_prefs'
const GLOBE_PREFS_EVENT = 'ws:globe-prefs'

function normalizeRiskProfileValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(100, value))
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'low' || text === 'conservative') return 0
  if (text === 'moderate' || text === 'medium' || text === 'balanced') return 50
  if (text === 'high' || text === 'aggressive') return 100
  const numeric = Number(text)
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(100, numeric))
  return 50
}

const SECTIONS = [
  { key: 'risk',     icon: '\u2696\uFE0F', label: 'Risk Profile' },
  { key: 'profile',  icon: '\u{1F464}', label: 'Profile Details' },
  { key: 'display',  icon: '\u{1F3A8}', label: 'Appearance' },
  { key: 'security', icon: '\u{1F510}', label: 'Security & Privacy' },
  { key: 'data',     icon: '\u{1F4E1}', label: 'Browser Extension' },
  { key: 'help',     icon: '\u2753', label: 'Help Centre' },
]

function Toggle({ on, onChange }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{ width: 44, height: 24, borderRadius: 999, flexShrink: 0, cursor: 'pointer', position: 'relative', transition: 'all 0.25s',
        background: on ? 'rgba(42,184,163,0.22)' : 'var(--surface3)',
        border: `1px solid ${on ? 'rgba(42,184,163,0.42)' : 'var(--border)'}` }}
    >
      <div style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', transition: 'all 0.25s', boxShadow: '0 4px 10px rgba(0,0,0,0.16)',
        left: on ? 'calc(100% - 20px)' : 2, background: on ? 'var(--teal)' : '#fff' }} />
    </div>
  )
}

function SelInput({ value, opts, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px',
        color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: '0.84rem', outline: 'none', minWidth: 165, cursor: 'pointer' }}>
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  )
}

function Row({ name, desc, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)', gap: 20 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: '0.88rem', marginBottom: 2 }}>{name}</div>
        {desc && <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>{desc}</div>}
      </div>
      {children}
    </div>
  )
}

function SliderField({ value, min = 0, max = 100, step = 1, onChange, leftLabel, rightLabel }) {
  return (
    <div style={{ minWidth: 220 }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--teal)', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.68rem', color: 'var(--text-faint)' }}>
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  )
}
function Card({ title, icon, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '20px 22px', marginBottom: 16 }}>
      {title && (
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', marginBottom: 14, paddingBottom: 12,
          borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{icon}</span>{title}
        </div>
      )}
      {children}
    </div>
  )
}

export default function SettingsModal({ onClose }) {
  const { user, logout } = useAuth()
  const [active, setActive]             = useState('risk')
  const [saved, setSaved]               = useState(false)
  const [unsaved, setUnsaved]           = useState(false)
  const [riskOpen, setRiskOpen]         = useState(false)
  const [riskLevel, setRiskLevel]       = useState(null)
  const [profileRisk, setProfileRisk]   = useState(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [toggles, setToggles]           = useState({ labels: true, pulses: true })
  const [displayPrefs, setDisplayPrefs] = useState(() => {
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
  })
  const [extensionStatus, setExtensionStatus] = useState(
    'Automatic install is not supported by the browser, so use the guide below to load the extension manually.'
  )
  const [youtubeEmbedUrl, setYoutubeEmbedUrl] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [dangerBusy, setDangerBusy] = useState('')
  const [dangerMsg, setDangerMsg] = useState('')
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    country: 'Singapore',
    investorType: 'Individual Investor',
    currency: 'SGD',
    password: '',
  })

  const mark = () => setUnsaved(true)
  const setProfileField = (key, value) => {
    setProfileForm(prev => ({ ...prev, [key]: value }))
    mark()
  }
  const updateDisplayPref = (key, value) => {
    const nextValue = Math.max(0, Math.min(100, Number(value) || 0))
    setDisplayPrefs(prev => {
      const next = { ...prev, [key]: nextValue }
      localStorage.setItem(GLOBE_PREFS_KEY, JSON.stringify(next))
      window.dispatchEvent(new CustomEvent(GLOBE_PREFS_EVENT, { detail: next }))
      return next
    })
    mark()
  }
  const updateGlobeTogglePref = (key, value) => {
    setToggles(p => ({ ...p, [key]: value }))
    setDisplayPrefs(prev => {
      const next = { ...prev, [key]: Boolean(value) }
      localStorage.setItem(GLOBE_PREFS_KEY, JSON.stringify(next))
      window.dispatchEvent(new CustomEvent(GLOBE_PREFS_EVENT, { detail: next }))
      return next
    })
    mark()
  }

  useEffect(() => {
    setToggles(prev => ({
      ...prev,
      labels: displayPrefs.labels !== false,
      pulses: displayPrefs.pulses !== false,
    }))
  }, [displayPrefs.labels, displayPrefs.pulses])

  useEffect(() => {
    fetch(`${API}/app/content/video`)
      .then(r => r.json())
      .then(data => {
        const embed = String(data?.embed_url || '')
        if (embed) setYoutubeEmbedUrl(embed)
      })
      .catch(() => {})
  }, [])

  // Load user's current risk profile
  useEffect(() => {
    if (!user?.user_id) { setProfileLoaded(true); return }
    Promise.all([
      fetch(`${API}/users/${user.user_id}`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/users/profile/details/${user.user_id}`).then(r => r.json()).catch(() => ({})),
    ])
      .then(([jsonData, csvData]) => {
        if (jsonData?.user?.risk_profile != null) setProfileRisk(normalizeRiskProfileValue(jsonData.user.risk_profile))
        const fullName = String(csvData?.profile?.name || jsonData?.user?.name || user?.username || '').trim()
        const [firstName = '', ...lastParts] = fullName ? fullName.split(/\s+/) : ['']
        const lastName = lastParts.join(' ')
        setProfileForm(prev => ({
          ...prev,
          firstName: firstName || prev.firstName,
          lastName: lastName || prev.lastName,
          email: String(csvData?.profile?.email || jsonData?.user?.email || prev.email || ''),
          country: String(csvData?.profile?.country || jsonData?.user?.country || prev.country || 'Singapore'),
          investorType: String(csvData?.profile?.investor_type || jsonData?.user?.investor_type || prev.investorType || 'Individual Investor'),
          currency: String(csvData?.profile?.currency || jsonData?.user?.currency || prev.currency || 'SGD'),
          password: String(csvData?.profile?.password || prev.password || ''),
        }))
      })
      .catch(() => {})
      .finally(() => setProfileLoaded(true))
  }, [user?.user_id])

  // Escape key to close
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleSave = async () => {
    setSaveError('')
    let didPersist = false
    let profileSaved = false
    if (user?.user_id) {
      try {
        const profileRes = await fetch(`${API}/users/profile/details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.user_id,
            first_name: profileForm.firstName,
            last_name: profileForm.lastName,
            email: profileForm.email,
            country: profileForm.country,
            investor_type: profileForm.investorType,
            currency: profileForm.currency,
            password: profileForm.password || undefined,
          }),
        })
        if (!profileRes.ok) {
          const err = await profileRes.json().catch(() => ({}))
          throw new Error(err?.detail || `profile save failed (${profileRes.status})`)
        }
        setProfileForm(prev => ({ ...prev, password: '' }))
        didPersist = true
        profileSaved = true
      } catch (err) {
        setSaveError(err?.message || 'Could not save profile details.')
      }

      const riskValue = normalizeRiskProfileValue(riskLevel?.value ?? profileRisk ?? 50)
      try {
        const res = await fetch(`${API}/users/risk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.user_id, risk_profile: riskValue }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setProfileRisk(riskValue)
        didPersist = true
      } catch (_) {}
    }
    if (profileSaved) {
      setSaved(true)
      setUnsaved(false)
      setTimeout(() => setSaved(false), 2000)
    }
    if (didPersist) refreshPage()
  }

  const handleDeletePortfolio = async () => {
    if (!user?.user_id || dangerBusy) return
    if (!window.confirm('Delete all portfolio data for this account? This cannot be undone.')) return
    setDangerBusy('delete')
    setDangerMsg('')
    try {
      const res = await fetch(`${API}/users/${user.user_id}/danger/portfolio`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `delete failed (${res.status})`)
      }
      setDangerMsg('Portfolio data deleted.')
      refreshPage()
    } catch (err) {
      setDangerMsg(err?.message || 'Portfolio delete failed.')
    } finally {
      setDangerBusy('')
    }
  }

  const handleCloseAccount = async () => {
    if (!user?.user_id || dangerBusy) return
    if (!window.confirm('Close account and delete all data permanently?')) return
    setDangerBusy('close')
    setDangerMsg('')
    try {
      const res = await fetch(`${API}/users/${user.user_id}/danger/account`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `close account failed (${res.status})`)
      }
      logout()
      onClose()
      window.location.assign('/')
    } catch (err) {
      setDangerMsg(err?.message || 'Account close failed.')
      setDangerBusy('')
    }
  }

  const extensionPath = 'FinTech/chrome-extension'

  const handleCopyExtensionPath = async () => {
    try {
      await navigator.clipboard.writeText(extensionPath)
      setExtensionStatus('Extension folder path copied. Paste it into Chrome after clicking Load unpacked.')
    } catch {
      setExtensionStatus(`Extension folder: ${extensionPath}`)
    }
  }

  const liveRisk = normalizeRiskProfileValue(riskLevel?.value ?? profileRisk ?? 50)
  const liveDiversification = Number((0.7 * liveRisk).toFixed(1))
  const liveLiquidity = Number((70 - liveDiversification).toFixed(1))
  const liveDebt = 30
  const riskInfo = {
    label: liveRisk <= 33 ? 'Conservative Portfolio' : liveRisk <= 66 ? 'Balanced Portfolio' : 'Aggressive Portfolio',
    ratio: `Diversification ${liveDiversification}% + Liquidity ${liveLiquidity}% + Debt-Income ${liveDebt}%`,
  }

  return createPortal(
    <div style={s.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.modal}>

        {/* â”€â”€ Left tab rail â”€â”€ */}
        <aside style={s.rail}>
          <div style={s.railTitle}>Settings</div>
          {SECTIONS.map(sec => (
            <button key={sec.key} style={{ ...s.tab, ...(active === sec.key ? s.tabActive : {}) }}
              onClick={() => setActive(sec.key)}>
              <span style={s.tabIcon}>{sec.icon}</span>
              <span style={s.tabLabel}>{sec.label}</span>
            </button>
          ))}
        </aside>

        {/* â”€â”€ Right content â”€â”€ */}
        <div style={s.body}>

          {/* Header bar */}
          <div style={s.header}>
            <div>
              <div style={s.eyebrow}>{SECTIONS.find(s => s.key === active)?.icon} {SECTIONS.find(s => s.key === active)?.label}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {saveError && (
                <div style={{ color:'var(--red)', fontSize:'0.75rem', maxWidth:260, textAlign:'right' }}>{saveError}</div>
              )}
              {unsaved && (
                <button style={s.btnSave} onClick={handleSave}>
                  {saved ? 'Saved!' : 'Save Changes'}
                </button>
              )}
              <button style={s.btnClose} onClick={onClose}>X</button>
            </div>
          </div>

          {/* â”€â”€ RISK PROFILE â”€â”€ */}
          {active === 'risk' && (
            <div style={s.content}>
              <p style={s.pageSub}>Your risk tolerance shapes wellness scoring, recommendations, and suggested allocations.</p>

              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16,
                  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', marginBottom: riskOpen ? 20 : 0 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(201,168,76,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>⚖️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', marginBottom: 2 }}>{riskInfo.label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.67rem', color: 'var(--teal)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Wellness ratio: {riskInfo.ratio}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 3 }}>
                      {profileRisk ? 'Saved to your profile' : 'Default - not yet saved'}
                    </div>
                  </div>
                  <button style={s.btnRiskAdjust} onClick={() => { setRiskOpen(r => !r); mark() }}>
                    {riskOpen ? 'Close' : 'Adjust'}
                  </button>
                </div>
                {riskOpen && (
                  <div style={{ animation: 'fadeUp 0.25s ease' }}>
                    {profileLoaded
                      ? <RiskSlider key={profileRisk ?? 'default'} initialPct={normalizeRiskProfileValue(profileRisk ?? 50)}
                          onChange={l => { setRiskLevel(l); mark() }} />
                      : <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>Loading...</div>
                    }
                  </div>
                )}
              </Card>

            </div>
          )}

          {/* â”€â”€ PROFILE DETAILS â”€â”€ */}
          {active === 'profile' && (
            <div style={s.content}>
              <p style={s.pageSub}>Update your personal information and display preferences.</p>
              <Card title="Personal Info" icon={'\u{1F464}'}>
                <div style={{ marginBottom: 14 }}>
                  <div style={s.formLabel}>First Name</div>
                  <input style={s.formInput} value={profileForm.firstName} onChange={e => setProfileField('firstName', e.target.value)} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={s.formLabel}>Last Name</div>
                  <input style={s.formInput} value={profileForm.lastName} onChange={e => setProfileField('lastName', e.target.value)} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <div style={s.formLabel}>Email Address</div>
                  <input style={s.formInput} value={profileForm.email} onChange={e => setProfileField('email', e.target.value)} />
                </div>
                <div style={{ marginBottom: 0 }}>
                  <div style={s.formLabel}>Password</div>
                  <div style={s.passwordWrap}>
                    <input
                      style={{ ...s.formInput, paddingRight: 44 }}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Leave blank to keep current password"
                      value={profileForm.password}
                      onChange={e => setProfileField('password', e.target.value)}
                    />
                    <button
                      type="button"
                      style={s.passwordToggle}
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? '\u{1F648}' : '\u{1F441}'}
                    </button>
                  </div>
                </div>
              </Card>
              <Card title="Preferences" icon={'\u{1F310}'}>
                <Row name="Investor Type">
                  <SelInput
                    value={profileForm.investorType}
                    opts={['Individual Investor','HNWI','Family Office','Institutional']}
                    onChange={v => setProfileField('investorType', v)}
                  />
                </Row>
                <Row name="Primary Currency">
                  <SelInput
                    value={profileForm.currency}
                    opts={['SGD','USD','GBP','EUR']}
                    onChange={v => setProfileField('currency', v)}
                  />
                </Row>
                <Row name="Country">
                  <SelInput
                    value={profileForm.country}
                    opts={['Singapore','United Kingdom','United States','Australia','Japan']}
                    onChange={v => setProfileField('country', v)}
                  />
                </Row>
              </Card>
            </div>
          )}

          {active === 'display' && (
            <div style={s.content}>
              <p style={s.pageSub}>Customize how the globe behaves in real time.</p>
              <Card title="Globe View" icon="🌍">
                <Row name="Show satellite labels" desc="Display asset class labels floating next to globe nodes.">
                  <Toggle on={toggles.labels} onChange={v => updateGlobeTogglePref('labels', v)} />
                </Row>
                <Row name="Animate node pulses" desc="Animated pulsing rings around active portfolio nodes.">
                  <Toggle on={toggles.pulses} onChange={v => updateGlobeTogglePref('pulses', v)} />
                </Row>
                <Row name="Globe rotation speed" desc={`Current: ${displayPrefs.rotationSpeed}%`}>
                  <SliderField
                    value={displayPrefs.rotationSpeed}
                    onChange={v => updateDisplayPref('rotationSpeed', v)}
                    leftLabel="Stopped"
                    rightLabel="Fast"
                  />
                </Row>
                <Row name="Node size scaling" desc={`Current: ${displayPrefs.nodeScale}%`}>
                  <SliderField
                    value={displayPrefs.nodeScale}
                    onChange={v => updateDisplayPref('nodeScale', v)}
                    leftLabel="Smaller"
                    rightLabel="Larger"
                  />
                </Row>
              </Card>
            </div>
          )}

          {/* Security & Privacy */}
          {active === 'security' && (
            <div style={s.content}>
              <p style={s.pageSub}>Manage your account security, 2FA, and data privacy preferences.</p>
              <Card title="Danger Zone" icon="⚠️">
                {[
                  { key: 'delete', title: 'Delete all portfolio data', desc: 'Permanently erase all portfolio holdings and history. Cannot be undone.', btn: 'Delete Data', red: true, onClick: handleDeletePortfolio },
                  { key: 'close', title: 'Close account', desc: 'Permanently delete your Unova account and all data.', btn: 'Close Account', red: true, onClick: handleCloseAccount },
                ].map(d => (
                  <div key={d.key} style={{ background: d.red ? 'rgba(248,113,113,0.04)' : 'var(--surface2)',
                    border: `1px solid ${d.red ? 'rgba(248,113,113,0.18)' : 'var(--border)'}`,
                    borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.86rem', color: d.red ? 'var(--red)' : 'var(--text)', marginBottom: 2 }}>{d.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{d.desc}</div>
                    </div>
                    <button style={{ background: 'transparent', border: `1px solid ${d.red ? 'rgba(248,113,113,0.4)' : 'var(--border)'}`,
                      color: d.red ? 'var(--red)' : 'var(--text)', padding: '8px 14px', borderRadius: 8,
                      fontFamily: 'var(--font-display)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0, opacity: dangerBusy ? 0.6 : 1 }}
                      disabled={Boolean(dangerBusy)}
                      onClick={d.onClick}
                    >
                      {dangerBusy === d.key ? 'Working...' : d.btn}
                    </button>
                  </div>
                ))}
                {dangerMsg && (
                  <div style={{ marginTop: 8, fontSize: '0.76rem', color: dangerMsg.toLowerCase().includes('failed') ? 'var(--red)' : 'var(--text-dim)' }}>
                    {dangerMsg}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* â”€â”€ DATA & API â”€â”€ */}
          {active === 'data' && (
            <div style={s.content}>
              <p style={s.pageSub}>Control browser extension setup and import workflow.</p>
              <Card title="Browser Extension" icon={'\u{1F9E9}'}>
                <div style={s.extensionHero}>
                  <div style={s.extensionIcon}>{'\u{1F4F8}'}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1rem', marginBottom:6 }}>
                      Install the Unova importer
                    </div>
                    <div style={{ fontSize:'0.8rem', color:'var(--text-dim)', lineHeight:1.65 }}>
                      Capture broker screenshots, parse holdings, and send them straight into your Unova portfolio.
                    </div>
                  </div>
                </div>
                {extensionStatus && (
                  <div style={s.extensionNotice}>{extensionStatus}</div>
                )}
                <div style={s.extensionGuide}>
                  <div style={s.extensionGuideTitle}>Manual install guide</div>
                  <div style={s.extensionSteps}>
                    {[
                      'Open chrome://extensions in Chrome.',
                      'Turn on Developer mode in the top-right corner.',
                      'Click Load unpacked.',
                      'Select the Unova extension folder.',
                      'Pin the extension and sign in before using imports.',
                    ].map((step, index) => (
                      <div key={step} style={s.extensionStep}>
                        <div style={s.extensionStepNum}>{index + 1}</div>
                        <div>{step}</div>
                      </div>
                    ))}
                  </div>
                  <div style={s.extensionPathRow}>
                    <div style={s.extensionPathBox}>{extensionPath}</div>
                    <button style={s.btnGhost} onClick={handleCopyExtensionPath}>Copy path</button>
                  </div>
                </div>
              </Card>
              <Card title="YouTube Embed" icon={'\u{1F4FA}'}>
                {youtubeEmbedUrl ? (
                  <div style={{ border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', background:'var(--surface2)' }}>
                    <iframe
                      title="youtube-embed-preview"
                      src={youtubeEmbedUrl}
                      style={{ width:'100%', height:280, border:'none' }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div style={{ fontSize:'0.78rem', color:'var(--text-faint)' }}>
                    Help video unavailable right now.
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* â”€â”€ HELP CENTRE â”€â”€ */}
          {active === 'help' && (
            <div style={s.content}>
              <p style={s.pageSub}>Find answers, read documentation, or get in touch with our team.</p>
              <Card title="Quick Links" icon={'\u{1F517}'}>
                {[
                  { icon: '\u{1F4D6}', title: 'Documentation',       desc: 'Full guides for every Unova feature.',       href: 'https://github.com/Zerius7733/FinTech/blob/main/README.md' },
                ].map(l => (
                  <a key={l.title} href={l.href} target={l.href.startsWith('http') ? '_blank' : undefined} rel={l.href.startsWith('http') ? 'noreferrer noopener' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
                    borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface2)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>{l.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.87rem', marginBottom: 2 }}>{l.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{l.desc}</div>
                    </div>
                      <span style={{ color: 'var(--text-faint)', fontSize: '0.9rem' }}>{'->'}</span>
                  </a>
                ))}
              </Card>
              <Card title="Contact Support" icon={'\u{1F4EE}'}>
                {[
                  { name: 'GLYN', email: 'glyn0003@e.ntu.edu.sg' },
                  { name: 'YIBIN', email: 'GUAN0094@e.ntu.edu.sg' },
                  { name: 'ABDI', email: 'gohj0099@e.ntu.edu.sg' },
                  { name: 'Zi An', email: 'e230221@e.ntu.edu.sg' },
                ].map((contact, idx, arr) => (
                  <a
                    key={contact.email}
                    href={`mailto:${contact.email}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 14,
                      padding: '12px 0',
                      borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.87rem', marginBottom: 2 }}>{contact.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{contact.email}</div>
                    </div>
                    <span style={{ color: 'var(--text-faint)', fontSize: '0.9rem' }}>{'->'}</span>
                  </a>
                ))}
              </Card>
              <Card title="App Info" icon={'\u2139\uFE0F'}>
                {[['Version','1.0.0-beta'],['Last updated','10 March 2026'],['Backend','FastAPI (configured API URL)'],['Frontend','React 18 + Vite']].map(([k,v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0',
                    borderBottom: '1px solid var(--border)', fontSize: '0.83rem' }}>
                    <span style={{ color: 'var(--text-dim)' }}>{k}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{v}</span>
                  </div>
                ))}
              </Card>
            </div>
          )}

        </div>
      </div>
    </div>
  , document.body)
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 900,
    background: 'rgba(8,10,18,0.72)',
    backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    animation: 'fadeIn 0.18s ease',
  },
  modal: {
    display: 'flex', width: '88vw', maxWidth: 960, height: '80vh', maxHeight: 680,
    background: 'var(--bg)', borderRadius: 24,
    border: '1px solid var(--border)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.48)',
    overflow: 'hidden',
    animation: 'modalPop 0.22s cubic-bezier(0.34,1.56,0.64,1)',
  },
  rail: {
    width: 200, flexShrink: 0,
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    padding: '22px 12px',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  railTitle: {
    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem',
    padding: '0 10px', marginBottom: 16, color: 'var(--text)',
  },
  tab: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
    border: '1px solid transparent',
    background: 'transparent', color: 'var(--text-dim)',
    fontSize: '0.87rem', fontWeight: 500, width: '100%', textAlign: 'left',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: 'var(--bg)', border: '1px solid var(--border)',
    color: 'var(--text)', boxShadow: '0 6px 16px rgba(17,24,39,0.07)',
  },
  tabIcon: { fontSize: '0.9rem', width: 20, textAlign: 'center', flexShrink: 0 },
  tabLabel: { fontSize: '0.85rem' },
  body: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 28px 14px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  eyebrow: {
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.05rem',
  },
  content: {
    flex: 1, overflowY: 'auto', padding: '20px 28px 32px',
  },
  pageSub: {
    color: 'var(--text-dim)', fontSize: '0.87rem', lineHeight: 1.65, marginBottom: 20, marginTop: 0,
  },
  formLabel: {
    fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-faint)',
    textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6,
  },
  formInput: {
    width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '10px 14px', color: 'var(--text)',
    fontFamily: 'var(--font-body)', fontSize: '0.87rem', outline: 'none',
    boxSizing: 'border-box', marginBottom: 0,
  },
  passwordWrap: {
    position:'relative',
  },
  passwordToggle: {
    position:'absolute',
    right:10,
    top:'50%',
    transform:'translateY(-50%)',
    width:28,
    height:28,
    borderRadius:8,
    border:'1px solid var(--border)',
    background:'var(--surface)',
    color:'var(--text-dim)',
    cursor:'pointer',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    padding:0,
    fontSize:'0.9rem',
  },
  btnClose: {
    width: 34, height: 34, borderRadius: '50%',
    border: '1px solid var(--border)', background: 'var(--surface2)',
    color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.85rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  btnSave: {
    background: 'var(--gold)', border: 'none', color: 'var(--btn-text-on-gold)',
    padding: '9px 18px', borderRadius: 10, fontFamily: 'var(--font-display)',
    fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer',
  },
  btnGhost: {
    background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
    padding: '8px 14px', borderRadius: 10, fontFamily: 'var(--font-display)',
    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
  },
  btnRiskAdjust: {
    background: '#111111',
    border: '1px solid #000000',
    color: '#ffffff',
    padding: '8px 14px',
    borderRadius: 10,
    fontFamily: 'var(--font-display)',
    fontSize: '0.8rem',
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
    boxShadow: '0 8px 16px rgba(0,0,0,0.18)',
  },
  extensionHero: {
    display:'flex',
    alignItems:'center',
    gap:16,
    padding:'4px 0 2px',
  },
  extensionIcon: {
    width:52,
    height:52,
    borderRadius:16,
    background:'linear-gradient(135deg, rgba(109,141,247,0.14), rgba(42,184,163,0.18))',
    border:'1px solid rgba(109,141,247,0.16)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    fontSize:'1.3rem',
    color:'var(--teal)',
    flexShrink:0,
  },
  btnInstall: {
    background:'linear-gradient(135deg,var(--teal),#0e9f84)',
    border:'none',
    color:'#061218',
    padding:'10px 16px',
    borderRadius:12,
    fontFamily:'var(--font-body)',
    fontSize:'0.84rem',
    fontWeight:700,
    cursor:'pointer',
    boxShadow:'0 10px 22px rgba(42,184,163,0.18)',
    flexShrink:0,
  },
  extensionNotice: {
    marginTop:14,
    background:'rgba(109,141,247,0.06)',
    border:'1px solid rgba(109,141,247,0.14)',
    borderRadius:12,
    padding:'10px 12px',
    fontSize:'0.78rem',
    color:'var(--text-dim)',
    lineHeight:1.6,
  },
  extensionGuide: {
    marginTop:14,
    background:'var(--surface2)',
    border:'1px solid var(--border)',
    borderRadius:14,
    padding:'14px 14px 12px',
  },
  extensionGuideTitle: {
    fontFamily:'var(--font-display)',
    fontWeight:700,
    fontSize:'0.92rem',
    marginBottom:10,
  },
  extensionSteps: {
    display:'grid',
    gap:10,
  },
  extensionStep: {
    display:'flex',
    alignItems:'flex-start',
    gap:10,
    fontSize:'0.8rem',
    color:'var(--text-dim)',
    lineHeight:1.6,
  },
  extensionStepNum: {
    width:22,
    height:22,
    borderRadius:'50%',
    background:'rgba(42,184,163,0.12)',
    border:'1px solid rgba(42,184,163,0.18)',
    color:'var(--teal)',
    fontFamily:'var(--font-mono)',
    fontSize:'0.72rem',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    flexShrink:0,
    marginTop:1,
  },
  extensionPathRow: {
    display:'flex',
    alignItems:'center',
    gap:10,
    marginTop:14,
  },
  extensionPathBox: {
    flex:1,
    minWidth:0,
    background:'rgba(255,255,255,0.72)',
    border:'1px solid var(--border)',
    borderRadius:10,
    padding:'10px 12px',
    fontFamily:'var(--font-mono)',
    fontSize:'0.74rem',
    color:'var(--text-dim)',
    overflow:'hidden',
    textOverflow:'ellipsis',
    whiteSpace:'nowrap',
  },
}











