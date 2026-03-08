import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLoginModal } from '../context/LoginModalContext.jsx'
import ThemeModal from './ThemeModal.jsx'
import SettingsModal from './SettingsModal.jsx'

const API = 'http://localhost:8000'
const NAV_LINKS = [
  { label: 'Home',      path: '/' },
  { label: 'Markets',    path: '/stocks' },
]

function isAccountAtLeastDaysOld(createdAt, minDays = 30) {
  if (!createdAt) return false
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return false
  return Date.now() - created.getTime() >= minDays * 24 * 60 * 60 * 1000
}

function hasFinancialActivity(profile) {
  if (!profile || typeof profile !== 'object') return false

  const portfolio = profile.portfolio && typeof profile.portfolio === 'object' ? profile.portfolio : {}
  const portfolioBuckets = ['stocks', 'cryptos', 'commodities']
  const hasPortfolioPositions = portfolioBuckets.some(bucket =>
    Array.isArray(portfolio[bucket]) && portfolio[bucket].some(item =>
      Number(item?.qty || 0) > 0 || Number(item?.market_value || 0) > 0
    )
  )

  const hasManualAssets = Array.isArray(profile.manual_assets) && profile.manual_assets.some(item => Number(item?.value || 0) > 0)
  const hasIncomeStreams = Array.isArray(profile.income_streams) && profile.income_streams.some(item => Number(item?.monthly_amount || 0) > 0)
  const hasLiabilityItems = Array.isArray(profile.liability_items) && profile.liability_items.some(item => Number(item?.amount || 0) > 0)

  return hasPortfolioPositions || hasManualAssets || hasIncomeStreams || hasLiabilityItems
}

export default function Navbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const { setLoginModalOpen, setSurveyModalOpen } = useLoginModal()
  const [navProfile, setNavProfile] = useState(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [expandedNotifId, setExpandedNotifId] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [themeModalOpen, setThemeModalOpen] = useState(false)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const notifRef = useRef(null)
  const settingsRef = useRef(null)

  function handleSignOut() {
    logout()
    navigate('/')
  }

  useEffect(() => {
    if (!user?.user_id) {
      setNavProfile(null)
      return
    }
    let cancelled = false
    async function loadUser() {
      try {
        const res = await fetch(`${API}/users/${user.user_id}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setNavProfile(data.user ?? null)
      } catch {
        if (!cancelled) setNavProfile(null)
      }
    }
    loadUser()
    return () => { cancelled = true }
  }, [user?.user_id, pathname])

  useEffect(() => {
    if (!notifOpen) return
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false)
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setNotifOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [notifOpen])

  useEffect(() => {
    if (!settingsOpen) return
    function handleClickOutside(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setSettingsOpen(false)
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [settingsOpen])

  const notifications = useMemo(() => {
    if (!navProfile) return []
    if (!isAccountAtLeastDaysOld(user?.created_at, 30)) return []
    if (!hasFinancialActivity(navProfile)) return []
    const cashBalance = Number(navProfile.cash_balance || 0)
    const monthlyIncome = Number(navProfile.income || 0)
    const reserveTarget = Math.max(monthlyIncome * 3, 10000)
    const idleCash = Math.max(0, cashBalance - reserveTarget)
    const potentialAnnualGrowth = idleCash * 0.05
    const items = []

    if (idleCash >= 5000) {
      const suggestedMove = Math.round(idleCash * 0.6)
      items.push({
        id:'latent-growth-idle-cash',
        tone:'var(--teal)',
        label:'Latent growth detected',
        title:`Potential +${new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(potentialAnnualGrowth)}/year from idle cash`,
        body:`About ${new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(idleCash)} is sitting above a 3-month reserve. Redirecting part of it into your portfolio could improve long-term growth.`,
        detailTitle:'Suggested next step',
        details:[
          `Keep about ${new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(reserveTarget)} in cash as your current emergency reserve.`,
          `Consider moving roughly ${new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(suggestedMove)} of the excess into long-term investments instead of leaving it idle.`,
          'Do it gradually in 2 to 4 entries if you want to reduce timing risk.',
        ],
        cta:'Review optimization',
      })
    }

    return items
  }, [navProfile])

  return (
    <nav style={S.nav}>
      {/* Logo */}
      <div style={S.logo} onClick={() => navigate('/')}>
        <img src="/logo.png" alt="Logo" style={S.logoImage} />
        <span style={S.logoText}>Unova</span>
      </div>

      {/* Links */}
      <ul style={S.links}>
        {NAV_LINKS.map(({ label, path }) => {
          const active = label === 'Markets'
            ? ['/stocks', '/commodities', '/crypto'].includes(pathname)
            : pathname === path
          return (
            <li key={label}>
              <span
                onClick={() => navigate(path)}
                style={{
                  ...S.link,
                  ...(active ? S.linkActive : {}),
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-dim)' }}
              >
                {label}
              </span>
            </li>
          )
        })}
      </ul>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div ref={settingsRef} style={{ position:'relative' }}>
          <button
            type="button"
            aria-label="View settings menu"
            title="Settings"
            onClick={() => setSettingsOpen(open => !open)}
            style={S.settingsBtn}
          >
            <svg viewBox="0 0 512 512" style={{ height:16, fill:'currentColor' }}>
              <path d="M0 416c0 17.7 14.3 32 32 32l54.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48L480 448c17.7 0 32-14.3 32-32s-14.3-32-32-32l-246.7 0c-12.3-28.3-40.5-48-73.3-48s-61 19.7-73.3 48L32 384c-17.7 0-32 14.3-32 32zm128 0a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zM320 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm32-80c-32.8 0-61 19.7-73.3 48L32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l246.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48l54.7 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-54.7 0c-12.3-28.3-40.5-48-73.3-48zM192 128a32 32 0 1 1 0-64 32 32 0 1 1 0 64zm73.3-64C253 35.7 224.8 16 192 16s-61 19.7-73.3 48L32 64C14.3 64 0 78.3 0 96s14.3 32 32 32l86.7 0c12.3 28.3 40.5 48 73.3 48s61-19.7 73.3-48L480 128c17.7 0 32-14.3 32-32s-14.3-32-32-32L265.3 64z" />
            </svg>
          </button>
          {settingsOpen && (
            <div style={S.settingsMenu}>
              {[
                { icon:'🎨', label:'Change Theme', action:() => { setSettingsOpen(false); setThemeModalOpen(true) } },
                { icon:'⚙️', label:'Settings', action:() => { setSettingsOpen(false); setSettingsModalOpen(true) } },
              ].map((item, i, arr) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action}
                  style={{
                    ...S.settingsItem,
                    borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <span style={{ fontSize:'1rem' }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {user ? (
          <>
            <div ref={notifRef} style={{ position:'relative' }}>
              <div style={S.bellWrapper} onClick={() => setNotifOpen(open => !open)}>
                <label className="bell-container">
                  <input type="checkbox" checked={notifOpen} readOnly />
                  <svg className="bell-regular" xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 448 512">
                    <path d="M224 0c-17.7 0-32 14.3-32 32V49.9C119.5 61.4 64 124.2 64 200v33.4c0 45.4-15.5 89.5-43.8 124.9L5.3 377c-5.8 7.2-6.9 17.1-2.9 25.4S14.8 416 24 416H424c9.2 0 17.6-5.3 21.6-13.6s2.9-18.2-2.9-25.4l-14.9-18.6C399.5 322.9 384 278.8 384 233.4V200c0-75.8-55.5-138.6-128-150.1V32c0-17.7-14.3-32-32-32zm0 96h8c57.4 0 104 46.6 104 104v33.4c0 47.9 13.9 94.6 39.7 134.6H72.3C98.1 328 112 281.3 112 233.4V200c0-57.4 46.6-104 104-104h8zm64 352H224 160c0 17 6.7 33.3 18.7 45.3s28.3 18.7 45.3 18.7s33.3-6.7 45.3-18.7s18.7-28.3 18.7-45.3z"></path>
                  </svg>
                  <svg className="bell-solid" xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 448 512">
                    <path d="M224 0c-17.7 0-32 14.3-32 32V51.2C119 66 64 130.6 64 208v18.8c0 47-17.3 92.4-48.5 127.6l-7.4 8.3c-8.4 9.4-10.4 22.9-5.3 34.4S19.4 416 32 416H416c12.6 0 24-7.4 29.2-18.9s3.1-25-5.3-34.4l-7.4-8.3C401.3 319.2 384 273.9 384 226.8V208c0-77.4-55-142-128-156.8V32c0-17.7-14.3-32-32-32zm45.3 493.3c12-12 18.7-28.3 18.7-45.3H224 160c0 17 6.7 33.3 18.7 45.3s28.3 18.7 45.3 18.7s33.3-6.7 45.3-18.7z"></path>
                  </svg>
                </label>
                {notifications.length > 0 && (
                  <span style={S.bellBadge}>{notifications.length}</span>
                )}
              </div>
              {notifOpen && (
                <div style={S.notifPanel}>
                  <div style={S.notifHeader}>
                    <span>Notifications</span>
                    <span style={S.notifCount}>{notifications.length}</span>
                  </div>
                  <div style={S.notifList}>
                    {notifications.length === 0 ? (
                      <div style={S.notifEmpty}>No new notifications.</div>
                    ) : (
                      notifications.map(item => (
                        <div key={item.id} style={S.notifCard}>
                          <div style={{ ...S.notifTag, color:item.tone, borderColor:`${item.tone}33` }}>{item.label}</div>
                          <div style={S.notifTitle}>{item.title}</div>
                          <div style={S.notifBody}>{item.body}</div>
                          {expandedNotifId === item.id && (
                            <div style={S.notifDetailBox}>
                              <div style={S.notifDetailTitle}>{item.detailTitle}</div>
                              <div style={S.notifDetailList}>
                                {item.details?.map((detail, index) => (
                                  <div key={`${item.id}-${index}`} style={S.notifDetailRow}>
                                    <span style={{ ...S.notifDetailDot, background:item.tone }} />
                                    <span>{detail}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <button
                            type="button"
                            style={{ ...S.notifAction, color:item.tone }}
                            onClick={() => setExpandedNotifId(current => current === item.id ? null : item.id)}
                          >
                            {expandedNotifId === item.id ? 'Hide optimization' : item.cta}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              style={S.btnGold}
              onClick={() => navigate('/profile')}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >
              Portfolio
            </button>
            <button
              style={S.btnGhost}
              onClick={handleSignOut}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-act)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <button
              style={S.btnGhost}
              onClick={() => setLoginModalOpen(true)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-act)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
            >
              Sign In
            </button>
            <button
              style={S.btnPrimary}
              onClick={() => setSurveyModalOpen(true)}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.88' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >
              Get Started
            </button>
          </>
        )}
      </div>
      <ThemeModal open={themeModalOpen} onClose={() => setThemeModalOpen(false)} />
      {settingsModalOpen && <SettingsModal onClose={() => setSettingsModalOpen(false)} />}
    </nav>
  )
}

const S = {
  nav: {
    position: 'fixed',
    top: 0, // fixed to top of viewport
    left: 0, right: 0,
    zIndex: 101,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 40px',
    background: 'var(--nav-bg)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    borderBottom: '1px solid var(--border)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    userSelect: 'none',
  },
  logoImage: {
    height: 40,
    width: 'auto',
    objectFit: 'contain',
    flexShrink: 0,
    background: 'transparent',
    borderRadius: '8px',
  },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '1.2rem',
    letterSpacing: '-0.02em',
    color: 'var(--text)',
  },
  links: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 32,
    listStyle: 'none',
    margin: 0, padding: 0,
    alignItems: 'center',
  },
  link: {
    color: 'var(--text-dim)',
    fontSize: '0.88rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'color 0.18s',
    userSelect: 'none',
    paddingBottom: 6,
  },
  linkActive: {
    color: 'var(--text)',
    borderBottom: '2px solid var(--text)',
  },
  btnGold: {
    background: 'var(--btn-primary-bg)',
    border: '1px solid var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    padding: '9px 20px',
    borderRadius: 12,
    fontFamily: 'var(--font-body)',
    fontSize: '0.85rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(21,28,45,0.12)',
    transition: 'opacity 0.18s',
  },
  btnGhost: {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: 'var(--text-dim)',
    padding: '9px 20px',
    borderRadius: 12,
    fontFamily: 'var(--font-body)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    transition: 'all 0.18s',
  },
  btnPrimary: {
    background: 'var(--btn-primary-bg)',
    border: 'none',
    color: 'var(--btn-primary-text)',
    padding: '9px 22px',
    borderRadius: 12,
    fontFamily: 'var(--font-body)',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(21,28,45,0.12)',
    transition: 'opacity 0.18s',
  },
  bellWrapper: {
    position:'relative',
    width:46,
    height:46,
    borderRadius:14,
    border:'1px solid var(--border)',
    background:'var(--surface)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    boxShadow:'0 10px 24px rgba(21,28,45,0.08)',
    cursor:'pointer',
  },
  settingsBtn: {
    width:46,
    height:46,
    borderRadius:14,
    border:'1px solid var(--border)',
    background:'var(--surface)',
    color:'var(--text-dim)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    cursor:'pointer',
    boxShadow:'0 10px 24px rgba(21,28,45,0.08)',
    transition:'all 0.18s',
  },
  settingsMenu: {
    position:'absolute',
    top:'calc(100% + 12px)',
    right:0,
    background:'var(--surface)',
    border:'1px solid var(--border)',
    borderRadius:14,
    overflow:'hidden',
    boxShadow:'0 16px 48px rgba(15,23,42,0.16)',
    display:'flex',
    flexDirection:'column',
    minWidth:190,
    zIndex:120,
  },
  settingsItem: {
    display:'flex',
    alignItems:'center',
    gap:12,
    background:'transparent',
    border:'none',
    padding:'13px 18px',
    cursor:'pointer',
    fontFamily:'var(--font-display)',
    fontSize:'0.88rem',
    color:'var(--text)',
    textAlign:'left',
  },
  bellBadge: {
    position:'absolute',
    top:-2,
    right:-2,
    minWidth:18,
    height:18,
    padding:'0 5px',
    borderRadius:999,
    background:'var(--teal)',
    color:'#041015',
    fontFamily:'var(--font-mono)',
    fontSize:'0.62rem',
    fontWeight:700,
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    border:'1px solid rgba(42,184,163,0.22)',
  },
  notifPanel: {
    position:'absolute',
    top:'calc(100% + 12px)',
    right:0,
    width:360,
    maxHeight:420,
    background:'var(--surface)',
    border:'1px solid var(--border)',
    borderRadius:18,
    boxShadow:'0 24px 48px rgba(15,23,42,0.16)',
    overflow:'hidden',
  },
  notifHeader: {
    display:'flex',
    alignItems:'center',
    justifyContent:'space-between',
    padding:'14px 16px 12px',
    borderBottom:'1px solid var(--border)',
    fontFamily:'var(--font-display)',
    fontSize:'0.98rem',
    fontWeight:700,
    color:'var(--text)',
  },
  notifCount: {
    fontFamily:'var(--font-mono)',
    fontSize:'0.68rem',
    color:'var(--teal)',
    background:'rgba(42,184,163,0.08)',
    border:'1px solid rgba(42,184,163,0.18)',
    borderRadius:999,
    padding:'4px 8px',
  },
  notifList: {
    maxHeight:360,
    overflowY:'auto',
    padding:12,
    display:'grid',
    gap:10,
  },
  notifEmpty: {
    padding:'18px 12px',
    fontSize:'0.84rem',
    color:'var(--text-faint)',
    textAlign:'center',
  },
  notifCard: {
    background:'var(--surface2)',
    border:'1px solid var(--border)',
    borderRadius:14,
    padding:'14px 14px 12px',
  },
  notifTag: {
    display:'inline-flex',
    alignItems:'center',
    border:'1px solid',
    background:'var(--surface)',
    borderRadius:999,
    padding:'4px 8px',
    fontFamily:'var(--font-mono)',
    fontSize:'0.62rem',
    letterSpacing:'0.05em',
    marginBottom:10,
  },
  notifTitle: {
    fontFamily:'var(--font-display)',
    fontSize:'1rem',
    fontWeight:700,
    color:'var(--text)',
    lineHeight:1.35,
    marginBottom:8,
  },
  notifBody: {
    fontSize:'0.82rem',
    color:'var(--text-dim)',
    lineHeight:1.65,
    marginBottom:10,
  },
  notifDetailBox: {
    background:'var(--surface)',
    border:'1px solid var(--border)',
    borderRadius:12,
    padding:'12px 12px 10px',
    marginBottom:10,
  },
  notifDetailTitle: {
    fontFamily:'var(--font-display)',
    fontSize:'0.86rem',
    fontWeight:700,
    color:'var(--text)',
    marginBottom:8,
  },
  notifDetailList: {
    display:'grid',
    gap:8,
  },
  notifDetailRow: {
    display:'flex',
    alignItems:'flex-start',
    gap:8,
    fontSize:'0.78rem',
    color:'var(--text-dim)',
    lineHeight:1.6,
  },
  notifDetailDot: {
    width:7,
    height:7,
    borderRadius:'50%',
    marginTop:6,
    flexShrink:0,
  },
  notifAction: {
    appearance:'none',
    WebkitAppearance:'none',
    border:'none',
    background:'transparent',
    padding:0,
    fontFamily:'var(--font-body)',
    fontSize:'0.8rem',
    fontWeight:700,
    cursor:'pointer',
  },
}
