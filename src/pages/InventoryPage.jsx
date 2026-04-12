import { useEffect, useMemo, useState } from 'react'
import { displayOptionalColumn, displaySku, getDistinctProductFields, supabase } from '../lib/supabase'
import { STATUSES, STATUS_SELECT_CLASSES, normalizeStatus } from '../constants/statuses'
import ExpiryBadge from '../components/ExpiryBadge'
import { daysToExpiry, formatDate } from '../utils/date'
import { downloadProductPhotosZip, getAllProductPhotoUrls, mergeUserNotesEdit, notesVisibleToUser } from '../lib/productPhotos'

export default function InventoryPage() {
  const [products, setProducts] = useState([])
  const [filters, setFilters] = useState({ client: '', slot: '', status: '', from: '', to: '', expiringOnly: false })
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState([])
  const [slots, setSlots] = useState([])
  const [galleryProduct, setGalleryProduct] = useState(null)
  const [zipLoading, setZipLoading] = useState(false)
  const [zipError, setZipError] = useState('')

  const fetchProducts = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false })
    if (!error) setProducts(data || [])
    setLoading(false)
  }

  const fetchDistinctValues = async () => {
    try {
      const { clients: c, slots: s } = await getDistinctProductFields()
      setClients(c)
      setSlots(s)
    } catch {
      // Keep page usable even if lookup fails.
    }
  }

  useEffect(() => {
    const id = setTimeout(() => {
      void fetchProducts()
      void fetchDistinctValues()
    }, 0)
    return () => clearTimeout(id)
  }, [])

  const updateProduct = async (id, patch) => {
    const payload = { ...patch }
    if (patch.status === 'Caricato') payload.loaded_at = new Date().toISOString()
    if (patch.status === 'Venduto') payload.sold_at = new Date().toISOString()
    if (patch.status === 'Pagato') payload.paid_at = new Date().toISOString()

    const { error } = await supabase.from('products').update(payload).eq('id', id)
    if (!error) {
      fetchProducts()
      fetchDistinctValues()
    }
  }

  const rows = useMemo(() => {
    const isExpiring = (product) => {
      if (!product.loaded_at || product.status !== 'Caricato') return false
      const days = daysToExpiry(product.loaded_at)
      if (days === null || Number.isNaN(days)) return false
      return days < 5
    }

    return products.filter((p) => {
      if (
        filters.client &&
        !displayOptionalColumn(p.client_name).toLowerCase().includes(filters.client.toLowerCase())
      )
        return false
      if (filters.slot && !displayOptionalColumn(p.slot).toLowerCase().includes(filters.slot.toLowerCase()))
        return false
      if (filters.status && p.status !== filters.status) return false
      if (filters.from && new Date(p.created_at) < new Date(filters.from)) return false
      if (filters.to && new Date(p.created_at) > new Date(`${filters.to}T23:59:59`)) return false
      if (filters.expiringOnly && !isExpiring(p)) return false
      return true
    })
  }, [products, filters])

  const filterStatusClass = STATUSES.includes(filters.status)
    ? STATUS_SELECT_CLASSES[filters.status]
    : 'border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-900/70 dark:text-zinc-100'

  return (
    <section className="space-y-6">
      <div className="app-card grid gap-4 p-6 text-base md:grid-cols-6">
        <select
          className="app-input py-3 font-medium"
          value={filters.client}
          onChange={(e) => setFilters((f) => ({ ...f, client: e.target.value }))}
        >
          <option value="">Tutti i clienti</option>
          {clients.map((client) => (
            <option key={client} value={client}>
              {client}
            </option>
          ))}
        </select>
        <select
          className="app-input py-3 font-medium"
          value={filters.slot}
          onChange={(e) => setFilters((f) => ({ ...f, slot: e.target.value }))}
        >
          <option value="">Tutti gli slot</option>
          {slots.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>
        <select
          className={`app-input border-2 py-3 font-semibold ${filterStatusClass}`}
          value={STATUSES.includes(filters.status) ? filters.status : ''}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">Tutti gli stati</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="app-input py-3"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
        />
        <input
          type="date"
          className="app-input py-3"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
        />
        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, expiringOnly: !f.expiringOnly }))}
          className={`rounded-xl border-2 px-4 py-3 text-base font-semibold transition ${
            filters.expiringOnly
              ? 'border-[#0ABAB5] bg-[#0ABAB5]/12 text-zinc-900 dark:border-[#0ABAB5] dark:bg-[#0ABAB5]/18 dark:text-zinc-100'
              : 'border-zinc-200 bg-transparent text-zinc-700 hover:bg-zinc-500/10 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-500/10'
          }`}
        >
          In scadenza
        </button>
      </div>

      <div className="app-card overflow-x-auto p-4 sm:p-6">
        <table className="w-full min-w-0 table-fixed border-collapse text-base">
          <colgroup>
            <col style={{ width: '12%' }} />
            <col style={{ width: '37%' }} />
            <col style={{ width: '37%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr className="app-table-head text-base">
              <th className="px-4 py-3.5 text-center">Foto</th>
              <th className="px-4 py-3.5 text-left">Dettagli</th>
              <th className="px-4 py-3.5 text-left">Stato, prezzo e note</th>
              <th className="px-4 py-3.5 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="app-table-row">
                <td className="app-text-muted p-8 text-center text-base" colSpan={4}>
                  Caricamento…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="app-table-row">
                <td className="app-text-muted p-8 text-center text-base" colSpan={4}>
                  Nessun articolo trovato
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="app-table-row">
                  <td className="min-w-0 px-4 py-4 align-top">
                    {(() => {
                      const urls = getAllProductPhotoUrls(p)
                      if (!urls.length) {
                        return <span className="block text-center text-zinc-400">—</span>
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => setGalleryProduct(p)}
                          className="group mx-auto flex w-full max-w-[8.5rem] flex-col items-center text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0ABAB5] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900"
                          aria-label={`Apri galleria foto, ${urls.length} immagini`}
                        >
                          <span className="flex max-h-[26rem] w-full flex-col gap-2.5 overflow-y-auto overflow-x-hidden pt-0.5">
                            {urls.map((url, si) => (
                              <img
                                key={`${url}-${si}`}
                                src={url}
                                alt=""
                                className="aspect-square w-full shrink-0 rounded-xl border-2 border-[var(--paper)] object-cover shadow-sm ring-1 ring-zinc-200/90 transition group-hover:opacity-95 dark:border-zinc-900 dark:ring-zinc-600"
                              />
                            ))}
                          </span>
                        </button>
                      )
                    })()}
                  </td>
                  <td className="min-w-0 px-4 py-4 align-top">
                    <div className="flex min-w-0 flex-col gap-3.5">
                      <input
                        type="text"
                        value={p.description ?? ''}
                        onChange={(e) =>
                          updateProduct(p.id, { description: e.target.value.trim() || 'Articolo' })
                        }
                        className="app-input box-border w-full min-w-0 py-3 text-base font-medium"
                        placeholder="Descrizione"
                      />
                      <div className="flex min-w-0 flex-col gap-2.5">
                        <label className="min-w-0">
                          <span className="mb-1.5 block text-base font-medium text-zinc-600 dark:text-zinc-400">
                            SKU
                          </span>
                          <input
                            value={displaySku(p.sku)}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                              updateProduct(p.id, { sku: v || null })
                            }}
                            className="app-input box-border w-full min-w-0 py-2.5 font-mono text-base tabular-nums"
                            placeholder="1234"
                            maxLength={4}
                            inputMode="numeric"
                            aria-label="SKU"
                          />
                        </label>
                        <label className="min-w-0">
                          <span className="mb-1.5 block text-base font-medium text-zinc-600 dark:text-zinc-400">
                            Proprietario
                          </span>
                          <input
                            value={displayOptionalColumn(p.client_name)}
                            onChange={(e) => updateProduct(p.id, { client_name: e.target.value.trim() || null })}
                            className="app-input box-border w-full min-w-0 py-2.5 text-base"
                            placeholder="Nome"
                            aria-label="Proprietario"
                          />
                        </label>
                        <label className="min-w-0">
                          <span className="mb-1.5 block text-base font-medium text-zinc-600 dark:text-zinc-400">
                            Slot
                          </span>
                          <input
                            value={displayOptionalColumn(p.slot)}
                            onChange={(e) => updateProduct(p.id, { slot: e.target.value.trim() || null })}
                            className="app-input box-border w-full min-w-0 py-2.5 text-base"
                            placeholder="es. 1-A1"
                            aria-label="Slot"
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ExpiryBadge loadedAt={p.loaded_at} status={p.status} />
                        <button type="button" onClick={() => setGalleryProduct(p)} className="app-link-accent text-lg">
                          Foto ({getAllProductPhotoUrls(p).length})
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="min-w-0 px-4 py-4 align-top">
                    <div className="flex min-w-0 flex-col gap-3.5">
                      <div>
                        <span className="mb-1.5 block text-base font-medium text-zinc-600 dark:text-zinc-400">
                          Stato
                        </span>
                        <select
                          value={normalizeStatus(p.status)}
                          onChange={(e) => updateProduct(p.id, { status: e.target.value })}
                          className={`app-input box-border block w-full min-w-0 border-2 py-3 text-base font-semibold ${STATUS_SELECT_CLASSES[normalizeStatus(p.status)]}`}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <label className="block min-w-0">
                        <span className="mb-1.5 block text-base font-medium text-zinc-600 dark:text-zinc-400">
                          Prezzo (EUR)
                        </span>
                        <input
                          type="number"
                          value={p.price ?? ''}
                          onChange={(e) =>
                            updateProduct(p.id, { price: e.target.value ? Number(e.target.value) : null })
                          }
                          className="app-input box-border w-full min-w-0 py-2.5 tabular-nums text-base"
                        />
                      </label>
                      <label className="block min-w-0">
                        <span className="mb-1.5 block text-base font-medium text-zinc-600 dark:text-zinc-400">
                          Note
                        </span>
                        <textarea
                          value={notesVisibleToUser(p.notes)}
                          onChange={(e) =>
                            updateProduct(p.id, { notes: mergeUserNotesEdit(p.notes ?? '', e.target.value) })
                          }
                          rows={4}
                          className="app-input box-border min-h-[7rem] w-full min-w-0 resize-y py-2.5 text-base leading-snug"
                        />
                      </label>
                    </div>
                  </td>
                  <td className="app-text-muted min-w-0 px-4 py-4 align-top text-base leading-relaxed">
                    <div className="break-words">
                      <div>Creato: {formatDate(p.created_at)}</div>
                      <div>Caricato: {formatDate(p.loaded_at)}</div>
                      <div>Venduto: {formatDate(p.sold_at)}</div>
                      <div>Pagato: {formatDate(p.paid_at)}</div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {galleryProduct ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gallery-title"
          onClick={() => {
            setGalleryProduct(null)
            setZipError('')
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200 bg-[var(--paper)] shadow-xl dark:border-zinc-600 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
              <div className="min-w-0">
                <h2 id="gallery-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Foto articolo
                </h2>
                <p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                  SKU {displaySku(galleryProduct.sku) || '—'} · {galleryProduct.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setGalleryProduct(null)
                  setZipError('')
                }}
                className="app-btn-secondary shrink-0 px-3 py-1.5 text-sm"
              >
                Chiudi
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {getAllProductPhotoUrls(galleryProduct).map((url, i) => (
                  <a
                    key={url + i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800"
                  >
                    <img src={url} alt="" className="aspect-square w-full object-cover" />
                  </a>
                ))}
              </div>
              {zipError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{zipError}</p> : null}
            </div>
            <div className="flex flex-wrap gap-3 border-t border-zinc-200 bg-zinc-50/80 px-5 py-4 dark:border-zinc-700 dark:bg-zinc-950/50">
              <button
                type="button"
                disabled={zipLoading}
                onClick={() => {
                  setZipError('')
                  setZipLoading(true)
                  void downloadProductPhotosZip(galleryProduct)
                    .catch((err) => setZipError(err.message || 'Download fallito'))
                    .finally(() => setZipLoading(false))
                }}
                className="app-btn-primary px-5 py-2.5 text-sm disabled:opacity-60"
              >
                {zipLoading ? 'Creazione ZIP…' : 'Scarica tutte le foto (ZIP per Vinted)'}
              </button>
              <p className="app-text-muted-xs self-center">
                Il file contiene tutte le immagini numerate (SKU-01, SKU-02, …).
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
