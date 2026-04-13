import {
  buildFallbackListingNotes,
  clampToMaxWords,
  countWords,
} from '../src/lib/fallbackListingNotes.js'
import { parseJsonFromModelText } from './modelJsonParse.js'

/** 1.5 spesso ancora abilitato su piani dove 2.0 ha quota 0. */
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash'
const GEMINI_MODEL_ALTERNATES = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']

export function getGeminiApiKeyForServer() {
  return (
    (process.env.GEMINI_API_KEY || '').trim() ||
    (process.env.GOOGLE_AI_API_KEY || '').trim() ||
    (process.env.VITE_GEMINI_API_KEY || '').trim()
  )
}

function buildParts(images, n, multiLeadText, finalPrompt) {
  const parts = []
  if (n > 1 && multiLeadText) {
    parts.push({ text: multiLeadText })
  }
  for (let i = 0; i < n; i++) {
    const { base64, mimeType } = images[i]
    if (n > 1) {
      parts.push({ text: `— Immagine ${i + 1} di ${n} —` })
    }
    parts.push({
      inlineData: {
        mimeType,
        data: base64,
      },
    })
  }
  parts.push({ text: finalPrompt })
  return parts
}

function asStr(v) {
  if (v == null) return ''
  return typeof v === 'string' ? v : String(v)
}

/**
 * Se Anthropic è saturo: stesso schema JSON (description, sku, client_name, slot, notes).
 * @param {{ images: { base64: string, mimeType: string }[], n: number, systemText: string, multiLeadText: string, finalPrompt: string }} p
 * @returns {Promise<{ ok: true, result: { status: number, body: object } } | { ok: false, error: string }>}
 */
export async function tryGeminiAnalyze({ images, n, systemText, multiLeadText, finalPrompt }) {
  const apiKey = getGeminiApiKeyForServer()
  if (!apiKey) {
    return { ok: false, error: 'Nessuna chiave Gemini lato server (GEMINI_API_KEY o VITE_GEMINI_API_KEY)' }
  }

  const configured = (process.env.GEMINI_MODEL || '').trim()
  const primary = configured || DEFAULT_GEMINI_MODEL
  const modelOrder = [...new Set([primary, ...GEMINI_MODEL_ALTERNATES])]

  const parts = buildParts(images, n, multiLeadText, finalPrompt)
  const buildBody = (jsonMode) => ({
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: 8192,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  })

  let lastErr = ''
  /** @type {unknown} */
  let successPayload = null
  let modelUsed = ''
  for (const model of modelOrder) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

    let body = buildBody(true)
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    let payload = await res.json().catch(() => ({}))

    if (!res.ok && payload?.error?.message?.includes('responseMimeType')) {
      body = buildBody(false)
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      payload = await res.json().catch(() => ({}))
    }

    if (!res.ok) {
      lastErr =
        payload?.error?.message ||
        payload?.error?.status ||
        `Gemini HTTP ${res.status}`
      const canTryNext =
        /quota|resource_exhausted|rate limit|429|404|not found|not supported for generateContent/i.test(
          String(lastErr),
        ) && modelOrder.indexOf(model) < modelOrder.length - 1
      if (canTryNext) {
        console.warn(`[Telovendo AI] Gemini ${model} fallito, provo altro modello`)
        continue
      }
      return { ok: false, error: lastErr }
    }

    successPayload = payload
    modelUsed = model
    break
  }

  if (!successPayload) {
    return { ok: false, error: lastErr || 'Gemini: nessuna risposta valida' }
  }

  const payload = successPayload

  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map((p) => (typeof p.text === 'string' ? p.text : ''))
      .join('\n')
      .trim() || ''

  if (!text) {
    return { ok: false, error: 'Risposta Gemini senza testo' }
  }

  let parsed1
  try {
    parsed1 = parseJsonFromModelText(text)
  } catch (e) {
    return { ok: false, error: e.message || 'JSON non valido da Gemini' }
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
    responseLength: text.length,
    notesWords: countWords(notesOut),
    model: modelUsed,
    provider: 'gemini',
  })

  console.warn(`[Telovendo AI] analisi completata con Google Gemini (${modelUsed}) dopo saturazione Anthropic`)
  return {
    ok: true,
    result: { status: 200, body: { data, raw } },
  }
}
