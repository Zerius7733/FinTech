import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useTheme, THEMES } from '../context/ThemeContext.jsx'

export default function Theme() {
  const navigate = useNavigate()
  const { activeTheme, selectTheme } = useTheme()
  const [hovered, setHovered] = useState(null)
  const [justApplied, setJustApplied] = useState(null)

  const handleSelect = (theme) => {
    selectTheme(theme)
    setJustApplied(theme.id)
    setTimeout(() => setJustApplied(null), 1600)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', overflowX: 'hidden', transition: 'background 0.4s, color 0.4s' }}>
      <Navbar />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '120px 40px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 52 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--teal)',
            textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 14,
          }}>
            Appearance
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: 'clamp(2rem,4vw,2.8rem)', lineHeight: 1.1, marginBottom: 12,
            color: 'var(--text)',
          }}>
            Choose your{' '}
            <em style={{
              fontStyle: 'normal',
              background: 'linear-gradient(135deg,var(--gold-light),var(--gold))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              theme
            </em>
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.92rem', lineHeight: 1.7, maxWidth: 460, margin: 0 }}>
            Changes apply instantly — globe lighting adapts too.
          </p>
        </div>

        {/* Active theme indicator */}
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 36, fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
          color: 'var(--text-dim)',
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: activeTheme.palette[1],
            boxShadow: `0 0 8px ${activeTheme.palette[1]}`,
            flexShrink: 0,
          }} />
          Currently active:&nbsp;
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{activeTheme.label}</span>
        </div>

        {/* Theme grid — 2 columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 20 }}>
          {THEMES.map(theme => {
            const isActive  = activeTheme.id === theme.id
            const isHov     = hovered === theme.id
            const applied   = justApplied === theme.id
            const [bg, accent, pop] = theme.palette

            return (
              <button
                key={theme.id}
                onClick={() => handleSelect(theme)}
                onMouseEnter={() => setHovered(theme.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: 'var(--surface)',
                  border: isActive
                    ? `2px solid ${accent}`
                    : isHov
                    ? `1.5px solid ${accent}88`
                    : '1.5px solid var(--border)',
                  borderRadius: 18, padding: 24, cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.22s cubic-bezier(.4,0,.2,1)',
                  boxShadow: isActive
                    ? `0 0 0 4px ${accent}22, 0 8px 32px rgba(0,0,0,0.08)`
                    : isHov ? `0 8px 28px rgba(0,0,0,0.07)` : 'none',
                  transform: isHov && !isActive ? 'translateY(-3px)' : 'none',
                  position: 'relative', overflow: 'hidden',
                }}
              >
                {/* Active pill */}
                {isActive && (
                  <div style={{
                    position: 'absolute', top: 14, right: 14,
                    background: accent, color: bg,
                    fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.14em',
                    padding: '4px 10px', borderRadius: 20,
                  }}>
                    Active
                  </div>
                )}

                {/* Applied flash */}
                {applied && (
                  <div style={{
                    position: 'absolute', top: 14, right: 14,
                    background: '#22c55e', color: '#fff',
                    fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.14em',
                    padding: '4px 10px', borderRadius: 20,
                  }}>
                    ✓ Applied
                  </div>
                )}

                {/* Mini preview */}
                <div style={{
                  background: bg, border: `1px solid ${accent}33`,
                  borderRadius: 12, padding: '14px 16px', marginBottom: 18,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  {/* Swatches */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
                    {[bg, accent, pop].map((c, i) => (
                      <div key={i} style={{
                        width: i === 0 ? 32 : 22, height: 32, borderRadius: 7,
                        background: c, flexShrink: 0,
                        border: '1px solid rgba(128,128,128,0.15)',
                        boxShadow: i === 1 ? `0 0 10px ${c}55` : 'none',
                      }} />
                    ))}
                    <div style={{ flex: 1, marginLeft: 4 }}>
                      <div style={{ height: 7, borderRadius: 4, background: accent, opacity: 0.85, marginBottom: 5, width: '65%' }} />
                      <div style={{ height: 5, borderRadius: 4, background: pop, opacity: 0.55, width: '45%' }} />
                    </div>
                  </div>
                  {/* Mini globe */}
                  <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle at 40% 38%, ${accent}66, #00000099)` }} />
                    <div style={{ position: 'absolute', top: '28%', left: '26%', width: 5, height: 5, borderRadius: '50%', background: pop, boxShadow: `0 0 5px ${pop}` }} />
                    <div style={{ position: 'absolute', top: '54%', left: '54%', width: 4, height: 4, borderRadius: '50%', background: accent, boxShadow: `0 0 4px ${accent}` }} />
                  </div>
                </div>

                {/* Label */}
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', marginBottom: 5 }}>
                  {theme.label}
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {theme.desc}
                </div>
              </button>
            )
          })}
        </div>

        <p style={{
          marginTop: 32, fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
          color: 'var(--text-faint)', textAlign: 'center',
        }}>
          Preference is saved to your browser and persists across sessions.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-dim)', padding: '10px 28px', borderRadius: 10,
              cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: '0.85rem',
              transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--teal)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            ← Back to Globe
          </button>
        </div>
      </div>
    </div>
  )
}
