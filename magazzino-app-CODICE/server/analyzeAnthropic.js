import {
  buildFallbackListingNotes,
  clampToMaxWords,
  countWords,
} from '../src/lib/fallbackListingNotes.js'
import { tryGeminiAnalyze, getGeminiApiKeyForServer } from './analyzeGemini.js'
import { parseJsonFromModelText } from './modelJsonParse.js'

/**
 * Logica condivisa tra Express (server.js) e Vercel (api/analyze.js).
 * Accetta una foto (imageBase64 + mimeType) oppure più foto (images[]).
 *
 * Una sola chiamata Anthropic: JSON con titolo, campi etichetta e `notes` insieme (evita timeout doppi su Vercel / proxy).
 *
 * Modello: ANTHROPIC_MODEL in .env, altrimenti snapshot Sonnet 4.5 (vision).
 * Se il principale è in overload / rate limit dopo i retry, si prova ANTHROPIC_FALLBACK_MODEL
 * (default: Haiku 3.5 vision). Disabilita con ANTHROPIC_FALLBACK_MODEL=off.
 */
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929'
const DEFAULT_FALLBACK_MODEL = 'claude-3-5-haiku-20241022'

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Solo saturazione Anthropic: serve per attivare il secondo modello (Haiku ecc.). */
function isAnthropicCapacityExceeded(status, payload) {
  if (status === 429 || status === 529) return true
  const t = payload?.error?.type
  if (t === 'overloaded_error' || t === 'rate_limit_error') return true
  if (String(payload?.error?.message || '').toLowerCase().includes('overloaded')) return true
  return false
}

function resolveAnthropicFallbackModel(primaryModel) {
  const raw = (process.env.ANTHROPIC_FALLBACK_MODEL ?? '').trim()
  if (/^(off|none|disabled?|0)$/i.test(raw)) return ''
  const chosen = raw || DEFAULT_FALLBACK_MODEL
  if (chosen === primaryModel) return ''
  return chosen
}

/** Errori Anthropic spesso transitori: overload, rate limit, gateway. */
function isRetryableAnthropicFailure(status, payload) {
  if (status === 429 || status === 529) return true
  if (status === 502 || status === 503 || status === 504) return true
  const t = payload?.error?.type
  if (t === 'overloaded_error' || t === 'rate_limit_error') return true
  const msg = String(payload?.error?.message || payload?.message || '').toLowerCase()
  if (msg.includes('overloaded')) return true
  return false
}

/**
 * Chiama Anthropic con retry (overload / rate limit / 5xx transitori).
 * @param {Parameters<typeof callAnthropicMessages>[0]} params
 * @param {{ maxAttempts?: number, baseDelayMs?: number }} [opts]
 */
async function callAnthropicMessagesWithRetry(params, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 7
  const baseDelayMs = opts.baseDelayMs ?? 1500
  let last = /** @type {Awaited<ReturnType<typeof callAnthropicMessages>>} */ ({ ok: false, status: 502, error: '' })

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await callAnthropicMessages(params)
    if (last.ok) return last
    if (attempt >= maxAttempts || !isRetryableAnthropicFailure(last.status, last.payload)) {
      return last
    }
    const cap = 28000
    const exp = Math.min(cap, baseDelayMs * 2 ** (attempt - 1))
    const jitter = Math.random() * 600
    const delayMs = Math.min(cap, exp + jitter)
    console.warn(
      `[Telovendo AI] tentativo ${attempt}/${maxAttempts} (${last.error || last.status}), nuovo tentativo tra ${Math.round(delayMs)}ms`,
    )
    await sleep(delayMs)
  }
  return last
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

  const systemCombined =
    'Inventario Telovendo: capi usati con etichetta. Rispondi SOLO con un unico JSON valido, senza markdown, senza testo fuori dal JSON. ' +
    'Le chiavi devono essere esattamente queste cinque: description, sku, client_name, slot, notes.'

  const multiLead =
    `Stai per ricevere ${n} immagini dello STESSO capo (stesso articolo), angolazioni o distanze diverse. ` +
    'Esamina ogni immagine; cerca etichetta, SKU a 4 cifre, nome cliente, slot. Se un dato compare solo in una foto, usalo.'

  const promptCombinedSingle =
    'Analizza la foto: capo usato con foglio etichetta. Rispondi con UN SOLO JSON con le chiavi description, sku, client_name, slot, notes. ' +
    'description = titolo breve 6-7 parole per magazzino. sku = esattamente 4 cifre se leggibile altrimenti "". ' +
    'client_name e slot come letti dall’etichetta (stringa vuota se non leggibili). ' +
    'notes = descrizione annuncio in italiano, **minimo 10 parole e massimo 40 parole**: tipo capo e marca se leggibile, taglia solo se su etichetta, colore sintetico, condizioni se deducibili; una parola su vestibilità solo se evidentissima. ' +
    'Niente hashtag, prezzo o emoji; niente elenchi lunghi di dettagli costruttivi.'

  const promptCombinedMulti =
    'Rispondi con UN SOLO JSON: chiavi description, sku, client_name, slot, notes. ' +
    'description: 6-7 parole (titolo magazzino) fondendo tutte le foto. sku: 4 cifre se chiaro in almeno una foto altrimenti "". ' +
    'client_name e slot: valori più leggibili tra le inquadrature (stringa vuota se non leggibili). ' +
    'notes: come per annuncio (10-40 parole italiano, essenziale: tipo capo, marca, taglia da etichetta, colore, condizioni). Niente hashtag, prezzo o emoji.'

  const content1 = buildImageBlocks(images, n, {
    multiLeadText: n > 1 ? multiLead : '',
    labelEachImage: n > 1,
    finalPrompt: n > 1 ? promptCombinedMulti : promptCombinedSingle,
  })

  let res1
  let modelUsed = model
  try {
    res1 = await callAnthropicMessagesWithRetry({
      apiKey,
      model,
      system: systemCombined,
      max_tokens: 8192,
      content: content1,
    })
  } catch (err) {
    return {
      status: 502,
      body: { error: `Rete verso Anthropic: ${err.message || String(err)}` },
    }
  }

  const fallbackModel = resolveAnthropicFallbackModel(model)
  let triedCapacityFallback = false
  if (
    !res1.ok &&
    fallbackModel &&
    isAnthropicCapacityExceeded(res1.status, res1.payload)
  ) {
    triedCapacityFallback = true
    console.warn(`[Telovendo AI] modello principale (${model}) in saturazione, tentativo con ${fallbackModel}`)
    try {
      res1 = await callAnthropicMessagesWithRetry(
        {
          apiKey,
          model: fallbackModel,
          system: systemCombined,
          max_tokens: 8192,
          content: content1,
        },
        { maxAttempts: 5, baseDelayMs: 1200 },
      )
      if (res1.ok) modelUsed = fallbackModel
    } catch (err) {
      return {
        status: 502,
        body: { error: `Rete verso Anthropic: ${err.message || String(err)}` },
      }
    }
  }

  const looksCapacity =
    res1.payload?.error?.type === 'overloaded_error' ||
    res1.payload?.error?.type === 'rate_limit_error' ||
    res1.status === 429 ||
    res1.status === 529 ||
    String(res1.error || '').toLowerCase().includes('overloaded')

  if (!res1.ok && looksCapacity && getGeminiApiKeyForServer()) {
    const gem = await tryGeminiAnalyze({
      images,
      n,
      systemText: systemCombined,
      multiLeadText: n > 1 ? multiLead : '',
      finalPrompt: n > 1 ? promptCombinedMulti : promptCombinedSingle,
    })
    if (gem.ok) return gem.result
    console.warn('[Telovendo AI] fallback Google Gemini non riuscito:', gem.error)
  }

  if (!res1.ok) {
    const friendly = looksCapacity
      ? getGeminiApiKeyForServer()
        ? 'Anthropic è saturo e anche il backup Google Gemini non ha risposto (limite o errore). Riprova tra qualche minuto.'
        : triedCapacityFallback
          ? 'Anthropic è molto saturo (modello principale e Haiku). Aggiungi GEMINI_API_KEY o VITE_GEMINI_API_KEY in .env per attivare il backup automatico con Google Gemini.'
          : 'Anthropic è saturo. L’API ritenta e passa a Haiku; se persiste, aggiungi GEMINI_API_KEY o VITE_GEMINI_API_KEY in .env per il backup Google Gemini.'
      : res1.error
    return { status: res1.status, body: { error: friendly, model, detail: res1.payload } }
  }

  let parsed1
  try {
    parsed1 = parseJsonFromModelText(res1.text)
  } catch (error) {
    console.warn('[Telovendo AI] JSON non valido:', error.message, String(res1.text).slice(0, 500))
    return {
      status: 500,
      body: { error: error.message || 'JSON non valido dall’analisi', raw: res1.text, model },
    }
  }

  const description = asStr(parsed1.description).trim()
  const sku = asStr(parsed1.sku).replace(/\D/g, '').slice(0, 4)
  const client_name = asStr(parsed1.client_name ?? parsed1.clientName).trim()
  const slot = asStr(parsed1.slot).trim()

  let notesOut = asStr(
    parsed1.notes ??
      parsed1.note ??
      parsed1.descrizione ??
      parsed1.vinted_description ??
      parsed1.listing_description,
  )
    .trim()
    .slice(0, 4500)

  notesOut = clampToMaxWords(notesOut, 40)
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

  const raw = JSON.stringify({
    responseLength: res1.text?.length ?? 0,
    notesWords: countWords(notesOut),
    model: modelUsed,
  })

  return { status: 200, body: { data, raw } }
}
