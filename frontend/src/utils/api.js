const DEFAULT_LOCAL_API_BASE = 'http://localhost:8000'

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function inferApiBaseFromBrowser() {
  if (typeof window === 'undefined') return DEFAULT_LOCAL_API_BASE
  return isLocalHostname(window.location.hostname) ? DEFAULT_LOCAL_API_BASE : window.location.origin
}

export function resolveApiBase({
  explicitBase = '',
  browserBase = '',
} = {}) {
  const overrideBase = normalizeBaseUrl(explicitBase)
  if (overrideBase) return overrideBase

  const envBase = normalizeBaseUrl(import.meta.env.VITE_API_URL)
  if (envBase) return envBase

  const fallbackBrowserBase = normalizeBaseUrl(browserBase)
  if (fallbackBrowserBase) return fallbackBrowserBase

  return inferApiBaseFromBrowser()
}

export function getApiPaths(baseUrl) {
  const normalizedBase = normalizeBaseUrl(baseUrl) || resolveApiBase()
  return {
    baseUrl: normalizedBase,
    apiBase: `${normalizedBase}/api`,
    healthUrl: `${normalizedBase}/health`,
  }
}

export function createApiClient(baseUrl) {
  const paths = getApiPaths(baseUrl)
  return {
    ...paths,
    fetchJson: (input, init) => fetch(input, init),
  }
}

export const API_BASE = resolveApiBase()
export const API_API_BASE = `${API_BASE}/api`
