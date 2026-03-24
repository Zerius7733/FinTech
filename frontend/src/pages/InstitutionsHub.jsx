import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLoginModal } from '../context/LoginModalContext.jsx'
import { API_BASE as API } from '../utils/api.js'

const INSTITUTIONS = [
  {
    id: 'prudential-sg',
    name: 'Prudential Singapore',
    shortName: 'Prudential',
    accent: '#c81e3a',
    accentSoft: 'rgba(200, 30, 58, 0.12)',
    description: 'Health, life, and wealth planning products with strong retirement and family-protection coverage.',
    note: 'Official Prudential Singapore consumer products.',
    products: [
      {
        id: 'prushield',
        name: 'PRUShield',
        category: 'Health',
        planningLens: 'Hospital coverage',
        horizon: 'Immediate protection',
        fit: ['Singapore residents', 'Hospitalisation planning', 'Medical bill buffer'],
        summary: 'Integrated Shield coverage for hospital and large medical expenses.',
        caution: 'Works best when paired with a clear rider and deductible budget.',
        source: 'https://www.prudential.com.sg/products',
      },
      {
        id: 'pruactive-term',
        name: 'PRUActive Term',
        category: 'Life',
        planningLens: 'Family protection',
        horizon: '10 to 30 years',
        fit: ['Income replacement', 'Mortgage years', 'Young families'],
        summary: 'Term life protection for periods where liabilities and dependants are highest.',
        caution: 'Coverage ends at the chosen term, so renewability and future replacement cost matter.',
        source: 'https://www.prudential.com.sg/products',
      },
      {
        id: 'pruactive-life-ii',
        name: 'PRUActive Life II',
        category: 'Whole life',
        planningLens: 'Protection with cash value',
        horizon: 'Long-term',
        fit: ['Lifetime cover', 'Legacy planning', 'Structured protection'],
        summary: 'Whole life participating plan for death, terminal illness, and total permanent disability coverage.',
        caution: 'Higher long-term commitment than pure term cover.',
        source: 'https://www.prudential.com.sg/products/life-insurance/whole-life-insurance/pruactive-life-ii',
      },
      {
        id: 'pruwealth-income',
        name: 'PRUWealth Income',
        category: 'Retirement',
        planningLens: 'Income planning',
        horizon: 'Retirement runway',
        fit: ['Retirement income', 'Capital-conscious savers', 'Later-life cash flow'],
        summary: 'A savings-oriented whole life plan designed around monthly income and wealth accumulation.',
        caution: 'Returns and payout suitability depend on how much liquidity you need before retirement.',
        source: 'https://www.prudential.com.sg/products/wealth-accumulation/savings/pruwealth-income/',
      },
    ],
  },
  {
    id: 'manulife-sg',
    name: 'Manulife Singapore',
    shortName: 'Manulife',
    accent: '#2d8f64',
    accentSoft: 'rgba(45, 143, 100, 0.12)',
    description: 'Protection and savings lineup with flexible term cover, CI cover, and income-focused plans.',
    note: 'Official Manulife Singapore consumer products.',
    products: [
      {
        id: 'manuprotect-term-ii',
        name: 'ManuProtect Term (II)',
        category: 'Life',
        planningLens: 'Family protection',
        horizon: 'Fixed term',
        fit: ['Affordable cover', 'Mortgage protection', 'Breadwinner coverage'],
        summary: 'Customisable term life coverage with options up to age 85.',
        caution: 'Best for clients who want efficient protection, not cash value accumulation.',
        source: 'https://www.manulife.com.sg/en/solutions/life/term-life-insurance.html',
      },
      {
        id: 'early-completecare',
        name: 'Manulife Early CompleteCare',
        category: 'Critical illness',
        planningLens: 'Income shock protection',
        horizon: 'Working years',
        fit: ['Early-stage CI cover', 'Recovery buffer', 'Professionals'],
        summary: 'Critical illness protection with early-stage coverage and recovery-focused support.',
        caution: 'Needs to be sized against emergency fund and hospitalisation coverage.',
        source: 'https://www.manulife.com.sg/en/solutions/health/critical-illness.html',
      },
      {
        id: 'manulife-wealthgen',
        name: 'Manulife WealthGen',
        category: 'Savings',
        planningLens: 'Wealth accumulation',
        horizon: 'Long-term savings',
        fit: ['Long horizon', 'Legacy planning', 'SRS-or-cash funding'],
        summary: 'Savings and accumulation plan positioned for longer-run wealth building and continuity.',
        caution: 'More suitable for clients with stable surplus cash than those still building reserves.',
        source: 'https://www.manulife.com.sg/en/solutions/save/save.html',
      },
      {
        id: 'manulife-incomegen-ii',
        name: 'Manulife IncomeGen (II)',
        category: 'Retirement',
        planningLens: 'Lifetime income',
        horizon: 'Retirement runway',
        fit: ['Retirement payouts', 'Lifetime income', 'Conservative planning'],
        summary: 'Whole-life savings plan built around monthly income and protection coverage.',
        caution: 'Most relevant after core protection gaps have already been handled.',
        source: 'https://www.manulife.com.sg/content/dam/insurance/sg/solutions/our-solutions/save/savings-plan/manulife-income-gen/Income_Gen_EN.pdf',
      },
    ],
  },
  {
    id: 'income-insurance',
    name: 'Income Insurance',
    shortName: 'Income',
    accent: '#ee7a28',
    accentSoft: 'rgba(238, 122, 40, 0.12)',
    description: 'Broad Singapore retail shelf spanning shield, CI, life, accident, and retirement products.',
    note: 'Official Income Insurance consumer products.',
    products: [
      {
        id: 'incomeshield',
        name: 'IncomeShield',
        category: 'Health',
        planningLens: 'Hospital coverage',
        horizon: 'Immediate protection',
        fit: ['Integrated Shield', 'Private hospital option', 'MediShield upgrade'],
        summary: 'Integrated Shield coverage for members who want coverage above MediShield Life levels.',
        caution: 'Rider choices and co-payment structure matter more from 1 April 2026 onward.',
        source: 'https://www.income.com.sg/health-insurance/incomeshield',
      },
      {
        id: 'complete-critical-protect',
        name: 'Complete Critical Protect',
        category: 'Critical illness',
        planningLens: 'Disease protection',
        horizon: 'Working years',
        fit: ['Early-to-advanced CI cover', 'High medical shock concern', 'Recovery support'],
        summary: 'Critical illness plan covering early to advanced stage conditions with richer support features.',
        caution: 'Benefit structure is deeper, so understanding claim limits and options matters.',
        source: 'https://www.income.com.sg/life-insurance/complete-critical-protect',
      },
      {
        id: 'direct-star-protect-pro',
        name: 'DIRECT Star Protect Pro',
        category: 'Whole life',
        planningLens: 'Direct-purchase life cover',
        horizon: 'Long-term',
        fit: ['Lifetime base cover', 'Direct purchase', 'Simple estate protection'],
        summary: 'Whole life direct-purchase insurance for death, terminal illness, and TPD before age 65.',
        caution: 'This is a direct-purchase route, so product advice may be limited.',
        source: 'https://www.income.com.sg/life-insurance/direct-star-protect-pro',
      },
      {
        id: 'gro-retire-flex-pro-ii',
        name: 'Gro Retire Flex Pro II',
        category: 'Retirement',
        planningLens: 'Retirement income',
        horizon: 'Retirement runway',
        fit: ['Monthly retirement payouts', 'Flexible start date', 'Retirement planners'],
        summary: 'Retirement income plan with adjustable payout timing and multiple premium term options.',
        caution: 'Works better for planned retirement funding than short-term savings goals.',
        source: 'https://www.income.com.sg/savings-and-investments/gro-retire-flex-pro-ii',
      },
    ],
  },
]

const ALL_PRODUCTS = INSTITUTIONS.flatMap(institution =>
  institution.products.map(product => ({
    ...product,
    institutionId: institution.id,
    institutionName: institution.name,
    institutionShortName: institution.shortName,
    accent: institution.accent,
    accentSoft: institution.accentSoft,
  }))
)

function fmtCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function normalizeRiskProfile(profileValue) {
  if (typeof profileValue === 'number' && Number.isFinite(profileValue)) {
    if (profileValue <= 33.33) return 'Low'
    if (profileValue <= 66.66) return 'Moderate'
    return 'High'
  }
  const normalized = String(profileValue || '').trim().toLowerCase()
  if (['low', 'conservative'].includes(normalized)) return 'Low'
  if (['moderate', 'medium', 'balanced'].includes(normalized)) return 'Moderate'
  if (['high', 'aggressive'].includes(normalized)) return 'High'
  return 'Moderate'
}

function getProfileSignals(profile) {
  const country = String(profile?.country || 'Singapore')
  const risk = normalizeRiskProfile(profile?.risk_profile)
  const cash = Number(profile?.cash_balance || 0)
  const incomeCountry = String(profile?.income_summary?.country || country).toUpperCase()
  const householdMode = String(profile?.household_profile?.mode || 'personal')
  return {
    country,
    risk,
    cash,
    cpfEligible: incomeCountry === 'SG' || String(country).toUpperCase() === 'SG' || String(country).toLowerCase() === 'singapore',
    householdMode,
  }
}

function buildAssessment(product, signals) {
  let score = 54
  const reasons = []

  if (signals.cpfEligible && product.category === 'Health') {
    score += 16
    reasons.push('Pairs well with Singapore hospital-planning needs and MediShield top-up behaviour.')
  }
  if (signals.householdMode === 'household' && product.fit.some(tag => /family|mortgage|breadwinner/i.test(tag))) {
    score += 12
    reasons.push('Useful when household cash flow depends on one or two key income earners.')
  }
  if (signals.risk === 'Low' && ['Health', 'Life', 'Whole life', 'Critical illness', 'Retirement'].includes(product.category)) {
    score += 10
    reasons.push('Matches a lower-risk profile that usually prioritises downside protection first.')
  }
  if (signals.risk === 'Moderate' && ['Retirement', 'Savings', 'Whole life', 'Critical illness'].includes(product.category)) {
    score += 9
    reasons.push('Fits a balanced profile looking for protection with more structured accumulation.')
  }
  if (signals.risk === 'High' && ['Savings', 'Retirement'].includes(product.category)) {
    score += 4
    reasons.push('Can anchor part of the portfolio while higher-risk assets sit elsewhere.')
  }
  if (signals.cash >= 50000 && ['Savings', 'Retirement', 'Whole life'].includes(product.category)) {
    score += 11
    reasons.push('You appear to have enough deployable cash to consider longer-horizon planning products.')
  }
  if (signals.cash < 15000 && ['Savings', 'Retirement'].includes(product.category)) {
    score -= 8
  }
  if (product.fit.some(tag => /early-stage|hospital|income replacement|retirement/i.test(tag))) {
    score += 6
  }

  const confidence = Math.max(52, Math.min(97, score))
  const caution = signals.cash < 15000 && ['Savings', 'Retirement', 'Whole life'].includes(product.category)
    ? 'This may be better after cash reserves are stronger.'
    : product.caution

  return {
    score: confidence,
    suitable: confidence >= 68,
    reasons: reasons.slice(0, 3).length ? reasons.slice(0, 3) : [
      `Aligned to ${product.planningLens.toLowerCase()} rather than generic product browsing.`,
      `Targets ${product.fit.slice(0, 2).join(' and ').toLowerCase()}.`,
      'Useful if you want advisor conversations to start from a narrower shortlist.',
    ],
    caution,
  }
}

function fitTone(score) {
  if (score >= 84) return { label: 'Strong fit', color: '#0f766e', bg: 'rgba(15,118,110,0.12)' }
  if (score >= 70) return { label: 'Good fit', color: '#2563eb', bg: 'rgba(37,99,235,0.12)' }
  return { label: 'Review manually', color: '#9a6700', bg: 'rgba(154,103,0,0.12)' }
}

export default function InstitutionsHub() {
  const { user } = useAuth()
  const { setLoginModalOpen } = useLoginModal()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(Boolean(user?.user_id))
  const [error, setError] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [selectedInstitutionId, setSelectedInstitutionId] = useState(INSTITUTIONS[0].id)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedProductId, setSelectedProductId] = useState(ALL_PRODUCTS[0]?.id || '')
  const [requestNote, setRequestNote] = useState('')
  const [submitState, setSubmitState] = useState({ busy: false, message: '', error: '' })

  useEffect(() => {
    if (!user?.user_id) {
      setProfile(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`${API}/users/${encodeURIComponent(user.user_id)}`)
      .then(async res => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload?.detail || `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then(payload => {
        if (!cancelled) setProfile(payload?.user || null)
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Could not load institution matching.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [user?.user_id])

  const signals = getProfileSignals(profile)
  const latestRequest = Array.isArray(profile?.advisor_match_requests) ? profile.advisor_match_requests[0] : null

  const selectedInstitution = useMemo(
    () => INSTITUTIONS.find(item => item.id === selectedInstitutionId) || INSTITUTIONS[0],
    [selectedInstitutionId],
  )

  const categories = useMemo(() => {
    const values = new Set(['All'])
    selectedInstitution.products.forEach(product => values.add(product.category))
    return Array.from(values)
  }, [selectedInstitution])

  const visibleProducts = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    return ALL_PRODUCTS
      .filter(product => product.institutionId === selectedInstitutionId)
      .filter(product => selectedCategory === 'All' || product.category === selectedCategory)
      .filter(product => {
        if (!query) return true
        const haystack = [
          product.name,
          product.category,
          product.institutionName,
          product.summary,
          product.planningLens,
          ...product.fit,
        ].join(' ').toLowerCase()
        return haystack.includes(query)
      })
      .map(product => ({
        ...product,
        assessment: buildAssessment(product, signals),
      }))
      .sort((a, b) => b.assessment.score - a.assessment.score)
  }, [searchValue, selectedInstitutionId, selectedCategory, signals])

  useEffect(() => {
    if (selectedCategory !== 'All' && !categories.includes(selectedCategory)) {
      setSelectedCategory('All')
    }
  }, [categories, selectedCategory])

  useEffect(() => {
    if (!visibleProducts.some(item => item.id === selectedProductId)) {
      setSelectedProductId(visibleProducts[0]?.id || '')
    }
  }, [visibleProducts, selectedProductId])

  const selectedProduct = visibleProducts.find(item => item.id === selectedProductId)
    || ALL_PRODUCTS.map(product => ({ ...product, assessment: buildAssessment(product, signals) })).find(item => item.id === selectedProductId)
    || visibleProducts[0]
    || null
  const selectedTone = fitTone(selectedProduct?.assessment?.score || 0)

  function toggleInstitution(institutionId) {
    setSelectedInstitutionId(institutionId)
    setSelectedCategory('All')
  }

  async function handleMatchRequest() {
    if (!user?.user_id) {
      setLoginModalOpen(true)
      return
    }
    if (!selectedProduct) return

    setSubmitState({ busy: true, message: '', error: '' })
    try {
      const response = await fetch(`${API}/users/${encodeURIComponent(user.user_id)}/advisor-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institution_id: selectedProduct.institutionId,
          institution_name: selectedProduct.institutionName,
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          notes: requestNote,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.detail || `HTTP ${response.status}`)
      if (payload?.user) setProfile(payload.user)
      setSubmitState({
        busy: false,
        message: `Request sent to ${selectedProduct.institutionName}. The advisor will receive your selected product and current profile context.`,
        error: '',
      })
      setRequestNote('')
    } catch (err) {
      setSubmitState({ busy: false, message: '', error: err.message || 'Could not submit match request.' })
    }
  }

  return (
    <div style={styles.page}>
      <Navbar />
      <main style={styles.shell}>
        <section style={styles.commandCard}>
          <div style={styles.commandTopRow}>
            <div style={styles.searchWrap}>
              <div style={styles.filterSectionLabel}>Search the shelf</div>
              <input
                value={searchValue}
                onChange={event => setSearchValue(event.target.value)}
                placeholder="Search insurer, category, product, or use case"
                style={styles.searchInput}
              />
            </div>
          </div>

          <div style={styles.commandBottomRow}>
            <div style={styles.filterSection}>
              <div style={styles.filterSectionLabel}>Institution</div>
              <div style={styles.filterGroup}>
                {INSTITUTIONS.map(item => {
                  const active = selectedInstitutionId === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleInstitution(item.id)}
                      style={{
                        ...styles.filterChip,
                        ...(active ? { background: item.accentSoft, borderColor: item.accent, color: 'var(--text)' } : null),
                      }}
                    >
                      <span style={{ ...styles.filterDot, background: item.accent }} />
                      {item.shortName}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={styles.filterSection}>
              <div style={styles.filterSectionLabel}>Category</div>
              <div style={styles.filterGroup}>
                {categories.map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    style={{
                      ...styles.categoryChip,
                      ...(selectedCategory === category ? styles.categoryChipActive : null),
                    }}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section style={styles.mainGrid}>
          <article style={styles.tableCard}>
            <div style={styles.tableHeader}>
              <div>
                <div style={styles.cardEyebrow}>Product list</div>
                <div style={styles.tableTitle}>Institution-specific product filters</div>
              </div>
              <div style={{ ...styles.fitBadge, color: selectedTone.color, background: selectedTone.bg }}>
                {selectedTone.label} · {selectedProduct?.assessment?.score || 0}/100
              </div>
            </div>

            <div style={styles.tableWrap}>
              <div style={styles.tableHeadRow}>
                <div>Institution</div>
                <div>Product</div>
                <div>Category</div>
                <div>Planning use</div>
                <div>Fit score</div>
                <div>Source</div>
              </div>

              {visibleProducts.map(product => {
                const active = product.id === selectedProductId
                const tone = fitTone(product.assessment.score)
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setSelectedProductId(product.id)}
                    style={{
                      ...styles.tableRow,
                      borderColor: active ? product.accent : 'rgba(15, 23, 42, 0.08)',
                      boxShadow: active ? `0 0 0 1px ${product.accentSoft}, 0 24px 38px rgba(15, 23, 42, 0.08)` : 'none',
                    }}
                  >
                    <div style={styles.tableInstitutionCell}>
                      <span style={{ ...styles.filterDot, background: product.accent, width: 9, height: 9 }} />
                      {product.institutionShortName}
                    </div>
                    <div style={styles.tableProductCell}>
                      <div style={styles.tableProductName}>{product.name}</div>
                      <div style={styles.tableProductSummary}>{product.summary}</div>
                    </div>
                    <div style={styles.tableMuted}>{product.category}</div>
                    <div style={styles.tableMuted}>{product.planningLens}</div>
                    <div>
                      <div style={{ ...styles.tableScore, color: tone.color }}>{product.assessment.score}</div>
                      <div style={styles.tableScoreLabel}>{tone.label}</div>
                    </div>
                    <a
                      href={product.source}
                      target="_blank"
                      rel="noreferrer"
                      onClick={event => event.stopPropagation()}
                      style={styles.sourceLink}
                    >
                      Official
                    </a>
                  </button>
                )
              })}

              {!visibleProducts.length ? (
                <div style={styles.emptyInline}>No products match the current institution and category filters.</div>
              ) : null}
            </div>
          </article>

          <aside style={styles.sideStack}>
            <article style={styles.selectionCard}>
              <div style={styles.cardEyebrow}>Selected product</div>
              <div style={styles.selectionTopRow}>
                <div>
                  <div style={styles.selectionTitle}>{selectedProduct?.name || 'No product selected'}</div>
                  <div style={styles.selectionMeta}>
                    {selectedProduct?.institutionName || 'Choose a product'} · {selectedProduct?.category || 'Filtered shelf'}
                  </div>
                </div>
                {selectedProduct ? (
                  <span style={{ ...styles.institutionPill, background: selectedProduct.accentSoft, color: selectedProduct.accent }}>
                    {selectedProduct.horizon}
                  </span>
                ) : null}
              </div>

              {selectedProduct ? (
                <>
                  <p style={styles.selectionCopy}>{selectedProduct.summary}</p>
                  <div style={styles.tagRow}>
                    {selectedProduct.fit.map(tag => (
                      <span key={tag} style={styles.tagPill}>{tag}</span>
                    ))}
                  </div>

                  <div style={styles.fitReasonBox}>
                    <div style={styles.cautionLabel}>Why this product fits you</div>
                    <div style={styles.fitReasonList}>
                      {selectedProduct.assessment.reasons.map(reason => (
                        <div key={reason} style={styles.fitReasonRow}>
                          <span style={styles.fitReasonDot} />
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={styles.cautionCard}>
                    <div style={styles.cautionLabel}>Watch-out</div>
                    <div style={styles.cautionCopy}>{selectedProduct.assessment.caution}</div>
                  </div>
                </>
              ) : null}
            </article>

            <article style={styles.selectionCard}>
              <div style={styles.cardEyebrow}>Advisor handoff</div>
              <div style={styles.selectionTitle}>Request an FA from {selectedProduct?.institutionShortName || selectedInstitution.shortName}</div>
              <p style={styles.selectionCopy}>
                UNOVA will pass the selected institution, product interest, and your current risk and cash posture into the request.
              </p>
              <div style={styles.handoffGrid}>
                <div style={styles.handoffItem}>
                  <div style={styles.handoffLabel}>Risk profile</div>
                  <div style={styles.handoffValue}>{signals.risk}</div>
                </div>
                <div style={styles.handoffItem}>
                  <div style={styles.handoffLabel}>Cash posture</div>
                  <div style={styles.handoffValue}>{fmtCurrency(signals.cash)}</div>
                </div>
                <div style={styles.handoffItem}>
                  <div style={styles.handoffLabel}>Product fit</div>
                  <div style={styles.handoffValue}>{selectedProduct?.assessment?.score || 0}/100</div>
                </div>
                <div style={styles.handoffItem}>
                  <div style={styles.handoffLabel}>Mode</div>
                  <div style={styles.handoffValue}>{signals.householdMode === 'household' ? 'Household' : 'Personal'}</div>
                </div>
              </div>
              <textarea
                value={requestNote}
                onChange={event => setRequestNote(event.target.value)}
                placeholder="Optional: note your priority, such as hospital cover, CI protection, mortgage cover, or retirement income."
                style={styles.textArea}
              />
              <button type="button" onClick={handleMatchRequest} style={styles.primaryBtn} disabled={submitState.busy || !selectedProduct}>
                {submitState.busy ? 'Sending request…' : `Match me with ${selectedProduct?.institutionShortName || selectedInstitution.shortName}`}
              </button>
              {submitState.message ? <div style={styles.success}>{submitState.message}</div> : null}
              {submitState.error ? <div style={styles.errorText}>{submitState.error}</div> : null}
              {latestRequest ? (
                <div style={styles.latestRequest}>
                  Latest request: {latestRequest.institution_name}
                  {latestRequest.product_name ? ` · ${latestRequest.product_name}` : ''}
                </div>
              ) : null}
            </article>
          </aside>
        </section>

        {!user?.user_id ? (
          <section style={styles.emptyCard}>
            <div style={styles.emptyTitle}>Sign in to send an advisor request.</div>
            <div style={styles.emptyCopy}>You can browse the full insurer shelf without an account, but advisor handoff stays tied to your profile.</div>
            <button type="button" onClick={() => setLoginModalOpen(true)} style={styles.primaryBtn}>Sign in</button>
          </section>
        ) : loading ? (
          <section style={styles.emptyCard}>
            <div style={styles.emptyTitle}>Loading your fit signals…</div>
          </section>
        ) : error ? (
          <section style={styles.emptyCard}>
            <div style={styles.emptyTitle}>Could not load institution matching.</div>
            <div style={styles.emptyCopy}>{error}</div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'transparent',
    color: 'var(--text)',
  },
  shell: {
    width: 'min(1320px, calc(100vw - 40px))',
    margin: '0 auto',
    padding: '128px 0 88px',
  },
  commandCard: {
    borderRadius: 34,
    padding: 18,
    background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--glow-gold)',
    marginBottom: 20,
  },
  commandTopRow: {
    marginBottom: 20,
  },
  searchWrap: {
    width: '100%',
  },
  filterSection: {
    display: 'grid',
    gap: 10,
    alignContent: 'start',
  },
  filterSectionLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.68rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  },
  searchInput: {
    width: '100%',
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '18px 24px',
    background: 'var(--surface2)',
    color: 'var(--text)',
    font: 'inherit',
    outline: 'none',
    fontSize: '1.02rem',
  },
  commandBottomRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, auto) minmax(0, 1fr)',
    gap: 24,
    alignItems: 'start',
  },
  filterGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChip: {
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    borderRadius: 999,
    padding: '10px 14px',
    color: 'var(--text-dim)',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    outline: 'none',
    boxShadow: 'none',
  },
  categoryChip: {
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    borderRadius: 999,
    padding: '10px 14px',
    color: 'var(--text-dim)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  categoryChipActive: {
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    borderColor: 'var(--btn-primary-bg)',
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    display: 'inline-block',
  },
  cardEyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.68rem',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 10,
  },
  institutionPill: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    minWidth: 190,
    padding: '10px 18px',
    borderRadius: 999,
    background: 'var(--surface2)',
    color: 'var(--text-dim)',
    fontSize: '0.84rem',
    lineHeight: 1.2,
    border: '1px solid var(--border)',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.78fr)',
    gap: 18,
  },
  tableCard: {
    borderRadius: 34,
    padding: 22,
    background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--glow-gold)',
  },
  tableHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  tableTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.64rem',
    lineHeight: 1.08,
  },
  fitBadge: {
    padding: '8px 12px',
    borderRadius: 999,
    fontWeight: 700,
    fontSize: '0.85rem',
  },
  tableWrap: {
    display: 'grid',
    gap: 10,
  },
  tableHeadRow: {
    display: 'grid',
    gridTemplateColumns: '0.9fr 1.7fr 0.8fr 1fr 0.7fr 0.55fr',
    gap: 12,
    padding: '0 14px',
    color: 'var(--text-faint)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.7rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  tableRow: {
    border: '1px solid var(--border)',
    borderRadius: 24,
    background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
    padding: '16px 14px',
    display: 'grid',
    gridTemplateColumns: '0.9fr 1.7fr 0.8fr 1fr 0.7fr 0.55fr',
    gap: 12,
    alignItems: 'center',
    textAlign: 'left',
    cursor: 'pointer',
  },
  tableInstitutionCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    fontWeight: 700,
    color: 'var(--text)',
  },
  tableProductCell: {
    display: 'grid',
    gap: 6,
  },
  tableProductName: {
    fontWeight: 700,
    color: 'var(--text)',
  },
  tableProductSummary: {
    color: 'var(--text-dim)',
    lineHeight: 1.5,
    fontSize: '0.92rem',
  },
  tableMuted: {
    color: 'var(--text-dim)',
    lineHeight: 1.55,
  },
  tableScore: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.2rem',
    fontWeight: 700,
  },
  tableScoreLabel: {
    color: 'var(--text-faint)',
    fontSize: '0.82rem',
    marginTop: 2,
  },
  sourceLink: {
    color: 'var(--text)',
    fontWeight: 700,
    textDecoration: 'none',
  },
  sideStack: {
    display: 'grid',
    gap: 16,
  },
  selectionCard: {
    borderRadius: 34,
    padding: 24,
    background: 'color-mix(in srgb, var(--surface) 90%, transparent)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--glow-gold)',
  },
  selectionTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  selectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.5rem',
    lineHeight: 1.08,
    marginBottom: 6,
  },
  selectionMeta: {
    color: 'var(--text-faint)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.74rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  selectionCopy: {
    margin: '14px 0 0',
    color: 'var(--text-dim)',
    lineHeight: 1.7,
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  fitReasonBox: {
    borderRadius: 22,
    padding: 16,
    background: 'color-mix(in srgb, var(--surface2) 82%, transparent)',
    border: '1px solid var(--border)',
    marginTop: 18,
  },
  fitReasonList: {
    display: 'grid',
    gap: 10,
  },
  fitReasonRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    color: 'var(--text-dim)',
    lineHeight: 1.65,
    fontSize: '0.95rem',
  },
  fitReasonDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: 'var(--teal)',
    marginTop: 8,
    flexShrink: 0,
  },
  tagPill: {
    padding: '8px 11px',
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text-dim)',
    fontSize: '0.84rem',
  },
  cautionCard: {
    borderRadius: 22,
    padding: 16,
    background: 'color-mix(in srgb, var(--surface2) 82%, transparent)',
    border: '1px solid var(--border)',
    marginTop: 18,
  },
  cautionLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.68rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 8,
  },
  cautionCopy: {
    color: 'var(--text-dim)',
    lineHeight: 1.6,
  },
  handoffGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
    marginTop: 16,
  },
  handoffItem: {
    borderRadius: 20,
    padding: 14,
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
  },
  handoffLabel: {
    fontSize: '0.78rem',
    color: 'var(--text-faint)',
    marginBottom: 6,
  },
  handoffValue: {
    fontWeight: 700,
    color: 'var(--text)',
  },
  textArea: {
    width: '100%',
    minHeight: 120,
    resize: 'vertical',
    marginTop: 16,
    borderRadius: 22,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    padding: '15px 16px',
    font: 'inherit',
    outline: 'none',
  },
  primaryBtn: {
    marginTop: 14,
    border: 'none',
    borderRadius: 999,
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    fontWeight: 700,
    fontSize: '0.98rem',
    padding: '15px 18px',
    cursor: 'pointer',
  },
  success: {
    marginTop: 12,
    color: '#0f766e',
    lineHeight: 1.6,
  },
  errorText: {
    marginTop: 12,
    color: '#dc2626',
    lineHeight: 1.6,
  },
  latestRequest: {
    marginTop: 12,
    color: 'var(--text-faint)',
    lineHeight: 1.6,
    fontSize: '0.92rem',
  },
  emptyCard: {
    marginTop: 18,
    borderRadius: 30,
    padding: 24,
    background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--glow-gold)',
    display: 'grid',
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.28rem',
    color: 'var(--text)',
  },
  emptyCopy: {
    color: 'var(--text-dim)',
    lineHeight: 1.7,
  },
  emptyInline: {
    padding: '18px 14px',
    borderRadius: 20,
    border: '1px dashed var(--border-act)',
    color: 'var(--text-faint)',
    background: 'color-mix(in srgb, var(--surface) 72%, transparent)',
  },
}
