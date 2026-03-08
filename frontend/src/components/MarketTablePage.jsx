import { useState, useEffect, useCallback, useRef, forwardRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from './Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import AssetInsightsPanel, { getCachedInsight } from './AssetInsightsPanel.jsx'
import { convertCurrency, formatCompactCurrency, formatCurrency, normalizeCurrencyCode } from '../utils/currency.js'

const API_BASE = 'http://127.0.0.1:8000'
const PAGE_SIZE = 100
const CACHE_TTL_MS = 30 * 60_000

const FAVES_KEY = 'ws_favourites'
const loadFaves = () => { try { return JSON.parse(localStorage.getItem(FAVES_KEY) || '[]') } catch { return [] } }
const saveFaves = arr => { try { localStorage.setItem(FAVES_KEY, JSON.stringify(arr)) } catch {} }

const MARKET_TABS = [
  { label: 'Stocks', path: '/stocks' },
  { label: 'Commodities', path: '/commodities' },
  { label: 'Crypto', path: '/crypto' },
  { label: 'Favourites', path: null, fav: true },
]

async function fetchMarketPage(endpoint, page) {
  const res = await fetch(
    `${API_BASE}/api/market/${endpoint}?page=${page}&per_page=${PAGE_SIZE}`,
    { headers: { Accept: 'application/json' } }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function buildFmt(currencyCode) {
  return {
    price: v => {
      if (v == null) return '-'
      const converted = convertCurrency(v, 'USD', currencyCode)
      if (converted == null) return '-'
      if (Math.abs(converted) >= 1) return formatCurrency(converted, currencyCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      if (Math.abs(converted) >= 0.01) return formatCurrency(converted, currencyCode, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
      return formatCurrency(converted, currencyCode, { minimumFractionDigits: 8, maximumFractionDigits: 8 })
    },
    cap: v => {
      if (v == null) return '-'
      const converted = convertCurrency(v, 'USD', currencyCode)
      if (converted == null) return '-'
      return formatCompactCurrency(converted, currencyCode)
    },
    vol: v => {
      if (v == null) return '-'
      const converted = convertCurrency(v, 'USD', currencyCode)
      if (converted == null) return '-'
      return formatCompactCurrency(converted, currencyCode)
    },
    pct: v => {
      if (v == null) return '-'
      return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
    },
  }
}
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

function normalizeRiskBucket(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const score = clamp(value, 0, 100)
    if (score <= 33) return 'conservative'
    if (score <= 66) return 'balanced'
    return 'aggressive'
  }
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'conservative' || text === 'low') return 'conservative'
  if (text === 'balanced' || text === 'moderate' || text === 'medium') return 'balanced'
  if (text === 'aggressive' || text === 'high') return 'aggressive'
  const numeric = Number(text)
  if (Number.isFinite(numeric)) return normalizeRiskBucket(numeric)
  return 'balanced'
}

function riskLabel(value) {
  const bucket = normalizeRiskBucket(value)
  if (bucket === 'conservative') return 'Conservative'
  if (bucket === 'aggressive') return 'Aggressive'
  return 'Balanced'
}

function scoreTone(score) {
  if (score >= 80) return { label: 'Strong fit', color: 'var(--green)', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.22)' }
  if (score >= 65) return { label: 'Aligned', color: 'var(--teal)', bg: 'rgba(45,212,191,0.12)', border: 'rgba(45,212,191,0.22)' }
  if (score >= 45) return { label: 'Watchlist fit', color: 'var(--orange)', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.22)' }
  return { label: 'Cautious fit', color: 'var(--red)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.22)' }
}

function getAssetClassBase(endpoint, riskProfile) {
  const risk = normalizeRiskBucket(riskProfile)
  const matrix = {
    stocks: { conservative: 58, balanced: 76, aggressive: 84 },
    commodities: { conservative: 68, balanced: 72, aggressive: 62 },
    cryptos: { conservative: 28, balanced: 52, aggressive: 82 },
  }
  return matrix[endpoint]?.[risk] ?? 68
}

function getCompatibilityAnalysis(item, endpoint, userProfile, fallbackRank) {
  const riskProfile = riskLabel(userProfile?.risk_profile)
  const wellness = userProfile?.financial_wellness_score ?? 60
  const stress = userProfile?.financial_stress_index ?? 50
  const p24 = item.price_change_percentage_24h ?? 0
  const p7 = item.price_change_percentage_7d ?? 0
  const absMove = Math.abs(p24) + Math.abs(p7 || 0) * 0.35
  const rank = item.market_cap_rank ?? fallbackRank ?? 100
  const sizeBonus = clamp((120 - rank) / 6, -4, 14)

  let score = getAssetClassBase(endpoint, riskProfile)

  if (endpoint === 'cryptos') score += (wellness - 60) * 0.18 - (stress - 50) * 0.26 - absMove * 1.35
  if (endpoint === 'stocks') score += (wellness - 55) * 0.12 - (stress - 50) * 0.14 - Math.max(0, absMove - 6) * 0.55
  if (endpoint === 'commodities') score += (wellness - 55) * 0.08 + (stress - 50) * 0.08 - Math.max(0, absMove - 9) * 0.35

  score += sizeBonus
  score = Math.round(clamp(score, 18, 95))

  const reasons = []
  reasons.push(`${riskProfile} risk profile has ${endpoint === 'cryptos' ? 'the strongest sensitivity' : endpoint === 'stocks' ? 'a constructive bias' : 'a measured fit'} to ${endpoint.slice(0, -1)} exposure.`)
  reasons.push(`Current market behavior is ${absMove > 12 ? 'volatile' : absMove > 6 ? 'active' : 'relatively stable'}, based on the latest 24h and 7d move profile.`)
  reasons.push(`Scale support is ${rank <= 25 ? 'strong' : rank <= 75 ? 'moderate' : 'limited'}, using market-cap rank as a liquidity and resilience signal.`)

  const action =
    score >= 80 ? 'High-conviction candidate if it fits your allocation plan.' :
    score >= 65 ? 'Worth monitoring as a core watchlist name.' :
    score >= 45 ? 'Treat as selective exposure rather than a priority add.' :
    'Best kept on watch until your profile or market conditions improve.'

  return {
    score,
    tone: scoreTone(score),
    reasons,
    action,
    stats: [
      { label: 'Market rank', value: `#${rank}` },
    ],
  }
}

function endpointToCompatibilityType(endpoint) {
  if (endpoint === 'stocks') return 'stock'
  if (endpoint === 'cryptos') return 'crypto'
  return 'commodity'
}

function parseWhyItFitsBullets(payload) {
  const synthesis = payload?.llm_synthesis
  const bullets = synthesis?.why_it_fits_bullets
  if (!Array.isArray(bullets)) return []
  return bullets
    .map(line => String(line ?? '').trim())
    .filter(Boolean)
    .slice(0, 4)
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

function DetailSparkline({ item }) {
  const positive = (item.price_change_percentage_24h ?? 0) >= 0
  const seed = (item.market_cap_rank ?? 1) * 0.77
  const pts = []
  let v = 0.54
  for (let i = 0; i < 24; i += 1) {
    const drift = positive ? 0.012 : -0.012
    v = Math.max(0.12, Math.min(0.9, v + drift + Math.sin(seed + i * 0.7) * 0.05))
    pts.push(v)
  }
  const W = 520
  const H = 160
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / (pts.length - 1)) * W},${H - p * (H - 24)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 180, display: 'block' }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`detail-${item.id ?? item.symbol}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${W},${H} L0,${H} Z`} fill={`url(#detail-${item.id ?? item.symbol})`} />
      <path d={path} stroke="#7c3aed" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function insightNarrativeText(insight) {
  if (!insight || typeof insight !== 'object') return ''
  if (typeof insight.narrative === 'string' && insight.narrative.trim()) return insight.narrative.trim()
  if (typeof insight.conclusion === 'string' && insight.conclusion.trim()) return insight.conclusion.trim()
  if (Array.isArray(insight.tldr) && insight.tldr.length) {
    const first = insight.tldr.find(v => typeof v === 'string' && v.trim())
    if (first) return first.trim()
  }
  return ''
}

function MarketDetailModal({ item, endpoint, title, profile, userId, onClose, isFavourited, onToggleFavourite, fmt }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const insightAssetType = endpoint === 'stocks' ? 'stock' : endpoint === 'cryptos' ? 'crypto' : 'commodity'
  const cachedInsight = getCachedInsight(insightAssetType, item?.symbol, 3)
  const [liveInsightNarrative, setLiveInsightNarrative] = useState(() => insightNarrativeText(cachedInsight))
  const [llmWhyItFits, setLlmWhyItFits] = useState([])
  const [whyItFitsLoading, setWhyItFitsLoading] = useState(false)
  useEffect(() => {
    setLiveInsightNarrative(insightNarrativeText(cachedInsight))
  }, [endpoint, item?.symbol])
  useEffect(() => {
    setLlmWhyItFits([])
    setWhyItFitsLoading(false)
  }, [endpoint, item?.symbol, userId])

  const displayRank = item?.market_cap_rank ?? item?.__displayRank ?? null
  const hasUserContext = Boolean(userId && profile)
  const analysis = hasUserContext && item ? getCompatibilityAnalysis(item, endpoint, profile, displayRank) : null
  const positive24 = ((item?.price_change_percentage_24h) ?? 0) >= 0
  const positive7 = ((item?.price_change_percentage_7d) ?? 0) >= 0
  const suggestedReadText = liveInsightNarrative
    || 'Generate Market Insight to view a narrative read for this asset.'

  useEffect(() => {
    if (!hasUserContext || !item?.symbol) return undefined
    const targetType = endpointToCompatibilityType(endpoint)
    const controller = new AbortController()
    setWhyItFitsLoading(true)

    fetch(
      `${API_BASE}/users/${encodeURIComponent(userId)}/compatibility?target_type=${encodeURIComponent(targetType)}&symbol=${encodeURIComponent(item.symbol)}&_ts=${Date.now()}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      }
    )
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => {
        const bullets = parseWhyItFitsBullets(data)
        if (bullets.length) setLlmWhyItFits(bullets)
      })
      .catch(() => {})
      .finally(() => setWhyItFitsLoading(false))

    return () => controller.abort()
  }, [hasUserContext, userId, endpoint, item?.symbol])

  if (!item) return null

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={MD.backdrop}
    >
      <div style={MD.panel}>
        <div style={MD.topBar} />

        <div style={MD.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {item.image ? (
              <img src={item.image} alt={item.name} width={52} height={52} style={{ borderRadius: '50%', border: '1px solid var(--border)' }} />
            ) : (
              <div style={MD.avatar}>{(item.symbol || '?').slice(0, 4).toUpperCase()}</div>
            )}
            <div>
              <div style={MD.eyebrow}>{title} Detail</div>
              <div style={MD.nameRow}>
                <h2 style={MD.name}>{item.name}</h2>
                <span style={MD.symbol}>{item.symbol}</span>
              </div>
              <div style={MD.subline}>
                {fmt.price(item.current_price)} | Rank {displayRank ? `#${displayRank}` : '-'} | {fmt.cap(item.market_cap)} market cap
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => onToggleFavourite?.()}
              style={{ ...MD.closeBtn, fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isFavourited ? '#f43f5e' : 'var(--text-faint)', background: isFavourited ? 'rgba(244,63,94,0.1)' : 'var(--surface)', border: `1px solid ${isFavourited ? 'rgba(244,63,94,0.35)' : 'var(--border)'}`, transition: 'all 0.2s' }}
              title={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
            >
              {isFavourited ? '♥' : '♡'}
            </button>
            <button
              onClick={onClose}
              style={{ ...MD.closeBtn, fontSize: '1.25rem', fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}
              title="Close"
              aria-label="Close details"
            >
              ✕
            </button>
          </div>
        </div>

        <div style={MD.grid}>
          <div style={{ ...MD.card, gridColumn: '1 / -1' }}>
            <div style={MD.cardLabel}>Price Trend</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={MD.heroPrice}>{fmt.price(item.current_price)}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ ...MD.changePill, color: positive24 ? 'var(--green)' : 'var(--red)', background: positive24 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)' }}>
                  24H {fmt.pct(item.price_change_percentage_24h)}
                </div>
                <div style={{ ...MD.changePill, color: positive7 ? 'var(--green)' : 'var(--red)', background: positive7 ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)' }}>
                  7D {fmt.pct(item.price_change_percentage_7d)}
                </div>
              </div>
            </div>
            <DetailSparkline item={item} />
          </div>

          <div style={{ ...MD.card, ...MD.scoreCard }}>
            <div style={MD.cardLabel}>Compatibility Score</div>
            {hasUserContext ? (
              <>
                <div style={{ ...MD.scoreValue, color: analysis.tone.color }}>{analysis.score}</div>
                <div style={{ ...MD.scorePill, color: analysis.tone.color, background: analysis.tone.bg, borderColor: analysis.tone.border }}>
                  {analysis.tone.label}
                </div>
                <div style={MD.scoreBody}>
                  Calculated from your risk profile, current wellness, stress level, and this asset&apos;s recent market behavior.
                </div>
              </>
            ) : (
              <>
                <div style={{ ...MD.scoreValue, color: 'var(--text-faint)', fontSize: '2.1rem' }}>-</div>
                <div style={{ ...MD.scorePill, color: 'var(--text-faint)', background: 'rgba(148,163,184,0.08)', borderColor: 'rgba(148,163,184,0.18)' }}>
                  Locked
                </div>
                <div style={MD.scoreBody}>
                  Sign in to see your compatibility score.
                </div>
              </>
            )}
          </div>

          <div style={MD.card}>
            <div style={MD.cardLabel}>Why It Fits</div>
            {hasUserContext && whyItFitsLoading ? (
              <div style={{ ...MD.metricLabel, marginBottom: 8, color: 'var(--text-faint)' }}>
                Updating from AI...
              </div>
            ) : null}
            {hasUserContext ? (
              <div style={MD.reasonList}>
                {(llmWhyItFits.length ? llmWhyItFits : analysis.reasons).map(reason => (
                  <div key={reason} style={MD.reasonRow}>
                    <span style={MD.reasonDot} />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={MD.scoreBody}>
                Sign in to see how this asset fits your risk profile, wellness, and stress level.
              </div>
            )}
          </div>

          <div style={MD.card}>
            <div style={MD.cardLabel}>Useful Signals</div>
            <div style={MD.metricsGrid}>
              {[
                { label: '24h move', value: fmt.pct(item.price_change_percentage_24h), color: positive24 ? 'var(--green)' : 'var(--red)' },
                { label: 'Volume', value: fmt.vol(item.total_volume), color: 'var(--text)' },
                { label: 'Market cap', value: fmt.cap(item.market_cap), color: 'var(--text)' },
                ...(analysis?.stats ?? []),
              ].map(stat => (
                <div key={stat.label} style={MD.metricCard}>
                  <div style={MD.metricLabel}>{stat.label}</div>
                  <div style={{ ...MD.metricValue, color: stat.color || 'var(--text)' }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <AssetInsightsPanel
              assetType={endpoint === 'stocks' ? 'stock' : endpoint === 'cryptos' ? 'crypto' : 'commodity'}
              symbol={item.symbol}
              months={3}
              userId={userId}
              prefaceText={liveInsightNarrative ? suggestedReadText : (analysis?.action ?? suggestedReadText)}
              onInsightLoaded={insight => {
                const text = insightNarrativeText(insight)
                if (text) setLiveInsightNarrative(text)
              }}
            />
          </div>
        </div>
      </div>
    </div>
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

const MarketRow = forwardRef(function MarketRow({ item, rank, style, onClick, highlightState, highlightTone = 'green', fmt }, ref) {
  const [hovered, setHovered] = useState(false)
  const p24 = item.price_change_percentage_24h
  const p7 = item.price_change_percentage_7d
  const pos24 = p24 >= 0
  const pos7 = p7 >= 0
  const isHighlighted = highlightState === 'active' || highlightState === 'fading'
  const highlightOpacity = highlightState === 'active' ? 1 : highlightState === 'fading' ? 0 : 0
  const highlightColor = highlightTone === 'red'
    ? { bg: `rgba(248,113,113,${0.14 * highlightOpacity})`, border: `rgba(248,113,113,${0.28 * highlightOpacity})` }
    : { bg: `rgba(45,212,191,${0.14 * highlightOpacity})`, border: `rgba(45,212,191,${0.28 * highlightOpacity})` }

  return (
    <div
      ref={ref}
      style={{
        ...R.row,
        ...style,
        background: isHighlighted
          ? highlightColor.bg
          : hovered
            ? 'rgba(255,255,255,0.04)'
            : style?.background ?? 'transparent',
        boxShadow: isHighlighted ? `inset 0 0 0 1px ${highlightColor.border}` : 'none',
        transition: 'background 2.2s ease, box-shadow 2.2s ease',
      }}
      onClick={() => onClick?.(item)}
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
})

const R = {
  row: {
    display: 'flex', alignItems: 'center',
    padding: '0 20px', height: 60,
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    cursor: 'pointer',
  },
  col: {
    display: 'flex', alignItems: 'center',
    flexShrink: 0, gap: 0,
  },
}

function FavouritesView({ favourites, onSelect, fmt }) {
  if (favourites.length === 0) {
    return (
      <div style={{ margin: '0 48px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px', gap: 16 }}>
          <div style={{ fontSize: '3rem', lineHeight: 1 }}>+</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem' }}>No favourites yet</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', maxWidth: 380, textAlign: 'center', lineHeight: 1.7 }}>
            Open any asset detail panel and tap the heart icon to save it here.
          </div>
        </div>
      </div>
    )
  }
  const groups = [
    { ep: 'stocks', label: 'Stocks' },
    { ep: 'commodities', label: 'Commodities' },
    { ep: 'cryptos', label: 'Crypto' },
  ]
  return (
    <div style={{ margin: '0 48px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', animation: 'fadeUp 0.8s ease 0.15s both', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
      {groups.map(({ ep, label }) => {
        const epItems = favourites.filter(f => f.__endpoint === ep)
        if (!epItems.length) return null
        return (
          <div key={ep}>
            <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.12em', background: 'rgba(255,255,255,0.02)' }}>
              {label} | {epItems.length} saved
            </div>
            {epItems.map((item, i) => (
              <MarketRow
                key={item.__id ?? item.id ?? item.symbol}
                item={item}
                rank={item.market_cap_rank ?? '-'}
                style={i % 2 === 1 ? { background: 'rgba(255,255,255,0.015)' } : {}}
                fmt={fmt}
                onClick={() => onSelect(item)}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function SortHeader({ label, field, sort, onSort, right }) {
  const active = sort.field === field
  const isRank = field === 'rank' || field === 'market_cap_rank'
  return (
    <div
      onClick={() => onSort(field)}
      style={{
        ...R.col,
        flex: isRank ? undefined : field === 'name' ? 2 : 1,
        width: isRank ? 44 : field === 'chart' ? 96 : undefined,
        justifyContent: right ? 'flex-end' : isRank ? 'center' : 'flex-start',
        cursor: 'pointer', userSelect: 'none', gap: 4,
        fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
        color: active ? 'var(--gold)' : 'var(--text-faint)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        transition: 'color 0.15s',
      }}
    >
      {label}
      {active && (
        <span
          style={{
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: sort.dir === 'asc' ? 'none' : '6px solid var(--gold)',
            borderBottom: sort.dir === 'asc' ? '6px solid var(--gold)' : 'none',
            marginTop: 1,
          }}
        />
      )}
    </div>
  )
}

export default function MarketTablePage({ endpoint, title, accentLabel, description }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const effectiveUserId = user?.user_id || sessionStorage.getItem('user_id') || ''
  const [page, setPage] = useState(1)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ field: 'market_cap_rank', dir: 'asc' })
  const [profile, setProfile] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [displayCurrency, setDisplayCurrency] = useState('USD')
  const [favourites, setFavourites] = useState(() => loadFaves())
  const [showFavourites, setShowFavourites] = useState(false)
  const [highlightedItemKey, setHighlightedItemKey] = useState(null)
  const [highlightedTone, setHighlightedTone] = useState('green')
  const [fadingItemKey, setFadingItemKey] = useState(null)
  const [fadingTone, setFadingTone] = useState('green')
  const cacheRef = useRef({})
  const tableRef = useRef(null)
  const rowRefs = useRef({})
  const highlightTimeoutRef = useRef(null)
  const fadeTimeoutRef = useRef(null)

  const toggleFavourite = useCallback((item, itemEndpoint) => {
    setFavourites(prev => {
      const id = item.id ?? item.symbol
      const exists = prev.some(f => f.__id === id)
      const next = exists
        ? prev.filter(f => f.__id !== id)
        : [...prev, { ...item, __id: id, __endpoint: itemEndpoint }]
      saveFaves(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!effectiveUserId) return
    fetch(`${API_BASE}/users/${effectiveUserId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => setProfile(data?.user ?? null))
      .catch(() => {})
  }, [effectiveUserId])

  useEffect(() => {
    if (!effectiveUserId) {
      setDisplayCurrency('USD')
      return
    }
    fetch(`${API_BASE}/users/profile/details/${effectiveUserId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => setDisplayCurrency(normalizeCurrencyCode(data?.profile?.currency || 'USD')))
      .catch(() => setDisplayCurrency('USD'))
  }, [effectiveUserId])

  const fmt = buildFmt(displayCurrency)

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

  const scrollToItem = useCallback((item, tone = 'green') => {
    const key = item?.id ?? item?.symbol
    const row = key ? rowRefs.current[key] : null
    if (!row) return
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current)
    setHighlightedItemKey(key)
    setHighlightedTone(tone)
    setFadingItemKey(null)
    setFadingTone(tone)
    row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedItemKey(current => (current === key ? null : current))
      setFadingItemKey(key)
      setFadingTone(tone)
      fadeTimeoutRef.current = setTimeout(() => {
        setFadingItemKey(current => (current === key ? null : current))
      }, 2200)
    }, 1800)
  }, [])

  useEffect(() => () => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current)
  }, [])

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
  const movers = displayed.filter(item => item.price_change_percentage_24h != null)
  const positiveCount = movers.filter(item => item.price_change_percentage_24h >= 0).length
  const negativeCount = movers.filter(item => item.price_change_percentage_24h < 0).length
  const topGainer = movers.reduce((best, item) => {
    if (!best) return item
    return (item.price_change_percentage_24h ?? -Infinity) > (best.price_change_percentage_24h ?? -Infinity) ? item : best
  }, null)
  const topLoser = movers.reduce((worst, item) => {
    if (!worst) return item
    return (item.price_change_percentage_24h ?? Infinity) < (worst.price_change_percentage_24h ?? Infinity) ? item : worst
  }, null)

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
              {loading ? 'Loading market data...' : description}
            </p>
          </div>

          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontSize: '0.9rem', pointerEvents: 'none' }}>?</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${title.toLowerCase()} by name or symbol...`}
              style={PS.searchInput}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', fontSize: '1rem' }}>x</button>
            )}
          </div>
        </div>

        <div style={PS.tabs}>
          {MARKET_TABS.map(tab => {
            const active = tab.fav ? showFavourites : (pathname === tab.path && !showFavourites)
            return (
              <button
                key={tab.label}
                onClick={() => {
                  if (tab.fav) { setShowFavourites(true) }
                  else { setShowFavourites(false); navigate(tab.path) }
                }}
                style={{ ...PS.tab, ...(active ? PS.tabActive : {}) }}
              >
                {tab.label}{tab.fav && favourites.length > 0 ? ` (${favourites.length})` : ''}
              </button>
            )
          })}
        </div>

        {!showFavourites && !loading && !error && items.length > 0 && (
          <div style={PS.pills}>
            {[
              { label: `${title} up today`, val: `${positiveCount}`, color: 'var(--green)' },
              { label: `${title} down today`, val: `${negativeCount}`, color: 'var(--red)' },
              {
                label: 'Top gainer',
                val: topGainer ? (topGainer.symbol || topGainer.name) : '-',
                meta: topGainer ? fmt.pct(topGainer.price_change_percentage_24h) : null,
                color: 'var(--green)',
                item: topGainer,
              },
              {
                label: 'Top loser',
                val: topLoser ? (topLoser.symbol || topLoser.name) : '-',
                meta: topLoser ? fmt.pct(topLoser.price_change_percentage_24h) : null,
                color: 'var(--red)',
                item: topLoser,
              },
            ].map(pill => (
              <button
                key={pill.label}
                type="button"
                onClick={() => pill.item && scrollToItem(pill.item, pill.label === 'Top loser' ? 'red' : 'green')}
                style={{
                  ...PS.pill,
                  cursor: pill.item ? 'pointer' : 'default',
                  background: 'transparent',
                  border: 'none',
                  appearance: 'none',
                }}
              >
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.05rem', color: pill.color }}>{pill.val}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{pill.label}</span>
                {pill.meta ? (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: pill.color, fontWeight: 600 }}>
                    {pill.meta}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}

        {showFavourites ? (
          <FavouritesView
            favourites={favourites}
            onSelect={item => setSelectedItem(item)}
            fmt={fmt}
          />
        ) : (
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
                <div style={{ fontSize: '2.5rem' }}>!</div>
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
                key={item.id ?? item.symbol ?? i}
                item={item}
                rank={startRank + i}
                style={i % 2 === 1 ? { background: 'rgba(255,255,255,0.015)' } : {}}
                fmt={fmt}
                highlightState={
                  highlightedItemKey === (item.id ?? item.symbol)
                    ? 'active'
                    : fadingItemKey === (item.id ?? item.symbol)
                      ? 'fading'
                      : 'idle'
                }
                highlightTone={
                  highlightedItemKey === (item.id ?? item.symbol)
                    ? highlightedTone
                    : fadingItemKey === (item.id ?? item.symbol)
                      ? fadingTone
                      : 'green'
                }
                ref={node => {
                  const key = item.id ?? item.symbol
                  if (!key) return
                  if (node) rowRefs.current[key] = node
                  else delete rowRefs.current[key]
                }}
                onClick={clicked => setSelectedItem({ ...clicked, __displayRank: startRank + i })}
              />
            ))}

            {!loading && !error && displayed.length === 0 && search && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 12 }}>
                <div style={{ fontSize: '2rem' }}>?</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>No results for "{search}"</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-faint)' }}>Try another name or ticker.</div>
                <button onClick={() => setSearch('')} style={PS.clearBtn}>Clear search</button>
              </div>
            )}
          </div>

          <div style={PS.pagination}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-faint)' }}>
              {loading ? 'Loading...' : `Showing ${startRank}-${endRank}`}
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
                Previous
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
                    Loading...
                  </span>
                ) : hasMore ? 'Next ->' : 'End of list'}
              </button>
            </div>
          </div>
        </div>
        )}
      </main>

      <MarketDetailModal
        item={selectedItem}
        endpoint={endpoint}
        title={title}
        profile={profile}
        userId={effectiveUserId}
        onClose={() => setSelectedItem(null)}
        isFavourited={!!selectedItem && favourites.some(f => f.__id === (selectedItem.id ?? selectedItem.symbol))}
        onToggleFavourite={() => selectedItem && toggleFavourite(selectedItem, selectedItem.__endpoint || endpoint)}
        fmt={fmt}
      />

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
    background: 'var(--surface2)', border: '1px solid rgba(201,168,76,0.28)',
    color: 'var(--gold-light)', padding: '9px 16px', borderRadius: 999,
    fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase',
    letterSpacing: '0.1em', cursor: 'pointer',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
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

const MD = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 300,
    background: 'rgba(15,23,42,0.26)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 24px 48px',
    overflow: 'hidden',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'thin',
  },
  panel: {
    width: 'min(980px, 100%)',
    maxHeight: 'calc(100vh - 48px)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 24,
    boxShadow: '0 36px 90px rgba(0,0,0,0.35)',
    margin: '0 auto',
  },
  topBar: {
    height: 2,
    background: 'linear-gradient(90deg, var(--teal), #7c3aed, var(--gold))',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    padding: '28px 28px 20px',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(15,23,42,0.05)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.82rem',
    color: 'var(--text-faint)',
    flexShrink: 0,
  },
  eyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.65rem',
    color: 'var(--teal)',
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    marginBottom: 4,
  },
  nameRow: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  name: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: '1.55rem',
    lineHeight: 1.1,
  },
  symbol: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.82rem',
    color: 'var(--text-faint)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  subline: { fontSize: '0.84rem', color: 'var(--text-dim)', marginTop: 6 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-faint)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  grid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16,
    padding: '0 28px 28px',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  card: {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    padding: 20,
    boxShadow: '0 14px 28px rgba(0,0,0,0.2)',
  },
  cardLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.65rem',
    color: 'var(--text-faint)',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    marginBottom: 10,
  },
  heroPrice: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '1.9rem',
    lineHeight: 1,
  },
  changePill: {
    padding: '6px 10px',
    borderRadius: 999,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.74rem',
    fontWeight: 600,
  },
  scoreCard: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  scoreValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '3rem',
    lineHeight: 1,
  },
  scorePill: {
    marginTop: 10,
    border: '1px solid',
    borderRadius: 999,
    padding: '6px 12px',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
  },
  scoreBody: {
    fontSize: '0.84rem',
    color: 'var(--text-dim)',
    lineHeight: 1.7,
    marginTop: 14,
  },
  reasonList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    fontSize: '0.84rem',
    color: 'var(--text-dim)',
    lineHeight: 1.7,
  },
  reasonRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  },
  reasonDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    marginTop: 7,
    flexShrink: 0,
    background: 'var(--teal)',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12,
  },
  metricCard: {
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    padding: '14px 14px 12px',
  },
  metricLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.62rem',
    color: 'var(--text-faint)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 6,
  },
  metricValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '1rem',
  },
}
