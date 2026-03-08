import { createContext, useContext, useEffect, useState } from 'react'

// ─── Theme definitions ────────────────────────────────────────────────────────
export const THEMES = [
  {
    id: 'default',
    label: 'Default',
    desc: 'Clean professional light theme',
    palette: ['#f3f5f8', '#1d2738', '#2ab8a3'],
    bodyBg: 'radial-gradient(circle at top left, rgba(109,141,247,0.08), transparent 30%), linear-gradient(180deg, #f7f8fb 0%, #f3f5f8 100%)',
    vars: {
      '--bg':          '#f3f5f8',
      '--bg2':         '#eceff4',
      '--surface':     '#ffffff',
      '--surface2':    '#f7f8fb',
      '--surface3':    '#e9edf3',
      '--gold':        '#1d2738',
      '--gold-light':  '#46536a',
      '--teal':        '#2ab8a3',
      '--teal-dim':    '#179582',
      '--text':        '#1d2130',
      '--text-dim':    '#6f778a',
      '--text-faint':  '#9aa3b5',
      '--border':      'rgba(29,33,48,0.10)',
      '--border-act':  'rgba(29,39,56,0.20)',
      '--glow-gold':   '0 18px 44px rgba(17,24,39,0.08)',
      '--glow-teal':   '0 16px 38px rgba(42,184,163,0.16)',
      '--nav-bg':          'rgba(243,245,248,0.92)',
      '--btn-primary-bg':  '#1d2738',
      '--btn-primary-text':'#ffffff',
      '--logo-bg':         'linear-gradient(135deg,#172033,#2c3852)',
    },
    globe: {
      ambient:   0x334466,
      sun:       0x6699ff,
      accent:    0xc9a84c,
      cool:      0x2dd4bf,
      atmos1:    0x2244aa,
      atmos2:    0x1133cc,
      atmosOp1:  0.09,
      atmosOp2:  0.035,
      specular:  0x224488,
    },
  },
  {
    id: 'earthy',
    label: 'Earthy Tones',
    desc: 'Warm olive greens and cream',
    palette: ['#fefae0', '#283618', '#606c38'],
    bodyBg: 'radial-gradient(circle at top left, rgba(96,108,56,0.10), transparent 30%), linear-gradient(180deg, #fffef5 0%, #fefae0 100%)',
    vars: {
      '--bg':          '#fefae0',
      '--bg2':         '#f5f0cc',
      '--surface':     '#fffef5',
      '--surface2':    '#faf5e4',
      '--surface3':    '#f0e8c8',
      '--gold':        '#283618',
      '--gold-light':  '#606c38',
      '--teal':        '#8a6a1e',
      '--teal-dim':    '#6b510f',
      '--text':        '#1c2010',
      '--text-dim':    '#606c38',
      '--text-faint':  '#8a9060',
      '--border':      'rgba(40,54,24,0.12)',
      '--border-act':  'rgba(40,54,24,0.22)',
      '--glow-gold':   '0 18px 44px rgba(40,54,24,0.10)',
      '--glow-teal':   '0 16px 38px rgba(138,106,30,0.18)',
      '--nav-bg':          'rgba(254,250,224,0.92)',
      '--btn-primary-bg':  '#283618',
      '--btn-primary-text':'#ffffff',
      '--logo-bg':         'linear-gradient(135deg,#1c2b08,#3a4e18)',
    },
    globe: {
      ambient:   0x1e2a10,
      sun:       0x8faa44,
      accent:    0x606c38,
      cool:      0xa07830,
      atmos1:    0x3a5018,
      atmos2:    0x283618,
      atmosOp1:  0.10,
      atmosOp2:  0.04,
      specular:  0x2a4010,
    },
  },
  {
    id: 'moonlit',
    label: 'Moonlit Ocean',
    desc: 'Dark navy with cool blue-grey',
    palette: ['#edf2f4', '#2b2d42', '#8d99ae'],
    bodyBg: 'radial-gradient(circle at top left, rgba(141,153,174,0.10), transparent 30%), linear-gradient(180deg, #f4f7f8 0%, #edf2f4 100%)',
    vars: {
      '--bg':          '#edf2f4',
      '--bg2':         '#e2e8ed',
      '--surface':     '#ffffff',
      '--surface2':    '#f5f7f9',
      '--surface3':    '#e8edf1',
      '--gold':        '#2b2d42',
      '--gold-light':  '#5c6480',
      '--teal':        '#4a6fa5',
      '--teal-dim':    '#3a5885',
      '--text':        '#2b2d42',
      '--text-dim':    '#8d99ae',
      '--text-faint':  '#b0bac6',
      '--border':      'rgba(43,45,66,0.12)',
      '--border-act':  'rgba(43,45,66,0.22)',
      '--glow-gold':   '0 18px 44px rgba(43,45,66,0.10)',
      '--glow-teal':   '0 16px 38px rgba(74,111,165,0.18)',
      '--nav-bg':          'rgba(237,242,244,0.92)',
      '--btn-primary-bg':  '#2b2d42',
      '--btn-primary-text':'#ffffff',
      '--logo-bg':         'linear-gradient(135deg,#1e2238,#3a3f60)',
    },
    globe: {
      ambient:   0x1a2035,
      sun:       0x4a8ab5,
      accent:    0x8d99ae,
      cool:      0x2b6699,
      atmos1:    0x1a3a6c,
      atmos2:    0x112255,
      atmosOp1:  0.09,
      atmosOp2:  0.035,
      specular:  0x1a3a6c,
    },
  },
  {
    id: 'silent-night',
    label: 'Silent Night',
    desc: 'Deep black with warm chalk tones',
    palette: ['#0a0a0a', '#6a5a46', '#beb7a4'],
    bodyBg: 'linear-gradient(180deg, #111111 0%, #0a0a0a 100%)',
    vars: {
      '--bg':          '#0a0a0a',
      '--bg2':         '#111111',
      '--surface':     '#181818',
      '--surface2':    '#1e1e1e',
      '--surface3':    '#242424',
      '--gold':        '#6a5a46',
      '--gold-light':  '#9a8770',
      '--teal':        '#beb7a4',
      '--teal-dim':    '#a09890',
      '--text':        '#fffffc',
      '--text-dim':    '#beb7a4',
      '--text-faint':  '#8a8478',
      '--border':      'rgba(190,183,164,0.14)',
      '--border-act':  'rgba(254,255,252,0.22)',
      '--glow-gold':   '0 18px 44px rgba(254,255,252,0.06)',
      '--glow-teal':   '0 16px 38px rgba(190,183,164,0.14)',
      '--nav-bg':          'rgba(14,14,14,0.93)',
      '--btn-primary-bg':  '#3a3530',
      '--btn-primary-text':'#fffffc',
      '--logo-bg':         'linear-gradient(135deg,#2a2520,#403830)',
    },
    globe: {
      ambient:   0x222222,
      sun:       0xffffff,
      accent:    0xd4cfc4,
      cool:      0x9a9488,
      atmos1:    0x2a2a2a,
      atmos2:    0x1a1a1a,
      atmosOp1:  0.07,
      atmosOp2:  0.03,
      specular:  0x444444,
    },
  },
]

// ─── Apply theme to DOM ───────────────────────────────────────────────────────
function applyTheme(theme) {
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  document.body.style.background = theme.bodyBg
}

// ─── Context ──────────────────────────────────────────────────────────────────
const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const saved = localStorage.getItem('ws-theme') || 'default'
  const initial = THEMES.find(t => t.id === saved) || THEMES[0]
  const [activeTheme, setActiveTheme] = useState(initial)

  // Apply on mount
  useEffect(() => { applyTheme(initial) }, []) // eslint-disable-line

  const selectTheme = (theme) => {
    setActiveTheme(theme)
    applyTheme(theme)
    localStorage.setItem('ws-theme', theme.id)
  }

  return (
    <ThemeContext.Provider value={{ activeTheme, selectTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
