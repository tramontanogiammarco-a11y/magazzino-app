import { STATUS_COLORS } from '../constants/statuses'

export default function StatusBadge({ status }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-xs ${STATUS_COLORS[status] || STATUS_COLORS.Magazzino}`}>
      {status}
    </span>
  )
}
