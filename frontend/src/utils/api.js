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

export const API_BASE = normalizeBaseUrl(import.meta.env.VITE_API_URL) || inferApiBaseFromBrowser()
export const API_API_BASE = `${API_BASE}/api`
