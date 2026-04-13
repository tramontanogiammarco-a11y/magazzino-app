import { normalizeStatus, STATUS_COLORS } from '../constants/statuses'

export default function StatusBadge({ status }) {
  const normalized = normalizeStatus(status)
  return (
    <span className={`rounded-full border px-2 py-1 text-xs ${STATUS_COLORS[normalized] || STATUS_COLORS.Magazzino}`}>
      {normalized}
    </span>
  )
}
