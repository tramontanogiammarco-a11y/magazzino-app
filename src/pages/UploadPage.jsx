import { useEffect, useMemo, useState } from 'react'
import { extractProductDataFromPhoto } from '../lib/gemini'
import { notifyGoogleSheetsNewProduct } from '../lib/googleSheets'
import { getDistinctProductFields, supabase, uploadProductPhoto } from '../lib/supabase'
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

  /** iOS: a volte `multiple` non restituisce più file; senza multiple ogni scelta aggiunge 1+ file alla coda. */
  const onFileInputAppendChange = (e) => {
    const input = e.target
    appendFilesFromList(input.files, true)
    input.value = ''
  }

  const removeFromQueue = (index) => {
    setFileQueue((q) => q.filter((_, j) => j !== index))
  }

  const onAnalyze = async () => {
    if (!activeFile) return
    setLoadingVision(true)
    setMessage('')
    try {
      const data = await extractProductDataFromPhoto(activeFile)
      setForm((old) => ({
        ...old,
        ...data,
        client_name: (data.client_name ?? data.clientName ?? old.client_name ?? '').toString().trim(),
        slot: (data.slot ?? old.slot ?? '').toString().trim(),
        description: (data.description ?? old.description ?? '').toString(),
        sku: (data.sku ?? old.sku ?? '').toString(),
      }))
      setMessage('Dati estratti da Telovendo AI. Verifica e salva.')
    } catch (error) {
      setMessage(`Errore Telovendo AI: ${error.message}`)
    } finally {
      setLoadingVision(false)
    }
  }

  const onSave = async () => {
    if (!activeFile) return
    const removeIdx = safeActiveIndex
    setSaving(true)
    setMessage('')

    try {
      const clientName = form.client_name?.trim() ?? ''
      const slotValue = form.slot?.trim() ?? ''
      if (!clientName) {
        setMessage('Indica un cliente dal menu oppure scrivi il nome nel campo sotto.')
        return
      }
      if (!slotValue) {
        setMessage('Indica uno slot dal menu oppure scrivilo nel campo sotto.')
        return
      }

      const photoUrl = await uploadProductPhoto(activeFile)
      const payload = {
        photo_url: photoUrl,
        description: form.description,
        sku: form.sku,
        client_name: clientName,
        slot: slotValue,
        status: form.status,
        price: form.price ? Number(form.price) : null,
        notes: form.notes || null,
      }

      if (form.status === 'Caricato') payload.loaded_at = new Date().toISOString()
      if (form.status === 'Venduto') payload.sold_at = new Date().toISOString()
      if (form.status === 'Pagato') payload.paid_at = new Date().toISOString()

      const { error } = await supabase.from('products').insert(payload)
      if (error) throw error

      try {
        await notifyGoogleSheetsNewProduct({
          description: form.description,
          status: form.status,
          price: form.price ? Number(form.price) : null,
          client_name: clientName,
          sku: form.sku,
          slot: slotValue,
        })
      } catch {
        // Webhook best-effort; salvataggio già riuscito
      }

      const remaining = fileQueue.length - 1
      setFileQueue((q) => q.filter((_, j) => j !== removeIdx))
      setForm(initialForm)
      setMessage(
        remaining > 0
          ? `Articolo salvato. Restano ${remaining} foto in coda: conferma i dati per la prossima.`
          : 'Articolo salvato con successo.',
      )
      loadDistinctValues()
    } catch (error) {
      setMessage(`Errore salvataggio: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="grid gap-8 lg:grid-cols-2 lg:items-start">
      <div className="app-card p-5 sm:p-6">
        <p className="app-kicker mb-1">Passo 1</p>
        <h2 className="app-section-title mb-5">Carica e analizza la foto</h2>
        {/*
          Su iOS Safari aprire il file picker con button + input.click() ignora spesso `multiple`.
          L’input trasparente sopra l’etichetta riceve il tap direttamente (come nativo).
        */}
        <label className="app-btn-secondary relative flex min-h-[3.25rem] w-full cursor-pointer items-center py-3.5 pl-4 text-left text-[15px]">
          <input
            id="magazzino-upload-photos"
            type="file"
            accept="image/*"
            multiple
            className="absolute inset-0 z-10 block h-full min-h-[3.25rem] w-full cursor-pointer opacity-0"
            onChange={onFileInputChange}
            aria-label="Carica una o più foto prodotto"
          />
          <span className="pointer-events-none relative z-0 select-none">Carica foto (anche più insieme)</span>
        </label>
        <label className="app-btn-ghost relative mt-2 flex min-h-[2.75rem] w-full cursor-pointer items-center py-2.5 pl-3 text-left text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="file"
            accept="image/*"
            className="absolute inset-0 z-10 block h-full w-full cursor-pointer opacity-0"
            onChange={onFileInputAppendChange}
            aria-label="Aggiungi altre foto alla coda"
          />
          <span className="pointer-events-none relative z-0 select-none">
            + Aggiungi altre foto alla coda (un altro caricamento — su iPhone è il metodo più sicuro)
          </span>
        </label>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Su iPhone, dalla Libreria tocca <span className="font-medium text-zinc-700 dark:text-zinc-300">Seleziona foto</span> (in alto a destra) per segnarne più di una. Se ne arriva sempre una sola, usa il link sotto più volte: ogni scelta si <span className="font-medium">aggiunge</span> alla coda.
        </p>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          Se usi il sito online: dopo un deploy su Vercel fai refresh forzato (tenendo premuto ricarica → «ricarica senza contenuto in cache») oppure aggiorna l’app dalla home.
        </p>
        {fileQueue.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {fileQueue.length} {fileQueue.length === 1 ? 'foto in coda' : 'foto in coda'} — seleziona quella da lavorare
            </p>
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
            aria-label="Analizza con Telovendo AI"
            className="app-btn-primary w-full py-3.5"
          >
            {loadingVision ? 'Analisi in corso…' : 'Analizza con Telovendo AI'}
          </button>
        </div>
      </div>

      <div className="app-card p-5 sm:p-6">
        <p className="app-kicker mb-1">Passo 2</p>
        <h2 className="app-section-title mb-5">Conferma dati e salva</h2>
        <div className="grid gap-4">
          {['description', 'sku', 'price'].map((field) => (
            <label key={field} className="block">
              <span className="app-label capitalize">{field.replace('_', ' ')}</span>
              <input
                value={form[field]}
                onChange={(e) => setForm((old) => ({ ...old, [field]: e.target.value }))}
                className="app-input"
              />
            </label>
          ))}

          <label className="block">
            <span className="app-label">Nome cliente</span>
            <select
              value={clientOptions.includes(selectedClientValue) ? selectedClientValue : ''}
              onChange={(e) => {
                const v = e.target.value
                setForm((old) => ({ ...old, client_name: v }))
              }}
              className="app-input"
            >
              <option value="">Seleziona cliente</option>
              {clientOptions.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="app-label">Oppure scrivi il nome cliente</span>
            <input
              value={form.client_name}
              onChange={(e) => setForm((old) => ({ ...old, client_name: e.target.value }))}
              placeholder="Es. Mario Rossi"
              className="app-input placeholder:text-zinc-400"
            />
          </label>

          <label className="block">
            <span className="app-label">Slot</span>
            <select
              value={slotOptions.includes(selectedSlotValue) ? selectedSlotValue : ''}
              onChange={(e) => setForm((old) => ({ ...old, slot: e.target.value }))}
              className="app-input"
            >
              <option value="">Seleziona slot</option>
              {slotOptions.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="app-label">Oppure scrivi lo slot</span>
            <input
              value={form.slot}
              onChange={(e) => setForm((old) => ({ ...old, slot: e.target.value }))}
              placeholder="Es. 1-A1"
              className="app-input placeholder:text-zinc-400"
            />
          </label>

          <label className="block">
            <span className="app-label">Stato</span>
            <select
              value={form.status}
              onChange={(e) => setForm((old) => ({ ...old, status: e.target.value }))}
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
            <span className="app-label">Note</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((old) => ({ ...old, notes: e.target.value }))}
              rows={4}
              className="app-input resize-y"
            />
          </label>
        </div>

        <button onClick={onSave} disabled={!activeFile || saving} className="app-btn-primary mt-6 px-8">
          {saving ? 'Salvataggio…' : 'Salva prodotto'}
        </button>

        {message && (
          <p className="mt-4 rounded-xl border border-zinc-200/90 bg-zinc-500/[0.04] px-4 py-3 text-sm leading-relaxed text-zinc-800 dark:border-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-200">
            {message}
          </p>
        )}
      </div>
    </section>
  )
}
