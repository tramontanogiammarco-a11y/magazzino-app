export const DELETED_STATUS = 'Eliminato'

export const STATUSES = [
  'Magazzino',
  'Caricato',
  'Venduto',
  'Pagato',
  'Reso',
  'Da Buttare',
  'Abbassa di Prezzo',
  'Beneficienza',
  'Ridato al Cliente',
]

export const STATUS_COLORS = {
  Magazzino: 'bg-slate-500/20 text-slate-200 border-slate-500/50',
  Caricato: 'bg-blue-500/20 text-blue-200 border-blue-500/50',
  Venduto: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50',
  Pagato: 'bg-violet-500/20 text-violet-200 border-violet-500/50',
  Reso: 'bg-amber-500/20 text-amber-200 border-amber-500/50',
  'Da Buttare': 'bg-rose-500/20 text-rose-200 border-rose-500/50',
  'Abbassa di Prezzo': 'bg-orange-500/20 text-orange-200 border-orange-500/50',
  Beneficienza: 'bg-teal-500/20 text-teal-200 border-teal-500/50',
  'Ridato al Cliente': 'bg-zinc-500/20 text-zinc-200 border-zinc-500/50',
  Eliminato: 'bg-rose-500/15 text-rose-200 border-rose-500/40',
}

/** Tailwind: testo scuro su sfondo pastello (inventario / dropdown stato) */
/** Evita value del select non presente tra le option (warning React / UI rotta). */
export function normalizeStatus(status) {
  if (status === 'Spedito') return 'Venduto'
  if (status === DELETED_STATUS) return DELETED_STATUS
  return STATUSES.includes(status) ? status : 'Magazzino'
}

export const STATUS_SELECT_CLASSES = {
  Magazzino:
    'bg-zinc-200 text-zinc-900 dark:bg-zinc-600/90 dark:text-zinc-100 border-zinc-300/80 dark:border-zinc-500/50',
  Caricato:
    'bg-sky-200 text-sky-950 dark:bg-sky-700/90 dark:text-sky-50 border-sky-300/80 dark:border-sky-500/50',
  Venduto:
    'bg-emerald-200 text-emerald-950 dark:bg-emerald-800/90 dark:text-emerald-50 border-emerald-300/80 dark:border-emerald-500/50',
  Pagato:
    'bg-teal-300 text-teal-950 dark:bg-teal-700/90 dark:text-teal-50 border-teal-400/80 dark:border-teal-500/50',
  Reso: 'bg-orange-200 text-orange-950 dark:bg-orange-800/90 dark:text-orange-50 border-orange-300/80 dark:border-orange-500/50',
  'Da Buttare':
    'bg-rose-200 text-rose-950 dark:bg-rose-800/90 dark:text-rose-50 border-rose-300/80 dark:border-rose-500/50',
  'Abbassa di Prezzo':
    'bg-amber-200 text-amber-950 dark:bg-amber-800/90 dark:text-amber-50 border-amber-300/80 dark:border-amber-500/50',
  Beneficienza:
    'bg-violet-200 text-violet-950 dark:bg-violet-800/90 dark:text-violet-50 border-violet-300/80 dark:border-violet-500/50',
  'Ridato al Cliente':
    'bg-amber-200 text-amber-950 dark:bg-amber-900/80 dark:text-amber-50 border-amber-300/80 dark:border-amber-600/50',
  Eliminato:
    'bg-rose-200 text-rose-950 dark:bg-rose-900/80 dark:text-rose-50 border-rose-300/80 dark:border-rose-700/60',
}

/** Colori solidi per grafici (Recharts), allineati agli stati */
export const STATUS_CHART_COLORS = {
  Magazzino: '#9ca3af',
  Caricato: '#3b82f6',
  Venduto: '#22c55e',
  Pagato: '#15803d',
  Reso: '#f97316',
  'Da Buttare': '#ef4444',
  'Abbassa di Prezzo': '#eab308',
  Beneficienza: '#a855f7',
  'Ridato al Cliente': '#92400e',
  Eliminato: '#e11d48',
}

export function isDeletedStatus(status) {
  return String(status || '').trim() === DELETED_STATUS
}
