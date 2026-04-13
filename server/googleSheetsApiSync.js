/**
 * Optional Google Sheets API sync (service account).
 * When GOOGLE_SHEETS_SPREADSHEET_ID + credentials are set, /api/sheets-forward
 * updates existing rows instead of relying on Apps Script.
 *
 * Env:
 *   GOOGLE_SHEETS_SPREADSHEET_ID  (required for API mode)
 *   GOOGLE_SHEETS_TAB              (default: Foglio1)
 *   GOOGLE_APPLICATION_CREDENTIALS (path to JSON) OR
 *   GOOGLE_SERVICE_ACCOUNT_JSON    (inline JSON, e.g. on Vercel)
 */

import { readFileSync, existsSync } from 'fs'
import { JWT } from 'google-auth-library'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const ID_ARTICLE_DEFAULT_COLUMN = 10

function loadServiceAccountJson() {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (inline && String(inline).trim()) {
    try {
      return JSON.parse(String(inline).trim())
    } catch {
      return null
    }
  }
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (path && existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      return null
    }
  }
  return null
}

function humanizeGoogleSheetsApiError(message) {
  const raw = String(message || '').trim()
  if (
    /sheets\.googleapis\.com/i.test(raw) &&
    (/has not been used/i.test(raw) || /is disabled/i.test(raw))
  ) {
    return (
      'Google Sheets API non attiva nel progetto Google Cloud. Apri la pagina API del progetto, abilita Google Sheets API, attendi 1-2 minuti e riprova.'
    )
  }
  if (/permission denied|the caller does not have permission|insufficient authentication scopes/i.test(raw)) {
    return (
      'Il service account non ha accesso al foglio Google. Condividi il foglio con l’email del service account come Editor e riprova.'
    )
  }
  if (/unable to parse range|range.*not found|requested entity was not found/i.test(raw)) {
    return 'Il tab Google indicato in GOOGLE_SHEETS_TAB non esiste. Controlla il nome del foglio e riprova.'
  }
  return raw
}

async function getAccessToken(creds) {
  const jwt = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [SHEETS_SCOPE],
  })
  const res = await jwt.authorize()
  return res.access_token
}

function escapeSheetTitle(name) {
  return `'${String(name).replace(/'/g, "''")}'`
}

/** Allineato a normalizeDesc_ in SheetsWebhook.gs (accenti, spazi). */
function normalizeDesc(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function normHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Stessa logica di buildHeaderMap_ + default colonne in SheetsWebhook.gs */
function buildHeaderMapLikeAppsScript(headersRow) {
  const map = {}
  const headers = headersRow || []
  for (let i = 0; i < headers.length; i++) {
    const h = normHeader(headers[i])
    if (!h) continue
    const col = i + 1
    if (
      h === 'id_prodotto' ||
      h === 'id articolo' ||
      h === 'idarticolo' ||
      h === 'product_id' ||
      h === 'productid' ||
      h === 'uuid' ||
      h === 'supabase id'
    ) {
      map.id_prodotto = col
    } else if (h === 'data' || h === 'date') map.data = col
    else if (
      h === 'descrizione' ||
      h === 'titolo' ||
      h === 'description' ||
      h === 'articolo'
    )
      map.descrizione = col
    else if (h === 'stato' || h === 'status') map.stato = col
    else if (h === 'prezzo' || h === 'price') map.prezzo = col
    else if (h === 'cliente' || h === 'client' || h === 'proprietario' || h === 'nome cliente')
      map.cliente = col
    else if (h === 'sku' || h === 'codice') map.sku = col
    else if (h === 'slot' || h === 'posizione') map.slot = col
  }
  if (!map.data) map.data = 1
  if (!map.descrizione) map.descrizione = 2
  if (!map.stato) map.stato = 3
  if (!map.prezzo) map.prezzo = 4
  if (!map.cliente) map.cliente = 5
  if (!map.sku) map.sku = 6
  if (!map.slot) map.slot = 7
  if (!map.id_prodotto) {
    map.id_prodotto = ID_ARTICLE_DEFAULT_COLUMN
  }
  return map
}

function maxColumnIndex(map) {
  let m = 0
  for (const k of Object.keys(map)) {
    const v = map[k]
    if (typeof v === 'number' && v > m) m = v
  }
  return Math.max(m, 1)
}

function buildRowArray(map, data, width) {
  const row = new Array(width).fill('')
  const set = (col, val) => {
    if (col > 0 && col <= width) row[col - 1] = val == null ? '' : String(val)
  }
  if (map.id_prodotto) set(map.id_prodotto, data.productId || '')
  if (map.data) set(map.data, data.date || '')
  if (map.stato) set(map.stato, data.status || '')
  if (map.prezzo) set(map.prezzo, data.price || '')
  if (map.sku) set(map.sku, data.sku || '')
  if (map.slot) set(map.slot, data.slot || '')
  if (map.cliente) set(map.cliente, data.client || '')
  if (map.descrizione) set(map.descrizione, data.description || '')
  return row
}

function findAllRowIndices1Based(values, map, idCol, productId, sku, description) {
  const rows = []
  const skuDigits = String(sku || '').replace(/\D/g, '').trim()
  const descNorm = normalizeDesc(description)

  for (let idx = 1; idx < values.length; idx++) {
    const row = values[idx]
    const sheetRow = idx + 1
    const idCell =
      idCol > 0 && row.length >= idCol ? String(row[idCol - 1] || '').trim() : ''
    if (productId && idCell === productId) rows.push(sheetRow)
  }
  if (rows.length) return [...new Set(rows)]

  for (let idx = 1; idx < values.length; idx++) {
    const row = values[idx]
    const sheetRow = idx + 1
    const cSku =
      map.sku > 0 && row.length >= map.sku
        ? String(row[map.sku - 1] || '').replace(/\D/g, '').trim()
        : ''
    const cDesc =
      map.descrizione > 0 && row.length >= map.descrizione
        ? normalizeDesc(row[map.descrizione - 1])
        : ''
    const skuOk = !skuDigits || cSku === skuDigits
    const descOk = !descNorm || cDesc === descNorm
    if (!(skuOk && descOk && (skuDigits || descNorm))) continue
    const idCell =
      idCol > 0 && row.length >= idCol ? String(row[idCol - 1] || '').trim() : ''
    if (!idCell || idCell === productId) rows.push(sheetRow)
  }
  if (rows.length) return [...new Set(rows)]

  for (let idx = 1; idx < values.length; idx++) {
    const row = values[idx]
    const sheetRow = idx + 1
    const cSku =
      map.sku > 0 && row.length >= map.sku
        ? String(row[map.sku - 1] || '').replace(/\D/g, '').trim()
        : ''
    if (!skuDigits || cSku !== skuDigits) continue
    const idCell =
      idCol > 0 && row.length >= idCol ? String(row[idCol - 1] || '').trim() : ''
    if (!idCell || idCell === productId) rows.push(sheetRow)
  }
  return [...new Set(rows)]
}

function productIdExistsInSheet(values, idCol, productId) {
  if (!productId || !idCol) return false
  for (let idx = 1; idx < values.length; idx++) {
    const row = values[idx]
    const idCell =
      idCol > 0 && row.length >= idCol ? String(row[idCol - 1] || '').trim() : ''
    if (idCell === productId) return true
  }
  return false
}

async function sheetsGetValues(accessToken, spreadsheetId, range) {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
  )
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const text = await res.text()
  let json = {}
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const err = json.error?.message || text || res.statusText
    throw new Error(err)
  }
  return json.values || []
}

async function sheetsBatchUpdate(accessToken, spreadsheetId, body) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = {}
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const err = json.error?.message || text || res.statusText
    throw new Error(err)
  }
  return json
}

async function sheetsAppend(accessToken, spreadsheetId, range, values) {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`,
  )
  url.searchParams.set('valueInputOption', 'USER_ENTERED')
  url.searchParams.set('insertDataOption', 'INSERT_ROWS')
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  })
  const text = await res.text()
  let json = {}
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const err = json.error?.message || text || res.statusText
    throw new Error(err)
  }
  return json
}

/**
 * If spreadsheet id + SA credentials are configured, perform sync via Sheets API.
 * @returns {Promise<object|null>} Result object or null to fall back to webhook.
 */
export async function trySheetsApiSync(body) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
  if (!spreadsheetId || !String(spreadsheetId).trim()) return null

  const creds = loadServiceAccountJson()
  if (!creds?.client_email || !creds?.private_key) return null

  const tab = (process.env.GOOGLE_SHEETS_TAB || 'Foglio1').trim()
  const escaped = escapeSheetTitle(tab)
  const readRange = `${escaped}!A1:ZZ5000`

  const action = String(body?.action || '').toLowerCase()
  const data = {
    productId: String(body?.productId || '').trim(),
    date: body?.date,
    status: body?.status,
    price: body?.price,
    sku: body?.sku,
    slot: body?.slot,
    client: body?.client_name ?? body?.client,
    description: body?.description,
  }

  if (action !== 'update' && action !== 'insert') {
    return { ok: false, error: 'Azione non valida' }
  }

  try {
    const accessToken = await getAccessToken(creds)
    const values = await sheetsGetValues(accessToken, spreadsheetId, readRange)
    const headersRow = values[0] || []
    const map = buildHeaderMapLikeAppsScript(headersRow)
    const idCol = map.id_prodotto || 0
    const width = maxColumnIndex(map)
    const colLetterEnd = columnIndexToA1Letter(width)

    if (action === 'update') {
      const targets = findAllRowIndices1Based(
        values,
        map,
        idCol,
        data.productId,
        data.sku,
        data.description,
      )
      if (!targets.length) {
        return { ok: false, error: 'Riga non trovata per aggiornamento' }
      }
      const rowVals = buildRowArray(map, data, width)
      const batchData = targets.map((sheetRow) => ({
        range: `${escaped}!A${sheetRow}:${colLetterEnd}${sheetRow}`,
        values: [rowVals],
      }))
      await sheetsBatchUpdate(accessToken, spreadsheetId, {
        valueInputOption: 'USER_ENTERED',
        data: batchData,
      })
      return {
        ok: true,
        via: 'google_sheets_api',
        action: 'update',
        rows: targets.length,
      }
    }

    // insert
    if (data.productId && productIdExistsInSheet(values, idCol, data.productId)) {
      const targets = findAllRowIndices1Based(
        values,
        map,
        idCol,
        data.productId,
        data.sku,
        data.description,
      )
      if (!targets.length) {
        return { ok: false, error: 'Riga esistente non trovata per aggiornamento' }
      }
      const rowVals = buildRowArray(map, data, width)
      const batchData = targets.map((sheetRow) => ({
        range: `${escaped}!A${sheetRow}:${colLetterEnd}${sheetRow}`,
        values: [rowVals],
      }))
      await sheetsBatchUpdate(accessToken, spreadsheetId, {
        valueInputOption: 'USER_ENTERED',
        data: batchData,
      })
      return {
        ok: true,
        via: 'google_sheets_api',
        action: 'insert_dedupe',
        rows: targets.length,
      }
    }

    const rowVals = buildRowArray(map, data, width)
    await sheetsAppend(accessToken, spreadsheetId, `${escaped}!A1`, [rowVals])
    return { ok: true, via: 'google_sheets_api', action: 'insert', rows: 1 }
  } catch (e) {
    return {
      ok: false,
      error: humanizeGoogleSheetsApiError(e?.message || String(e)),
      via: 'google_sheets_api',
    }
  }
}

/** 1-based column index to A1 letter(s) */
function columnIndexToA1Letter(n) {
  let col = n
  let s = ''
  while (col > 0) {
    const rem = (col - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    col = Math.floor((col - 1) / 26)
  }
  return s || 'A'
}
