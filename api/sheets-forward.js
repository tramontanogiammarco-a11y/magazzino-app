import { SHEETS_WEBHOOK_URL } from '../src/constants/sheetsWebhook.js'
import { trySheetsApiSync } from '../server/googleSheetsApiSync.js'
import { mergeGsQueryIntoBody, parseJsonBody } from '../server/sheetsMergeGsQuery.js'

function buildGoogleSheetsTargetUrl(base, req) {
  const u = new URL(base.trim())
  const q = req.query ?? {}
  for (const [key, val] of Object.entries(q)) {
    if (!key.startsWith('gs_')) continue
    const v = Array.isArray(val) ? val[0] : val
    if (v != null && String(v) !== '') u.searchParams.set(key, String(v))
  }
  return u.toString()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  const mergedBody = mergeGsQueryIntoBody(parseJsonBody(req.body), req.query)
  const apiResult = await trySheetsApiSync(mergedBody)
  if (apiResult != null) {
    const status = apiResult.ok === false ? 422 : 200
    return res.status(status).json(apiResult)
  }

  const action = String(mergedBody?.action || '').toLowerCase()
  if (action === 'update') {
    return res.status(422).json({
      ok: false,
      error:
        'Aggiornamento Google Sheets disattivato: con il webhook attuale aggiunge righe duplicate. I nuovi prodotti continuano a essere inseriti, ma per aggiornare la stessa riga serve configurare la modalità Google Sheets API.',
    })
  }

  const base = process.env.SHEETS_WEBHOOK_URL || SHEETS_WEBHOOK_URL
  const target = buildGoogleSheetsTargetUrl(base, req)
  const payload = JSON.stringify(mergedBody)

  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload,
      redirect: 'follow',
    })
    const text = await r.text()
    let outStatus = r.status
    try {
      const j = JSON.parse(text)
      if (j && j.ok === false) outStatus = 422
    } catch {
      // non JSON
    }
    const ct = r.headers.get('content-type') || 'text/plain; charset=utf-8'
    return res.status(outStatus).setHeader('Content-Type', ct).send(text)
  } catch (e) {
    console.error('[sheets-forward]', e)
    return res.status(502).json({ error: e.message || 'Proxy verso Google fallito' })
  }
}
