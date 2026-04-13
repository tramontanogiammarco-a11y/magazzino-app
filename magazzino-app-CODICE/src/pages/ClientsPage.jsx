import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportClientPdf } from '../lib/exportClientPdf'
import { clientShareFromSalePrice } from '../lib/vintedCommission'
import { displayOptionalColumn, displaySku, fetchClientProfiles, supabase, upsertClientProfile } from '../lib/supabase'
import { daysToExpiry, formatDate } from '../utils/date'

function emptyProfileForm(clientName) {
  return {
    client_name: clientName,
    first_name: '',
    last_name: '',
    phone: '',
    expected_revenue: '',
    email: '',
    iban: '',
  }
}

function rowToForm(row) {
  const cn = row.client_name
  return {
    client_name: cn,
    first_name: row.first_name ?? '',
    last_name: row.last_name ?? '',
    phone: row.phone ?? '',
    expected_revenue: row.expected_revenue != null ? String(row.expected_revenue) : '',
    email: row.email ?? '',
    iban: row.iban ?? '',
  }
}

function profileHasAnyData(f) {
  return Boolean(
    f.first_name?.trim() ||
      f.last_name?.trim() ||
      f.phone?.trim() ||
      f.expected_revenue?.toString().trim() ||
      f.email?.trim() ||
      f.iban?.trim(),
  )
}

export default function ClientsPage() {
  const [products, setProducts] = useState([])
  const [profileForms, setProfileForms] = useState({})
  const [pdfLoading, setPdfLoading] = useState(null)
  const [savingClient, setSavingClient] = useState(null)
  const [saveMessage, setSaveMessage] = useState({})
  /** clientName → form anagrafica aperto */
  const [profileOpen, setProfileOpen] = useState({})

  const loadData = useCallback(async () => {
    const { data: prodData, error: prodErr } = await supabase.from('products').select('*')
    if (prodErr) console.error(prodErr)
    setProducts(prodData || [])

    let profileRows = []
    try {
      profileRows = await fetchClientProfiles()
    } catch (e) {
      console.warn('client_profiles:', e.message)
    }
    setProfileForms((prev) => {
      const next = { ...prev }
      for (const row of profileRows) {
        if (row.client_name) next[row.client_name] = rowToForm(row)
      }
      return next
    })
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const clients = useMemo(() => {
    const map = new Map()
    for (const p of products) {
      const key = displayOptionalColumn(p.client_name) || 'Senza Nome'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }

    return [...map.entries()].map(([clientName, items]) => {
      const toPay = items
        .filter((i) => i.status === 'Venduto')
        .reduce((sum, i) => sum + clientShareFromSalePrice(i.price), 0)

      const expiringItems = items.filter((i) => i.status === 'Caricato' && i.loaded_at)
      const minDays =
        expiringItems.length === 0 ? null : Math.min(...expiringItems.map((i) => daysToExpiry(i.loaded_at) ?? 9999))

      return { clientName, items, toPay, minDays }
    })
  }, [products])

  const getForm = (clientName) => ({
    ...emptyProfileForm(clientName),
    ...profileForms[clientName],
  })

  const patchForm = (clientName, field, value) => {
    setProfileForms((prev) => ({
      ...prev,
      [clientName]: {
        ...emptyProfileForm(clientName),
        ...prev[clientName],
        [field]: value,
      },
    }))
    setSaveMessage((m) => ({ ...m, [clientName]: '' }))
  }

  const saveProfile = async (clientName) => {
    const form = getForm(clientName)
    let revenue = null
    if (form.expected_revenue.trim() !== '') {
      const n = Number(form.expected_revenue.replace(',', '.'))
      revenue = Number.isFinite(n) ? n : null
    }
    setSavingClient(clientName)
    setSaveMessage((m) => ({ ...m, [clientName]: '' }))
    try {
      const where = await upsertClientProfile({
        client_name: clientName,
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim() || null,
        expected_revenue: revenue,
        email: form.email.trim() || null,
        iban: form.iban.replace(/\s/g, '').trim() || null,
      })
      setSaveMessage(
        (m) => ({
          ...m,
          [clientName]:
            where === 'local'
              ? 'Salvato nel browser (questo PC). Supabase non vede ancora la tabella client_profiles: quando la crei, salva di nuovo per copiare i dati online.'
              : 'Salvato.',
        }),
      )
    } catch (e) {
      setSaveMessage((m) => ({ ...m, [clientName]: `Errore: ${e?.message || String(e)}` }))
    } finally {
      setSavingClient(null)
    }
  }

  return (
    <section className="space-y-6">
      {clients.map((client) => {
        const f = getForm(client.clientName)
        return (
          <article key={client.clientName} className="app-card overflow-hidden p-0">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200/90 bg-gradient-to-r from-[#0ABAB5]/[0.07] to-transparent px-5 py-5 dark:border-zinc-700/80">
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{client.clientName}</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Da versare al cliente (solo Venduto, quota su prezzo Vinted):{' '}
                  <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    EUR {client.toPay.toFixed(2)}
                  </span>
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Scadenza minima (solo Caricato):{' '}
                  {client.minDays === null ? '—' : <span className="font-medium">{client.minDays} giorni</span>}
                </p>
              </div>
              <button
                type="button"
                disabled={pdfLoading === client.clientName}
                onClick={() => {
                  setPdfLoading(client.clientName)
                  void exportClientPdf({
                    clientName: client.clientName,
                    items: client.items,
                    toPay: client.toPay,
                  })
                    .catch((err) => console.error(err))
                    .finally(() => setPdfLoading(null))
                }}
                className="app-btn-primary shrink-0 px-5 py-2.5 text-sm disabled:opacity-60"
              >
                {pdfLoading === client.clientName ? 'PDF…' : 'Export PDF'}
              </button>
            </div>

            <div className="border-b border-zinc-200/80 dark:border-zinc-700/80">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-500/[0.03] px-5 py-3 dark:bg-zinc-950/50">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Dati cliente
                  </p>
                  {!profileOpen[client.clientName] && profileHasAnyData(f) ? (
                    <p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                      {[f.first_name, f.last_name].filter(Boolean).join(' ') || '—'}
                      {f.email?.trim() ? ` · ${f.email.trim()}` : ''}
                    </p>
                  ) : !profileOpen[client.clientName] ? (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">Nessun dato anagrafico salvato</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setProfileOpen((prev) => ({
                      ...prev,
                      [client.clientName]: !prev[client.clientName],
                    }))
                  }
                  className="app-btn-secondary shrink-0 px-4 py-2 text-sm"
                >
                  {profileOpen[client.clientName]
                    ? 'Chiudi'
                    : profileHasAnyData(f)
                      ? 'Modifica dati'
                      : 'Aggiungi dati'}
                </button>
              </div>

              {profileOpen[client.clientName] ? (
                <div className="space-y-4 px-5 pb-5 pt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="app-label">Nome</span>
                      <input
                        value={f.first_name}
                        onChange={(e) => patchForm(client.clientName, 'first_name', e.target.value)}
                        className="app-input"
                        autoComplete="given-name"
                      />
                    </label>
                    <label className="block">
                      <span className="app-label">Cognome</span>
                      <input
                        value={f.last_name}
                        onChange={(e) => patchForm(client.clientName, 'last_name', e.target.value)}
                        className="app-input"
                        autoComplete="family-name"
                      />
                    </label>
                    <label className="block">
                      <span className="app-label">Cellulare</span>
                      <input
                        type="tel"
                        value={f.phone}
                        onChange={(e) => patchForm(client.clientName, 'phone', e.target.value)}
                        className="app-input"
                        autoComplete="tel"
                      />
                    </label>
                    <label className="block">
                      <span className="app-label">Ricavo attesi (EUR)</span>
                      <input
                        value={f.expected_revenue}
                        onChange={(e) => patchForm(client.clientName, 'expected_revenue', e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        className="app-input tabular-nums"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="app-label">Email</span>
                      <input
                        type="email"
                        value={f.email}
                        onChange={(e) => patchForm(client.clientName, 'email', e.target.value)}
                        className="app-input"
                        autoComplete="email"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="app-label">IBAN</span>
                      <input
                        value={f.iban}
                        onChange={(e) => patchForm(client.clientName, 'iban', e.target.value)}
                        className="app-input font-mono text-sm"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={savingClient === client.clientName}
                      onClick={() => void saveProfile(client.clientName)}
                      className="app-btn-primary px-5 py-2 text-sm disabled:opacity-60"
                    >
                      {savingClient === client.clientName ? 'Salvataggio…' : 'Salva dati cliente'}
                    </button>
                    {saveMessage[client.clientName] ? (
                      <span
                        className={`max-w-full text-sm sm:max-w-xl ${saveMessage[client.clientName].startsWith('Errore') ? 'whitespace-pre-wrap break-words text-red-600 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-400'}`}
                      >
                        {saveMessage[client.clientName]}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="overflow-auto px-2 pb-2">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="app-table-head">
                    <th className="p-3">SKU</th>
                    <th className="p-3">Descrizione</th>
                    <th className="p-3">Stato</th>
                    <th className="p-3">Prezzo</th>
                    <th className="p-3">Creato</th>
                  </tr>
                </thead>
                <tbody>
                  {client.items.map((i) => (
                    <tr key={i.id} className="app-table-row">
                      <td className="p-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        {displaySku(i.sku) || '—'}
                      </td>
                      <td className="p-3 text-zinc-800 dark:text-zinc-200">{i.description}</td>
                      <td className="p-3">
                        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700/80 dark:text-zinc-200">
                          {i.status}
                        </span>
                      </td>
                      <td className="p-3 tabular-nums text-zinc-800 dark:text-zinc-200">
                        EUR {Number(i.price || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-xs text-zinc-500 dark:text-zinc-400">{formatDate(i.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        )
      })}
    </section>
  )
}
