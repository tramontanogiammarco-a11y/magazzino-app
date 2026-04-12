import { useEffect, useMemo, useState } from 'react'
import { getDistinctProductFields, supabase } from '../lib/supabase'
import { STATUSES, STATUS_SELECT_CLASSES, normalizeStatus } from '../constants/statuses'
import ExpiryBadge from '../components/ExpiryBadge'
import { daysToExpiry, formatDate } from '../utils/date'
import { downloadProductPhotosZip, getAllProductPhotoUrls } from '../lib/productPhotos'

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
      if (filters.client && !p.client_name?.toLowerCase().includes(filters.client.toLowerCase())) return false
      if (filters.slot && !p.slot?.toLowerCase().includes(filters.slot.toLowerCase())) return false
      if (filters.status && p.status !== filters.status) return false
      if (filters.from && new Date(p.created_at) < new Date(filters.from)) return false
      if (filters.to && new Date(p.created_at) > new Date(`${filters.to}T23:59:59`)) return false
      if (filters.expiringOnly && !isExpiring(p)) return false
      return true
    })
  }, [products, filters])

  const filterStatusClass = STATUSES.includes(filters.status)
    ? STATUS_SELECT_CLASSES[filters.status]
    : 'border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-900/70 dark:text-stone-100'

  return (
    <section className="space-y-6">
      <div className="app-card grid gap-3 p-4 md:grid-cols-6 md:p-5">
        <select
          className="app-input py-2.5 font-medium"
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
          className="app-input py-2.5 font-medium"
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
          className={`app-input border-2 py-2.5 font-semibold ${filterStatusClass}`}
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
          className="app-input py-2.5"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
        />
        <input
          type="date"
          className="app-input py-2.5"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
        />
        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, expiringOnly: !f.expiringOnly }))}
          className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${
            filters.expiringOnly
              ? 'border-[#0ABAB5] bg-[#0ABAB5]/12 text-zinc-900 dark:border-[#0ABAB5] dark:bg-[#0ABAB5]/18 dark:text-zinc-100'
              : 'border-zinc-200 bg-transparent text-zinc-700 hover:bg-zinc-500/10 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-500/10'
          }`}
        >
          In scadenza
        </button>
      </div>

      <div className="app-card overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-stone-200/90 bg-stone-100/90 text-left text-xs font-semibold uppercase tracking-wider text-stone-600 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-400">
            <tr>
              <th className="p-3">Foto</th>
              <th className="p-3">Dettagli</th>
              <th className="p-3">Stato</th>
              <th className="p-3">Prezzo</th>
              <th className="p-3">Note</th>
              <th className="p-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-6 text-stone-500" colSpan={6}>
                  Caricamento…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-6 text-stone-500" colSpan={6}>
                  Nessun articolo trovato
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-stone-200/80 transition hover:bg-stone-500/[0.04] dark:border-stone-700/80 dark:hover:bg-white/[0.03]"
                >
                  <td className="p-3 align-top">
                    {(() => {
                      const urls = getAllProductPhotoUrls(p)
                      if (!urls.length) {
                        return <span className="text-stone-400">—</span>
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => setGalleryProduct(p)}
                          className="group relative block text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0ABAB5] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"
                          aria-label={`Apri galleria foto, ${urls.length} immagini`}
                        >
                          <img
                            src={urls[0]}
                            alt=""
                            className="h-20 w-20 rounded-lg border border-stone-200 object-cover transition group-hover:opacity-90 dark:border-stone-600"
                          />
                          {urls.length > 1 && (
                            <span className="absolute -bottom-1 -right-1 rounded-full bg-[#0ABAB5] px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                              +{urls.length - 1}
                            </span>
                          )}
                        </button>
                      )
                    })()}
                  </td>
                  <td className="p-3 align-top">
                    <button
                      type="button"
                      onClick={() => setGalleryProduct(p)}
                      className="block w-full rounded-lg py-0.5 text-left transition hover:bg-stone-500/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0ABAB5] dark:hover:bg-white/[0.04]"
                    >
                      <div className="font-medium text-stone-900 dark:text-stone-100">{p.description}</div>
                      <div className="text-xs text-stone-500 dark:text-stone-400">
                        SKU {p.sku} · {p.client_name} · {p.slot} · {getAllProductPhotoUrls(p).length} foto
                      </div>
                      <div className="mt-1.5">
                        <ExpiryBadge loadedAt={p.loaded_at} status={p.status} />
                      </div>
                    </button>
                  </td>
                  <td className="p-3 align-top">
                    <select
                      value={normalizeStatus(p.status)}
                      onChange={(e) => updateProduct(p.id, { status: e.target.value })}
                      className={`app-input block w-full min-w-[11rem] border-2 py-2 text-sm font-semibold ${STATUS_SELECT_CLASSES[normalizeStatus(p.status)]}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3 align-top">
                    <input
                      type="number"
                      value={p.price ?? ''}
                      onChange={(e) => updateProduct(p.id, { price: e.target.value ? Number(e.target.value) : null })}
                      className="app-input w-28 py-2 tabular-nums"
                    />
                  </td>
                  <td className="p-3 align-top">
                    <textarea
                      value={p.notes ?? ''}
                      onChange={(e) => updateProduct(p.id, { notes: e.target.value })}
                      rows={2}
                      className="app-input w-56 resize-y py-2"
                    />
                  </td>
                  <td className="p-3 align-top text-xs text-stone-500 dark:text-stone-400">
                    <div>Creato: {formatDate(p.created_at)}</div>
                    <div>Caricato: {formatDate(p.loaded_at)}</div>
                    <div>Venduto: {formatDate(p.sold_at)}</div>
                    <div>Pagato: {formatDate(p.paid_at)}</div>
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
            className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-[var(--paper)] shadow-xl dark:border-stone-600 dark:bg-stone-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4 dark:border-stone-700">
              <div className="min-w-0">
                <h2 id="gallery-title" className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                  Foto articolo
                </h2>
                <p className="mt-1 truncate text-sm text-stone-600 dark:text-stone-400">
                  SKU {galleryProduct.sku} · {galleryProduct.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setGalleryProduct(null)
                  setZipError('')
                }}
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-500/10 dark:text-stone-400"
              >
                Chiudi
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {getAllProductPhotoUrls(galleryProduct).map((url, i) => (
                  <a
                    key={url + i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-xl border border-stone-200 bg-stone-100 dark:border-stone-600 dark:bg-stone-800"
                  >
                    <img src={url} alt="" className="aspect-square w-full object-cover" />
                  </a>
                ))}
              </div>
              {zipError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{zipError}</p> : null}
            </div>
            <div className="flex flex-wrap gap-3 border-t border-stone-200 bg-stone-50/80 px-5 py-4 dark:border-stone-700 dark:bg-stone-950/50">
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
              <p className="self-center text-xs text-stone-500 dark:text-stone-400">
                Il file contiene tutte le immagini numerate (SKU-01, SKU-02, …).
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
