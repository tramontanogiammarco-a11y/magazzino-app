import { useEffect, useMemo, useState } from 'react'
import {
  ACTIVE_STATUSES,
  CONFIRMED_STATUSES,
  CONFIRMED_LOOKAHEAD_DAYS,
  STATUSES,
  addDaysIso,
  exportLeadsCsv,
  followUpDueDate,
  formatDate,
  isConfirmedInWindow,
  isFollowUpDue,
  newLeadDraft,
  normalizeLead,
  statusLabel,
  todayIso,
} from './lib/leads'
import { deleteLeadById, loadLeads, saveLead } from './lib/leadStore'

const emptyFilters = { query: '', status: 'all' }

function StatusBadge({ status }) {
  const item = STATUSES.find((s) => s.value === status)
  return <span className={`status-badge status-${item?.tone || 'neutral'}`}>{item?.label || status}</span>
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div className="stat-card">
      <p>{label}</p>
      <strong className={accent ? 'accent-text' : ''}>{value}</strong>
    </div>
  )
}

function AgendaItem({ lead, kind, onEdit, onDone }) {
  const date = kind === 'followup' ? followUpDueDate(lead) : lead.scheduledDate
  return (
    <article className="agenda-item">
      <div>
        <div className="agenda-title">
          <strong>{lead.fullName || 'Senza nome'}</strong>
          <StatusBadge status={lead.status} />
        </div>
        <p>{lead.car || 'Auto non inserita'} · {lead.city || 'Citta non inserita'}</p>
        <p className="muted">{kind === 'followup' ? 'Follow-up' : 'Batteria da gestire'}: {formatDate(date)}</p>
      </div>
      <div className="agenda-actions">
        {lead.phone ? (
          <a className="icon-btn" href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="Apri WhatsApp">
            WA
          </a>
        ) : null}
        <button className="secondary-btn" type="button" onClick={() => onEdit(lead)}>Apri</button>
        {kind === 'followup' ? (
          <button className="primary-btn small" type="button" onClick={() => onDone(lead)}>Rimanda 20gg</button>
        ) : null}
      </div>
    </article>
  )
}

function LeadForm({ draft, setDraft, onSubmit, editingId, onCancel }) {
  const confirmed = CONFIRMED_STATUSES.has(draft.status)

  return (
    <form className="app-card lead-form" onSubmit={onSubmit}>
      <div className="section-heading">
        <div>
          <p className="kicker">Relife Battery</p>
          <h2>{editingId ? 'Modifica lead' : 'Nuovo lead'}</h2>
        </div>
        {editingId ? <button className="ghost-btn" type="button" onClick={onCancel}>Annulla</button> : null}
      </div>

      <div className="form-grid">
        <Field label="Nome e cognome">
          <input value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} required placeholder="Es. Mario Rossi" />
        </Field>
        <Field label="Telefono">
          <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="Es. 333 1234567" />
        </Field>
        <Field label="Email">
          <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="nome@email.it" />
        </Field>
        <Field label="Citta/provincia">
          <input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="Es. Roma" />
        </Field>
        <Field label="Auto e marca">
          <input value={draft.car} onChange={(e) => setDraft({ ...draft, car: e.target.value })} required placeholder="Es. Toyota Auris 2014" />
        </Field>
        <Field label="Stato lead">
          <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </Field>
        {confirmed ? (
          <Field label="Data da seguire">
            <input
              type="date"
              value={draft.scheduledDate}
              onChange={(e) => setDraft({ ...draft, scheduledDate: e.target.value })}
              required
            />
          </Field>
        ) : null}
      </div>

      <Field label="Note interne">
        <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows="4" placeholder="Scrivi accordi, dubbi, prezzo, prossima azione..." />
      </Field>

      <button className="primary-btn full" type="submit">{editingId ? 'Salva modifiche' : 'Inserisci lead'}</button>
    </form>
  )
}

function LeadRow({ lead, onEdit, onDelete, onQuickStatus, onQuickDate }) {
  const isConfirmed = CONFIRMED_STATUSES.has(lead.status)

  return (
    <article className="lead-row">
      <div className="lead-main">
        <strong>{lead.fullName || 'Senza nome'}</strong>
        <span>{lead.car || 'Auto non inserita'}</span>
        <small>{lead.city || 'Citta non inserita'} · Aggiornato {formatDate(lead.updatedAt)}</small>
      </div>
      <div className="lead-contact">
        <span>{lead.phone || 'Telefono assente'}</span>
        <span>{lead.email || 'Email assente'}</span>
      </div>
      <div className="lead-status">
        <StatusBadge status={lead.status} />
        {lead.scheduledDate ? <small>{formatDate(lead.scheduledDate)}</small> : null}
      </div>
      <div className="row-actions">
        <select value={lead.status} onChange={(e) => onQuickStatus(lead, e.target.value)} title="Cambia stato rapido">
          {STATUSES.map((status) => (
            <option key={status.value} value={status.value}>{status.label}</option>
          ))}
        </select>
        {isConfirmed ? (
          <input
            className="row-date-input"
            type="date"
            value={lead.scheduledDate || todayIso()}
            onChange={(e) => onQuickDate(lead, e.target.value)}
            title="Data da seguire"
          />
        ) : null}
        <button className="secondary-btn" type="button" onClick={() => onEdit(lead)}>Apri</button>
        <button className="danger-btn" type="button" onClick={() => onDelete(lead.id)}>Elimina</button>
      </div>
    </article>
  )
}

export default function App() {
  const [leads, setLeads] = useState([])
  const [draft, setDraft] = useState(newLeadDraft)
  const [editingId, setEditingId] = useState('')
  const [filters, setFilters] = useState(emptyFilters)
  const [storageMode, setStorageMode] = useState('locale')
  const [showFollowUps, setShowFollowUps] = useState(false)

  useEffect(() => {
    let active = true
    loadLeads().then(({ leads: loadedLeads, mode }) => {
      if (!active) return
      setLeads(loadedLeads)
      setStorageMode(mode)
    })
    return () => {
      active = false
    }
  }, [])

  function sortLeads(next) {
    const sorted = [...next].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    return sorted
  }

  async function persistLead(nextLead) {
    const next = leads.some((lead) => lead.id === nextLead.id)
      ? leads.map((lead) => (lead.id === nextLead.id ? nextLead : lead))
      : [nextLead, ...leads]
    const sorted = sortLeads(next)
    setLeads(sorted)
    const result = await saveLead(nextLead)
    setStorageMode(result.mode)
  }

  function resetForm() {
    setDraft(newLeadDraft())
    setEditingId('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (CONFIRMED_STATUSES.has(draft.status) && !draft.scheduledDate) return
    const existing = leads.find((lead) => lead.id === editingId)
    const nextLead = normalizeLead(draft, existing)
    await persistLead(nextLead)
    resetForm()
  }

  function editLead(lead) {
    setEditingId(lead.id)
    setDraft({
      fullName: lead.fullName || '',
      phone: lead.phone || '',
      email: lead.email || '',
      city: lead.city || '',
      car: lead.car || '',
      status: lead.status || 'conversazione',
      scheduledDate: lead.scheduledDate || '',
      notes: lead.notes || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteLead(id) {
    if (!confirm('Eliminare questo lead?')) return
    setLeads(leads.filter((lead) => lead.id !== id))
    const result = await deleteLeadById(id)
    setStorageMode(result.mode)
    if (editingId === id) resetForm()
  }

  async function quickStatus(lead, status) {
    const scheduledDate = CONFIRMED_STATUSES.has(status) ? lead.scheduledDate || todayIso() : ''
    await persistLead(normalizeLead({ ...lead, status, scheduledDate }, lead))
  }

  async function quickDate(lead, scheduledDate) {
    await persistLead(normalizeLead({ ...lead, scheduledDate }, lead))
  }

  async function postponeFollowUp(lead) {
    await persistLead({ ...lead, updatedAt: todayIso(), lastMovedAt: todayIso() })
  }

  const today = todayIso()
  const stats = useMemo(() => {
    const active = leads.filter((lead) => ACTIVE_STATUSES.has(lead.status)).length
    return {
      total: leads.length,
      active,
      conversation: leads.filter((lead) => lead.status === 'conversazione').length,
      dueFollowups: leads.filter((lead) => isFollowUpDue(lead, today)).length,
      upcomingBatteries: leads.filter((lead) => isConfirmedInWindow(lead, today)).length,
      paid: leads.filter((lead) => lead.status === 'pagato').length,
    }
  }, [leads, today])

  const agenda = useMemo(() => {
    const followups = leads.filter((lead) => isFollowUpDue(lead, today))
    const batteries = leads
      .filter((lead) => isConfirmedInWindow(lead, today))
      .sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)))
    return { followups, batteries }
  }, [leads, today])

  const visibleLeads = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    return leads.filter((lead) => {
      const statusOk = filters.status === 'all' || lead.status === filters.status
      const queryOk =
        !q ||
        [lead.fullName, lead.phone, lead.email, lead.city, lead.car, statusLabel(lead.status)]
          .join(' ')
          .toLowerCase()
          .includes(q)
      return statusOk && queryOk
    })
  }, [filters, leads])

  return (
    <div className="app-shell">
      <div className="page-bg" aria-hidden />
      <header className="topbar">
        <div>
          <p className="kicker">Relife Battery</p>
          <h1>CRM</h1>
        </div>
        <div className="topbar-actions">
          <span className={`sync-pill ${storageMode === 'cloud' ? 'sync-cloud' : ''}`}>
            {storageMode === 'cloud' ? 'Cloud' : 'Locale'}
          </span>
          <button className="secondary-btn" type="button" onClick={() => exportLeadsCsv(leads)}>Export CSV</button>
        </div>
      </header>

      <main className="content">
        <section className="stats-grid">
          <StatCard label="Lead totali" value={stats.total} />
          <StatCard label="Attivi" value={stats.active} />
          <StatCard label="Conversazione" value={stats.conversation} />
          <StatCard label="Follow-up" value={stats.dueFollowups} accent />
          <StatCard label="Prossimi giorni" value={stats.upcomingBatteries} accent />
          <StatCard label="Pagati" value={stats.paid} />
        </section>

        <section className="work-grid">
          <LeadForm
            draft={draft}
            setDraft={setDraft}
            onSubmit={handleSubmit}
            editingId={editingId}
            onCancel={resetForm}
          />

          <aside className="app-card agenda-card">
            <div className="section-heading">
              <div>
                <p className="kicker">Prossimi giorni</p>
                <h2>Da seguire</h2>
              </div>
              <span className="date-pill">{formatDate(today)} - {formatDate(addDaysIso(today, CONFIRMED_LOOKAHEAD_DAYS))}</span>
            </div>

            <div className="agenda-block">
              <h3>Confermate da preparare</h3>
              {agenda.batteries.length ? (
                agenda.batteries.map((lead) => (
                  <AgendaItem key={lead.id} lead={lead} kind="battery" onEdit={editLead} onDone={postponeFollowUp} />
                ))
              ) : (
                <p className="empty">Nessuna conferma nei prossimi giorni.</p>
              )}
            </div>

            <button className="followup-toggle" type="button" onClick={() => setShowFollowUps((value) => !value)}>
              <span>Follow-up conversazioni ferme</span>
              <strong>{agenda.followups.length}</strong>
            </button>

            {showFollowUps ? (
              <div className="agenda-block followup-panel">
                {agenda.followups.length ? (
                  agenda.followups.map((lead) => (
                    <AgendaItem key={lead.id} lead={lead} kind="followup" onEdit={editLead} onDone={postponeFollowUp} />
                  ))
                ) : (
                  <p className="empty">Nessun lead in conversazione fermo da 20 giorni.</p>
                )}
              </div>
            ) : null}
          </aside>
        </section>

        <section className="app-card list-card">
          <div className="section-heading list-heading">
            <div>
              <p className="kicker">Archivio</p>
              <h2>Lead</h2>
            </div>
            <div className="filters">
              <input
                value={filters.query}
                onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                placeholder="Cerca nome, telefono, auto..."
              />
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="all">Tutti gli stati</option>
                {STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="lead-list">
            {visibleLeads.length ? (
              visibleLeads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onEdit={editLead}
                  onDelete={deleteLead}
                  onQuickStatus={quickStatus}
                  onQuickDate={quickDate}
                />
              ))
            ) : (
              <p className="empty">Nessun lead trovato.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
