import { useEffect, useMemo, useRef, useState } from 'react'
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

export default function UploadPage() {
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [form, setForm] = useState(initialForm)
  const [loadingVision, setLoadingVision] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [clients, setClients] = useState([])
  const [slots, setSlots] = useState([])

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

  const onAnalyze = async () => {
    if (!file) return
    setLoadingVision(true)
    setMessage('')
    try {
      const data = await extractProductDataFromPhoto(file)
      setForm((old) => ({
        ...old,
        ...data,
        client_name: (data.client_name ?? data.clientName ?? old.client_name ?? '').toString().trim(),
        slot: (data.slot ?? old.slot ?? '').toString().trim(),
        description: (data.description ?? old.description ?? '').toString(),
        sku: (data.sku ?? old.sku ?? '').toString(),
      }))
      setMessage('Dati estratti da Gemini. Verifica e salva.')
    } catch (error) {
      setMessage(`Errore Gemini: ${error.message}`)
    } finally {
      setLoadingVision(false)
    }
  }

  const onSave = async () => {
    if (!file) return
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

      const photoUrl = await uploadProductPhoto(file)
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

      setMessage('Articolo salvato con successo.')
      setForm(initialForm)
      setFile(null)
      if (preview) URL.revokeObjectURL(preview)
      setPreview('')
      if (fileInputRef.current) fileInputRef.current.value = ''
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          tabIndex={-1}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            setFile(f || null)
            setPreview((prev) => {
              if (prev) URL.revokeObjectURL(prev)
              return f ? URL.createObjectURL(f) : ''
            })
          }}
        />
        <button
          type="button"
          aria-label="Carica foto prodotto"
          onClick={() => fileInputRef.current?.click()}
          className="app-btn-secondary w-full justify-start py-3.5 text-left text-[15px]"
        >
          Carica foto prodotto
        </button>
        {file && (
          <p className="mt-2 truncate text-xs text-zinc-500 dark:text-zinc-400" title={file.name}>
            {file.name}
          </p>
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
            disabled={!file || loadingVision}
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

        <button onClick={onSave} disabled={!file || saving} className="app-btn-primary mt-6 px-8">
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
