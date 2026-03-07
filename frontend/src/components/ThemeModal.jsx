import { useState, useEffect } from 'react'
import { useTheme, THEMES } from '../context/ThemeContext.jsx'

export default function ThemeModal({ open, onClose }) {
  const { activeTheme, selectTheme } = useTheme()
  const [hovered,     setHovered]     = useState(null)
  const [justApplied, setJustApplied] = useState(null)

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const handleSelect = (theme) => {
    selectTheme(theme)
    setJustApplied(theme.id)
    setTimeout(() => setJustApplied(null), 1600)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          animation: 'fadeIn 0.18s ease',
        }}
      />

      {/* Modal panel */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: 501,
        width: 'min(820px,92vw)',
        maxHeight: '88vh',
        overflowY: 'auto',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 22,
        padding: '36px 36px 32px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.32)',
        animation: 'modalPop 0.22s cubic-bezier(.4,0,.2,1)',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--teal)',
              textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 8,
            }}>
              Appearance
            </div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 800,
              fontSize: '1.6rem', lineHeight: 1.1, margin: 0, color: 'var(--text)',
            }}>
              Choose your{' '}
              <em style={{
                fontStyle: 'normal',
                background: 'linear-gradient(135deg,var(--gold-light),var(--gold))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                theme
              </em>
            </h2>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text-dim)', fontSize: '1.1rem', lineHeight: 1,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface3)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
          >
            ✕
          </button>
        </div>

        {/* Active indicator */}
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 24, fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
          color: 'var(--text-dim)',
        }}>
          <div style={{
            width: 9, height: 9, borderRadius: '50%',
            background: activeTheme.palette[1],
            boxShadow: `0 0 7px ${activeTheme.palette[1]}`,
            flexShrink: 0,
          }} />
          Active:&nbsp;
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{activeTheme.label}</span>
          <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: '0.62rem' }}>Changes apply instantly</span>
        </div>

        {/* 2-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
          {THEMES.map(theme => {
            const isActive = activeTheme.id === theme.id
            const isHov    = hovered === theme.id
            const applied  = justApplied === theme.id
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
                  borderRadius: 16, padding: 20, cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
                  boxShadow: isActive
                    ? `0 0 0 4px ${accent}22, 0 6px 24px rgba(0,0,0,0.07)`
                    : isHov ? '0 6px 22px rgba(0,0,0,0.06)' : 'none',
                  transform: isHov && !isActive ? 'translateY(-2px)' : 'none',
                  position: 'relative', overflow: 'hidden',
                }}
              >
                {/* Active / applied badge */}
                {(isActive || applied) && (
                  <div style={{
                    position: 'absolute', top: 12, right: 12,
                    background: applied ? '#22c55e' : accent,
                    color: applied ? '#fff' : bg,
                    fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.14em',
                    padding: '3px 9px', borderRadius: 20,
                  }}>
                    {applied ? '✓ Applied' : 'Active'}
                  </div>
                )}

                {/* Mini preview */}
                <div style={{
                  background: bg, border: `1px solid ${accent}33`,
                  borderRadius: 10, padding: '12px 14px', marginBottom: 14,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flex: 1 }}>
                    {[bg, accent, pop].map((c, i) => (
                      <div key={i} style={{
                        width: i === 0 ? 28 : 20, height: 28, borderRadius: 6,
                        background: c, flexShrink: 0,
                        border: '1px solid rgba(128,128,128,0.15)',
                        boxShadow: i === 1 ? `0 0 8px ${c}55` : 'none',
                      }} />
                    ))}
                    <div style={{ flex: 1, marginLeft: 4 }}>
                      <div style={{ height: 6, borderRadius: 3, background: accent, opacity: 0.85, marginBottom: 4, width: '65%' }} />
                      <div style={{ height: 4, borderRadius: 3, background: pop, opacity: 0.55, width: '45%' }} />
                    </div>
                  </div>
                  {/* Mini globe */}
                  <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle at 40% 38%, ${accent}66, #00000099)` }} />
                    <div style={{ position: 'absolute', top: '28%', left: '26%', width: 5, height: 5, borderRadius: '50%', background: pop, boxShadow: `0 0 5px ${pop}` }} />
                    <div style={{ position: 'absolute', top: '54%', left: '54%', width: 4, height: 4, borderRadius: '50%', background: accent, boxShadow: `0 0 4px ${accent}` }} />
                  </div>
                </div>

                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', marginBottom: 4 }}>
                  {theme.label}
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  {theme.desc}
                </div>
              </button>
            )
          })}
        </div>

        <p style={{
          marginTop: 24, fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
          color: 'var(--text-faint)', textAlign: 'center',
        }}>
          Preference saved to browser — persists across sessions.
        </p>
      </div>

      {/* Modal animation keyframe */}
      <style>{`
        @keyframes modalPop {
          from { opacity:0; transform:translate(-50%,-50%) scale(0.95) }
          to   { opacity:1; transform:translate(-50%,-50%) scale(1) }
        }
      `}</style>
    </>
  )
}
