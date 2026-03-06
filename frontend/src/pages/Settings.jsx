import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import RiskSlider from '../components/RiskSlider.jsx'

const SECTIONS = [
  { group:'Portfolio',  items:[{key:'risk',label:'Risk Profile',icon:'⚖️'},{key:'accounts',label:'Connected Accounts',icon:'🔗'},{key:'assets',label:'Asset Preferences',icon:'📊'}] },
  { group:'Account',    items:[{key:'profile',label:'Profile Details',icon:'👤'},{key:'notifications',label:'Notifications',icon:'🔔'},{key:'security',label:'Security & Privacy',icon:'🔐'}] },
  { group:'Display',    items:[{key:'display',label:'Appearance',icon:'🎨'},{key:'data',label:'Data & API',icon:'📡'}] },
  { group:'Support',    items:[{key:'help',label:'Help Centre',icon:'❓'},{key:'log',label:'Changelog',icon:'📋'}] },
]

const ACCOUNTS = [
  { icon:'📈', bg:'rgba(96,165,250,0.1)',   name:'Interactive Brokers', meta:'4 accounts · Last synced 2 min ago',     connected:true },
  { icon:'🏦', bg:'rgba(201,168,76,0.1)',   name:'DBS Wealth',          meta:'2 accounts · Last synced 15 min ago',    connected:true },
  { icon:'💜', bg:'rgba(167,139,250,0.1)',  name:'Saxo Bank',           meta:'Not connected',                           connected:false },
  { icon:'⭐', bg:'rgba(251,191,36,0.1)',   name:'Tiger Brokers',       meta:'Not connected',                           connected:false },
  { icon:'🔷', bg:'rgba(45,212,191,0.1)',   name:'MetaMask (ETH)',      meta:'0x3a4f...b82c · $28,400 · Read-only',    connected:true, wallet:true },
  { icon:'🌊', bg:'rgba(248,113,113,0.1)',  name:'Phantom (SOL)',       meta:'Not connected',                           connected:false, wallet:true },
]

function Toggle({ on, onChange }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{ width:44, height:24, borderRadius:12, background: on ? 'rgba(45,212,191,0.3)' : 'var(--surface2)', border:`1px solid ${on ? 'var(--teal)' : 'var(--border)'}`, position:'relative', cursor:'pointer', transition:'all 0.3s', flexShrink:0 }}
    >
      <div style={{ position:'absolute', top:2, left: on ? 'calc(100% - 20px)' : 2, width:18, height:18, borderRadius:'50%', background: on ? 'var(--teal)' : 'var(--text-faint)', transition:'all 0.3s', boxShadow: on ? '0 0 8px rgba(45,212,191,0.5)' : 'none' }} />
    </div>
  )
}

function SettingRow({ name, desc, children }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 0', borderBottom:'1px solid var(--border)', gap:20 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:500, fontSize:'0.9rem', marginBottom:3 }}>{name}</div>
        <div style={{ fontSize:'0.77rem', color:'var(--text-dim)', lineHeight:1.5 }}>{desc}</div>
      </div>
      {children}
    </div>
  )
}

function SelInput({ value, opts, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontFamily:'var(--font-body)', fontSize:'0.87rem', outline:'none', minWidth:150, cursor:'pointer' }}>
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  )
}

export default function Settings() {
  const [activeKey, setActiveKey]         = useState('risk')
  const [saved, setSaved]                 = useState(false)
  const [unsaved, setUnsaved]             = useState(false)
  const [toggles, setToggles]             = useState({ autoRebal:true, bgSync:true, wellness:true, largeMove:true, priceAlert:true, digest:true, twofa:true, biometric:true, globeRotate:true, labels:true, pulses:true })
  const [selects, setSelects]             = useState({ rebalFreq:'Quarterly', driftThresh:'5%', syncFreq:'Every 15 minutes', currency:'SGD', numFmt:'$1,234,567', sessionTimeout:'1 hour' })
  const [riskOpen, setRiskOpen]           = useState(false)

  const markUnsaved = () => setUnsaved(true)
  const setToggle = (k, v) => { setToggles(p => ({...p,[k]:v})); markUnsaved() }
  const setSelect = (k, v) => { setSelects(p => ({...p,[k]:v})); markUnsaved() }

  const handleSave = () => {
    setSaved(true); setUnsaved(false)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <Sidebar />

      {/* Settings sub-nav */}
      <nav style={s.settingsNav}>
        <div style={s.settingsTitle}>Settings</div>
        {SECTIONS.map(sec => (
          <div key={sec.group} style={{ marginBottom:24 }}>
            <div style={s.groupLabel}>{sec.group}</div>
            {sec.items.map(item => (
              <div key={item.key}
                style={{ ...s.snavItem, ...(activeKey === item.key ? s.snavActive : {}) }}
                onClick={() => setActiveKey(item.key)}>
                <span style={s.snavIcon}>{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        ))}
      </nav>

      {/* Content */}
      <main style={s.content}>

        {/* ── RISK ── */}
        {activeKey === 'risk' && (
          <div style={s.section}>
            <div style={s.pageHeader}>
              <div style={s.eyebrow}>Portfolio Settings</div>
              <h1 style={s.pageTitle}>Risk Profile</h1>
              <p style={s.pageSub}>Your risk tolerance shapes wellness scoring, recommendations, and suggested allocations.</p>
            </div>

            <div style={s.riskPanel}>
              <div style={s.riskCurrent}>
                <div style={{ width:52, height:52, borderRadius:14, background:'rgba(201,168,76,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem', flexShrink:0 }}>⚖️</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:'1rem', marginBottom:2 }}>Balanced Portfolio</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--teal)' }}>Scoring Factor: 0.7</div>
                  <div style={{ fontSize:'0.74rem', color:'var(--text-faint)', marginTop:3 }}>Last updated: 7 days ago</div>
                </div>
                <button style={s.btnGhost} onClick={() => { setRiskOpen(r => !r); markUnsaved() }}>
                  {riskOpen ? 'Close ↑' : 'Adjust →'}
                </button>
              </div>

              {riskOpen && (
                <div style={{ marginTop:20, animation:'fadeInRight 0.3s ease' }}>
                  <RiskSlider initialPct={50} onChange={markUnsaved} />
                </div>
              )}
            </div>

            <div style={s.card}>
              <div style={s.cardTitle}><span>🎯</span> Rebalancing</div>
              <SettingRow name="Auto-rebalance suggestions" desc="Get AI-driven rebalancing recommendations when allocation drifts beyond target by ±5%.">
                <Toggle on={toggles.autoRebal} onChange={v => setToggle('autoRebal', v)} />
              </SettingRow>
              <SettingRow name="Rebalancing frequency" desc="How often to check if your portfolio needs rebalancing.">
                <SelInput value={selects.rebalFreq} opts={['Monthly','Quarterly','Semi-annually','Annually']} onChange={v => setSelect('rebalFreq', v)} />
              </SettingRow>
              <SettingRow name="Drift threshold" desc="Alert when any asset class deviates by more than this percentage.">
                <SelInput value={selects.driftThresh} opts={['3%','5%','10%']} onChange={v => setSelect('driftThresh', v)} />
              </SettingRow>
            </div>
          </div>
        )}

        {/* ── ACCOUNTS ── */}
        {activeKey === 'accounts' && (
          <div style={s.section}>
            <div style={s.pageHeader}>
              <div style={s.eyebrow}>Portfolio Settings</div>
              <h1 style={s.pageTitle}>Connected Accounts</h1>
              <p style={s.pageSub}>All connections use read-only OAuth — we never access trading or withdrawal permissions.</p>
            </div>

            {['Brokerages & Banks','Digital Wallets'].map((group, gi) => (
              <div key={group} style={s.card}>
                <div style={s.cardTitle}><span>{gi === 0 ? '🏦' : '₿'}</span> {group}</div>
                {ACCOUNTS.filter(a => !!a.wallet === (gi === 1)).map(acct => (
                  <div key={acct.name} style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ width:42, height:42, borderRadius:12, background:acct.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', flexShrink:0 }}>{acct.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:'0.9rem', marginBottom:2 }}>{acct.name}</div>
                      <div style={{ fontSize:'0.74rem', color:'var(--text-dim)' }}>{acct.meta}</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'var(--font-mono)', fontSize:'0.7rem', padding:'4px 10px', borderRadius:8, background: acct.connected ? 'rgba(52,211,153,0.1)' : 'var(--surface2)', color: acct.connected ? 'var(--green)' : 'var(--text-faint)', border:`1px solid ${acct.connected ? 'rgba(52,211,153,0.2)' : 'var(--border)'}`, flexShrink:0 }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background: acct.connected ? 'var(--green)' : 'var(--text-faint)' }} />
                      {acct.connected ? 'Connected' : 'Inactive'}
                    </div>
                    <button
                      onClick={markUnsaved}
                      style={{ background:'transparent', border:`1px solid ${acct.connected ? 'rgba(248,113,113,0.3)' : 'rgba(45,212,191,0.3)'}`, color: acct.connected ? 'var(--red)' : 'var(--teal)', padding:'7px 14px', borderRadius:8, fontFamily:'var(--font-display)', fontSize:'0.78rem', fontWeight:600, cursor:'pointer' }}>
                      {acct.connected ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
            ))}

            <div style={s.card}>
              <div style={s.cardTitle}><span>⚙️</span> Sync Settings</div>
              <SettingRow name="Auto-sync frequency" desc="How often WealthSphere pulls fresh data from connected sources.">
                <SelInput value={selects.syncFreq} opts={['Every 5 minutes','Every 15 minutes','Every hour','Manual only']} onChange={v => setSelect('syncFreq', v)} />
              </SettingRow>
              <SettingRow name="Background sync" desc="Allow WealthSphere to sync data even when the app is not open.">
                <Toggle on={toggles.bgSync} onChange={v => setToggle('bgSync', v)} />
              </SettingRow>
            </div>
          </div>
        )}

        {/* ── NOTIFICATIONS ── */}
        {activeKey === 'notifications' && (
          <div style={s.section}>
            <div style={s.pageHeader}>
              <div style={s.eyebrow}>Account Settings</div>
              <h1 style={s.pageTitle}>Notifications</h1>
              <p style={s.pageSub}>Control how and when WealthSphere keeps you informed.</p>
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}><span>📊</span> Portfolio Alerts</div>
              {[
                { key:'wellness', name:'Wellness score change',    desc:'Alert when your score moves by more than 5 points.' },
                { key:'largeMove',name:'Large portfolio movement', desc:'Alert when daily P&L exceeds ±2% of total AUM.' },
              ].map(n => (
                <SettingRow key={n.key} name={n.name} desc={n.desc}>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <SelInput value="Email" opts={['Push','Email','Both']} onChange={markUnsaved} />
                    <Toggle on={toggles[n.key]} onChange={v => setToggle(n.key, v)} />
                  </div>
                </SettingRow>
              ))}
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}><span>📈</span> Market Alerts</div>
              {[
                { key:'priceAlert', name:'Price target reached', desc:'Get notified when a tracked asset hits your custom price target.' },
                { key:'digest',     name:'Weekly digest',        desc:'Sunday morning summary of your week\'s performance and insights.' },
              ].map(n => (
                <SettingRow key={n.key} name={n.name} desc={n.desc}>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <SelInput value="Email" opts={['Push','Email','Both']} onChange={markUnsaved} />
                    <Toggle on={toggles[n.key]} onChange={v => setToggle(n.key, v)} />
                  </div>
                </SettingRow>
              ))}
            </div>
          </div>
        )}

        {/* ── DISPLAY ── */}
        {activeKey === 'display' && (
          <div style={s.section}>
            <div style={s.pageHeader}>
              <div style={s.eyebrow}>Display Settings</div>
              <h1 style={s.pageTitle}>Appearance</h1>
              <p style={s.pageSub}>Customise how WealthSphere looks and feels.</p>
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}><span>🌍</span> Globe View</div>
              <SettingRow name="Globe rotation speed" desc="Adjust the idle auto-rotation speed of the portfolio globe.">
                <SelInput value="Normal" opts={['Off','Slow','Normal','Fast']} onChange={markUnsaved} />
              </SettingRow>
              <SettingRow name="Node size scaling" desc="Scale portfolio nodes by AUM value vs. equal size for all.">
                <SelInput value="Scale by AUM" opts={['Scale by AUM','Equal size','Scale by performance']} onChange={markUnsaved} />
              </SettingRow>
              <SettingRow name="Show satellite labels" desc="Display asset class labels floating next to globe nodes.">
                <Toggle on={toggles.labels} onChange={v => setToggle('labels', v)} />
              </SettingRow>
              <SettingRow name="Animate node pulses" desc="Show animated pulsing rings around active portfolio nodes.">
                <Toggle on={toggles.pulses} onChange={v => setToggle('pulses', v)} />
              </SettingRow>
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}><span>💰</span> Currency & Numbers</div>
              <SettingRow name="Display currency" desc="All portfolio values will be converted to this currency for display.">
                <SelInput value={selects.currency} opts={['SGD','USD','GBP','EUR']} onChange={v => setSelect('currency', v)} />
              </SettingRow>
              <SettingRow name="Number format" desc="How large numbers are displayed throughout the app.">
                <SelInput value={selects.numFmt} opts={['$1,234,567','$1.23M','$1.2m']} onChange={v => setSelect('numFmt', v)} />
              </SettingRow>
            </div>
          </div>
        )}

        {/* ── SECURITY ── */}
        {activeKey === 'security' && (
          <div style={s.section}>
            <div style={s.pageHeader}>
              <div style={s.eyebrow}>Account Settings</div>
              <h1 style={s.pageTitle}>Security & Privacy</h1>
              <p style={s.pageSub}>Manage your account security, 2FA, and data privacy preferences.</p>
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}><span>🔐</span> Authentication</div>
              <SettingRow name="Two-factor authentication" desc="Require a second factor (authenticator app) on every login.">
                <Toggle on={toggles.twofa} onChange={v => setToggle('twofa', v)} />
              </SettingRow>
              <SettingRow name="Biometric login" desc="Allow Face ID or fingerprint for quick access on mobile.">
                <Toggle on={toggles.biometric} onChange={v => setToggle('biometric', v)} />
              </SettingRow>
              <SettingRow name="Session timeout" desc="Automatically log out after a period of inactivity.">
                <SelInput value={selects.sessionTimeout} opts={['15 minutes','1 hour','4 hours','Never']} onChange={v => setSelect('sessionTimeout', v)} />
              </SettingRow>
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}><span>⚠️</span> Danger Zone</div>
              {[
                { title:'Export portfolio data',      desc:'Download a full CSV export of your portfolio history.',                     btnLabel:'Export CSV' },
                { title:'Delete all portfolio data',  desc:'Permanently erase all portfolio data. This cannot be undone.',              btnLabel:'Delete Data' },
                { title:'Close account',              desc:'Permanently delete your WealthSphere account and all associated data.',     btnLabel:'Close Account' },
              ].map(d => (
                <div key={d.title} style={{ background:'rgba(248,113,113,0.04)', border:'1px solid rgba(248,113,113,0.15)', borderRadius:14, padding:'18px 22px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:20, marginBottom:10 }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:'0.9rem', color:'var(--red)', marginBottom:3 }}>{d.title}</div>
                    <div style={{ fontSize:'0.77rem', color:'var(--text-dim)' }}>{d.desc}</div>
                  </div>
                  <button style={{ background:'transparent', border:'1px solid rgba(248,113,113,0.4)', color:'var(--red)', padding:'9px 16px', borderRadius:8, fontFamily:'var(--font-display)', fontSize:'0.82rem', fontWeight:600, cursor:'pointer', flexShrink:0 }}>{d.btnLabel}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fallback for unbuilt sections */}
        {!['risk','accounts','notifications','display','security'].includes(activeKey) && (
          <div style={s.section}>
            <div style={s.pageHeader}>
              <h1 style={s.pageTitle}>Coming soon</h1>
              <p style={s.pageSub}>This section is under construction.</p>
            </div>
          </div>
        )}

      </main>

      {/* Save banner */}
      {unsaved && (
        <div style={s.saveBanner}>
          <div style={{ fontSize:'0.87rem', color:'var(--text-dim)' }}><strong style={{ color:'var(--text)' }}>Unsaved changes</strong> — Your settings have been modified.</div>
          <button style={s.btnDiscard} onClick={() => setUnsaved(false)}>Discard</button>
          <button style={{ ...s.btnSave, ...(saved ? { background:'linear-gradient(135deg,var(--green),#059669)', boxShadow:'0 4px 16px rgba(52,211,153,0.3)' } : {}) }} onClick={handleSave}>
            {saved ? '✓ Saved!' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}

const s = {
  settingsNav: {
    width:230, background:'var(--surface)', borderRight:'1px solid var(--border)',
    padding:'40px 18px', flexShrink:0, position:'sticky', top:0, height:'100vh',
    overflowY:'auto', marginLeft:72,
  },
  settingsTitle: { fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem', marginBottom:28, padding:'0 6px' },
  groupLabel: { fontFamily:'var(--font-mono)', fontSize:'0.6rem', color:'var(--text-faint)', textTransform:'uppercase', letterSpacing:'0.15em', padding:'0 8px', marginBottom:6 },
  snavItem: {
    display:'flex', alignItems:'center', gap:9, padding:'10px 12px',
    borderRadius:10, cursor:'pointer', transition:'all 0.2s',
    color:'var(--text-dim)', fontSize:'0.87rem', border:'1px solid transparent', marginBottom:2,
  },
  snavActive: { background:'rgba(201,168,76,0.08)', borderColor:'rgba(201,168,76,0.2)', color:'var(--gold)' },
  snavIcon: { fontSize:'0.88rem', width:20, textAlign:'center' },
  content: { flex:1, padding:'40px 52px', overflowY:'auto' },
  section: { maxWidth:780 },
  pageHeader: { marginBottom:32 },
  eyebrow: { fontFamily:'var(--font-mono)', fontSize:'0.67rem', color:'var(--teal)', textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:6 },
  pageTitle: { fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.6rem', marginBottom:6 },
  pageSub: { color:'var(--text-dim)', fontSize:'0.89rem', lineHeight:1.65 },
  riskPanel: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:26, marginBottom:24 },
  riskCurrent: {
    display:'flex', alignItems:'center', gap:18,
    background:'var(--surface2)', border:'1px solid var(--border)',
    borderRadius:14, padding:'14px 18px',
  },
  card: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:22, marginBottom:20 },
  cardTitle: {
    fontFamily:'var(--font-display)', fontWeight:700, fontSize:'0.95rem',
    marginBottom:14, paddingBottom:12, borderBottom:'1px solid var(--border)',
    display:'flex', alignItems:'center', gap:8,
  },
  btnGhost: { background:'transparent', border:'1px solid var(--border)', color:'var(--text-dim)', padding:'8px 16px', borderRadius:8, fontFamily:'var(--font-display)', fontSize:'0.82rem', fontWeight:600, cursor:'pointer' },
  saveBanner: {
    position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)',
    background:'var(--surface2)', border:'1px solid var(--border)',
    borderRadius:14, padding:'13px 24px',
    display:'flex', alignItems:'center', gap:14,
    boxShadow:'0 8px 32px rgba(0,0,0,0.4)',
    backdropFilter:'blur(12px)', zIndex:200,
    animation:'fadeUp 0.3s ease',
  },
  btnDiscard: { background:'transparent', border:'1px solid var(--border)', color:'var(--text-dim)', padding:'9px 14px', borderRadius:8, fontFamily:'var(--font-display)', fontSize:'0.83rem', cursor:'pointer' },
  btnSave: { background:'linear-gradient(135deg,var(--gold),#b8922e)', border:'none', color:'#080c14', padding:'9px 22px', borderRadius:8, fontFamily:'var(--font-display)', fontSize:'0.85rem', fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(201,168,76,0.3)', transition:'all 0.3s' },
}
