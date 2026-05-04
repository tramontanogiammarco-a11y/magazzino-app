import { convertImageBuffer, readRequestBuffer } from '../server/convertImage.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

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
    const input = await readRequestBuffer(req)
    const result = await convertImageBuffer(input, {
      maxEdge: req.query?.maxEdge,
      quality: req.query?.quality,
    })

    res.setHeader('Content-Type', result.mimeType)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(result.buffer)
  } catch (error) {
    console.error('api/convert-image:', error)
    return res.status(error.status || 422).json({
      error: error.message || 'Conversione immagine non riuscita',
    })
  }
}
