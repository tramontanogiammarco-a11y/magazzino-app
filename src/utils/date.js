const DAY_MS = 24 * 60 * 60 * 1000

/** Giorni alla scadenza del ciclo 30g da una data di riferimento (es. loaded_at). */
export function daysToExpiry(createdAt) {
  if (!createdAt) return null
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return null
  const expiry = t + 30 * DAY_MS
  return Math.ceil((expiry - Date.now()) / DAY_MS)
}

export function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('it-IT')
}

export function monthKey(dateLike) {
  const d = new Date(dateLike)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
