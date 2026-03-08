export function refreshPage(delayMs = 300) {
  if (typeof window === 'undefined') return
  const delay = Math.max(0, Number(delayMs) || 0)
  window.setTimeout(() => window.location.reload(), delay)
}
