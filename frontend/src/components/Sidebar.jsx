import { useNavigate, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
  { icon: '🌍', label: 'Globe',     path: '/' },
  { icon: '👤', label: 'Profile',   path: '/profile' },
  { icon: '₿',  label: 'Crypto',    path: '/crypto' },
  { icon: '⚙️', label: 'Settings',  path: '/settings' },
  { icon: '📊', label: 'Analytics', path: null },
  { icon: '🔔', label: 'Alerts',    path: null },
]

export default function Sidebar() {
  const navigate  = useNavigate()
  const location  = useLocation()

  return (
    <aside style={styles.sidebar}>
      <div style={styles.logo}>◉</div>

      <nav style={styles.nav}>
        {NAV_ITEMS.map(item => {
          const active = item.path && location.pathname === item.path
          return (
            <div
              key={item.label}
              style={{ ...styles.navIcon, ...(active ? styles.navIconActive : {}) }}
              onClick={() => item.path && navigate(item.path)}
              title={item.label}
            >
              {item.icon}
              <span style={styles.tip}>{item.label}</span>
            </div>
          )
        })}
      </nav>

      <div style={styles.bottom}>
        <div style={styles.avatar} onClick={() => navigate('/profile')}>AC</div>
      </div>
    </aside>
  )
}

const styles = {
  sidebar: {
    width: 72, background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '20px 0',
    position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
  },
  logo: {
    width: 36, height: 36, borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--gold), var(--teal))',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1rem', marginBottom: 32,
    boxShadow: '0 0 16px rgba(201,168,76,0.3)', cursor: 'pointer',
  },
  nav: { display: 'flex', flexDirection: 'column', gap: 8, flex: 1 },
  navIcon: {
    width: 44, height: 44, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.1rem', cursor: 'pointer',
    color: 'var(--text-faint)', position: 'relative',
    transition: 'all 0.2s',
  },
  navIconActive: {
    background: 'rgba(201,168,76,0.12)',
    color: 'var(--gold)',
    boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.25)',
  },
  tip: {
    position: 'absolute', left: 'calc(100% + 12px)',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '5px 10px',
    fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
    color: 'var(--text)', whiteSpace: 'nowrap', pointerEvents: 'none',
    opacity: 0, transition: 'opacity 0.2s', zIndex: 100,
  },
  bottom: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' },
  avatar: {
    width: 36, height: 36, borderRadius: '50%',
    background: 'linear-gradient(135deg, #3b5bdb, #6e48c7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
    border: '2px solid var(--gold)',
    boxShadow: '0 0 10px rgba(201,168,76,0.25)',
  },
}