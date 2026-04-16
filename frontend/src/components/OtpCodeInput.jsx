import { useRef, useState } from 'react'

export default function OtpCodeInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  placeholderChar = '•',
  style = {},
  autoComplete = 'one-time-code',
}) {
  const inputRef = useRef(null)
  const [focused, setFocused] = useState(false)
  const normalizedValue = String(value || '').replace(/\D/g, '').slice(0, length)

  const handleChange = (event) => {
    onChange?.(event.target.value.replace(/\D/g, '').slice(0, length))
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        ...style,
      }}
      onClick={() => {
        if (!disabled) inputRef.current?.focus()
      }}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete={autoComplete}
        maxLength={length}
        value={normalizedValue}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        aria-label={`${length}-digit verification code`}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          width: '100%',
          minHeight: 54,
          borderRadius: 14,
          border: `1px solid ${focused ? 'rgba(29,39,56,0.24)' : 'var(--border)'}`,
          background: 'var(--surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '0 18px',
          boxShadow: focused ? '0 0 0 3px rgba(42,184,163,0.08)' : 'none',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        {Array.from({ length }).map((_, index) => {
          const char = normalizedValue[index] || placeholderChar
          const isPlaceholder = !normalizedValue[index]
          const isActive = focused && normalizedValue.length === index
          return (
            <span
              key={index}
              style={{
                width: 16,
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: '1rem',
                lineHeight: 1,
                color: isPlaceholder ? '#1d2130' : '#1d2130',
                opacity: isPlaceholder ? 0.9 : 1,
                borderBottom: isActive ? '2px solid var(--teal)' : '2px solid transparent',
                paddingBottom: 3,
              }}
            >
              {char}
            </span>
          )
        })}
      </div>
    </div>
  )
}
