/**
 * Logica condivisa tra Express (server.js) e Vercel (api/analyze.js).
 * Accetta una foto (imageBase64 + mimeType) oppure più foto (images[]).
 *
 * Modello: ANTHROPIC_MODEL in .env, altrimenti snapshot Sonnet 4.5 (vision).
 */
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929'

function normalizeAnalyzeBody(raw) {
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {}
    } catch {
      return {}
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString('utf8')) || {}
    } catch {
      return {}
    }
  }
  return typeof raw === 'object' ? raw : {}
}

function pickImagePayload(im) {
  if (!im || typeof im !== 'object') return null
  const b64 = im.base64 || im.imageBase64 || im.data
  if (!b64 || typeof b64 !== 'string' || b64.length < 20) return null
  const mime = im.mimeType || im.media_type || im.mediaType || 'image/jpeg'
  return { base64: b64, mimeType: mime }
}

export async function analyzeAnthropic(body) {
  const bodySafe = normalizeAnalyzeBody(body)
  const fromArray = Array.isArray(bodySafe.images) ? bodySafe.images : []
  const images = []

  for (const im of fromArray.slice(0, 6)) {
    const picked = pickImagePayload(im)
    if (picked) images.push(picked)
  }

  if (images.length === 0 && bodySafe.imageBase64 && typeof bodySafe.imageBase64 === 'string') {
    images.push({
      base64: bodySafe.imageBase64,
      mimeType: bodySafe.mimeType || 'image/jpeg',
    })
  }

  if (images.length === 0) {
    return {
      status: 400,
      body: {
        error:
          'Nessuna immagine nel body. Invia imageBase64 + mimeType oppure images: [{ base64 o imageBase64, mimeType }].',
        receivedKeys: Object.keys(bodySafe),
      },
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { status: 500, body: { error: 'ANTHROPIC_API_KEY mancante in .env' } }
  }

  const model = (process.env.ANTHROPIC_MODEL || DEFAULT_MODEL).trim()

  const n = images.length
  const promptSingle =
    'Analizza la foto di un capo usato con foglio etichetta. Estrai solo JSON valido senza testo extra con queste chiavi: description, sku, client_name, slot. Regole: description 6-7 parole, sku esattamente 4 cifre se leggibile altrimenti stringa vuota, mantieni nome cliente e slot come letti.'

  const promptMultiLead =
    `Stai per ricevere ${n} immagini dello STESSO capo (stesso articolo), angolazioni o distanze diverse. ` +
    'Obbligatorio: esamina ogni immagine; nessuna ha priorità sulla prima. ' +
    'Cerca su TUTTE le foto: testo etichetta, SKU a 4 cifre, nome cliente, slot. ' +
    'Se un dato compare solo in una foto (anche non la prima), usalo. ' +
    'Se le foto sono complementari (es. davanti/dietro, dettaglio + panorama), fondi i dettagli nella description.'

  const promptMultiClose =
    'Ora rispondi: un solo JSON valido, senza markdown né testo fuori dal JSON, con chiavi esatte description, sku, client_name, slot. ' +
    'description: 6-7 parole che sintetizzano il capo usando ciò che emerge da tutte le foto insieme. ' +
    'sku: esattamente 4 cifre se in almeno una foto l’etichetta lo mostra chiaramente, altrimenti stringa vuota. ' +
    'client_name e slot: valori letti dalle foto, scegliendo la resa più leggibile tra le inquadrature.'

  const content = []
  if (n > 1) {
    content.push({ type: 'text', text: promptMultiLead })
  }
  for (let i = 0; i < n; i++) {
    const { base64, mimeType } = images[i]
    if (n > 1) {
      content.push({ type: 'text', text: `— Immagine ${i + 1} di ${n} —` })
    }
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType,
        data: base64,
      },
    })
  }

  content.push({ type: 'text', text: n > 1 ? promptMultiClose : promptSingle })

  const systemMulti =
    'Capisci inventario capi usati con etichetta cartacea. Con più foto dello stesso articolo devi sempre fondere le evidenze visive da tutte le immagini; non basare la risposta solo sulla prima. Output: solo JSON con le chiavi richieste dall’utente, nient’altro.'

  let anthropicResponse
  try {
    anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        ...(n > 1 ? { system: systemMulti } : {}),
        max_tokens: n > 1 ? 512 : 300,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      }),
    })
  } catch (err) {
    return {
      status: 502,
      body: { error: `Rete verso Anthropic: ${err.message || String(err)}` },
    }
  }

  const payload = await anthropicResponse.json().catch(() => ({}))
  if (!anthropicResponse.ok) {
    const msg =
      payload?.error?.message ||
      payload?.error?.type ||
      payload?.message ||
      (typeof payload?.error === 'string' ? payload.error : null) ||
      `Anthropic HTTP ${anthropicResponse.status}`
    return {
      status: anthropicResponse.status >= 400 && anthropicResponse.status < 600 ? anthropicResponse.status : 502,
      body: { error: msg, model, detail: payload },
    }
  }

  const raw = payload?.content?.find((item) => item.type === 'text')?.text?.trim()
  if (!raw) {
    return {
      status: 502,
      body: { error: 'Risposta Anthropic senza testo valido', model, payload },
    }
  }

  try {
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return { status: 200, body: { data: parsed, raw } }
  } catch (error) {
    return {
      status: 500,
      body: { error: error.message || 'JSON non valido dalla risposta', raw, model },
    }
  }
}
