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
    const result = await analyzeAnthropic(req.body || {})
    return res.status(result.status).json(result.body)
  } catch (error) {
    console.log('Errore completo /api/analyze:', error)
    return res.status(500).json({ error: error.message || 'Errore interno server' })
  }
})

app.listen(PORT, () => {
  console.log('API KEY:', process.env.ANTHROPIC_API_KEY ? 'presente' : 'MANCANTE')
  console.log(`Server avviato su http://localhost:${PORT}`)
})
