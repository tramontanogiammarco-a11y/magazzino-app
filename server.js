import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { SHEETS_WEBHOOK_URL } from './src/constants/sheetsWebhook.js'
import { analyzeAnthropic } from './server/analyzeAnthropic.js'
import { trySheetsApiSync } from './server/googleSheetsApiSync.js'
import { mergeGsQueryIntoBody, parseJsonBody } from './server/sheetsMergeGsQuery.js'

dotenv.config()

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json({ limit: '15mb' }))

app.get('/api/health', (_req, res) => {
  const gemini =
    Boolean((process.env.GEMINI_API_KEY || '').trim()) ||
    Boolean((process.env.GOOGLE_AI_API_KEY || '').trim()) ||
    Boolean((process.env.VITE_GEMINI_API_KEY || '').trim())
  const sheetsApiConfigured =
    Boolean((process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '').trim()) &&
    (Boolean((process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim()) ||
      Boolean((process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim()))
  res.json({
    ok: true,
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    geminiKey: gemini,
    model: (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929').trim(),
    sheetsSync: sheetsApiConfigured ? 'google_sheets_api' : 'webhook_only',
  })
})

app.post('/api/analyze', async (req, res) => {
  try {
    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body || '{}')
      } catch {
        return res.status(400).json({ error: 'Body JSON non valido' })
      }
    }
    const result = await analyzeAnthropic(body || {})
    return res.status(result.status).json(result.body)
  } catch (error) {
    console.log('Errore completo /api/analyze:', error)
    return res.status(500).json({ error: error.message || 'Errore interno server' })
  }
})

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

/** Proxy verso Web App Google: il browser non chiama più script.google.com in no-cors (body più affidabile). */
app.post('/api/sheets-forward', async (req, res) => {
  try {
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
      // risposta non JSON (es. HTML)
    }
    const ct = r.headers.get('content-type') || 'text/plain; charset=utf-8'
    return res.status(outStatus).setHeader('Content-Type', ct).send(text)
  } catch (error) {
    console.error('Errore /api/sheets-forward:', error)
    return res.status(502).json({ error: error.message || 'Proxy Google Sheets fallito' })
  }
})

const server = app.listen(PORT, () => {
  console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'presente' : 'MANCANTE')
  console.log('ANTHROPIC_MODEL:', process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929 (default)')
  console.log(`API Telovendo AI (POST /api/analyze): http://localhost:${PORT}`)
  console.log(`Sheets proxy (POST /api/sheets-forward): http://localhost:${PORT}`)
  console.log(`Health: http://localhost:${PORT}/api/health`)
})
/** Richieste lunghe (Anthropic + più foto) senza chiudere il socket troppo presto */
server.headersTimeout = 190000
server.requestTimeout = 180000
