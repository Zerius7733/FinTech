import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from './Navbar.jsx'

const API_BASE = 'http://127.0.0.1:8000'
const PAGE_SIZE = 100
const CACHE_TTL_MS = 60_000

const MARKET_TABS = [
  { label: 'Stocks', path: '/stocks' },
  { label: 'Commodities', path: '/commodities' },
  { label: 'Crypto', path: '/crypto' },
]

async function fetchMarketPage(endpoint, page) {
  const res = await fetch(
    `${API_BASE}/api/market/${endpoint}?page=${page}&per_page=${PAGE_SIZE}`,
    { headers: { Accept: 'application/json' } }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const fmt = {
  price: v => {
    if (v == null) return '—'
    if (v >= 1) return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (v >= 0.01) return '$' + v.toFixed(4)
    return '$' + v.toFixed(8)
  },
  cap: v => {
    if (v == null) return '—'
    if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
    return '$' + v.toLocaleString()
  },
  vol: v => fmt.cap(v),
  pct: v => {
    if (v == null) return '—'
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
  },
}

function MiniSparkline({ positive, seed = 0 }) {
  const pts = []
  let v = 0.5
  for (let i = 0; i < 14; i += 1) {
    const drift = positive ? 0.022 : -0.022
    v = Math.max(0.05, Math.min(0.95, v + drift + Math.sin(seed * 7 + i) * 0.03))
    pts.push(v)
  }
  const W = 80
  const H = 28
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / (pts.length - 1)) * W},${H - p * (H - 4)}`).join(' ')
  const color = positive ? '#34d399' : '#f87171'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`spk-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${W},${H} L0,${H} Z`} fill={`url(#spk-${seed})`} />
      <path d={path} stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function SkeletonRow({ i }) {
  return (
    <div style={{ ...R.row, animationDelay: `${i * 30}ms`, animation: 'skPulse 1.4s ease-in-out infinite' }}>
      <div style={{ ...R.col, width: 44, justifyContent: 'center' }}>
        <div style={SK.pill} />
      </div>
      <div style={{ ...R.col, flex: 2, gap: 10 }}>
        <div style={{ ...SK.circle, width: 32, height: 32 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ ...SK.pill, width: 80 }} />
          <div style={{ ...SK.pill, width: 44 }} />
        </div>
      </div>
      {[120, 90, 90, 90, 80].map((w, j) => (
        <div key={j} style={{ ...R.col, flex: 1, justifyContent: 'flex-end' }}>
          <div style={{ ...SK.pill, width: w }} />
        </div>
      ))}
    </div>
  )
}

const SK = {
  pill: { height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.06)' },
  circle: { borderRadius: '50%', background: 'rgba(255,255,255,0.06)', flexShrink: 0 },
}

function MarketRow({ item, rank, style }) {
  const [hovered, setHovered] = useState(false)
  const p24 = item.price_change_percentage_24h
  const p7 = item.price_change_percentage_7d
  const pos24 = p24 >= 0
  const pos7 = p7 >= 0

  return (
    <div
      style={{
        ...R.row,
        ...style,
        background: hovered ? 'rgba(255,255,255,0.04)' : style?.background ?? 'transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ ...R.col, width: 44, justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-faint)' }}>
          {item.market_cap_rank ?? rank}
        </span>
      </div>

      <div style={{ ...R.col, flex: 2, gap: 10 }}>
        {item.image ? (
          <img src={item.image} alt={item.name} width={32} height={32} style={{ borderRadius: '50%', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            {(item.symbol || '?').slice(0, 3).toUpperCase()}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {item.symbol}
          </div>
        </div>
      </div>

      <div style={{ ...R.col, flex: 1, justifyContent: 'flex-end' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 600 }}>
          {fmt.price(item.current_price)}
        </span>
      </div>

      <div style={{ ...R.col, flex: 1, justifyContent: 'flex-end' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600,
          color: pos24 ? 'var(--green)' : 'var(--red)',
          background: pos24 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
          padding: '2px 7px', borderRadius: 6,
        }}>
          {fmt.pct(p24)}
        </span>
      </div>

      <div style={{ ...R.col, flex: 1, justifyContent: 'flex-end' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: pos7 ? 'var(--green)' : 'var(--red)' }}>
          {fmt.pct(p7)}
        </span>
      </div>

      <div style={{ ...R.col, flex: 1, justifyContent: 'flex-end' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-dim)' }}>
          {fmt.cap(item.market_cap)}
        </span>
      </div>

      <div style={{ ...R.col, flex: 1, justifyContent: 'flex-end' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-faint)' }}>
          {fmt.vol(item.total_volume)}
        </span>
      </div>

      <div style={{ ...R.col, width: 96, justifyContent: 'flex-end' }}>
        <MiniSparkline positive={pos24} seed={item.market_cap_rank ?? rank} />
      </div>
    </div>
  )
}

const R = {
  row: {
    display: 'flex', alignItems: 'center',
    padding: '0 20px', height: 60,
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    cursor: 'default',
  },
  col: {
    display: 'flex', alignItems: 'center',
    flexShrink: 0, gap: 0,
  },
}

function SortHeader({ label, field, sort, onSort, right }) {
  const active = sort.field === field
  return (
    <div
      onClick={() => onSort(field)}
      style={{
        ...R.col,
        flex: field === 'name' ? 2 : 1,
        width: field === 'rank' ? 44 : field === 'chart' ? 96 : undefined,
        justifyContent: right ? 'flex-end' : field === 'rank' ? 'center' : 'flex-start',
        cursor: 'pointer', userSelect: 'none', gap: 4,
        fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
        color: active ? 'var(--gold)' : 'var(--text-faint)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        transition: 'color 0.15s',
      }}
    >
      {label}
      {active && <span style={{ fontSize: '0.7rem', color: 'var(--gold)' }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
    </div>
  )
}

export default function MarketTablePage({ endpoint, title, accentLabel, description }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [page, setPage] = useState(1)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ field: 'market_cap_rank', dir: 'asc' })
  const cacheRef = useRef({})
  const tableRef = useRef(null)

  const load = useCallback(async (pg) => {
    setLoading(true)
    setError(null)

    const cacheKey = `${endpoint}:${pg}`
    const cached = cacheRef.current[cacheKey]
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setItems(cached.data)
      setHasMore(cached.data.length === PAGE_SIZE)
      setLoading(false)
      return
    }

    try {
      const data = await fetchMarketPage(endpoint, pg)
      if (!Array.isArray(data)) throw new Error('Unexpected response format')
      cacheRef.current[cacheKey] = { data, ts: Date.now() }
      setItems(data)
      setHasMore(data.length === PAGE_SIZE)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    load(page)
    tableRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [page, load])

  const handleSort = field => {
    setSort(current => ({
      field,
      dir: current.field === field && current.dir === 'asc' ? 'desc' : 'asc',
    }))
  }

  const displayed = [...items]
    .filter(item => {
      if (!search) return true
      const q = search.toLowerCase()
      return item.name?.toLowerCase().includes(q) || item.symbol?.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1
      const av = a[sort.field] ?? (sort.dir === 'asc' ? Infinity : -Infinity)
      const bv = b[sort.field] ?? (sort.dir === 'asc' ? Infinity : -Infinity)
      return (av > bv ? 1 : av < bv ? -1 : 0) * dir
    })

  const startRank = (page - 1) * PAGE_SIZE + 1
  const endRank = startRank + Math.max(items.length - 1, 0)
  const positiveCount = items.filter(item => (item.price_change_percentage_24h ?? 0) >= 0).length
  const negativeCount = items.filter(item => (item.price_change_percentage_24h ?? 0) < 0).length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main style={{ flex: 1, paddingTop: 100, paddingBottom: 40 }}>
        <div style={PS.header}>
          <div>
            <div style={PS.eyebrow}>
              <div style={PS.eyeLine} />Live Market Data<div style={PS.eyeLine} />
            </div>
            <h1 style={PS.title}>
              {title} <em style={{ fontStyle: 'normal', background: 'linear-gradient(135deg,var(--gold-light),var(--gold),var(--teal))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Markets</em>
            </h1>
            <p style={PS.sub}>
              {loading ? 'Loading market data…' : description}
            </p>
          </div>

          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${title.toLowerCase()} by name or symbol…`}
              style={PS.searchInput}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: '1rem' }}>×</button>
            )}
          </div>
        </div>

        <div style={PS.tabs}>
          {MARKET_TABS.map(tab => {
            const active = pathname === tab.path
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                style={{ ...PS.tab, ...(active ? PS.tabActive : {}) }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {!loading && !error && items.length > 0 && (
          <div style={PS.pills}>
            {[
              { label: accentLabel, val: `${startRank}–${endRank}`, color: 'var(--gold)' },
              { label: 'Names up today', val: `${positiveCount}`, color: 'var(--green)' },
              { label: 'Names down today', val: `${negativeCount}`, color: 'var(--red)' },
            ].map(pill => (
              <div key={pill.label} style={PS.pill}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.05rem', color: pill.color }}>{pill.val}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{pill.label}</span>
              </div>
            ))}
          </div>
        )}

        <div style={PS.tableWrap}>
          <div style={{ ...R.row, height: 44, borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', position: 'sticky', top: 0, zIndex: 5, borderRadius: '16px 16px 0 0' }}>
            <SortHeader label="#" field="market_cap_rank" sort={sort} onSort={handleSort} />
            <SortHeader label="Name" field="name" sort={sort} onSort={handleSort} />
            <SortHeader label="Price" field="current_price" sort={sort} onSort={handleSort} right />
            <SortHeader label="24h %" field="price_change_percentage_24h" sort={sort} onSort={handleSort} right />
            <SortHeader label="7d %" field="price_change_percentage_7d" sort={sort} onSort={handleSort} right />
            <SortHeader label="Mkt Cap" field="market_cap" sort={sort} onSort={handleSort} right />
            <SortHeader label="Volume" field="total_volume" sort={sort} onSort={handleSort} right />
            <div style={{ ...R.col, width: 96, justifyContent: 'flex-end', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>7d Chart</div>
          </div>

          <div ref={tableRef} style={{ maxHeight: 'calc(100vh - 430px)', overflowY: 'auto', scrollbarWidth: 'thin' }}>
            {error && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 16 }}>
                <div style={{ fontSize: '2.5rem' }}>⚠️</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--red)' }}>Failed to load market data</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', maxWidth: 420, textAlign: 'center', lineHeight: 1.7 }}>
                  This market feed is temporarily unavailable. Please try again in a moment.
                </div>
                <button onClick={() => load(page)} style={PS.retryBtn}>Retry</button>
              </div>
            )}

            {loading && Array.from({ length: 20 }).map((_, i) => <SkeletonRow key={i} i={i} />)}

            {!loading && !error && displayed.map((item, i) => (
              <MarketRow
                key={item.id ?? i}
                item={item}
                rank={startRank + i}
                style={i % 2 === 1 ? { background: 'rgba(255,255,255,0.015)' } : {}}
              />
            ))}

            {!loading && !error && displayed.length === 0 && search && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 12 }}>
                <div style={{ fontSize: '2rem' }}>🔍</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>No results for "{search}"</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-faint)' }}>Try another name or ticker.</div>
                <button onClick={() => setSearch('')} style={PS.clearBtn}>Clear search</button>
              </div>
            )}
          </div>

          <div style={PS.pagination}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-faint)' }}>
              {loading ? 'Loading…' : `Showing ${startRank}–${endRank}`}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => { if (page > 1 && !loading) setPage(p => p - 1) }}
                disabled={page === 1 || loading}
                style={{
                  ...PS.pageBtn,
                  opacity: page === 1 || loading ? 0.35 : 1,
                  cursor: page === 1 || loading ? 'not-allowed' : 'pointer',
                }}
              >
                ← Previous
              </button>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {[page - 1, page, page + 1]
                  .filter(p => p >= 1 && (p <= page || hasMore || p === page))
                  .map(p => (
                    <button
                      key={p}
                      onClick={() => !loading && setPage(p)}
                      disabled={loading || (!hasMore && p > page)}
                      style={{
                        ...PS.pageNum,
                        background: p === page ? 'var(--gold)' : 'rgba(255,255,255,0.05)',
                        color: p === page ? '#ffffff' : 'var(--text-dim)',
                        border: p === page ? 'none' : '1px solid rgba(255,255,255,0.08)',
                        fontWeight: p === page ? 700 : 400,
                        opacity: (!hasMore && p > page) || loading ? 0.3 : 1,
                        cursor: (!hasMore && p > page) || loading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {p}
                    </button>
                  ))}
              </div>

              <button
                onClick={() => { if (hasMore && !loading) setPage(p => p + 1) }}
                disabled={!hasMore || loading}
                style={{
                  ...PS.pageBtn,
                  background: hasMore && !loading ? 'var(--gold)' : 'rgba(255,255,255,0.05)',
                  color: hasMore && !loading ? '#ffffff' : 'var(--text-dim)',
                  border: hasMore && !loading ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  opacity: !hasMore || loading ? 0.4 : 1,
                  cursor: !hasMore || loading ? 'not-allowed' : 'pointer',
                  boxShadow: hasMore && !loading ? '0 10px 24px rgba(17,24,39,0.16)' : 'none',
                }}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Loading…
                  </span>
                ) : hasMore ? 'Next →' : 'End of list'}
              </button>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes skPulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar { width:5px; height:5px }
        ::-webkit-scrollbar-track { background:var(--bg) }
        ::-webkit-scrollbar-thumb { background:var(--surface2); border-radius:3px }
        input::placeholder { color:var(--text-faint) }
      `}</style>
    </div>
  )
}

const PS = {
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap',
    gap: 20, padding: '0 48px 20px', animation: 'fadeUp 0.6s ease both',
  },
  eyebrow: {
    fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--teal)',
    textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 10,
    display: 'flex', alignItems: 'center', gap: 10,
  },
  eyeLine: { width: 24, height: 1, background: 'var(--teal)', opacity: 0.5 },
  title: {
    fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem,3vw,2.6rem)',
    fontWeight: 800, lineHeight: 1.1, marginBottom: 6,
  },
  sub: { fontSize: '0.86rem', color: 'var(--text-dim)', maxWidth: 720, lineHeight: 1.65 },
  searchInput: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: 12, padding: '10px 14px 10px 40px',
    fontFamily: 'var(--font-mono)', fontSize: '0.82rem', width: 320,
    outline: 'none', transition: 'border-color 0.2s',
  },
  tabs: {
    display: 'flex', gap: 10, margin: '0 48px 22px', flexWrap: 'wrap',
  },
  tab: {
    background: 'rgba(255,255,255,0.55)', border: '1px solid var(--border)',
    color: 'var(--text-dim)', padding: '9px 16px', borderRadius: 999,
    fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase',
    letterSpacing: '0.1em', cursor: 'pointer',
  },
  tabActive: {
    background: 'var(--gold)',
    color: '#ffffff',
    borderColor: 'transparent',
    boxShadow: '0 10px 24px rgba(17,24,39,0.16)',
  },
  pills: {
    display: 'flex', gap: 2, margin: '0 48px 24px',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 14, overflow: 'hidden', animation: 'fadeUp 0.7s ease 0.1s both',
  },
  pill: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 3, padding: '12px 16px',
    borderRight: '1px solid var(--border)',
  },
  tableWrap: {
    margin: '0 48px', background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 16,
    overflow: 'hidden', animation: 'fadeUp 0.8s ease 0.15s both',
    boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
  },
  pagination: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)', flexWrap: 'wrap', gap: 12,
  },
  pageBtn: {
    fontFamily: 'var(--font-display)', fontSize: '0.82rem', fontWeight: 600,
    padding: '9px 18px', borderRadius: 10, transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  pageNum: {
    width: 34, height: 34, borderRadius: 8,
    fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  },
  retryBtn: {
    background: 'var(--gold)',
    border: 'none',
    color: '#ffffff',
    padding: '10px 28px',
    borderRadius: 8,
    fontFamily: 'var(--font-display)',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(17,24,39,0.16)',
  },
  clearBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text-dim)',
    padding: '8px 20px',
    borderRadius: 8,
    fontFamily: 'var(--font-body)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    marginTop: 4,
  },
}
