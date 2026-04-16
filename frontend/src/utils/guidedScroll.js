const GUIDED_SCROLL_KEY = 'unova-guided-scroll'
export const GUIDED_SCROLL_EVENT = 'unova-guided-scroll'

function safeParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function queueGuidedScroll(targetId, meta = {}) {
  const payload = {
    targetId,
    meta,
    timestamp: Date.now(),
  }

  try {
    sessionStorage.setItem(GUIDED_SCROLL_KEY, JSON.stringify(payload))
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GUIDED_SCROLL_EVENT, { detail: payload }))
  }

  return payload
}

export function consumeGuidedScroll() {
  if (typeof window === 'undefined') return null

  try {
    const raw = sessionStorage.getItem(GUIDED_SCROLL_KEY)
    if (!raw) return null
    sessionStorage.removeItem(GUIDED_SCROLL_KEY)
    return safeParse(raw)
  } catch {
    return null
  }
}
