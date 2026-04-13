import {
  buildFallbackListingNotes,
  clampToMaxWords,
  countWords,
} from './fallbackListingNotes.js'

async function prepareImageForUpload(file) {
  const imageUrl = URL.createObjectURL(file)

  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = imageUrl
    })

    const maxSize = 800
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas non disponibile')

    ctx.drawImage(img, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
    return {
      base64: dataUrl.split(',')[1],
      mimeType: 'image/jpeg',
    }
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

const MAX_ANALYSIS_IMAGES = 6

const MSG_ANTHROPIC_CAPACITY =
  'Anthropic è saturo o in limite di richieste. L’API ritenta più volte e, se serve, passa automaticamente a un modello più leggero (Haiku). Se vedi ancora questo messaggio, riprova tra qualche minuto o in un altro orario.'

/** Riconosce overload / rate limit sia nel JSON nostro (`detail`) sia in risposte “grezze” Anthropic (`error` oggetto). */
function isAnthropicCapacityError(parsed, httpStatus) {
  if (httpStatus === 429 || httpStatus === 529) return true
  if (!parsed || typeof parsed !== 'object') return false
  if (isAnthropicCapacityError(parsed.detail, httpStatus)) return true
  const err = parsed.error
  if (err && typeof err === 'object') {
    if (err.type === 'overloaded_error' || err.type === 'rate_limit_error') return true
    if (String(err.message || '').toLowerCase().includes('overloaded')) return true
  }
  if (parsed.type === 'error' && err && typeof err === 'object') {
    if (err.type === 'overloaded_error' || err.type === 'rate_limit_error') return true
  }
  if (typeof err === 'string' && err.toLowerCase().includes('overloaded')) return true
  return false
}

/** Messaggio grezzo in inglese dal provider: meglio sostituirlo con testo utile in italiano. */
function isShortRawAnthropicUserMessage(s) {
  const t = String(s || '').trim().toLowerCase()
  if (!t) return true
  if (t.length <= 24 && (t.includes('overload') || t === 'rate limit exceeded')) return true
  return false
}

function summarizeAnalyzeError(status, bodyText, parsed) {
  if (status === 0 || /failed to fetch|networkerror|load failed/i.test(bodyText)) {
    return 'Impossibile contattare /api/analyze. In locale usa `npm run dev` (Vite + API sulla 3001) oppure in due terminali `npm run dev:vite` e `npm run server`. Su Vercel verifica api/analyze e ANTHROPIC_API_KEY.'
  }
  if (parsed && typeof parsed === 'object') {
    if (typeof parsed.error === 'string' && parsed.error.trim() && !isShortRawAnthropicUserMessage(parsed.error)) {
      return parsed.error.trim()
    }
    if (parsed.error?.message && !isShortRawAnthropicUserMessage(parsed.error.message)) {
      return String(parsed.error.message)
    }
    if (isAnthropicCapacityError(parsed, status)) return MSG_ANTHROPIC_CAPACITY
    if (parsed.error && typeof parsed.error === 'string') return parsed.error
    if (parsed.error?.message) return parsed.error.message
    if (parsed.message) return parsed.message
  }
  if (bodyText && bodyText.length < 400 && !bodyText.trim().startsWith('<')) return bodyText
  if (status === 502) {
    const snippet =
      bodyText && bodyText.length > 0 && !bodyText.trim().startsWith('<')
        ? ` Dettaglio: ${bodyText.trim().slice(0, 300)}`
        : ''
    return (
      'Errore HTTP 502: spesso è il proxy Vite che va in timeout, oppure il processo API (porta 3001) non è attivo. ' +
      'Chiudi e rilancia `npm run dev` dalla cartella del progetto; apri nel browser http://localhost:3001/api/health (deve dare JSON con ok:true). ' +
      'Su Vercel: ANTHROPIC_API_KEY nelle variabili d’ambiente e nuovo deploy.' +
      snippet
    )
  }
  if (status) return `Errore HTTP ${status}`
  return 'Risposta non valida dal server di analisi'
}

/** Analizza più foto dello stesso articolo (stessa etichetta / angolazioni diverse). */
export async function extractProductDataFromPhotos(files) {
  const list = Array.from(files || []).filter(Boolean).slice(0, MAX_ANALYSIS_IMAGES)
  if (!list.length) throw new Error('Nessun file da analizzare')

  const prepared = await Promise.all(list.map((f) => prepareImageForUpload(f)))
  for (let i = 0; i < prepared.length; i++) {
    if (!prepared[i]?.base64 || prepared[i].base64.length < 20) {
      throw new Error(`Foto ${i + 1}: conversione immagine fallita (base64 vuoto). Prova un altro formato.`)
    }
  }

  const images = prepared.map((p) => ({
    base64: p.base64,
    imageBase64: p.base64,
    mimeType: p.mimeType,
  }))

  let response
  try {
    response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        images,
        imageBase64: prepared[0].base64,
        mimeType: prepared[0].mimeType,
      }),
    })
  } catch (err) {
    throw new Error(
      `Connessione a /api/analyze non riuscita (${err.message || err}). Avvia l’ambiente completo: npm run dev — oppure npm run dev:vite e in parallelo npm run server (porta 3001).`,
    )
  }

  const text = await response.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    throw new Error(summarizeAnalyzeError(response.status, text, parsed))
  }

  if (!parsed?.data) {
    throw new Error(summarizeAnalyzeError(response.status, text, parsed) || 'Risposta senza campo data')
  }

  const d = { ...parsed.data }
  const notesTrim = String(d.notes ?? '').trim()
  const descTrim = String(d.description ?? '').trim()
  if (descTrim && (!notesTrim || countWords(notesTrim) < 10)) {
    d.notes = buildFallbackListingNotes(descTrim)
  }
  d.notes = clampToMaxWords(String(d.notes ?? '').trim(), 40)
  return d
}

/** Una sola foto (compatibilità). */
export async function extractProductDataFromPhoto(file) {
  return extractProductDataFromPhotos([file])
}
