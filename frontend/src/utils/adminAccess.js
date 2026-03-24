const ADMIN_KEY_STORAGE = 'unova_admin_key'

export function getAdminKey() {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE) || ''
  } catch {
    return ''
  }
}

export function hasAdminAccess() {
  return Boolean(getAdminKey())
}

export function setAdminKey(value) {
  try {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, String(value || '').trim())
  } catch {}
}

export function clearAdminKey() {
  try {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE)
  } catch {}
}

export function getAdminHeaders(extraHeaders = {}) {
  const key = getAdminKey()
  return {
    ...extraHeaders,
    ...(key ? { 'X-Unova-Admin-Key': key } : {}),
  }
}
