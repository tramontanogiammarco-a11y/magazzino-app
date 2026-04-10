import { daysToExpiry } from '../utils/date'

export default function ExpiryBadge({ loadedAt, status }) {
  if (!loadedAt || status !== 'Caricato') return null
  const days = daysToExpiry(loadedAt)
  if (days === null || Number.isNaN(days)) return null

  if (days < 0) {
    return (
      <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800 dark:bg-red-500/25 dark:text-red-100">
        Scaduto ({Math.abs(days)}g)
      </span>
    )
  }

  if (days < 5) {
    return (
      <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-900 dark:bg-orange-500/25 dark:text-orange-100">
        Scade tra {days}g
      </span>
    )
  }

  return (
    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100">
      {days}g residui
    </span>
  )
}
