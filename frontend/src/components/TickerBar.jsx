import { MOCK_TICKERS } from '../data.js'

export default function TickerBar({ style = {} }) {
  // Double array so the marquee loops seamlessly
  const items = [...MOCK_TICKERS, ...MOCK_TICKERS]

  return (
    <div style={{ ...styles.wrap, ...style }}>
      <div style={styles.track}>
        {items.map((t, i) => (
          <span key={i} style={styles.item}>
            <span style={styles.sym}>{t.sym}</span>
            <span style={styles.price}>{t.price}</span>
            <span style={{ ...styles.chg, color: t.up ? 'var(--green)' : 'var(--red)' }}>
              {t.chg}
            </span>
            <span style={styles.dot}>·</span>
          </span>
        ))}
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    overflow: 'hidden',
    borderTop: '1px solid var(--border)',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    padding: '12px 0',
  },
  track: {
    display: 'flex', gap: 40,
    width: 'max-content',
    animation: 'marquee 30s linear infinite',
    whiteSpace: 'nowrap',
  },
  item: {
    display: 'inline-flex', alignItems: 'center', gap: 10,
    fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
  },
  sym:   { color: 'var(--text-dim)' },
  price: { color: 'var(--text)' },
  chg:   { fontWeight: 500 },
  dot:   { color: 'var(--text-faint)' },
}
