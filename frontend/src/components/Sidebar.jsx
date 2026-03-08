import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import SettingsModal from './SettingsModal.jsx'

const NAV_GROUPS = [
  {
    label: 'Main',
    items: [
      { icon: '🌍', label: 'Globe', path: '/' },
      { icon: '👤', label: 'Profile', path: '/profile' },
      { icon: '📈', label: 'Stocks', path: '/stocks' },
      { icon: '🪙', label: 'Commodities', path: '/commodities' },
      { icon: '₿', label: 'Crypto', path: '/crypto' },
    ],
  },
  {
    label: 'Other',
    items: [
      { icon: '⚙️', label: 'Settings', path: null, modal: 'settings' },
      { icon: '🔔', label: 'Alerts', path: null },
      { icon: '❓', label: 'Help', path: null },
    ],
  },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const displayName = user?.username || 'Unova User'
  const initials = displayName
    .split(/\s+/)
    .map(part => part[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join('') || 'WS'

  return (
    <aside style={styles.sidebar}>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <div>
        <div style={styles.brandWrap}>
          <div style={styles.brandIcon}>◈</div>
          <div>
            <div style={styles.brandTitle}>Unova</div>
            <div style={styles.brandSub}>Finance App</div>
          </div>
        </div>

        {NAV_GROUPS.map(group => (
          <div key={group.label} style={styles.group}>
            <div style={styles.groupLabel}>{group.label}</div>
            <div style={styles.groupList}>
              {group.items.map(item => {
                const active = item.path && location.pathname === item.path
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      if (item.modal === 'settings') { setSettingsOpen(true); return }
                      item.path && navigate(item.path)
                    }}
                    style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}
                  >
                    <span style={styles.navIcon}>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.lower}>
        <div style={styles.supportCard}>
          <div style={styles.supportTitle}>Need support?</div>
          <div style={styles.supportText}>Contact one of our experts for help with setup and account preferences.</div>
          <button type="button" style={styles.supportBtn}>Contact Us</button>
        </div>

        <div style={styles.profileCard}>
          <div style={styles.avatar}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div style={styles.profileName}>{displayName}</div>
            <div style={styles.profileMeta}>Personal workspace</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

const styles = {
  sidebar: {
    width: 'var(--sidebar-w)',
    background: '#060914',
    color: '#eef2ff',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '26px 16px 18px',
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 50,
    boxShadow: '18px 0 42px rgba(4,7,15,0.18)',
  },
  brandWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 30,
    padding: '2px 8px',
  },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: 'linear-gradient(135deg,#0f1729,#1d2738)',
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.05rem',
    boxShadow: '0 14px 28px rgba(0,0,0,0.28)',
  },
  brandTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '1rem',
    color: '#f9fbff',
  },
  brandSub: {
    color: 'rgba(225,230,244,0.62)',
    fontSize: '0.78rem',
    marginTop: 2,
  },
  group: {
    marginBottom: 20,
  },
  groupLabel: {
    color: 'rgba(196,203,223,0.52)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.62rem',
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    padding: '0 10px',
    marginBottom: 10,
  },
  groupList: {
    display: 'grid',
    gap: 6,
  },
  navItem: {
    width: '100%',
    background: 'transparent',
    border: '1px solid transparent',
    color: 'rgba(229,234,247,0.78)',
    borderRadius: 14,
    padding: '12px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    textAlign: 'left',
    fontSize: '0.95rem',
    transition: 'all 0.18s ease',
  },
  navItemActive: {
    background: '#ffffff',
    color: '#161c2d',
    boxShadow: '0 10px 22px rgba(0,0,0,0.22)',
  },
  navIcon: {
    width: 22,
    textAlign: 'center',
    fontSize: '1rem',
    flexShrink: 0,
  },
  lower: {
    display: 'grid',
    gap: 14,
  },
  supportCard: {
    background: '#ffffff',
    borderRadius: 16,
    padding: '16px 14px',
    color: '#202636',
  },
  supportTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '0.96rem',
    marginBottom: 8,
  },
  supportText: {
    color: 'var(--text-dim)',
    fontSize: '0.8rem',
    lineHeight: 1.65,
    marginBottom: 12,
  },
  supportBtn: {
    width: '100%',
    background: '#f6f8fb',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 12,
    padding: '11px 14px',
    fontWeight: 600,
  },
  profileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 6px',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    background: 'linear-gradient(135deg,#9fb6ff,#ffffff)',
    color: '#0f1729',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profileName: {
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  profileMeta: {
    color: 'rgba(225,230,244,0.62)',
    fontSize: '0.76rem',
    marginTop: 2,
  },
}
