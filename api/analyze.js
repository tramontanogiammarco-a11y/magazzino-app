import { analyzeAnthropic } from '../server/analyzeAnthropic.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const result = await analyzeAnthropic(req.body)
    return res.status(result.status).json(result.body)
  } catch (error) {
    console.error('api/analyze:', error)
    return res.status(500).json({ error: error.message || 'Errore interno server' })
  }
}
