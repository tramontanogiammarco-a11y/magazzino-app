import {
  buildFallbackListingNotes,
  clampToMaxWords,
  countWords,
} from '../src/lib/fallbackListingNotes.js'

/**
 * Logica condivisa tra Express (server.js) e Vercel (api/analyze.js).
 * Accetta una foto (imageBase64 + mimeType) oppure più foto (images[]).
 *
 * Due passaggi Anthropic: (1) dati tabellari + titolo breve, (2) solo testo lungo "notes" per Vinted.
 * Così il JSON del primo passo non viene mai troncato prima delle note.
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

function asStr(v) {
  if (v == null) return ''
  return typeof v === 'string' ? v : String(v)
}

/** Estrae il primo oggetto `{ ... }` bilanciato rispettando stringhe JSON (escape, virgolette). */
function extractFirstBalancedJsonObject(s) {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (c === '\\') {
        escape = true
        continue
      }
      if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function parseJsonFromModelText(raw) {
  let clean = String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim()
  const tryParse = (str) => {
    try {
      return JSON.parse(str)
    } catch {
      return null
    }
  }
  const direct = tryParse(clean)
  if (direct) return direct
  const sub = extractFirstBalancedJsonObject(clean)
  if (sub) {
    const nested = tryParse(sub)
    if (nested) return nested
  }
  throw new Error('JSON non valido')
}

/**
 * @param {{ apiKey: string, model: string, system: string, max_tokens: number, content: unknown[] }} p
 */
async function callAnthropicMessages({ apiKey, model, system, max_tokens, content }) {
  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system,
      max_tokens,
      temperature: 0.25,
      messages: [{ role: 'user', content }],
    }),
  })

  const payload = await anthropicResponse.json().catch(() => ({}))
  if (!anthropicResponse.ok) {
    const msg =
      payload?.error?.message ||
      payload?.error?.type ||
      payload?.message ||
      (typeof payload?.error === 'string' ? payload.error : null) ||
      `Anthropic HTTP ${anthropicResponse.status}`
    return {
      ok: false,
      status: anthropicResponse.status >= 400 && anthropicResponse.status < 600 ? anthropicResponse.status : 502,
      error: msg,
      payload,
    }
  }

  /** Anthropic può restituire più blocchi `text` (es. prefisso + JSON): unirli tutti. */
  const text =
    Array.isArray(payload?.content) && payload.content.length
      ? payload.content
          .filter((item) => item.type === 'text' && typeof item.text === 'string')
          .map((item) => item.text)
          .join('\n')
          .trim()
      : ''
  if (!text) {
    return { ok: false, status: 502, error: 'Risposta Anthropic senza testo valido', payload }
  }
  return { ok: true, status: 200, text, payload }
}

function buildImageBlocks(images, n, { multiLeadText, labelEachImage, finalPrompt }) {
  const content = []
  if (n > 1 && multiLeadText) {
    content.push({ type: 'text', text: multiLeadText })
  }
  for (let i = 0; i < n; i++) {
    const { base64, mimeType } = images[i]
    if (n > 1 && labelEachImage) {
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
  content.push({ type: 'text', text: finalPrompt })
  return content
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

  const systemTabular =
    'Inventario Telovendo: capi usati con etichetta. Rispondi SOLO con JSON valido, senza markdown, senza testo fuori dal JSON. ' +
    'Le chiavi devono essere esattamente: description, sku, client_name, slot. NON includere la chiave notes in questa risposta.'

  const systemNotes =
    'Descrizioni annuncio in italiano: **da 10 a 40 parole** (conteggio rigoroso), solo essenziale. ' +
    'Rispondi SOLO con JSON valido con una sola chiave: notes (stringa). Nessun markdown, nessun testo fuori dal JSON.'

  const multiLead =
    `Stai per ricevere ${n} immagini dello STESSO capo (stesso articolo), angolazioni o distanze diverse. ` +
    'Esamina ogni immagine; cerca etichetta, SKU a 4 cifre, nome cliente, slot. Se un dato compare solo in una foto, usalo.'

  const promptPhase1Single =
    'Analizza la foto: capo usato con foglio etichetta. Estrai JSON con chiavi description, sku, client_name, slot. ' +
    'description = titolo breve 6-7 parole per magazzino. sku = esattamente 4 cifre se leggibile altrimenti "". ' +
    'client_name e slot come letti dall’etichetta.'

  const promptPhase1Multi =
    'Ora rispondi con un solo JSON: chiavi description, sku, client_name, slot. ' +
    'description: 6-7 parole (titolo magazzino) fondendo tutte le foto. sku: 4 cifre se chiaro in almeno una foto altrimenti "". ' +
    'client_name e slot: valori più leggibili tra le inquadrature.'

  const content1 = buildImageBlocks(images, n, {
    multiLeadText: n > 1 ? multiLead : '',
    labelEachImage: n > 1,
    finalPrompt: n > 1 ? promptPhase1Multi : promptPhase1Single,
  })

  let res1
  try {
    res1 = await callAnthropicMessages({
      apiKey,
      model,
      system: systemTabular,
      max_tokens: 900,
      content: content1,
    })
  } catch (err) {
    return {
      status: 502,
      body: { error: `Rete verso Anthropic: ${err.message || String(err)}` },
    }
  }

  if (!res1.ok) {
    return { status: res1.status, body: { error: res1.error, model, detail: res1.payload } }
  }

  let parsed1
  try {
    parsed1 = parseJsonFromModelText(res1.text)
  } catch (error) {
    return {
      status: 500,
      body: { error: error.message || 'JSON non valido (fase titolo)', raw: res1.text, model },
    }
  }

  const description = asStr(parsed1.description).trim()
  const sku = asStr(parsed1.sku).replace(/\D/g, '').slice(0, 4)
  const client_name = asStr(parsed1.client_name ?? parsed1.clientName).trim()
  const slot = asStr(parsed1.slot).trim()

  const titleForNotes = description || 'Articolo usato'
  const safeTitle = titleForNotes.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  const promptPhase2 =
    `Stesse foto del passo precedente. Titolo di magazzino (solo contesto): "${safeTitle}". ` +
    'Scrivi SOLO questo JSON (una chiave): {"notes":"..."}. ' +
    'Obbligo assoluto su "notes": testo in italiano di **minimo 10 parole e massimo 40 parole** — conta le parole nella stringa finale; se superi 40, accorcia prima di rispondere. ' +
    'Contenuto: in frasi semplici solo **che capo è** (e marca se leggibile), **taglia** solo se leggibile su etichetta, **colore** sintetico, **condizioni** se le capisci dalle foto; opzionale **una** parola su **vestibilità** solo se è evidentissima. ' +
    'Niente elenchi di dettagli (tasche, zip, fodera, materiali lunghi, logo). Niente hashtag, prezzo o emoji.'

  const content2 = buildImageBlocks(images, n, {
    multiLeadText: n > 1 ? multiLead : '',
    labelEachImage: n > 1,
    finalPrompt: promptPhase2,
  })

  let notesOut = ''
  try {
    const res2 = await callAnthropicMessages({
      apiKey,
      model,
      system: systemNotes,
      max_tokens: 350,
      content: content2,
    })
    if (res2.ok) {
      try {
        const parsed2 = parseJsonFromModelText(res2.text)
        notesOut = asStr(
          parsed2.notes ??
            parsed2.note ??
            parsed2.descrizione ??
            parsed2.text ??
            parsed2.vinted_description ??
            parsed2.listing_description,
        )
          .trim()
          .slice(0, 4500)
      } catch {
        notesOut = ''
      }
    }
  } catch {
    notesOut = ''
  }

  notesOut = clampToMaxWords(notesOut.trim(), 40)
  if (countWords(notesOut) < 10) {
    notesOut = buildFallbackListingNotes(description)
  }
  notesOut = clampToMaxWords(notesOut, 40)

  const data = {
    description,
    sku,
    client_name,
    slot,
    notes: notesOut,
  }

  const raw = JSON.stringify({ phase1: res1.text, notesLength: notesOut.length })

  return { status: 200, body: { data, raw } }
}
