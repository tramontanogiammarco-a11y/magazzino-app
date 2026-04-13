import { SHEETS_WEBHOOK_URL } from '../constants/sheetsWebhook.js'

function todayDdMmYyyy() {
  return new Date().toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatPriceEuro(price) {
  if (price == null || price === '') return ''
  const n = Number(price)
  if (Number.isNaN(n)) return ''
  return `${n} €`
}

/** Stesso payload che riceve Apps Script (JSON come stringa, text/plain). */
function buildSheetsBody(payload) {
  return JSON.stringify(payload)
}

const GS_DESC_MAX = 450

/**
 * Parametri `gs_*` nella query: Apps Script li espone in `e.parameter` anche su POST.
 * Se lo script ignora il body JSON, ha comunque stato, prezzo, SKU, descrizione (troncata), ecc.
 */
function appendGsSyncQuery(searchParams, payload) {
  searchParams.set('gs_action', String(payload.action || 'insert'))
  if (payload.productId) searchParams.set('gs_pid', String(payload.productId))
  searchParams.set('gs_date', String(payload.date || ''))
  if (payload.status != null && payload.status !== '') searchParams.set('gs_status', String(payload.status))
  if (payload.price != null && payload.price !== '') searchParams.set('gs_price', String(payload.price))
  if (payload.sku != null && payload.sku !== '') searchParams.set('gs_sku', String(payload.sku))
  if (payload.slot != null && payload.slot !== '') searchParams.set('gs_slot', String(payload.slot))
  if (payload.client_name != null && payload.client_name !== '') {
    searchParams.set('gs_client', String(payload.client_name).slice(0, 120))
  }
  const desc = String(payload.description || '').trim()
  if (desc) searchParams.set('gs_desc', desc.slice(0, GS_DESC_MAX))
}

function googleSheetsWebhookUrlWithSyncQuery(baseUrl, payload) {
  const u = new URL(baseUrl)
  appendGsSyncQuery(u.searchParams, payload)
  return u.toString()
}

/**
 * Invio diretto al Web App Google (come in origine). Con `no-cors` il browser non legge la risposta,
 * ma la richiesta parte comunque — utile se `/api/sheets-forward` non è disponibile.
 */
async function postDirectToGoogleSheets(payload) {
  const body = buildSheetsBody(payload)
  const url = googleSheetsWebhookUrlWithSyncQuery(SHEETS_WEBHOOK_URL, payload)
  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
  })
}

/**
 * Prima prova il proxy (body affidabile da server); se non risponde o errore HTTP (tranne 422),
 * reinvia in diretta a Google così il foglio si aggiorna anche senza API locale / senza funzione Vercel.
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
export async function notifyGoogleSheetsNewProduct({
  productId = null,
  action = 'insert',
  description,
  status,
  price,
  client_name,
  sku,
  slot,
}) {
  const payload = {
    date: todayDdMmYyyy(),
    action,
    productId: productId != null ? String(productId) : null,
    description: description ?? '',
    status: status ?? '',
    price: formatPriceEuro(price),
    client_name: client_name ?? '',
    sku: sku != null ? String(sku) : '',
    slot: slot ?? '',
  }

  const body = buildSheetsBody(payload)
  const qs = new URLSearchParams()
  appendGsSyncQuery(qs, payload)
  const forwardUrl = `/api/sheets-forward?${qs.toString()}`

  let res
  try {
    res = await fetch(forwardUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
      body,
    })
  } catch (e) {
    const m = e?.message || String(e)
    try {
      await postDirectToGoogleSheets(payload)
      return {
        ok: true,
        message:
          'Foglio: inviato in diretta a Google (il proxy /api non risponde — avvia `npm run dev` o il deploy con api/sheets-forward per avere conferma errori). ' +
          (m ? `(${m})` : ''),
      }
    } catch (e2) {
      return { ok: false, message: m || String(e2) }
    }
  }

  const text = await res.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // HTML o testo
  }

  /** 422 = Apps Script ha risposto { ok: false } (es. update senza riga): non fare doppio invio diretto. */
  if (res.status === 422 || (parsed && parsed.ok === false)) {
    return {
      ok: false,
      message:
        parsed?.error ||
        'il foglio ha risposto con errore (controlla lo script Google e le colonne id_prodotto / SKU).',
    }
  }

  if (!res.ok) {
    try {
      await postDirectToGoogleSheets(payload)
      return {
        ok: true,
        message: `Foglio: inviato in diretta (il proxy ha risposto HTTP ${res.status}). Controlla il foglio.`,
      }
    } catch {
      return {
        ok: false,
        message:
          (parsed && (parsed.error || parsed.message)) || text.trim().slice(0, 220) || `HTTP ${res.status}`,
      }
    }
  }

  return { ok: true }
}

export { SHEETS_WEBHOOK_URL }
