import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { analyzeAnthropic } from './server/analyzeAnthropic.js'

dotenv.config()

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json({ limit: '15mb' }))

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

app.listen(PORT, () => {
  console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'presente' : 'MANCANTE')
  console.log('ANTHROPIC_MODEL:', process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929 (default)')
  console.log(`API Telovendo AI (POST /api/analyze): http://localhost:${PORT}`)
})
