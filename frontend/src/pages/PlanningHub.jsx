import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLoginModal } from '../context/LoginModalContext.jsx'
import { API_BASE as API } from '../utils/api.js'

function fmtCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function fmtCompactCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

function fmtPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`
}

function parseTargetDateParts(targetDate) {
  const raw = String(targetDate || '').trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [yearText, monthText] = raw.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
      return { year, month }
    }
  }
  if (/^\d{4}$/.test(raw)) {
    return { year: Number(raw), month: 12 }
  }
  const compactParts = raw.split(/[-/]/).map(Number)
  if (compactParts.length === 3 && compactParts.every(Number.isFinite)) {
    const [first, second, third] = compactParts
    const year = third
    const month = second
    if (month >= 1 && month <= 12 && year >= 1900) {
      return { year, month, day: first }
    }
  }
  return null
}

function monthsUntilTarget(targetDate) {
  const parts = parseTargetDateParts(targetDate)
  if (!parts) return null
  const now = new Date()
  const currentMonths = now.getFullYear() * 12 + now.getMonth()
  const targetMonths = parts.year * 12 + (parts.month - 1)
  return Math.max(1, targetMonths - currentMonths + 1)
}

function formatTargetDateLabel(targetDate) {
  const parts = parseTargetDateParts(targetDate)
  if (!parts) return String(targetDate || 'No date')
  const labelDate = new Date(parts.year, Math.max(0, parts.month - 1), 1)
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(labelDate)
}

function startCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
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

function getStressScore(profile) {
  const direct = Number(profile?.financial_stress_index)
  if (Number.isFinite(direct)) return direct
  const nested = Number(profile?.wellness_metrics?.financial_stress_index)
  return Number.isFinite(nested) ? nested : 0
}

function getReserveMonths(profileBucket, stressScore) {
  const baseMonths = { Low: 6, Moderate: 4, High: 3 }[profileBucket] ?? 4
  if (stressScore >= 60) return baseMonths + 2
  if (stressScore >= 40) return baseMonths + 1
  return baseMonths
}

function getDeployableCash(profile) {
  const syncedCashBalance = Number(profile?.cash_balance || 0)
  const bankEntryTotal = Array.isArray(profile?.manual_assets)
    ? profile.manual_assets.reduce((sum, item) => item?.category === 'banks' ? sum + Number(item?.value || 0) : sum, 0)
    : 0
  return syncedCashBalance + bankEntryTotal
}

function getCurrentAllocation(profile) {
  const portfolio = profile?.portfolio && typeof profile.portfolio === 'object' ? profile.portfolio : {}
  const sumBucket = bucket => (
    Array.isArray(portfolio[bucket])
      ? portfolio[bucket].reduce((sum, item) => sum + Number(item?.market_value || 0), 0)
      : 0
  )
  const amounts = {
    equities: sumBucket('stocks'),
    bonds: sumBucket('bonds'),
    real_assets: sumBucket('real_assets'),
    cash: getDeployableCash(profile),
    commodities: sumBucket('commodities'),
    crypto: sumBucket('cryptos'),
  }
  const total = Object.values(amounts).reduce((sum, value) => sum + value, 0)
  const weights = Object.fromEntries(
    Object.entries(amounts).map(([key, value]) => [key, total > 0 ? value / total : 0])
  )
  return { amounts, weights, total }
}

const PROFILE_ALLOCATIONS = {
  Low: { equities: 0.30, bonds: 0.50, cash: 0.18, commodities: 0.02, crypto: 0.00 },
  Moderate: { equities: 0.50, bonds: 0.25, cash: 0.15, commodities: 0.05, crypto: 0.05 },
  High: { equities: 0.55, bonds: 0.10, cash: 0.10, commodities: 0.05, crypto: 0.20 },
}

function applyStressGuardrails(allocation, stressScore) {
  const adjusted = { ...allocation }
  if (stressScore >= 60) {
    adjusted.cash += 0.10
    adjusted.equities = Math.max(0.20, adjusted.equities - 0.05)
    adjusted.crypto = Math.max(0, adjusted.crypto - 0.05)
  } else if (stressScore >= 40) {
    adjusted.cash += 0.05
    adjusted.equities = Math.max(0.25, adjusted.equities - 0.03)
    adjusted.crypto = Math.max(0, adjusted.crypto - 0.02)
  }
  const total = Object.values(adjusted).reduce((sum, value) => sum + value, 0)
  return Object.fromEntries(Object.entries(adjusted).map(([key, value]) => [key, value / total]))
}

export default function PlanningHub() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { setLoginModalOpen } = useLoginModal()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(Boolean(user?.user_id))
  const [error, setError] = useState('')
  const [householdBusy, setHouseholdBusy] = useState(false)
  const [sharedGoalBusy, setSharedGoalBusy] = useState(false)
  const [householdForm, setHouseholdForm] = useState({
    mode:'personal',
    partner_name:'',
    partner_monthly_contribution:'',
    partner_monthly_income:'',
    partner_fixed_expenses:'',
    shared_budget_monthly:'',
    contribution_style:'income_weighted',
    dependents_count:'0',
    shared_cash_reserve_target:'',
  })
  const [sharedGoalForm, setSharedGoalForm] = useState({
    title:'',
    target_amount:'',
    current_saved:'',
    monthly_contribution:'',
    household_share:'',
    target_date:'',
    category:'shared_goal',
    priority:'3',
    owners:'',
    notes:'',
  })

  useEffect(() => {
    if (!user?.user_id) {
      setProfile(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`${API}/users/${encodeURIComponent(user.user_id)}/financials`)
      .then(async res => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload?.detail || `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then(payload => {
        if (cancelled) return
        setProfile(payload?.user || null)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message || 'Could not load planning details.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [user?.user_id])

  useEffect(() => {
    const household = profile?.household_profile ?? {}
    setHouseholdForm({
      mode: household.mode || 'personal',
      partner_name: household.partner_name || '',
      partner_monthly_contribution: household.partner_monthly_contribution ? String(household.partner_monthly_contribution) : '',
      partner_monthly_income: household.partner_monthly_income ? String(household.partner_monthly_income) : '',
      partner_fixed_expenses: household.partner_fixed_expenses ? String(household.partner_fixed_expenses) : '',
      shared_budget_monthly: household.shared_budget_monthly ? String(household.shared_budget_monthly) : '',
      contribution_style: household.contribution_style || 'income_weighted',
      dependents_count: Number.isFinite(Number(household.dependents_count)) ? String(household.dependents_count) : '0',
      shared_cash_reserve_target: household.shared_cash_reserve_target ? String(household.shared_cash_reserve_target) : '',
    })
  }, [profile?.household_profile])

  const subscriptionPlan = String(profile?.subscription_plan || 'free').toLowerCase()
  const isPremiumPlan = subscriptionPlan === 'premium'
  const incomeSummary = profile?.income_summary || null
  const sharedGoals = Array.isArray(profile?.shared_goals) ? profile.shared_goals : []
  const householdProfile = profile?.household_profile || {}
  const primaryMonthlyNet = Number(incomeSummary?.monthly_net || profile?.income || 0)
  const partnerMonthlyIncome = Number(householdProfile.partner_monthly_income || 0)
  const partnerMonthlyContribution = Number(householdProfile.partner_monthly_contribution || 0)
  const sharedBudgetMonthly = Number(householdProfile.shared_budget_monthly || 0)
  const sharedReserveTarget = Number(householdProfile.shared_cash_reserve_target || 0)
  const partnerFixedExpenses = Number(householdProfile.partner_fixed_expenses || 0)
  const dependentsCount = Number(householdProfile.dependents_count || 0)
  const householdMonthlyIncome = primaryMonthlyNet + partnerMonthlyIncome
  const sharedGoalMonthlyCommitment = sharedGoals.reduce((sum, goal) => sum + Number(goal.monthly_contribution || 0) + Number(goal.household_share || 0), 0)
  const householdSurplus = Math.max(0, householdMonthlyIncome - sharedBudgetMonthly - partnerFixedExpenses - sharedGoalMonthlyCommitment)
  const totalGoalTarget = sharedGoals.reduce((sum, goal) => sum + Number(goal.target_amount || 0), 0)
  const totalGoalSaved = sharedGoals.reduce((sum, goal) => sum + Number(goal.current_saved || 0), 0)
  const totalGoalProgress = totalGoalTarget > 0 ? totalGoalSaved / totalGoalTarget : 0

  const latentGrowthContext = useMemo(() => {
    if (!profile) return null
    const riskProfile = normalizeRiskProfile(profile.risk_profile)
    const stressScore = getStressScore(profile)
    const monthlyIncome = Number(incomeSummary?.monthly_net || profile.income || 0)
    const reserveMonths = getReserveMonths(riskProfile, stressScore)
    const reserveTarget = Math.max(monthlyIncome * reserveMonths, 10000)
    const allocation = getCurrentAllocation(profile)
    const targetWeights = applyStressGuardrails(PROFILE_ALLOCATIONS[riskProfile], stressScore)
    const targetCashAmount = allocation.total * targetWeights.cash
    const excessAboveReserve = Math.max(0, allocation.amounts.cash - reserveTarget)
    const excessAboveAllocation = Math.max(0, allocation.amounts.cash - targetCashAmount)
    const idleCash = Math.min(excessAboveReserve, excessAboveAllocation || excessAboveReserve)
    if (idleCash < 5000) return null
    const moveRatio = stressScore >= 60 ? 0.35 : stressScore >= 40 ? 0.5 : riskProfile === 'Low' ? 0.45 : riskProfile === 'Moderate' ? 0.6 : 0.75
    return {
      reserveMonths,
      keep_cash_amount: Math.max(reserveTarget, targetCashAmount),
      idle_cash: idleCash,
      suggested_move: Math.round((Math.min(idleCash, excessAboveAllocation) || idleCash) * moveRatio),
      target_cash_weight: targetWeights.cash,
      current_cash_weight: allocation.weights.cash,
    }
  }, [incomeSummary?.monthly_net, profile])

  const scenarioLabCards = useMemo(() => {
    const cards = []
    if (latentGrowthContext) {
      cards.push({
        id: 'excess-cash',
        title: 'Redirect 20% of excess cash',
        preview: `Redirect about ${fmtCompactCurrency((latentGrowthContext.suggested_move || 0) * 0.2)} from idle cash while keeping ${fmtCompactCurrency(latentGrowthContext.keep_cash_amount)} set aside.`,
        detail: `You are holding about ${fmtCompactCurrency(latentGrowthContext.idle_cash)} above your reserve and target-cash weight. This scenario turns latent capacity into a measured investment move.`,
        premium: false,
        accent: 'var(--teal)',
      })
    }
    cards.push(
      {
        id: 'rates-fall',
        title: 'If rates fall',
        preview: 'See how bond-heavy and reserve-heavy allocations react when rates ease and cash becomes less attractive.',
        detail: 'Premium expands this into a portfolio-level decision: extend duration, preserve cash, or rotate incrementally.',
        premium: true,
        accent: 'var(--purple)',
      },
      {
        id: 'income-shock',
        title: 'If I lose income for 4 months',
        preview: `Pressure-test about ${fmtCompactCurrency((incomeSummary?.monthly_net || 0) * 4)} of take-home cashflow against your reserves and household commitments.`,
        detail: 'Premium turns this into a resilience plan with reserve drawdown, contribution pauses, and downside actions.',
        premium: true,
        accent: '#F97316',
      },
      {
        id: 'retire-12',
        title: 'If I retire in 12 years',
        preview: 'Model the contribution lift, CPF support, and household sharing needed for a shorter timeline.',
        detail: 'Premium expands this with deeper gap-closing suggestions and tradeoff guidance.',
        premium: true,
        accent: 'var(--gold)',
      },
    )
    return cards
  }, [incomeSummary?.monthly_net, latentGrowthContext])

  const visibleScenarioLabCards = isPremiumPlan ? scenarioLabCards : scenarioLabCards.slice(0, 1)
  const lockedScenarioCount = Math.max(0, scenarioLabCards.length - visibleScenarioLabCards.length)
  const [selectedScenarioId, setSelectedScenarioId] = useState('')
  const [selectedMoveId, setSelectedMoveId] = useState('')
  const [showAllGoals, setShowAllGoals] = useState(false)

  const goalPlanner = useMemo(() => {
    const targetAmount = Number(sharedGoalForm.target_amount || 0)
    const currentSaved = Number(sharedGoalForm.current_saved || 0)
    const enteredYou = Number(sharedGoalForm.monthly_contribution || 0)
    const enteredPartner = Number(sharedGoalForm.household_share || 0)
    const months = monthsUntilTarget(sharedGoalForm.target_date)
    if (!targetAmount || !months) return null
    const remaining = Math.max(0, targetAmount - currentSaved)
    const requiredMonthlyTotal = remaining > 0 ? remaining / months : 0
    const totalIncome = Math.max(0, primaryMonthlyNet) + Math.max(0, partnerMonthlyIncome)
    let yourRatio = 0.5
    if (householdForm.contribution_style === 'income_weighted' && totalIncome > 0) {
      yourRatio = Math.max(0, primaryMonthlyNet) / totalIncome
    } else if (householdForm.contribution_style === 'custom') {
      const totalEntered = enteredYou + enteredPartner
      if (totalEntered > 0) yourRatio = enteredYou / totalEntered
    }
    const partnerRatio = 1 - yourRatio
    return {
      months,
      remaining,
      requiredMonthlyTotal,
      yourSuggestedMonthly: requiredMonthlyTotal * yourRatio,
      partnerSuggestedMonthly: requiredMonthlyTotal * partnerRatio,
      enteredTotal: enteredYou + enteredPartner,
      gap: requiredMonthlyTotal - (enteredYou + enteredPartner),
    }
  }, [
    householdForm.contribution_style,
    partnerMonthlyIncome,
    primaryMonthlyNet,
    sharedGoalForm.current_saved,
    sharedGoalForm.household_share,
    sharedGoalForm.monthly_contribution,
    sharedGoalForm.target_amount,
    sharedGoalForm.target_date,
  ])

  const scenarioPlayground = useMemo(() => {
    const scenarioMap = {
      'excess-cash': {
        icon: 'Glow',
        mission: 'Turn excess cash into a measured move without damaging your reserve buffer.',
        reward: 'More growth without losing resilience.',
        moves: [
          { id: 'hold-line', label: 'Hold all cash', summary: 'Protect maximum resilience.', deltas: { resilience: 22, growth: -12, flexibility: 4 }, result: 'You stay safest, but latent growth remains idle.' },
          { id: 'deploy-20', label: 'Deploy 20%', summary: 'Balanced first move.', deltas: { resilience: 10, growth: 16, flexibility: 10 }, result: 'You unlock a measured growth step while keeping the reserve intact.' },
          { id: 'deploy-40', label: 'Deploy 40%', summary: 'Push harder for upside.', deltas: { resilience: -8, growth: 26, flexibility: -4 }, result: 'Growth improves more, but your flexibility starts to narrow.' },
        ],
      },
      'rates-fall': {
        icon: 'Shift',
        mission: 'Rates ease and cash loses appeal. Decide how to react first.',
        reward: 'Better duration and income positioning.',
        moves: [
          { id: 'keep-short', label: 'Stay short duration', summary: 'Keep risk tight.', deltas: { resilience: 16, growth: 2, flexibility: 12 }, result: 'You preserve optionality, but miss more of the upside from falling rates.' },
          { id: 'extend-duration', label: 'Extend bond duration', summary: 'Lean into rates sensitivity.', deltas: { resilience: 2, growth: 22, flexibility: 4 }, result: 'You pick up more upside if rates fall, at the cost of more exposure.' },
          { id: 'split-barbell', label: 'Build a barbell', summary: 'Mix short cash and longer bonds.', deltas: { resilience: 10, growth: 14, flexibility: 10 }, result: 'You capture some upside while keeping a healthy flexibility buffer.' },
        ],
      },
      'income-shock': {
        icon: 'Shield',
        mission: 'Income pauses for four months. Decide how the household absorbs the shock.',
        reward: 'Resilience under stress.',
        moves: [
          { id: 'freeze-goals', label: 'Pause goal contributions', summary: 'Protect cash first.', deltas: { resilience: 20, growth: -10, flexibility: 14 }, result: 'The household preserves runway, but longer-term goals slow down.' },
          { id: 'trim-lifestyle', label: 'Trim budget 10%', summary: 'Reduce burn without stopping goals.', deltas: { resilience: 14, growth: 6, flexibility: 10 }, result: 'This is a strong middle path if the household can accept lifestyle cuts.' },
          { id: 'sell-risk', label: 'Liquidate risk assets', summary: 'Raise cash quickly.', deltas: { resilience: 8, growth: -18, flexibility: 6 }, result: 'Cash improves immediately, but you may lock in bad timing.' },
        ],
      },
      'retire-12': {
        icon: 'Orbit',
        mission: 'Shorten the retirement horizon to 12 years without breaking the plan.',
        reward: 'Stronger contribution discipline.',
        moves: [
          { id: 'lift-contrib', label: 'Increase monthly investing', summary: 'Fund the gap directly.', deltas: { resilience: 4, growth: 20, flexibility: -6 }, result: 'You move the goal forward fastest, but monthly slack gets tighter.' },
          { id: 'delay-lifestyle', label: 'Delay a lifestyle goal', summary: 'Free cash for retirement.', deltas: { resilience: 12, growth: 14, flexibility: 8 }, result: 'You rebalance priorities without creating as much monthly pressure.' },
          { id: 'use-cpf-core', label: 'Lean on CPF and bonds', summary: 'More stable path.', deltas: { resilience: 14, growth: 8, flexibility: 10 }, result: 'The plan becomes steadier, though less aggressive.' },
        ],
      },
    }
    return scenarioLabCards.map(card => ({ ...card, ...(scenarioMap[card.id] || {}) }))
  }, [scenarioLabCards])

  const activeScenario = scenarioPlayground.find(card => card.id === selectedScenarioId) || scenarioPlayground[0] || null
  const activeMove = activeScenario?.moves?.find(move => move.id === selectedMoveId) || activeScenario?.moves?.[0] || null
  const sortedSharedGoals = useMemo(() => (
    [...sharedGoals].sort((a, b) => {
      const priorityDelta = Number(a?.priority || 99) - Number(b?.priority || 99)
      if (priorityDelta !== 0) return priorityDelta
      return Number(b?.target_amount || 0) - Number(a?.target_amount || 0)
    })
  ), [sharedGoals])
  const hasExtraGoals = sortedSharedGoals.length > 2
  const visibleSharedGoals = showAllGoals ? sortedSharedGoals : sortedSharedGoals.slice(0, 2)
  const scenarioMeters = useMemo(() => {
    if (!activeMove) return []
    const base = { resilience: 50, growth: 50, flexibility: 50 }
    return [
      ['Resilience', Math.max(8, Math.min(100, base.resilience + activeMove.deltas.resilience)), 'var(--teal)'],
      ['Growth', Math.max(8, Math.min(100, base.growth + activeMove.deltas.growth)), 'var(--gold)'],
      ['Flexibility', Math.max(8, Math.min(100, base.flexibility + activeMove.deltas.flexibility)), 'var(--purple)'],
    ]
  }, [activeMove])

  useEffect(() => {
    if (!scenarioPlayground.length) {
      setSelectedScenarioId('')
      setSelectedMoveId('')
      return
    }
    if (!scenarioPlayground.some(card => card.id === selectedScenarioId)) {
      setSelectedScenarioId(scenarioPlayground[0].id)
    }
  }, [scenarioPlayground, selectedScenarioId])

  useEffect(() => {
    if (!activeScenario?.moves?.length) {
      setSelectedMoveId('')
      return
    }
    if (!activeScenario.moves.some(move => move.id === selectedMoveId)) {
      setSelectedMoveId(activeScenario.moves[0].id)
    }
  }, [activeScenario, selectedMoveId])

  const openGoalManager = useCallback(() => {
    setShowAllGoals(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById('shared-goal-title-input')?.focus()
      })
    })
  }, [])

  const saveHouseholdProfile = useCallback(async () => {
    if (!user?.user_id) return
    setHouseholdBusy(true)
    setError('')
    try {
      const res = await fetch(`${API}/users/${user.user_id}/household`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: householdForm.mode,
          partner_name: householdForm.partner_name,
          partner_monthly_contribution: Number(householdForm.partner_monthly_contribution || 0),
          partner_monthly_income: Number(householdForm.partner_monthly_income || 0),
          partner_fixed_expenses: Number(householdForm.partner_fixed_expenses || 0),
          shared_budget_monthly: Number(householdForm.shared_budget_monthly || 0),
          contribution_style: householdForm.contribution_style,
          dependents_count: Number(householdForm.dependents_count || 0),
          shared_cash_reserve_target: Number(householdForm.shared_cash_reserve_target || 0),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `HTTP ${res.status}`)
      }
      const payload = await res.json()
      if (payload?.user) setProfile(payload.user)
    } catch (err) {
      setError(err.message || 'Could not save household settings.')
    } finally {
      setHouseholdBusy(false)
    }
  }, [householdForm, user?.user_id])

  const addSharedGoal = useCallback(async () => {
    if (!user?.user_id) return
    setSharedGoalBusy(true)
    setError('')
    try {
      const res = await fetch(`${API}/users/${user.user_id}/shared-goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sharedGoalForm.title,
          target_amount: Number(sharedGoalForm.target_amount || 0),
          current_saved: Number(sharedGoalForm.current_saved || 0),
          monthly_contribution: Number(sharedGoalForm.monthly_contribution || 0),
          household_share: Number(sharedGoalForm.household_share || 0),
          target_date: sharedGoalForm.target_date,
          category: sharedGoalForm.category,
          priority: Number(sharedGoalForm.priority || 3),
          owners: sharedGoalForm.owners.split(',').map(item => item.trim()).filter(Boolean),
          notes: sharedGoalForm.notes,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `HTTP ${res.status}`)
      }
      const payload = await res.json()
      if (payload?.user) setProfile(payload.user)
      setSharedGoalForm({ title:'', target_amount:'', current_saved:'', monthly_contribution:'', household_share:'', target_date:'', category:'shared_goal', priority:'3', owners:'', notes:'' })
    } catch (err) {
      setError(err.message || 'Could not add shared goal.')
    } finally {
      setSharedGoalBusy(false)
    }
  }, [sharedGoalForm, user?.user_id])

  const removeSharedGoal = useCallback(async goalId => {
    if (!user?.user_id) return
    setSharedGoalBusy(true)
    setError('')
    try {
      const res = await fetch(`${API}/users/${user.user_id}/shared-goals/${encodeURIComponent(goalId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || `HTTP ${res.status}`)
      }
      const payload = await res.json()
      if (payload?.user) setProfile(payload.user)
    } catch (err) {
      setError(err.message || 'Could not remove shared goal.')
    } finally {
      setSharedGoalBusy(false)
    }
  }, [user?.user_id])

  return (
    <div style={styles.page}>
      <Navbar />
      <main style={styles.shell}>
        <section style={styles.hero}>
          <div>
            <div style={styles.eyebrow}>Planning</div>
            <h1 style={styles.title}>Shared goals, household context, and what-if decisions.</h1>
            <p style={styles.copy}>
              Keep partner planning, household contribution targets, and scenario testing together so Premium becomes a decision layer instead of a longer write-up.
            </p>
          </div>
          <div style={styles.badge}>{isPremiumPlan ? 'Premium depth enabled' : 'Free preview active'}</div>
        </section>

        {!user?.user_id ? (
          <section style={styles.emptyCard}>
            <div style={styles.emptyTitle}>Sign in to manage planning.</div>
            <div style={styles.emptyCopy}>This page combines household mode, shared goals, and scenario lab previews.</div>
            <button type="button" onClick={() => setLoginModalOpen(true)} style={styles.primaryBtn}>Sign in</button>
          </section>
        ) : loading ? (
          <section style={styles.emptyCard}><div style={styles.emptyTitle}>Loading planning details…</div></section>
        ) : error ? (
          <section style={styles.emptyCard}><div style={styles.emptyTitle}>Could not load this page.</div><div style={styles.emptyCopy}>{error}</div></section>
        ) : (
          <>
            <section style={styles.sectionStack}>
              <div style={styles.card}>
                <div style={styles.sectionEyebrow}>Overview</div>
                <div style={styles.sectionTitle}>Household snapshot</div>
                <div style={styles.sectionDescription}>
                  See the current shared position first, then update partner inputs, goals, and what-if scenarios below.
                </div>
                <div style={styles.snapshotGrid}>
                  {[
                    ['Household inflow', fmtCurrency(householdMonthlyIncome)],
                    ['Shared budget', fmtCurrency(sharedBudgetMonthly)],
                    ['Goal progress', totalGoalTarget > 0 ? fmtPercent(totalGoalProgress) : '0%'],
                    ['Monthly slack', fmtCurrency(householdSurplus)],
                  ].map(([label, value]) => (
                    <div key={label} style={styles.snapshotCard}>
                      <div style={styles.snapshotLabel}>{label}</div>
                      <div style={styles.snapshotValue}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={styles.householdInsights}>
                  <div style={styles.insightBox}>
                    <div style={styles.snapshotLabel}>Contribution style</div>
                    <div style={styles.insightText}>{startCase(householdProfile.contribution_style || 'income_weighted')}</div>
                  </div>
                  <div style={styles.insightBox}>
                    <div style={styles.snapshotLabel}>Dependents</div>
                    <div style={styles.insightText}>{dependentsCount}</div>
                  </div>
                  <div style={styles.insightBox}>
                    <div style={styles.snapshotLabel}>Shared reserve target</div>
                    <div style={styles.insightText}>{fmtCurrency(sharedReserveTarget)}</div>
                  </div>
                </div>
              </div>

              <div style={styles.rowGrid}>
                <div style={styles.card}>
                  <div style={styles.sectionEyebrow}>Setup</div>
                  <div style={styles.sectionTitle}>Partner mode</div>
                  <div style={styles.sectionDescription}>
                    Set the partner inputs and how the household should think about shared funding.
                  </div>
                  <div style={styles.modeTabs}>
                    {['personal', 'household'].map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setHouseholdForm(prev => ({ ...prev, mode }))}
                        style={{ ...styles.modeTab, ...(householdForm.mode === mode ? styles.modeTabActive : {}) }}
                      >
                        {mode === 'personal' ? 'Personal' : 'Household'}
                      </button>
                    ))}
                  </div>
                  <div style={styles.formSectionTitle}>Partner profile</div>
                  <div style={styles.formGrid}>
                    <input value={householdForm.partner_name} onChange={e => setHouseholdForm(prev => ({ ...prev, partner_name:e.target.value }))} placeholder="Partner name" style={styles.input} />
                    <input value={householdForm.partner_monthly_income} onChange={e => setHouseholdForm(prev => ({ ...prev, partner_monthly_income:e.target.value }))} placeholder="Partner monthly income" style={styles.input} inputMode="decimal" />
                    <input value={householdForm.partner_fixed_expenses} onChange={e => setHouseholdForm(prev => ({ ...prev, partner_fixed_expenses:e.target.value }))} placeholder="Partner fixed expenses" style={styles.input} inputMode="decimal" />
                    <input value={householdForm.partner_monthly_contribution} onChange={e => setHouseholdForm(prev => ({ ...prev, partner_monthly_contribution:e.target.value }))} placeholder="Partner monthly contribution" style={styles.input} inputMode="decimal" />
                  </div>
                  <div style={styles.formSectionTitle}>Shared guardrails</div>
                  <div style={styles.formGrid}>
                    <input value={householdForm.shared_budget_monthly} onChange={e => setHouseholdForm(prev => ({ ...prev, shared_budget_monthly:e.target.value }))} placeholder="Shared monthly budget" style={styles.input} inputMode="decimal" />
                    <input value={householdForm.shared_cash_reserve_target} onChange={e => setHouseholdForm(prev => ({ ...prev, shared_cash_reserve_target:e.target.value }))} placeholder="Shared reserve target" style={styles.input} inputMode="decimal" />
                    <input value={householdForm.dependents_count} onChange={e => setHouseholdForm(prev => ({ ...prev, dependents_count:e.target.value }))} placeholder="Dependents" style={styles.input} inputMode="numeric" />
                    <select value={householdForm.contribution_style} onChange={e => setHouseholdForm(prev => ({ ...prev, contribution_style:e.target.value }))} style={styles.input}>
                      <option value="income_weighted">Income-weighted split</option>
                      <option value="equal">Equal split</option>
                      <option value="custom">Custom split</option>
                    </select>
                  </div>
                  <button type="button" onClick={saveHouseholdProfile} style={{ ...styles.primaryBtn, opacity:householdBusy ? 0.65 : 1 }} disabled={householdBusy}>
                    {householdBusy ? 'Saving…' : 'Save household mode'}
                  </button>
                </div>

                <div style={styles.card}>
                  <div style={styles.goalHeader}>
                    <div>
                      <div style={styles.sectionEyebrow}>Goals</div>
                    <div style={styles.sectionTitleCompact}>Shared goals</div>
                  </div>
                  <div style={styles.goalCount}>{sharedGoals.length} active</div>
                </div>
                <div style={styles.goalList}>
                  {visibleSharedGoals.map(goal => (
                    <div key={goal.id} style={styles.goalCard}>
                      <div style={{ flex: 1 }}>
                        <div style={styles.goalTitle}>{goal.title}</div>
                        <div style={styles.goalMeta}>
                          Target {fmtCompactCurrency(goal.target_amount)} · Saved {fmtCompactCurrency(goal.current_saved || 0)} · Partner share {fmtCurrency(goal.household_share)}
                        </div>
                        <div style={styles.goalMeta}>
                          {(() => {
                            const remaining = Math.max(0, Number(goal.target_amount || 0) - Number(goal.current_saved || 0))
                            const months = monthsUntilTarget(goal.target_date)
                            const totalMonthly = Number(goal.monthly_contribution || 0) + Number(goal.household_share || 0)
                            const requiredMonthly = months ? remaining / months : 0
                            const onTrack = !months || totalMonthly >= requiredMonthly
                            const contributionSplit = `${fmtCurrency(goal.monthly_contribution || 0)} you · ${fmtCurrency(goal.household_share || 0)} partner`
                            const targetLabel = formatTargetDateLabel(goal.target_date)
                            const pacing = months ? `Need ${fmtCurrency(requiredMonthly)}/mo total` : 'Set a deadline to calculate pacing'
                            return `${targetLabel} · ${startCase(goal.category || 'shared goal')} · ${pacing} · ${contributionSplit} · ${onTrack ? 'On track' : 'Needs more monthly funding'}`
                          })()}
                        </div>
                        <div style={styles.progressTrack}>
                          <div
                            style={{
                              ...styles.progressFill,
                              width: `${Math.max(6, Math.min(100, Number(goal.target_amount || 0) > 0 ? (Number(goal.current_saved || 0) / Number(goal.target_amount || 1)) * 100 : 0))}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div style={styles.goalActions}>
                        <span style={styles.goalPriority}>P{goal.priority || 3}</span>
                        <button type="button" onClick={() => removeSharedGoal(goal.id)} style={styles.removeBtn} disabled={sharedGoalBusy}>Remove</button>
                      </div>
                    </div>
                  ))}
                  {!sharedGoals.length && (
                    <div style={styles.goalStarterCard}>
                      <div style={styles.goalStarterTitle}>Set your first shared goal</div>
                      <div style={styles.goalStarterCopy}>
                        Start with something concrete like a trip, home fund, or retirement milestone. Set an amount and deadline and the planner will calculate the pace you both need.
                      </div>
                      <button
                        type="button"
                        onClick={openGoalManager}
                        style={styles.secondaryBtn}
                      >
                        Create a goal
                      </button>
                    </div>
                  )}
                </div>
                {hasExtraGoals && (
                  <div style={styles.goalExpandRow}>
                    <button
                      type="button"
                      onClick={() => setShowAllGoals(prev => !prev)}
                      style={styles.goalExpandBtn}
                    >
                      {showAllGoals ? `Show top 2 goals` : `Show all ${sharedGoals.length} goals`}
                    </button>
                  </div>
                )}
                {showAllGoals && (
                  <>
                    <div style={styles.formSectionTitle}>Add a new shared goal</div>
                    <div style={styles.goalPlannerHero}>
                      <div>
                        <div style={styles.goalPlannerTitle}>Plan the deadline first</div>
                        <div style={styles.goalPlannerCopy}>
                          Pick a date and this card will tell you what both of you need to save each month to land on time.
                        </div>
                      </div>
                      {goalPlanner ? (
                        <div style={styles.goalPlannerBadge}>
                          {goalPlanner.months} months left
                        </div>
                      ) : (
                        <div style={styles.goalPlannerBadgeMuted}>Set amount + date</div>
                      )}
                    </div>
                    <div style={styles.formGridWide}>
                      <input id="shared-goal-title-input" value={sharedGoalForm.title} onChange={e => setSharedGoalForm(prev => ({ ...prev, title:e.target.value }))} placeholder="Goal title" style={styles.input} />
                      <select value={sharedGoalForm.category} onChange={e => setSharedGoalForm(prev => ({ ...prev, category:e.target.value }))} style={styles.input}>
                        <option value="shared_goal">Shared goal</option>
                        <option value="housing">Housing</option>
                        <option value="family">Family</option>
                        <option value="education">Education</option>
                        <option value="retirement">Retirement</option>
                        <option value="travel">Travel</option>
                      </select>
                      <select value={sharedGoalForm.priority} onChange={e => setSharedGoalForm(prev => ({ ...prev, priority:e.target.value }))} style={styles.input}>
                        <option value="1">Priority 1</option>
                        <option value="2">Priority 2</option>
                        <option value="3">Priority 3</option>
                        <option value="4">Priority 4</option>
                        <option value="5">Priority 5</option>
                      </select>
                      <input value={sharedGoalForm.target_amount} onChange={e => setSharedGoalForm(prev => ({ ...prev, target_amount:e.target.value }))} placeholder="Target amount" style={styles.input} inputMode="decimal" />
                      <input value={sharedGoalForm.current_saved} onChange={e => setSharedGoalForm(prev => ({ ...prev, current_saved:e.target.value }))} placeholder="Already saved" style={styles.input} inputMode="decimal" />
                      <input value={sharedGoalForm.monthly_contribution} onChange={e => setSharedGoalForm(prev => ({ ...prev, monthly_contribution:e.target.value }))} placeholder="Your monthly contribution" style={styles.input} inputMode="decimal" />
                      <input value={sharedGoalForm.household_share} onChange={e => setSharedGoalForm(prev => ({ ...prev, household_share:e.target.value }))} placeholder="Partner contribution" style={styles.input} inputMode="decimal" />
                      <input value={sharedGoalForm.target_date} onChange={e => setSharedGoalForm(prev => ({ ...prev, target_date:e.target.value }))} type="month" min={new Date().toISOString().slice(0, 7)} style={styles.input} />
                      <input value={sharedGoalForm.owners} onChange={e => setSharedGoalForm(prev => ({ ...prev, owners:e.target.value }))} placeholder="Owners (comma-separated)" style={styles.input} />
                    </div>
                    <div style={styles.goalPlannerGrid}>
                      <div style={styles.plannerMetric}>
                        <div style={styles.snapshotLabel}>Remaining</div>
                        <div style={styles.snapshotValue}>{goalPlanner ? fmtCurrency(goalPlanner.remaining) : 'Set goal'}</div>
                      </div>
                      <div style={styles.plannerMetric}>
                        <div style={styles.snapshotLabel}>Needed each month</div>
                        <div style={styles.snapshotValue}>{goalPlanner ? fmtCurrency(goalPlanner.requiredMonthlyTotal) : 'Set date'}</div>
                      </div>
                      <div style={styles.plannerMetric}>
                        <div style={styles.snapshotLabel}>Suggested you</div>
                        <div style={styles.snapshotValue}>{goalPlanner ? fmtCurrency(goalPlanner.yourSuggestedMonthly) : '—'}</div>
                      </div>
                      <div style={styles.plannerMetric}>
                        <div style={styles.snapshotLabel}>Suggested partner</div>
                        <div style={styles.snapshotValue}>{goalPlanner ? fmtCurrency(goalPlanner.partnerSuggestedMonthly) : '—'}</div>
                      </div>
                    </div>
                    {goalPlanner && (
                      <div style={styles.goalPlannerNote}>
                        {goalPlanner.gap > 0
                          ? `Your current planned monthly saving is ${fmtCurrency(goalPlanner.enteredTotal)}. You are short by about ${fmtCurrency(goalPlanner.gap)} each month to hit the deadline.`
                          : `Your current planned monthly saving is ${fmtCurrency(goalPlanner.enteredTotal)}. That is enough to stay on pace for this deadline.`}
                      </div>
                    )}
                    <textarea value={sharedGoalForm.notes} onChange={e => setSharedGoalForm(prev => ({ ...prev, notes:e.target.value }))} placeholder="Notes" style={styles.textarea} />
                    <button type="button" onClick={addSharedGoal} style={{ ...styles.secondaryBtn, opacity:sharedGoalBusy ? 0.65 : 1 }} disabled={sharedGoalBusy}>
                      {sharedGoalBusy ? 'Saving…' : 'Add shared goal'}
                    </button>
                  </>
                )}
              </div>
            </div>

              <div style={styles.card}>
                <div style={styles.goalHeader}>
                  <div>
                    <div style={styles.sectionEyebrow}>Scenario Lab</div>
                    <div style={styles.sectionTitleCompact}>Play the trade-offs</div>
                  </div>
                  <div style={styles.goalCount}>{isPremiumPlan ? 'Full decision deck' : 'One mission unlocked'}</div>
                </div>
                <div style={styles.sectionDescription}>
                  Pick a scenario, choose your move, and see how it changes resilience, growth, and flexibility. Premium unlocks the full deck.
                </div>
                <div style={styles.scenarioGameGrid}>
                  <div style={styles.scenarioDeck}>
                    {visibleScenarioLabCards.map(card => {
                      const active = activeScenario?.id === card.id
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => setSelectedScenarioId(card.id)}
                          style={{
                            ...styles.scenarioMissionCard,
                            ...(active ? styles.scenarioMissionCardActive : {}),
                            borderColor: active ? `${card.accent}55` : 'var(--border)',
                          }}
                        >
                          <div style={{ ...styles.scenarioTag, color: card.accent }}>{card.icon || 'Scenario'}</div>
                          <div style={styles.goalTitle}>{card.title}</div>
                          <div style={styles.scenarioDetail}>{card.preview}</div>
                        </button>
                      )
                    })}
                    {!isPremiumPlan && lockedScenarioCount > 0 && (
                      <div style={styles.lockedCard}>
                        <div style={styles.scenarioTag}>Premium deck</div>
                        <div style={styles.goalTitle}>{lockedScenarioCount} more missions</div>
                        <div style={styles.scenarioDetail}>
                          Unlock the full scenario board for richer downside, rate, retirement, and latent-growth decision paths.
                        </div>
                      </div>
                    )}
                  </div>

                  {activeScenario && (
                    <div style={styles.scenarioPlayground}>
                      <div style={styles.scenarioBoardHeader}>
                        <div>
                          <div style={styles.sectionEyebrow}>Mission</div>
                          <div style={styles.goalTitle}>{activeScenario.title}</div>
                          <div style={styles.scenarioDetail}>{activeScenario.mission}</div>
                        </div>
                        <div style={styles.goalPriority}>{activeScenario.reward}</div>
                      </div>

                      <div style={styles.moveGrid}>
                        {activeScenario.moves?.map(move => {
                          const active = activeMove?.id === move.id
                          return (
                            <button
                              key={move.id}
                              type="button"
                              onClick={() => setSelectedMoveId(move.id)}
                              style={{ ...styles.moveCard, ...(active ? styles.moveCardActive : {}) }}
                            >
                              <div style={styles.moveTitle}>{move.label}</div>
                              <div style={styles.moveSummary}>{move.summary}</div>
                            </button>
                          )
                        })}
                      </div>

                      <div style={styles.meterGrid}>
                        {scenarioMeters.map(([label, value, color]) => (
                          <div key={label} style={styles.meterCard}>
                            <div style={styles.snapshotLabel}>{label}</div>
                            <div style={styles.meterTrack}>
                              <div style={{ ...styles.meterFill, width: `${value}%`, background: color }} />
                            </div>
                            <div style={styles.meterValue}>{value}/100</div>
                          </div>
                        ))}
                      </div>

                      {activeMove && (
                        <div style={styles.scenarioResultCard}>
                          <div style={styles.sectionEyebrow}>Outcome</div>
                          <div style={styles.goalTitle}>{activeMove.label}</div>
                          <div style={styles.scenarioDetail}>{activeMove.result}</div>
                        </div>
                      )}

                      {latentGrowthContext && activeScenario?.id === 'excess-cash' && (
                        <div style={styles.latentCard}>
                          <div style={styles.snapshotLabel}>Latent growth signal</div>
                          <div style={styles.goalTitle}>Excess cash is available to redeploy.</div>
                          <div style={styles.scenarioDetail}>
                            About {fmtCompactCurrency(latentGrowthContext.idle_cash)} sits above your reserve and target-cash weight. Current cash is about {fmtPercent(latentGrowthContext.current_cash_weight)} versus a target near {fmtPercent(latentGrowthContext.target_cash_weight)}.
                          </div>
                        </div>
                      )}

                      <div style={styles.scenarioFooter}>
                        <button type="button" onClick={() => navigate('/pricing?source=scenario-lab')} style={styles.primaryBtn}>
                          Compare decision layers
                        </button>
                        <button type="button" onClick={() => navigate('/profile')} style={styles.secondaryBtn}>
                          Open portfolio analysis
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'transparent',
  },
  shell: {
    width: 'min(1180px, calc(100vw - 48px))',
    margin: '0 auto',
    padding: '132px 0 88px',
  },
  hero: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 24,
    marginBottom: 34,
  },
  eyebrow: { fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 10 },
  title: { margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(2.2rem, 5vw, 4.5rem)', lineHeight: 0.96, color: 'var(--text)', maxWidth: 780 },
  copy: { maxWidth: 760, margin: '18px 0 0', color: 'var(--text-dim)', fontSize: '1.08rem', lineHeight: 1.75 },
  badge: {
    padding: '12px 18px',
    borderRadius: 999,
    border: '1px solid var(--border)',
    background: 'color-mix(in srgb, var(--surface) 82%, transparent)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.74rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    whiteSpace: 'nowrap',
    boxShadow: '0 12px 28px rgba(15,23,42,0.06)',
  },
  sectionStack: {
    display: 'grid',
    gap: 22,
  },
  rowGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 0.94fr) minmax(0, 1.06fr)',
    gap: 22,
    alignItems: 'start',
  },
  card: {
    padding: 28,
    borderRadius: 30,
    background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
    border: '1px solid var(--border)',
    boxShadow: '0 28px 54px rgba(15,23,42,0.08)',
    backdropFilter: 'blur(14px)',
  },
  sectionEyebrow: { fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 },
  sectionTitle: { fontFamily: 'var(--font-display)', fontSize: '1.65rem', fontWeight: 700, color: 'var(--text)', marginBottom: 10, lineHeight: 1.1 },
  sectionTitleCompact: { fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 },
  sectionDescription: { color: 'var(--text-dim)', lineHeight: 1.72, marginBottom: 20, maxWidth: 760 },
  note: { color: 'var(--text-dim)', lineHeight: 1.72, marginBottom: 16 },
  snapshotGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 18 },
  snapshotCard: { padding: 18, borderRadius: 20, background: 'var(--surface2)', border: '1px solid var(--border)' },
  snapshotLabel: { fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 },
  snapshotValue: { fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, color: 'var(--text)' },
  modeTabs: { display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' },
  modeTab: { padding: '10px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--surface) 78%, transparent)', cursor: 'pointer', color: 'var(--text)' },
  modeTabActive: { background: 'rgba(38,198,174,0.12)', borderColor: 'rgba(38,198,174,0.28)', color: 'var(--teal)' },
  formSectionTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    margin: '4px 0 12px',
  },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 },
  formGridWide: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 },
  input: { width: '100%', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--surface2)', padding: '14px 16px', font: 'inherit', color: 'var(--text)' },
  textarea: { width: '100%', minHeight: 90, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--surface2)', padding: '14px 16px', font: 'inherit', color: 'var(--text)', resize: 'vertical', marginBottom: 12 },
  primaryBtn: { border: 'none', borderRadius: 999, padding: '12px 20px', background: 'var(--ink)', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  secondaryBtn: { border: '1px solid var(--border)', borderRadius: 999, padding: '12px 20px', background: 'color-mix(in srgb, var(--surface) 78%, transparent)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer' },
  householdInsights: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 4 },
  insightBox: { padding: 18, borderRadius: 20, background: 'color-mix(in srgb, var(--surface2) 86%, transparent)', border: '1px solid var(--border)' },
  insightText: { fontWeight: 700, color: 'var(--text)', lineHeight: 1.45 },
  goalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 },
  subheading: { fontWeight: 700, color: 'var(--text)', fontSize: '1rem' },
  goalCount: { fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.14em' },
  goalList: { display: 'grid', gap: 12, marginBottom: 18 },
  goalCard: { display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', padding: 18, borderRadius: 20, background: 'var(--surface2)', border: '1px solid var(--border)' },
  goalTitle: { fontWeight: 700, color: 'var(--text)', fontSize: '1.02rem', lineHeight: 1.35 },
  goalMeta: { fontSize: '0.83rem', color: 'var(--text-dim)', lineHeight: 1.6, marginTop: 6 },
  goalPlannerHero: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    padding: 18,
    borderRadius: 22,
    background: 'linear-gradient(135deg, color-mix(in srgb, var(--teal) 10%, var(--surface) 90%), color-mix(in srgb, var(--surface) 84%, transparent))',
    border: '1px solid color-mix(in srgb, var(--teal) 22%, var(--border) 78%)',
    marginBottom: 14,
  },
  goalPlannerTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.08rem',
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: 6,
  },
  goalPlannerCopy: {
    color: 'var(--text-dim)',
    lineHeight: 1.6,
    maxWidth: 620,
  },
  goalPlannerBadge: {
    borderRadius: 999,
    padding: '10px 14px',
    background: 'rgba(38,198,174,0.12)',
    color: 'var(--teal)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  goalPlannerBadgeMuted: {
    borderRadius: 999,
    padding: '10px 14px',
    background: 'color-mix(in srgb, var(--surface) 70%, transparent)',
    color: 'var(--text-faint)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  goalPlannerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
    marginBottom: 12,
  },
  plannerMetric: {
    padding: 16,
    borderRadius: 18,
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
  },
  goalPlannerNote: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 16,
    background: 'color-mix(in srgb, var(--surface2) 88%, transparent)',
    border: '1px solid var(--border)',
    color: 'var(--text-dim)',
    lineHeight: 1.65,
  },
  progressTrack: { width: '100%', height: 8, borderRadius: 999, background: 'rgba(148,163,184,0.18)', overflow: 'hidden', marginTop: 10 },
  progressFill: { height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, rgba(38,198,174,0.9), rgba(94,234,212,0.95))' },
  goalActions: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, minWidth: 86 },
  goalPriority: { padding: '6px 10px', borderRadius: 999, background: 'rgba(38,198,174,0.12)', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' },
  removeBtn: { border: '1px solid rgba(239,68,68,0.18)', color: '#ef4444', background: 'color-mix(in srgb, var(--surface) 78%, transparent)', borderRadius: 999, padding: '10px 14px', cursor: 'pointer', fontWeight: 700 },
  goalStarterCard: {
    padding: 20,
    borderRadius: 20,
    border: '1px dashed var(--border)',
    background: 'color-mix(in srgb, var(--surface2) 88%, transparent)',
  },
  goalStarterTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.1rem',
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: 8,
  },
  goalStarterCopy: {
    color: 'var(--text-dim)',
    lineHeight: 1.7,
    marginBottom: 14,
    maxWidth: 680,
  },
  goalExpandRow: {
    display: 'flex',
    justifyContent: 'flex-start',
    marginBottom: 16,
  },
  goalExpandBtn: {
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '10px 16px',
    background: 'color-mix(in srgb, var(--surface) 78%, transparent)',
    color: 'var(--text)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  scenarioList: { display: 'grid', gap: 12 },
  scenarioCard: { padding: 18, borderRadius: 20, background: 'var(--surface2)', border: '1px solid var(--border)' },
  scenarioTag: { fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 10 },
  scenarioPreview: { color: 'var(--text)', lineHeight: 1.7, marginTop: 10 },
  scenarioDetail: { color: 'var(--text-dim)', lineHeight: 1.7, marginTop: 10 },
  lockedCard: { padding: 18, borderRadius: 20, background: 'color-mix(in srgb, var(--surface) 76%, transparent)', border: '1px dashed rgba(15,23,42,0.14)' },
  scenarioFooter: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 },
  scenarioGameGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(260px, 0.7fr) minmax(0, 1.3fr)',
    gap: 18,
    alignItems: 'start',
  },
  scenarioDeck: {
    display: 'grid',
    gap: 12,
  },
  scenarioMissionCard: {
    textAlign: 'left',
    padding: 18,
    borderRadius: 22,
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    transition: 'transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
  },
  scenarioMissionCardActive: {
    transform: 'translateY(-1px)',
    boxShadow: '0 18px 32px rgba(15,23,42,0.08)',
    background: 'color-mix(in srgb, var(--surface) 84%, transparent)',
  },
  scenarioPlayground: {
    padding: 20,
    borderRadius: 26,
    background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface) 92%, transparent), color-mix(in srgb, var(--surface2) 90%, transparent))',
    border: '1px solid var(--border)',
  },
  scenarioBoardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 18,
  },
  moveGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 12,
    marginBottom: 18,
  },
  moveCard: {
    textAlign: 'left',
    padding: 16,
    borderRadius: 18,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    cursor: 'pointer',
  },
  moveCardActive: {
    borderColor: 'rgba(38,198,174,0.3)',
    background: 'rgba(38,198,174,0.08)',
    boxShadow: '0 16px 28px rgba(38,198,174,0.12)',
  },
  moveTitle: {
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: 6,
  },
  moveSummary: {
    color: 'var(--text-dim)',
    lineHeight: 1.55,
    fontSize: '0.92rem',
  },
  meterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12,
    marginBottom: 16,
  },
  meterCard: {
    padding: 14,
    borderRadius: 18,
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
  },
  meterTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    background: 'rgba(148,163,184,0.18)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  meterFill: {
    height: '100%',
    borderRadius: 999,
  },
  meterValue: {
    color: 'var(--text)',
    fontWeight: 700,
    fontSize: '0.92rem',
  },
  scenarioResultCard: {
    padding: 18,
    borderRadius: 20,
    background: 'color-mix(in srgb, var(--surface2) 92%, transparent)',
    border: '1px solid var(--border)',
  },
  latentCard: { marginTop: 16, padding: 18, borderRadius: 20, background: 'rgba(38,198,174,0.08)', border: '1px solid rgba(38,198,174,0.2)' },
  emptyCard: { padding: 28, borderRadius: 30, background: 'color-mix(in srgb, var(--surface) 88%, transparent)', border: '1px solid var(--border)', boxShadow: '0 24px 44px rgba(15,23,42,0.07)', backdropFilter: 'blur(14px)' },
  emptyTitle: { fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)' },
  emptyCopy: { color: 'var(--text-dim)', lineHeight: 1.75, margin: '10px 0 16px' },
  emptyInline: { color: 'var(--text-faint)', fontSize: '0.95rem' },
}
