export const DEFAULT_CURRENCY = 'USD'

const USD_TO = {
  USD: 1,
  SGD: 1.35,
  EUR: 0.92,
  GBP: 0.79,
}

const LOCALE_BY_CURRENCY = {
  USD: 'en-US',
  SGD: 'en-SG',
  EUR: 'de-DE',
  GBP: 'en-GB',
}

export function normalizeCurrencyCode(value) {
  const code = String(value || '').trim().toUpperCase()
  return USD_TO[code] ? code : DEFAULT_CURRENCY
}

export function convertCurrency(amount, fromCurrency = DEFAULT_CURRENCY, toCurrency = DEFAULT_CURRENCY) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return null
  const from = normalizeCurrencyCode(fromCurrency)
  const to = normalizeCurrencyCode(toCurrency)
  const valueInUsd = value / USD_TO[from]
  return valueInUsd * USD_TO[to]
}

export function formatCurrency(amount, currency = DEFAULT_CURRENCY, options = {}) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '—'
  const code = normalizeCurrencyCode(currency)
  const locale = LOCALE_BY_CURRENCY[code] || 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2,
    ...options,
  }).format(value)
}

export function formatCompactCurrency(amount, currency = DEFAULT_CURRENCY) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '—'
  const code = normalizeCurrencyCode(currency)
  const locale = LOCALE_BY_CURRENCY[code] || 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}

