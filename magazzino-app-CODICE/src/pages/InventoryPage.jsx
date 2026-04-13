import { useEffect, useMemo, useRef, useState } from 'react'
import {
  displayOptionalColumn,
  displaySku,
  fetchClientProfiles,
  getDistinctProductFields,
  isClientProfileComplete,
  PLACEHOLDER_CLIENT_NAME,
  PLACEHOLDER_SKU,
  PLACEHOLDER_SLOT,
  supabase,
} from '../lib/supabase'
import { STATUSES, STATUS_SELECT_CLASSES, normalizeStatus } from '../constants/statuses'
import ExpiryBadge from '../components/ExpiryBadge'
import InventoryTodoBar from '../components/InventoryTodoBar'
import { daysToExpiry, formatDate } from '../utils/date'
import {
  downloadProductPhotosZip,
  getAllProductPhotoUrls,
  getProductPhotoThumbnailSrc,
  mergeUserNotesEdit,
  notesVisibleToUser,
} from '../lib/productPhotos'
import { notifyGoogleSheetsNewProduct } from '../lib/googleSheets'

function isExpiringProduct(p) {
  if (!p.loaded_at || p.status !== 'Caricato') return false
  const days = daysToExpiry(p.loaded_at)
  if (days === null || Number.isNaN(days)) return false
  return days < 5
}

/** Manca almeno uno tra SKU, slot, proprietario o prezzo (per annunci / magazzino). */
function productHasMissingListingDetails(p) {
  const noSku = !displaySku(p.sku)
  const noSlot = !displayOptionalColumn(p.slot)
  const noClient = !displayOptionalColumn(p.client_name)
  const noPrice = p.price == null || p.price === '' || Number(p.price) <= 0
  return noSku || noSlot || noClient || noPrice
}

export default function InventoryPage() {
  const [products, setProducts] = useState([])
  const productsRef = useRef(products)
  productsRef.current = products
  const [filters, setFilters] = useState({ client: '', slot: '', status: '', from: '', to: '', expiringOnly: false })
  const [quickFilter, setQuickFilter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState([])
  const [slots, setSlots] = useState([])
  const [clientProfiles, setClientProfiles] = useState([])
  const [galleryProduct, setGalleryProduct] = useState(null)
  const [galleryUrls, setGalleryUrls] = useState([])
  const [dragGalleryIndex, setDragGalleryIndex] = useState(null)
  const [gallerySaving, setGallerySaving] = useState(false)
  const [zipLoading, setZipLoading] = useState(false)
  const [zipError, setZipError] = useState('')
  const [saveHint, setSaveHint] = useState(null)
  const saveHintTimerRef = useRef(null)
  /** Testo prezzo mentre digiti (evita salvataggi a ogni tasto e valori intermedi). */
  const [priceDraftById, setPriceDraftById] = useState({})
  const priceDebounceRef = useRef(new Map())

  /** Bozze inventario: evita `updateProduct` a ogni tasto (race su fetch concorrenti). */
  const [descDraftById, setDescDraftById] = useState({})
  const [skuDraftById, setSkuDraftById] = useState({})
  const [clientDraftById, setClientDraftById] = useState({})
  const [slotDraftById, setSlotDraftById] = useState({})
  const [notesDraftById, setNotesDraftById] = useState({})

  /** `showLoading`: solo al primo caricamento — dopo gli aggiornamenti non azzerare la tabella. */
  const fetchProducts = async (showLoading = false) => {
    if (showLoading) setLoading(true)
    const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false })
    if (!error) setProducts(data || [])
    if (showLoading) setLoading(false)
  }

  const fetchDistinctValues = async () => {
    try {
      const { clients: c, slots: s } = await getDistinctProductFields()
      setClients(c)
      setSlots(s)
    } catch {
      // Keep page usable even if lookup fails.
    }
    try {
      setClientProfiles(await fetchClientProfiles())
    } catch {
      setClientProfiles([])
    }
  }

  useEffect(() => {
    const id = setTimeout(() => {
      void fetchProducts(true)
      void fetchDistinctValues()
    }, 0)
    return () => clearTimeout(id)
  }, [])

  const openGallery = (p) => {
    setGalleryProduct(p)
    setGalleryUrls(getAllProductPhotoUrls(p))
    setDragGalleryIndex(null)
    setZipError('')
  }

  const closeGallery = () => {
    setGalleryProduct(null)
    setGalleryUrls([])
    setDragGalleryIndex(null)
    setZipError('')
  }

  useEffect(() => {
    return () => {
      if (saveHintTimerRef.current) clearTimeout(saveHintTimerRef.current)
      // eslint-disable-next-line react-hooks/exhaustive-deps -- alla dismount servono i timer attuali sulla ref
      const pending = priceDebounceRef.current
      for (const t of pending.values()) clearTimeout(t)
      pending.clear()
    }
  }, [])

  const showSaveHint = (ok, msg) => {
    if (saveHintTimerRef.current) clearTimeout(saveHintTimerRef.current)
    setSaveHint({ ok, msg })
    saveHintTimerRef.current = setTimeout(() => setSaveHint(null), 2800)
  }

  const parsePriceInput = (raw) => {
    const trimmed = String(raw ?? '').trim()
    if (trimmed === '') return { ok: true, value: null }
    const n = Number(trimmed.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return { ok: false, value: null }
    return { ok: true, value: n }
  }

  const flushPriceDraft = async (id, rawString) => {
    const parsed = parsePriceInput(rawString)
    if (!parsed.ok) {
      showSaveHint(false, 'Prezzo non valido')
      return
    }
    const saved = await updateProduct(id, { price: parsed.value })
    if (saved) {
      setPriceDraftById((d) => {
        if (!(id in d)) return d
        const { [id]: _, ...rest } = d
        return rest
      })
    }
  }

  const schedulePriceDraftSave = (id, rawString) => {
    setPriceDraftById((d) => ({ ...d, [id]: rawString }))
    const prevTimer = priceDebounceRef.current.get(id)
    if (prevTimer) clearTimeout(prevTimer)
    priceDebounceRef.current.set(
      id,
      setTimeout(() => {
        priceDebounceRef.current.delete(id)
        void flushPriceDraft(id, rawString)
      }, 500),
    )
  }

  const onPriceBlur = (id, rawString) => {
    const t = priceDebounceRef.current.get(id)
    if (t) {
      clearTimeout(t)
      priceDebounceRef.current.delete(id)
    }
    void flushPriceDraft(id, rawString)
  }

  const updateProduct = async (id, patch) => {
    const prev = productsRef.current.find((x) => x.id === id)
    const payload = { ...patch }
    if (patch.status === 'Caricato') payload.loaded_at = new Date().toISOString()
    if (patch.status === 'Venduto') payload.sold_at = new Date().toISOString()
    if (patch.status === 'Pagato') payload.paid_at = new Date().toISOString()

    const { error } = await supabase.from('products').update(payload).eq('id', id)
    if (error) {
      showSaveHint(false, error.message || 'Salvataggio non riuscito')
      return false
    }

    const sheetKeys = ['status', 'price', 'description', 'sku', 'client_name', 'slot']
    let sheetMsg = ''
    if (prev && sheetKeys.some((k) => Object.prototype.hasOwnProperty.call(patch, k))) {
      const merged = { ...prev, ...payload }
      const sheetResult = await notifyGoogleSheetsNewProduct({
        productId: id,
        action: 'update',
        description: String(merged.description ?? '').trim() || 'Articolo',
        status: merged.status ?? '',
        price: merged.price,
        client_name: merged.client_name ?? '',
        sku: merged.sku ?? '',
        slot: merged.slot ?? '',
      })
      if (!sheetResult.ok) {
        sheetMsg = ` Foglio Google: ${sheetResult.message || 'sincronizzazione non riuscita'}.`
      }
    }

    showSaveHint(true, sheetMsg ? `Salvato.${sheetMsg}` : 'Salvato')
    await fetchProducts(false)
    void fetchDistinctValues()
    return true
  }

  const persistGalleryOrder = async (urls) => {
    if (!galleryProduct || urls.length < 2) return
    const productId = galleryProduct.id
    setGallerySaving(true)
    const first = urls[0] ?? null
    const { error } = await supabase.from('products').update({ photo_url: first, photo_urls: urls }).eq('id', productId)
    setGallerySaving(false)
    if (error) {
      showSaveHint(false, error.message || 'Ordine foto non salvato')
      return
    }
    showSaveHint(true, 'Ordine foto salvato')
    await fetchProducts(false)
    setGalleryProduct((prev) => (prev && prev.id === productId ? { ...prev, photo_url: first, photo_urls: urls } : prev))
  }

  const incompleteClientNames = useMemo(() => {
    const byName = new Map(clientProfiles.map((r) => [r.client_name, r]))
    const out = new Set()
    for (const p of products) {
      const cn = displayOptionalColumn(p.client_name)
      if (!cn) continue
      const row = byName.get(cn)
      if (!isClientProfileComplete(row)) out.add(cn)
    }
    return out
  }, [products, clientProfiles])

  const todoCounts = useMemo(() => {
    let expiring = 0
    let missingDetails = 0
    let magazzino = 0
    for (const p of products) {
      if (isExpiringProduct(p)) expiring += 1
      if (productHasMissingListingDetails(p)) missingDetails += 1
      if (p.status === 'Magazzino') magazzino += 1
    }
    return {
      expiring,
      clientsIncomplete: incompleteClientNames.size,
      missingDetails,
      magazzino,
    }
  }, [products, incompleteClientNames])

  const rows = useMemo(() => {
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
      if (filters.expiringOnly && !isExpiringProduct(p)) return false

      if (quickFilter === 'expiring' && !isExpiringProduct(p)) return false
      if (quickFilter === 'clients_incomplete') {
        const cn = displayOptionalColumn(p.client_name)
        if (!cn || !incompleteClientNames.has(cn)) return false
      }
      if (quickFilter === 'missing_details' && !productHasMissingListingDetails(p)) return false
      if (quickFilter === 'magazzino' && p.status !== 'Magazzino') return false

      return true
    })
  }, [products, filters, quickFilter, incompleteClientNames])

  const filterStatusClass = STATUSES.includes(filters.status)
    ? STATUS_SELECT_CLASSES[filters.status]
    : 'border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-900/70 dark:text-zinc-100'

  return (
    <section className="space-y-6">
      {saveHint ? (
        <div
          role="status"
          className={
            saveHint.ok
              ? 'rounded-2xl border-2 border-emerald-300/80 bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-950 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-100'
              : 'rounded-2xl border-2 border-red-300/80 bg-red-50 px-4 py-3 text-base font-medium text-red-950 dark:border-red-800/60 dark:bg-red-950/35 dark:text-red-100'
          }
        >
          {saveHint.msg}
        </div>
      ) : null}

      <InventoryTodoBar
        counts={todoCounts}
        active={quickFilter}
        onSelect={(key) => setQuickFilter((q) => (q === key ? null : key))}
        onClear={() => setQuickFilter(null)}
      />

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
                          onClick={() => openGallery(p)}
                          className="group mx-auto flex w-full max-w-[8.5rem] flex-col items-center text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0ABAB5] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900"
                          aria-label={`Apri galleria foto, ${urls.length} immagini`}
                        >
                          <span className="flex max-h-[26rem] w-full flex-col gap-2.5 overflow-y-auto overflow-x-hidden pt-0.5">
                            {urls.map((url, si) => {
                              const thumb = getProductPhotoThumbnailSrc(url)
                              return (
                                <img
                                  key={`${url}-${si}`}
                                  src={thumb}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => {
                                    e.currentTarget.onerror = null
                                    if (e.currentTarget.src !== url) e.currentTarget.src = url
                                  }}
                                  className="aspect-square w-full shrink-0 rounded-xl border-2 border-[var(--paper)] object-cover shadow-sm ring-1 ring-zinc-200/90 transition group-hover:opacity-95 dark:border-zinc-900 dark:ring-zinc-600"
                                />
                              )
                            })}
                          </span>
                        </button>
                      )
                    })()}
                  </td>
                  <td className="min-w-0 px-4 py-4 align-top">
                    <div className="flex min-w-0 flex-col gap-3.5">
                      <input
                        type="text"
                        value={p.id in descDraftById ? descDraftById[p.id] : (p.description ?? '')}
                        onChange={(e) => setDescDraftById((d) => ({ ...d, [p.id]: e.target.value }))}
                        onBlur={async (e) => {
                          const trimmed = e.target.value.trim() || 'Articolo'
                          const row = productsRef.current.find((x) => x.id === p.id)
                          const prev = String(row?.description ?? '').trim() || 'Articolo'
                          if (trimmed === prev) {
                            setDescDraftById((d) => {
                              if (!(p.id in d)) return d
                              const { [p.id]: _, ...rest } = d
                              return rest
                            })
                            return
                          }
                          const saved = await updateProduct(p.id, { description: trimmed })
                          if (saved) {
                            setDescDraftById((d) => {
                              if (!(p.id in d)) return d
                              const { [p.id]: _, ...rest } = d
                              return rest
                            })
                          }
                        }}
                        className="app-input box-border w-full min-w-0 py-3 text-base font-medium"
                        placeholder="Descrizione"
                      />
                      <div className="flex min-w-0 flex-col gap-2.5">
                        <label className="min-w-0">
                          <span className="mb-1.5 block text-base font-medium text-zinc-600 dark:text-zinc-400">
                            SKU
                          </span>
                          <input
                            value={p.id in skuDraftById ? skuDraftById[p.id] : displaySku(p.sku)}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                              setSkuDraftById((d) => ({ ...d, [p.id]: v }))
                            }}
                            onBlur={async (e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
                              const nextSku = digits || PLACEHOLDER_SKU
                              const row = productsRef.current.find((x) => x.id === p.id)
                              const prevDigits = String(row?.sku ?? '').replace(/\D/g, '').slice(0, 4)
                              const prevSku = prevDigits || PLACEHOLDER_SKU
                              if (nextSku === prevSku) {
                                setSkuDraftById((d) => {
                                  if (!(p.id in d)) return d
                                  const { [p.id]: _, ...rest } = d
                                  return rest
                                })
                                return
                              }
                              const saved = await updateProduct(p.id, { sku: nextSku })
                              if (saved) {
                                setSkuDraftById((d) => {
                                  if (!(p.id in d)) return d
                                  const { [p.id]: _, ...rest } = d
                                  return rest
                                })
                              }
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
                            value={
                              p.id in clientDraftById ? clientDraftById[p.id] : displayOptionalColumn(p.client_name)
                            }
                            onChange={(e) => setClientDraftById((d) => ({ ...d, [p.id]: e.target.value }))}
                            onBlur={async (e) => {
                              const t = e.target.value.trim()
                              const next = t || PLACEHOLDER_CLIENT_NAME
                              const row = productsRef.current.find((x) => x.id === p.id)
                              const prevRaw = String(row?.client_name ?? '').trim()
                              const prev = prevRaw || PLACEHOLDER_CLIENT_NAME
                              if (next === prev) {
                                setClientDraftById((d) => {
                                  if (!(p.id in d)) return d
                                  const { [p.id]: _, ...rest } = d
                                  return rest
                                })
                                return
                              }
                              const saved = await updateProduct(p.id, { client_name: next })
                              if (saved) {
                                setClientDraftById((d) => {
                                  if (!(p.id in d)) return d
                                  const { [p.id]: _, ...rest } = d
                                  return rest
                                })
                              }
                            }}
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
                            value={p.id in slotDraftById ? slotDraftById[p.id] : displayOptionalColumn(p.slot)}
                            onChange={(e) => setSlotDraftById((d) => ({ ...d, [p.id]: e.target.value }))}
                            onBlur={async (e) => {
                              const t = e.target.value.trim()
                              const next = t || PLACEHOLDER_SLOT
                              const row = productsRef.current.find((x) => x.id === p.id)
                              const prevRaw = String(row?.slot ?? '').trim()
                              const prev = prevRaw || PLACEHOLDER_SLOT
                              if (next === prev) {
                                setSlotDraftById((d) => {
                                  if (!(p.id in d)) return d
                                  const { [p.id]: _, ...rest } = d
                                  return rest
                                })
                                return
                              }
                              const saved = await updateProduct(p.id, { slot: next })
                              if (saved) {
                                setSlotDraftById((d) => {
                                  if (!(p.id in d)) return d
                                  const { [p.id]: _, ...rest } = d
                                  return rest
                                })
                              }
                            }}
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
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={
                            Object.prototype.hasOwnProperty.call(priceDraftById, p.id)
                              ? priceDraftById[p.id]
                              : p.price != null && p.price !== ''
                                ? String(p.price)
                                : ''
                          }
                          onChange={(e) => schedulePriceDraftSave(p.id, e.target.value)}
                          onBlur={(e) => onPriceBlur(p.id, e.target.value)}
                          className="app-input box-border w-full min-w-0 py-2.5 tabular-nums text-base"
                        />
                      </label>
                      <label className="block min-w-0">
                        <span className="mb-1.5 block text-base font-medium text-zinc-600 dark:text-zinc-400">
                          Note
                        </span>
                        <textarea
                          value={
                            p.id in notesDraftById ? notesDraftById[p.id] : notesVisibleToUser(p.notes)
                          }
                          onChange={(e) => setNotesDraftById((d) => ({ ...d, [p.id]: e.target.value }))}
                          onBlur={async (e) => {
                            const row = productsRef.current.find((x) => x.id === p.id)
                            const merged = mergeUserNotesEdit(row?.notes ?? '', e.target.value)
                            if (merged === (row?.notes ?? '')) {
                              setNotesDraftById((d) => {
                                if (!(p.id in d)) return d
                                const { [p.id]: _, ...rest } = d
                                return rest
                              })
                              return
                            }
                            const saved = await updateProduct(p.id, { notes: merged })
                            if (saved) {
                              setNotesDraftById((d) => {
                                if (!(p.id in d)) return d
                                const { [p.id]: _, ...rest } = d
                                return rest
                              })
                            }
                          }}
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
          onClick={closeGallery}
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
                onClick={closeGallery}
                className="app-btn-secondary shrink-0 px-3 py-1.5 text-sm"
              >
                Chiudi
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-5">
              {galleryUrls.length >= 2 ? (
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                  Trascina le righe per l&apos;ordine nel ZIP e su Vinted (la prima foto è la copertina).
                  {gallerySaving ? <span className="ml-2 font-semibold text-[#0ABAB5]">Salvataggio…</span> : null}
                </p>
              ) : null}
              <ul className="space-y-3">
                {galleryUrls.map((url, i) => (
                  <li
                    key={url}
                    draggable={galleryUrls.length >= 2}
                    onDragStart={(e) => {
                      if (galleryUrls.length < 2) return
                      e.dataTransfer.effectAllowed = 'move'
                      setDragGalleryIndex(i)
                    }}
                    onDragEnd={() => setDragGalleryIndex(null)}
                    onDragOver={(e) => {
                      if (galleryUrls.length < 2) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (galleryUrls.length < 2) return
                      const from = dragGalleryIndex
                      if (from == null || from === i) return
                      const next = [...galleryUrls]
                      const [removed] = next.splice(from, 1)
                      next.splice(i, 0, removed)
                      setGalleryUrls(next)
                      setDragGalleryIndex(null)
                      void persistGalleryOrder(next)
                    }}
                    className={[
                      'flex items-center gap-4 rounded-2xl border-2 border-zinc-200 bg-zinc-50/90 p-3 transition dark:border-zinc-600 dark:bg-zinc-800/60',
                      dragGalleryIndex === i ? 'opacity-70 ring-2 ring-[#0ABAB5]/50' : '',
                      galleryUrls.length >= 2 ? 'cursor-grab active:cursor-grabbing' : '',
                    ].join(' ')}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                      {i + 1}
                    </span>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block min-w-0 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <img src={url} alt="" className="h-28 w-28 object-cover sm:h-32 sm:w-32" loading="lazy" />
                    </a>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">Foto {i + 1}</p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Apri per originale a piena risoluzione</p>
                    </div>
                  </li>
                ))}
              </ul>
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
