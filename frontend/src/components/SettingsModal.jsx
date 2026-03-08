import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext.jsx'
import RiskSlider from './RiskSlider.jsx'

const API = 'http://localhost:8000'
const RISK_KEY_TO_PCT  = { Low: 0, Moderate: 50, High: 100 }
const RISK_KEY_TO_INFO = {
  Low:      { label: 'Conservative Portfolio', factor: '1.0' },
  Moderate: { label: 'Balanced Portfolio',      factor: '0.7' },
  High:     { label: 'Aggressive Portfolio',    factor: '0.5' },
}
const SLIDER_KEY_TO_RISK = { conservative: 'Low', balanced: 'Moderate', aggressive: 'High' }

const SECTIONS = [
  { key: 'risk',     icon: '⚖️',  label: 'Risk Profile'       },
  { key: 'profile',  icon: '👤',  label: 'Profile Details'    },
  { key: 'display',  icon: '🎨',  label: 'Appearance'         },
  { key: 'security', icon: '🔐',  label: 'Security & Privacy' },
  { key: 'data',     icon: '📡',  label: 'Data & API'         },
  { key: 'help',     icon: '❓',  label: 'Help Centre'        },
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
  const { user } = useAuth()
  const [active, setActive]             = useState('risk')
  const [saved, setSaved]               = useState(false)
  const [unsaved, setUnsaved]           = useState(false)
  const [riskOpen, setRiskOpen]         = useState(false)
  const [riskLevel, setRiskLevel]       = useState(null)
  const [profileRisk, setProfileRisk]   = useState(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [toggles, setToggles]           = useState({ twofa: true, biometric: true, bgSync: true, labels: true, pulses: true })
  const [selects, setSelects]           = useState({ sessionTimeout: '1 hour', syncFreq: 'Every 15 minutes', currency: 'SGD', numFmt: '$1,234,567' })
  const [extensionGuideOpen, setExtensionGuideOpen] = useState(false)
  const [extensionStatus, setExtensionStatus] = useState('')

  const mark = () => setUnsaved(true)
  const setToggle = (k, v) => { setToggles(p => ({ ...p, [k]: v })); mark() }
  const setSelect = (k, v) => { setSelects(p => ({ ...p, [k]: v })); mark() }

  // Load user's current risk profile
  useEffect(() => {
    if (!user?.user_id) { setProfileLoaded(true); return }
    fetch(`${API}/users/${user.user_id}`)
      .then(r => r.json())
      .then(d => { if (d.user?.risk_profile) setProfileRisk(d.user.risk_profile) })
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
    if (user?.user_id && riskLevel) {
      try {
        await fetch(`${API}/users/risk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.user_id, risk_profile: SLIDER_KEY_TO_RISK[riskLevel.key] }),
        })
        setProfileRisk(SLIDER_KEY_TO_RISK[riskLevel.key])
      } catch (_) {}
    }
    setSaved(true); setUnsaved(false)
    setTimeout(() => setSaved(false), 2000)
  }

  const extensionPath = 'FinTech/chrome-extension'

  const handleInstallExtension = () => {
    let opened = false
    try {
      const popup = window.open('chrome://extensions', '_blank')
      opened = !!popup
    } catch {
      opened = false
    }
    setExtensionGuideOpen(true)
    setExtensionStatus(opened
      ? 'Chrome extensions opened. Use Load unpacked and select the WealthSphere extension folder.'
      : 'Automatic install is not supported by the browser, so use the guide below to load the extension manually.')
  }

  const handleCopyExtensionPath = async () => {
    try {
      await navigator.clipboard.writeText(extensionPath)
      setExtensionStatus('Extension folder path copied. Paste it into Chrome after clicking Load unpacked.')
    } catch {
      setExtensionStatus(`Extension folder: ${extensionPath}`)
    }
  }

  const riskInfo = RISK_KEY_TO_INFO[profileRisk] ?? RISK_KEY_TO_INFO.Moderate

  return createPortal(
    <div style={s.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.modal}>

        {/* ── Left tab rail ── */}
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

        {/* ── Right content ── */}
        <div style={s.body}>

          {/* Header bar */}
          <div style={s.header}>
            <div>
              <div style={s.eyebrow}>{SECTIONS.find(s => s.key === active)?.icon} {SECTIONS.find(s => s.key === active)?.label}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {unsaved && (
                <button style={s.btnSave} onClick={handleSave}>
                  {saved ? '✓ Saved!' : 'Save Changes'}
                </button>
              )}
              <button style={s.btnClose} onClick={onClose}>✕</button>
            </div>
          </div>

          {/* ── RISK PROFILE ── */}
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
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--teal)' }}>Scoring Factor: {riskInfo.factor}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 3 }}>
                      {profileRisk ? 'Saved to your profile' : 'Default — not yet saved'}
                    </div>
                  </div>
                  <button style={s.btnGhost} onClick={() => { setRiskOpen(r => !r); mark() }}>
                    {riskOpen ? 'Close ↑' : 'Adjust →'}
                  </button>
                </div>
                {riskOpen && (
                  <div style={{ animation: 'fadeUp 0.25s ease' }}>
                    {profileLoaded
                      ? <RiskSlider key={profileRisk ?? 'default'} initialPct={RISK_KEY_TO_PCT[profileRisk] ?? 50}
                          onChange={l => { setRiskLevel(l); mark() }} />
                      : <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>Loading…</div>
                    }
                  </div>
                )}
              </Card>

              <Card title="Rebalancing" icon="🎯">
                <Row name="Auto-rebalance suggestions" desc="AI-driven rebalancing when allocation drifts beyond target.">
                  <Toggle on={toggles.rebal ?? true} onChange={v => setToggle('rebal', v)} />
                </Row>
                <Row name="Rebalancing frequency" desc="How often to check if your portfolio needs rebalancing.">
                  <SelInput value={selects.rebalFreq ?? 'Quarterly'} opts={['Monthly','Quarterly','Semi-annually','Annually']}
                    onChange={v => setSelect('rebalFreq', v)} />
                </Row>
              </Card>
            </div>
          )}

          {/* ── PROFILE DETAILS ── */}
          {active === 'profile' && (
            <div style={s.content}>
              <p style={s.pageSub}>Update your personal information and display preferences.</p>
              <Card title="Personal Info" icon="👤">
                {[['First Name','Alex'],['Last Name','Chen'],['Email Address','alex@example.com']].map(([label, ph]) => (
                  <div key={label} style={{ marginBottom: 14 }}>
                    <div style={s.formLabel}>{label}</div>
                    <input style={s.formInput} defaultValue={ph} onChange={mark} />
                  </div>
                ))}
              </Card>
              <Card title="Preferences" icon="🌐">
                {[
                  ['Investor Type', ['Individual Investor','HNWI','Family Office','Institutional'], 'investorType'],
                  ['Primary Currency', ['SGD','USD','GBP','EUR'], 'currency'],
                  ['Country', ['Singapore','United Kingdom','United States','Australia','Japan'], 'country'],
                ].map(([label, opts, key]) => (
                  <Row key={label} name={label}>
                    <SelInput value={selects[key] ?? opts[0]} opts={opts} onChange={v => setSelect(key, v)} />
                  </Row>
                ))}
              </Card>
            </div>
          )}

          {/* ── APPEARANCE ── */}
          {active === 'display' && (
            <div style={s.content}>
              <p style={s.pageSub}>Customise how WealthSphere looks and behaves.</p>
              <Card title="Globe View" icon="🌍">
                <Row name="Show satellite labels" desc="Display asset class labels floating next to globe nodes.">
                  <Toggle on={toggles.labels} onChange={v => setToggle('labels', v)} />
                </Row>
                <Row name="Animate node pulses" desc="Animated pulsing rings around active portfolio nodes.">
                  <Toggle on={toggles.pulses} onChange={v => setToggle('pulses', v)} />
                </Row>
                <Row name="Globe rotation speed">
                  <SelInput value={selects.globeSpeed ?? 'Normal'} opts={['Off','Slow','Normal','Fast']} onChange={v => setSelect('globeSpeed', v)} />
                </Row>
                <Row name="Node size scaling">
                  <SelInput value={selects.nodeScale ?? 'Scale by AUM'} opts={['Scale by AUM','Equal size','Scale by performance']} onChange={v => setSelect('nodeScale', v)} />
                </Row>
              </Card>
              <Card title="Currency & Numbers" icon="💰">
                <Row name="Display currency" desc="All portfolio values converted to this currency.">
                  <SelInput value={selects.currency} opts={['SGD','USD','GBP','EUR']} onChange={v => setSelect('currency', v)} />
                </Row>
                <Row name="Number format">
                  <SelInput value={selects.numFmt} opts={['$1,234,567','$1.23M','$1.2m']} onChange={v => setSelect('numFmt', v)} />
                </Row>
              </Card>
            </div>
          )}

          {/* ── SECURITY & PRIVACY ── */}
          {active === 'security' && (
            <div style={s.content}>
              <p style={s.pageSub}>Manage your account security, 2FA, and data privacy preferences.</p>
              <Card title="Authentication" icon="🔐">
                <Row name="Two-factor authentication" desc="Require a second factor (authenticator app) on every login.">
                  <Toggle on={toggles.twofa} onChange={v => setToggle('twofa', v)} />
                </Row>
                <Row name="Biometric login" desc="Allow Face ID or fingerprint for quick access on mobile.">
                  <Toggle on={toggles.biometric} onChange={v => setToggle('biometric', v)} />
                </Row>
                <Row name="Session timeout" desc="Automatically log out after a period of inactivity.">
                  <SelInput value={selects.sessionTimeout} opts={['15 minutes','1 hour','4 hours','Never']} onChange={v => setSelect('sessionTimeout', v)} />
                </Row>
              </Card>
              <Card title="Danger Zone" icon="⚠️">
                {[
                  { title: 'Export portfolio data',     desc: 'Download a full CSV export of your portfolio history.',         btn: 'Export CSV',      red: false },
                  { title: 'Delete all portfolio data', desc: 'Permanently erase all portfolio data. Cannot be undone.',        btn: 'Delete Data',     red: true  },
                  { title: 'Close account',             desc: 'Permanently delete your WealthSphere account and all data.',     btn: 'Close Account',   red: true  },
                ].map(d => (
                  <div key={d.title} style={{ background: d.red ? 'rgba(248,113,113,0.04)' : 'var(--surface2)',
                    border: `1px solid ${d.red ? 'rgba(248,113,113,0.18)' : 'var(--border)'}`,
                    borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.86rem', color: d.red ? 'var(--red)' : 'var(--text)', marginBottom: 2 }}>{d.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{d.desc}</div>
                    </div>
                    <button style={{ background: 'transparent', border: `1px solid ${d.red ? 'rgba(248,113,113,0.4)' : 'var(--border)'}`,
                      color: d.red ? 'var(--red)' : 'var(--text)', padding: '8px 14px', borderRadius: 8,
                      fontFamily: 'var(--font-display)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>{d.btn}</button>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {/* ── DATA & API ── */}
          {active === 'data' && (
            <div style={s.content}>
              <p style={s.pageSub}>Control how WealthSphere syncs and connects to external services.</p>
              <Card title="Browser Extension" icon="🧩">
                <div style={s.extensionHero}>
                  <div style={s.extensionIcon}>↗</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1rem', marginBottom:6 }}>
                      Install the WealthSphere importer
                    </div>
                    <div style={{ fontSize:'0.8rem', color:'var(--text-dim)', lineHeight:1.65 }}>
                      Capture broker screenshots, parse holdings, and send them straight into your WealthSphere portfolio.
                    </div>
                  </div>
                  <button style={s.btnInstall} onClick={handleInstallExtension}>Install Extension</button>
                </div>
                {extensionStatus && (
                  <div style={s.extensionNotice}>{extensionStatus}</div>
                )}
                {extensionGuideOpen && (
                  <div style={s.extensionGuide}>
                    <div style={s.extensionGuideTitle}>Manual install guide</div>
                    <div style={s.extensionSteps}>
                      {[
                        'Open chrome://extensions in Chrome.',
                        'Turn on Developer mode in the top-right corner.',
                        'Click Load unpacked.',
                        'Select the WealthSphere extension folder.',
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
                )}
              </Card>
              <Card title="Sync Settings" icon="⚙️">
                <Row name="Auto-sync frequency" desc="How often WealthSphere pulls fresh data from connected sources.">
                  <SelInput value={selects.syncFreq} opts={['Every 5 minutes','Every 15 minutes','Every hour','Manual only']} onChange={v => setSelect('syncFreq', v)} />
                </Row>
                <Row name="Background sync" desc="Allow WealthSphere to sync data even when the app is not open.">
                  <Toggle on={toggles.bgSync} onChange={v => setToggle('bgSync', v)} />
                </Row>
              </Card>
              <Card title="API Access" icon="🔑">
                <Row name="Personal API key" desc="Use this key to access your WealthSphere data programmatically.">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '8px 12px', color: 'var(--text-faint)', letterSpacing: '0.05em' }}>ws_••••••••••••••••</div>
                    <button style={s.btnGhost} onClick={mark}>Reveal</button>
                  </div>
                </Row>
                <Row name="Webhook URL" desc="POST portfolio events to this endpoint when changes are detected.">
                  <input placeholder="https://your-endpoint.com/hook" style={{ ...s.formInput, minWidth: 220, marginBottom: 0 }} onChange={mark} />
                </Row>
              </Card>
            </div>
          )}

          {/* ── HELP CENTRE ── */}
          {active === 'help' && (
            <div style={s.content}>
              <p style={s.pageSub}>Find answers, read documentation, or get in touch with our team.</p>
              <Card title="Quick Links" icon="🔗">
                {[
                  { icon: '📖', title: 'Documentation',       desc: 'Full guides for every WealthSphere feature.',       href: '#' },
                  { icon: '🎥', title: 'Video Tutorials',      desc: 'Step-by-step walkthroughs for new users.',          href: '#' },
                  { icon: '💬', title: 'Community Forum',      desc: 'Ask questions and share ideas with other users.',   href: '#' },
                  { icon: '📮', title: 'Contact Support',      desc: 'Reach our team — we reply within 24 hours.',        href: '#' },
                ].map(l => (
                  <a key={l.title} href={l.href} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
                    borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface2)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>{l.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.87rem', marginBottom: 2 }}>{l.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{l.desc}</div>
                    </div>
                    <span style={{ color: 'var(--text-faint)', fontSize: '0.9rem' }}>→</span>
                  </a>
                ))}
              </Card>
              <Card title="App Info" icon="ℹ️">
                {[['Version','1.0.0-beta'],['Last updated','7 March 2026'],['Backend','FastAPI · localhost:8000'],['Frontend','React 18 + Vite']].map(([k,v]) => (
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
  btnClose: {
    width: 34, height: 34, borderRadius: '50%',
    border: '1px solid var(--border)', background: 'var(--surface2)',
    color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.85rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  btnSave: {
    background: 'var(--gold)', border: 'none', color: '#fff',
    padding: '9px 18px', borderRadius: 10, fontFamily: 'var(--font-display)',
    fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer',
  },
  btnGhost: {
    background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
    padding: '8px 14px', borderRadius: 10, fontFamily: 'var(--font-display)',
    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
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
