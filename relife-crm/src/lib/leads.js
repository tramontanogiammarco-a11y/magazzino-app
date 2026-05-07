export const STATUSES = [
  { value: 'no_target', label: 'No target', tone: 'neutral' },
  { value: 'conversazione', label: 'Conversazione', tone: 'info' },
  { value: 'confermato_spedisce', label: 'Confermato spedisce', tone: 'work' },
  { value: 'confermato_porta', label: 'Confermato ce la porta', tone: 'work' },
  { value: 'confermato_silvano', label: 'Confermato Silvano', tone: 'work' },
  { value: 'pagato', label: 'Pagato', tone: 'success' },
]

export const CONFIRMED_STATUSES = new Set(['confermato_spedisce', 'confermato_porta', 'confermato_silvano'])
export const ACTIVE_STATUSES = new Set(['conversazione', ...CONFIRMED_STATUSES])
export const STORAGE_KEY = 'relife_crm_leads_v3'
export const FOLLOW_UP_DAYS = 20
export const CONFIRMED_LOOKAHEAD_DAYS = 8

export function statusLabel(status) {
  return STATUSES.find((item) => item.value === status)?.label || status
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function formatDate(iso) {
  if (!iso) return '—'
  const date = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

export function daysBetween(fromIso, toIso = todayIso()) {
  const from = new Date(`${fromIso}T12:00:00`)
  const to = new Date(`${toIso}T12:00:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0
  return Math.floor((to - from) / 86400000)
}

export function addDaysIso(fromIso, days) {
  const date = new Date(`${fromIso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function followUpDueDate(lead) {
  if (lead.status !== 'conversazione') return ''
  const base = new Date(`${lead.lastMovedAt || lead.updatedAt || lead.createdAt}T12:00:00`)
  if (Number.isNaN(base.getTime())) return ''
  base.setDate(base.getDate() + FOLLOW_UP_DAYS)
  return base.toISOString().slice(0, 10)
}

export function isFollowUpDue(lead, today = todayIso()) {
  const due = followUpDueDate(lead)
  return Boolean(due && due <= today)
}

export function isBatteryTaskDue(lead, today = todayIso()) {
  return CONFIRMED_STATUSES.has(lead.status) && lead.scheduledDate && lead.scheduledDate <= today
}

export function isConfirmedInWindow(lead, today = todayIso(), days = CONFIRMED_LOOKAHEAD_DAYS) {
  if (!CONFIRMED_STATUSES.has(lead.status) || !lead.scheduledDate) return false
  const end = addDaysIso(today, days)
  return lead.scheduledDate >= today && lead.scheduledDate <= end
}

export function newLeadDraft() {
  return {
    fullName: '',
    phone: '',
    email: '',
    city: '',
    car: '',
    status: 'conversazione',
    scheduledDate: '',
    notes: '',
  }
}

export function normalizeLead(input, existing) {
  const now = todayIso()
  const status = input.status || 'conversazione'
  const previousStatus = existing?.status
  const statusChanged = previousStatus && previousStatus !== status

  return {
    id: existing?.id || crypto.randomUUID(),
    fullName: String(input.fullName || '').trim(),
    phone: String(input.phone || '').trim(),
    email: String(input.email || '').trim(),
    city: String(input.city || '').trim(),
    car: String(input.car || '').trim(),
    status,
    scheduledDate: CONFIRMED_STATUSES.has(status) ? String(input.scheduledDate || '').trim() : '',
    notes: String(input.notes || '').trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastMovedAt: statusChanged || !existing?.lastMovedAt ? now : existing.lastMovedAt,
  }
}

export function readLeads() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeLeads(leads) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads))
}

export function seedLeadsIfEmpty() {
  if (readLeads().length) return
  const today = todayIso()
  const old = new Date(`${today}T12:00:00`)
  old.setDate(old.getDate() - 24)
  const tomorrow = new Date(`${today}T12:00:00`)
  tomorrow.setDate(tomorrow.getDate() + 1)

  writeLeads([
    normalizeLead({
      fullName: 'Mario Rossi',
      phone: '333 1234567',
      email: 'mario@example.com',
      city: 'Roma',
      car: 'Toyota Auris 2014',
      status: 'conversazione',
      notes: 'Da richiamare per confermare disponibilita batteria.',
    }),
    {
      ...normalizeLead({
        fullName: 'Lucia Bianchi',
        phone: '349 7654321',
        city: 'Milano',
        car: 'Toyota Yaris 2016',
        status: 'confermato_spedisce',
        scheduledDate: tomorrow.toISOString().slice(0, 10),
        notes: 'Attende istruzioni per spedizione.',
      }),
      createdAt: old.toISOString().slice(0, 10),
      updatedAt: old.toISOString().slice(0, 10),
      lastMovedAt: old.toISOString().slice(0, 10),
    },
  ])
}

export function exportLeadsCsv(leads) {
  const headers = ['Nome', 'Telefono', 'Email', 'Citta', 'Auto', 'Stato', 'Data', 'Note']
  const rows = leads.map((lead) => [
    lead.fullName,
    lead.phone,
    lead.email,
    lead.city,
    lead.car,
    statusLabel(lead.status),
    lead.scheduledDate,
    lead.notes,
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `relife-crm-${todayIso()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
