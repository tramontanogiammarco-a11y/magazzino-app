import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { extractProductDataFromPhotos } from '../lib/gemini'
import { notifyGoogleSheetsNewProduct } from '../lib/googleSheets'
import { encodeNotesWithGallery, getAllProductPhotoUrls, stripGalleryFromNotes } from '../lib/productPhotos'
import { formatProductsInsertError, isPhotoUrlsSchemaError } from '../lib/supabaseErrors'
import {
  getDistinctProductFields,
  PLACEHOLDER_CLIENT_NAME,
  PLACEHOLDER_SKU,
  PLACEHOLDER_SLOT,
  supabase,
  uploadProductPhoto,
  uploadProductPhotos,
} from '../lib/supabase'
import { STATUSES } from '../constants/statuses'

const initialForm = {
  description: '',
  sku: '',
  client_name: '',
  slot: '',
  status: 'Magazzino',
  price: '',
  notes: '',
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i

/**
 * Insert: sku / cliente / slot sempre valorizzati (SKU `9999` se vuoto, come da convenzione app).
 */
function prepareProductInsertPayload(payload) {
  const p = { ...payload }
  const skuDigits = p.sku != null ? String(p.sku).replace(/\D/g, '').slice(0, 4) : ''
  p.sku = skuDigits || PLACEHOLDER_SKU
  p.client_name =
    p.client_name != null && String(p.client_name).trim() !== ''
      ? String(p.client_name).trim()
      : PLACEHOLDER_CLIENT_NAME
  p.slot =
    p.slot != null && String(p.slot).trim() !== '' ? String(p.slot).trim() : PLACEHOLDER_SLOT
  return p
}

/** Escludi solo tipi chiaramente non immagine; il resto passa (MIME spesso vuoto su iPhone). */
function acceptPickerFile(file) {
  if (!file) return false
  const t = (file.type || '').toLowerCase()
  if (t.startsWith('video/')) return false
  if (t.startsWith('image/')) return true
  if (!t || t === 'application/octet-stream') return Boolean(file.size > 0)
  if (file.name && IMAGE_EXT.test(file.name)) return true
  return Boolean(file.size > 0)
}

export default function UploadPage() {
  /** Coda foto: ogni elemento ha id stabile per le key React */
  const [fileQueue, setFileQueue] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [preview, setPreview] = useState('')
  const [form, setForm] = useState(initialForm)
  const [loadingVision, setLoadingVision] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [clients, setClients] = useState([])
  const [slots, setSlots] = useState([])

  const fileQueueRef = useRef(fileQueue)
  fileQueueRef.current = fileQueue

  const prevQueueLengthRef = useRef(0)
  const autoAnalyzeDebounceRef = useRef(0)
  const analyzeInFlightRef = useRef(false)
  const analyzeBaselineRef = useRef(null)
  const manualTouchedFieldsRef = useRef(new Set())

  const safeActiveIndex = useMemo(() => {
    if (fileQueue.length === 0) return 0
    return Math.min(Math.max(0, activeIndex), fileQueue.length - 1)
  }, [activeIndex, fileQueue.length])

  const activeFile = fileQueue[safeActiveIndex]?.file ?? null

  /** Allinea activeIndex se fuori range (senza dipendere solo dalla lunghezza) */
  useEffect(() => {
    if (safeActiveIndex !== activeIndex) setActiveIndex(safeActiveIndex)
  }, [safeActiveIndex, activeIndex])

  /** Anteprima URL per la foto attiva */
  useEffect(() => {
    if (!activeFile) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(activeFile)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [activeFile])

  /** Include sempre il valore attuale nel menu, anche se non è ancora in DB (es. da vision). */
  const clientOptions = useMemo(() => {
    const set = new Set(clients.filter(Boolean))
    const current = form.client_name?.trim()
    if (current) set.add(current)
    return [...set].sort((a, b) => a.localeCompare(b, 'it-IT'))
  }, [clients, form.client_name])

  const slotOptions = useMemo(() => {
    const set = new Set(slots.filter(Boolean))
    const current = form.slot?.trim()
    if (current) set.add(current)
    return [...set].sort((a, b) => a.localeCompare(b, 'it-IT'))
  }, [slots, form.slot])

  const selectedClientValue = form.client_name?.trim() ?? ''
  const selectedSlotValue = form.slot?.trim() ?? ''

  const loadDistinctValues = async () => {
    try {
      const { clients: c, slots: s } = await getDistinctProductFields()
      setClients(c)
      setSlots(s)
    } catch {
      // Keep form usable even if lookup fails.
    }
  }

  useEffect(() => {
    loadDistinctValues()
  }, [])

  const appendFilesFromList = (list, preferStartAtNewBatch) => {
    if (!list?.length) return
    const picked = Array.from(list).filter(acceptPickerFile)
    if (!picked.length) return
    let startForActive = 0
    setFileQueue((q) => {
      startForActive = q.length
      return [...q, ...picked.map((file) => ({ id: crypto.randomUUID(), file }))]
    })
    if (preferStartAtNewBatch) setActiveIndex(startForActive)
  }

  const onFileInputChange = (e) => {
    const input = e.target
    appendFilesFromList(input.files, true)
    input.value = ''
  }

  const removeFromQueue = (index) => {
    setFileQueue((q) => q.filter((_, j) => j !== index))
  }

  const markManualField = (field, value) => {
    manualTouchedFieldsRef.current.add(field)
    setForm((old) => ({ ...old, [field]: value }))
  }

  const resetFormAndManualFields = () => {
    manualTouchedFieldsRef.current.clear()
    setForm(initialForm)
  }

  const runAnalyzeWithFiles = useCallback(async (filesToAnalyze) => {
    if (!filesToAnalyze?.length) return
    if (analyzeInFlightRef.current) return
    analyzeInFlightRef.current = true
    analyzeBaselineRef.current = {
      description: form.description ?? '',
      sku: form.sku ?? '',
      client_name: form.client_name ?? '',
      slot: form.slot ?? '',
      notes: form.notes ?? '',
    }
    setLoadingVision(true)
    setMessage('')
    try {
      const data = await extractProductDataFromPhotos(filesToAnalyze)
      setForm((old) => {
        const baseline = analyzeBaselineRef.current || {
          description: '',
          sku: '',
          client_name: '',
          slot: '',
          notes: '',
        }
        const aiNotes = (data.notes ?? '').toString().trim()
        const aiDescription = (data.description ?? '').toString()
        const aiSku = (data.sku ?? '').toString()
        const keepManual = (field, aiValue) => {
          if (manualTouchedFieldsRef.current.has(field)) return (old[field] ?? '').toString()
          const current = (old[field] ?? '').toString()
          const beforeAnalyze = (baseline[field] ?? '').toString()
          if (current !== beforeAnalyze) return current
          return aiValue || current
        }

        return {
          ...old,
          ...data,
          client_name: old.client_name,
          slot: old.slot,
          description: keepManual('description', aiDescription),
          sku: keepManual('sku', aiSku),
          notes: keepManual('notes', aiNotes.length > 0 ? aiNotes : ''),
        }
      })
    } catch (error) {
      setMessage(`Errore Telovendo AI: ${error.message}`)
    } finally {
      analyzeBaselineRef.current = null
      analyzeInFlightRef.current = false
      setLoadingVision(false)
    }
  }, [form.client_name, form.description, form.notes, form.sku, form.slot])

  /** Dopo nuove foto in coda: analisi automatica (debounce) con tutte le foto attuali. */
  useEffect(() => {
    const len = fileQueue.length
    const grew = len > prevQueueLengthRef.current
    prevQueueLengthRef.current = len
    if (!grew || len === 0 || saving) return

    autoAnalyzeDebounceRef.current += 1
    const token = autoAnalyzeDebounceRef.current
    const t = setTimeout(() => {
      if (token !== autoAnalyzeDebounceRef.current) return
      if (analyzeInFlightRef.current) return
      const files = fileQueueRef.current.map((item) => item.file).filter(Boolean)
      if (files.length) void runAnalyzeWithFiles(files)
    }, 450)
    return () => clearTimeout(t)
  }, [fileQueue, saving, runAnalyzeWithFiles])

  const onAnalyze = () => {
    if (!activeFile) return
    autoAnalyzeDebounceRef.current += 1
    void runAnalyzeWithFiles(fileQueue.map((item) => item.file))
  }

  const onSave = async () => {
    if (!activeFile) return
    const removeIdx = safeActiveIndex
    setSaving(true)
    setMessage('')

    try {
      const clientName = form.client_name?.trim() || null
      const slotValue = form.slot?.trim() || null
      const skuVal = form.sku?.replace(/\D/g, '').slice(0, 4) || null
      const desc = form.description?.trim() || 'Articolo'

      const photoUrl = await uploadProductPhoto(activeFile)
      /** Non inviare `photo_urls` nell’insert: se la colonna non c’è, PostgREST fallisce anche con 1 foto. */
      const payload = prepareProductInsertPayload({
        photo_url: photoUrl,
        description: desc,
        sku: skuVal,
        client_name: clientName,
        slot: slotValue,
        status: form.status,
        price: form.price ? Number(form.price) : null,
        notes: form.notes || null,
      })

      if (form.status === 'Caricato') payload.loaded_at = new Date().toISOString()
      if (form.status === 'Venduto') payload.sold_at = new Date().toISOString()
      if (form.status === 'Pagato') payload.paid_at = new Date().toISOString()

      const { data: insertedRow, error } = await supabase.from('products').insert(payload).select('id, photo_url').single()
      if (error) throw error

      const sheet = await notifyGoogleSheetsNewProduct({
        productId: insertedRow?.id ?? null,
        action: 'insert',
        description: payload.description ?? desc,
        status: payload.status ?? form.status,
        price: payload.price,
        client_name: payload.client_name ?? '',
        sku: payload.sku ?? '',
        slot: payload.slot ?? '',
      })
      const sheetNote =
        !sheet.ok
          ? ` Foglio Google: ${sheet.message || 'non sincronizzato'}.`
          : sheet.message
            ? ` ${sheet.message}`
            : ''

      const remaining = fileQueue.length - 1
      setFileQueue((q) => q.filter((_, j) => j !== removeIdx))
      resetFormAndManualFields()
      setMessage(
        (remaining > 0
          ? `Articolo salvato. Restano ${remaining} foto in coda: conferma i dati per la prossima.`
          : 'Articolo salvato con successo.') + sheetNote,
      )
      loadDistinctValues()
    } catch (error) {
      setMessage(`Errore salvataggio: ${formatProductsInsertError(error)}`)
    } finally {
      setSaving(false)
    }
  }

  /** Un solo articolo con tutte le foto in coda (stesso record, galleria per Vinted / inventario). */
  const onSaveAllPhotosOneProduct = async () => {
    if (fileQueue.length < 2) return
    setSaving(true)
    setMessage('')

    try {
      const clientName = form.client_name?.trim() || null
      const slotValue = form.slot?.trim() || null
      const skuVal = form.sku?.replace(/\D/g, '').slice(0, 4) || null
      const desc = form.description?.trim() || 'Articolo'

      const files = fileQueue.map((item) => item.file)
      const urls = await uploadProductPhotos(files)
      const payload = prepareProductInsertPayload({
        photo_url: urls[0],
        description: desc,
        sku: skuVal,
        client_name: clientName,
        slot: slotValue,
        status: form.status,
        price: form.price ? Number(form.price) : null,
        notes: form.notes || null,
      })

      if (form.status === 'Caricato') payload.loaded_at = new Date().toISOString()
      if (form.status === 'Venduto') payload.sold_at = new Date().toISOString()
      if (form.status === 'Pagato') payload.paid_at = new Date().toISOString()

      const { data: row, error: insertErr } = await supabase.from('products').insert(payload).select('id, photo_url').single()
      if (insertErr) throw insertErr

      const { error: galleryErr } = await supabase
        .from('products')
        .update({
          photo_urls: urls,
          notes: stripGalleryFromNotes(form.notes || '') || null,
        })
        .eq('id', row.id)
      if (galleryErr && isPhotoUrlsSchemaError(galleryErr)) {
        const notesPayload = encodeNotesWithGallery(form.notes || '', urls)
        const { error: notesErr } = await supabase
          .from('products')
          .update({ notes: notesPayload })
          .eq('id', row.id)
        if (notesErr) throw notesErr

        const sheetA = await notifyGoogleSheetsNewProduct({
          productId: row.id,
          action: 'insert',
          description: payload.description ?? desc,
          status: payload.status ?? form.status,
          price: payload.price,
          client_name: payload.client_name ?? '',
          sku: payload.sku ?? '',
          slot: payload.slot ?? '',
        })
        const sheetNoteA =
          !sheetA.ok
            ? ` Foglio Google: ${sheetA.message || 'non sincronizzato'}.`
            : sheetA.message
              ? ` ${sheetA.message}`
              : ''

        setFileQueue([])
        resetFormAndManualFields()
        setActiveIndex(0)
        setMessage(
          `Articolo salvato con tutte le ${urls.length} foto (galleria e ZIP: anche senza colonna photo_urls su Supabase). Quando potrai, esegui comunque sql/product_photo_urls.sql per usare solo il database.${sheetNoteA}`,
        )
        loadDistinctValues()
        return
      }
      if (galleryErr) throw galleryErr

      const inserted = { ...row, photo_urls: urls }

      const sheetB = await notifyGoogleSheetsNewProduct({
        productId: row.id,
        action: 'insert',
        description: payload.description ?? desc,
        status: payload.status ?? form.status,
        price: payload.price,
        client_name: payload.client_name ?? '',
        sku: payload.sku ?? '',
        slot: payload.slot ?? '',
      })
      const sheetNoteB =
        !sheetB.ok
          ? ` Foglio Google: ${sheetB.message || 'non sincronizzato'}.`
          : sheetB.message
            ? ` ${sheetB.message}`
            : ''

      setFileQueue([])
      resetFormAndManualFields()
      setActiveIndex(0)

      const savedN = getAllProductPhotoUrls(inserted).length
      const mismatch =
        savedN !== urls.length
          ? ` Attenzione: in database risultano ${savedN} foto su ${urls.length}. In Supabase esegui sql/product_photo_urls.sql se non l’hai già fatto.`
          : ''
      setMessage(
        `Articolo salvato con ${urls.length} foto in galleria. Apri l’inventario per vederle e scaricare lo ZIP.${mismatch}${sheetNoteB}`,
      )
      loadDistinctValues()
    } catch (error) {
      setMessage(`Errore salvataggio: ${formatProductsInsertError(error)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="app-card p-5 sm:p-6">
        <h2 className="app-section-title mb-5">Carica prodotto</h2>
        <label className="app-btn-secondary relative flex min-h-[3.25rem] w-full cursor-pointer items-center py-3.5 pl-4 text-left text-[15px]">
          <input
            id="magazzino-upload-photos"
            type="file"
            accept="image/*"
            multiple
            className="absolute inset-0 z-10 block h-full min-h-[3.25rem] w-full cursor-pointer opacity-0"
            onChange={onFileInputChange}
            aria-label="Carica foto prodotto"
          />
          <span className="pointer-events-none relative z-0 select-none">Carica prodotto</span>
        </label>
        {fileQueue.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{fileQueue.length} foto in coda</p>
            <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-zinc-200/80 bg-zinc-500/[0.03] p-2 dark:border-zinc-600 dark:bg-zinc-950/40">
              {fileQueue.map((item, index) => (
                <li key={item.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm transition ${
                      index === safeActiveIndex
                        ? 'bg-[#0ABAB5]/15 font-medium text-zinc-900 ring-1 ring-[#0ABAB5]/40 dark:text-zinc-100'
                        : 'text-zinc-700 hover:bg-zinc-500/10 dark:text-zinc-300'
                    }`}
                  >
                    {index + 1}. {item.file.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Rimuovi ${item.file.name}`}
                    onClick={() => removeFromQueue(index)}
                    className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-red-500/10 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
                  >
                    Rimuovi
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-4">
          {preview && (
            <div className="flex aspect-[4/3] max-h-[min(18rem,42vh)] w-full items-center justify-center overflow-hidden rounded-2xl border border-zinc-200/90 bg-zinc-500/[0.05] shadow-inner dark:border-zinc-600 dark:bg-zinc-950/50 sm:max-h-[min(20rem,45vh)]">
              <img
                src={preview}
                alt="Anteprima prodotto"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}

          <button
            type="button"
            onClick={onAnalyze}
            disabled={!activeFile || loadingVision}
            aria-label="Rianalizza con Telovendo AI"
            className="app-btn-primary w-full py-3.5"
          >
            {loadingVision ? 'Analisi in corso…' : 'Rianalizza con Telovendo AI'}
          </button>
        </div>
      </div>

      <div className="app-card p-5 sm:p-6">
        <p className="app-kicker mb-1">Passo 2</p>
        <h2 className="app-section-title mb-5">Conferma dati e salva</h2>
        <div className="grid gap-4">
          <label className="block">
            <span className="app-label">Titolo breve</span>
            <input
              value={form.description}
              onChange={(e) => markManualField('description', e.target.value)}
              className="app-input"
            />
          </label>
          <label className="block">
            <span className="app-label">Prezzo</span>
            <input
              value={form.price}
              onChange={(e) => markManualField('price', e.target.value)}
              className="app-input"
            />
          </label>

          <label className="block">
            <span className="app-label">SKU</span>
            <input
              value={form.sku}
              onChange={(e) =>
                markManualField('sku', e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              className="app-input font-mono tabular-nums"
              placeholder="Es. 1234"
              maxLength={4}
              inputMode="numeric"
            />
          </label>

          <label className="block">
            <span className="app-label">Nome cliente</span>
            <select
              value={clientOptions.includes(selectedClientValue) ? selectedClientValue : ''}
              onChange={(e) => {
                const v = e.target.value
                markManualField('client_name', v)
              }}
              className="app-input"
            >
              <option value="">—</option>
              {clientOptions.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="app-label">Nome nuovo cliente</span>
            <input
              value={form.client_name}
              onChange={(e) => markManualField('client_name', e.target.value)}
              placeholder="Es. Mario Rossi"
              className="app-input"
            />
          </label>

          <label className="block">
            <span className="app-label">Slot</span>
            <select
              value={slotOptions.includes(selectedSlotValue) ? selectedSlotValue : ''}
              onChange={(e) => markManualField('slot', e.target.value)}
              className="app-input"
            >
              <option value="">—</option>
              {slotOptions.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="app-label">Nuovo slot</span>
            <input
              value={form.slot}
              onChange={(e) => markManualField('slot', e.target.value)}
              placeholder="Es. 1-A1"
              className="app-input"
            />
          </label>

          <label className="block">
            <span className="app-label">Stato</span>
            <select
              value={form.status}
              onChange={(e) => markManualField('status', e.target.value)}
              className="app-input"
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="app-label">Descrizione annuncio</span>
            <textarea
              value={form.notes}
              onChange={(e) => markManualField('notes', e.target.value)}
              rows={8}
              className="app-input resize-y min-h-[10rem]"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {fileQueue.length >= 2 ? (
            <>
              <button
                type="button"
                onClick={() => void onSaveAllPhotosOneProduct()}
                disabled={saving}
                className="app-btn-primary px-8 disabled:opacity-60"
              >
                {saving ? 'Salvataggio…' : `Salva articolo con tutte le ${fileQueue.length} foto`}
              </button>
              <button type="button" onClick={onSave} disabled={!activeFile || saving} className="app-btn-secondary px-6 py-2.5 text-sm disabled:opacity-60">
                Solo la foto evidenziata (toglie 1 dalla coda)
              </button>
            </>
          ) : (
            <button type="button" onClick={onSave} disabled={!activeFile || saving} className="app-btn-primary px-8">
              {saving ? 'Salvataggio…' : 'Salva prodotto'}
            </button>
          )}
        </div>

        {message && <p className="app-inline-message">{message}</p>}
      </div>
    </section>
  )
}
