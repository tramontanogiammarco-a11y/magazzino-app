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

function summarizeAnalyzeError(status, bodyText, parsed) {
  if (status === 0 || /failed to fetch|networkerror|load failed/i.test(bodyText)) {
    return 'Impossibile contattare /api/analyze. In locale avvia anche il backend: npm run server (porta 3001), oppure usa npm run dev:full. Su Vercel verifica la funzione api/analyze e ANTHROPIC_API_KEY.'
  }
  if (parsed && typeof parsed === 'object') {
    if (parsed.error && typeof parsed.error === 'string') return parsed.error
    if (parsed.error?.message) return parsed.error.message
    if (parsed.message) return parsed.message
  }
  if (bodyText && bodyText.length < 400 && !bodyText.trim().startsWith('<')) return bodyText
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
      `Connessione a /api/analyze non riuscita (${err.message || err}). Avvia il server API: npm run server (porta 3001) insieme a npm run dev, oppure npm run dev:full.`,
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
    const hint = summarizeAnalyzeError(response.status, text, parsed)
    throw new Error(parsed?.error ? String(parsed.error) : hint || 'Risposta senza campo data')
  }
  return parsed.data
}

/** Una sola foto (compatibilità). */
export async function extractProductDataFromPhoto(file) {
  return extractProductDataFromPhotos([file])
}
