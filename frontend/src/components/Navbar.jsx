import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const NAV_LINKS = [
  { label: 'Globe',      path: '/' },
  { label: 'Portfolio',  path: '/profile' },
  { label: 'Markets',    path: '/crypto' },
]

export default function Navbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, logout } = useAuth()

  function handleSignOut() {
    logout()
    navigate('/')
  }

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
          const active = pathname === path
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
        {user ? (
          <>
            <button
              style={S.btnGold}
              onClick={() => navigate('/profile')}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >
              My Portfolio
            </button>
            <button
              style={S.btnGhost}
              onClick={handleSignOut}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'var(--text)' }}
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
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'var(--text)' }}
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
    padding: '15px 48px',
    background: 'linear-gradient(180deg, rgba(8,12,20,0.97) 0%, rgba(8,12,20,0.85) 100%)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  logo: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '1.25rem',
    letterSpacing: '0.05em',
    background: 'linear-gradient(135deg, var(--gold-light), var(--gold))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    userSelect: 'none',
  },
  logoDot: {
    width: 28, height: 28,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--gold), var(--teal))',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.9rem',
    WebkitTextFillColor: 'initial',
    color: '#fff',
    flexShrink: 0,
    boxShadow: '0 0 16px rgba(201,168,76,0.4)',
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
    cursor: 'pointer',
    transition: 'color 0.18s',
    userSelect: 'none',
    paddingBottom: 2,
  },
  linkActive: {
    color: 'var(--gold)',
    borderBottom: '1.5px solid var(--gold)',
  },
  btnGold: {
    background: 'linear-gradient(135deg, var(--gold), #b8922e)',
    border: '1px solid transparent',
    color: '#0d1220',
    padding: '8px 20px',
    borderRadius: 8,
    fontFamily: 'var(--font-body)',
    fontSize: '0.85rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 0 18px rgba(201,168,76,0.35)',
    transition: 'opacity 0.18s',
  },
  btnGhost: {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text-dim)',
    padding: '8px 20px',
    borderRadius: 8,
    fontFamily: 'var(--font-body)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    transition: 'all 0.18s',
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, var(--gold), #b8922e)',
    border: 'none',
    color: '#0d1220',
    padding: '9px 22px',
    borderRadius: 8,
    fontFamily: 'var(--font-body)',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(201,168,76,0.25)',
    transition: 'opacity 0.18s',
  },
}