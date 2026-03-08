import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import ThemeModal from './ThemeModal.jsx'
import SettingsModal from './SettingsModal.jsx'

const API = 'http://localhost:8000'
const NAV_LINKS = [
  { label: 'Finance Universe',      path: '/' },
  { label: 'Markets',    path: '/stocks' },
]

export default function Navbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
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
        <div style={S.logoDot}>◉</div>
        WealthSphere
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
              <button
                type="button"
                aria-label="Notifications"
                onClick={() => setNotifOpen(open => !open)}
                style={S.bellBtn}
              >
                <span style={{ fontSize:'1rem', lineHeight:1 }}>🔔</span>
                {notifications.length > 0 && (
                  <span style={S.bellBadge}>{notifications.length}</span>
                )}
              </button>
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
              onClick={() => navigate('/login')}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-act)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)' }}
            >
              Sign In
            </button>
            <button
              style={S.btnPrimary}
              onClick={() => navigate('/survey')}
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
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '1.2rem',
    letterSpacing: '-0.02em',
    color: 'var(--text)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    userSelect: 'none',
  },
  logoDot: {
    width: 28, height: 28,
    borderRadius: 10,
    background: 'var(--logo-bg)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.9rem',
    WebkitTextFillColor: 'initial',
    color: '#fff',
    flexShrink: 0,
    boxShadow: '0 10px 24px rgba(21,28,45,0.18)',
  },
  links: {
    display: 'flex',
    gap: 32,
    listStyle: 'none',
    margin: 0, padding: 0,
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
  bellBtn: {
    position:'relative',
    width:46,
    height:46,
    borderRadius:14,
    border:'1px solid var(--border)',
    background:'var(--surface)',
    color:'var(--text)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    cursor:'pointer',
    boxShadow:'0 10px 24px rgba(21,28,45,0.08)',
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
    top:6,
    right:6,
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
    background:'rgba(255,255,255,0.98)',
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
    background:'linear-gradient(135deg, rgba(109,141,247,0.04), rgba(42,184,163,0.04))',
    border:'1px solid var(--border)',
    borderRadius:14,
    padding:'14px 14px 12px',
  },
  notifTag: {
    display:'inline-flex',
    alignItems:'center',
    border:'1px solid',
    background:'rgba(255,255,255,0.7)',
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
    background:'rgba(255,255,255,0.72)',
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
