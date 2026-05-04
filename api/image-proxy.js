const MAX_IMAGE_BYTES = 10 * 1024 * 1024

function isAllowedUrl(raw) {
  let url
  try {
    url = new URL(String(raw || ''))
  } catch {
    return false
  }

  if (!['https:', 'http:'].includes(url.protocol)) return false
  if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/i.test(url.hostname)) return false
  return true
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'public, max-age=86400')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' })

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url
  if (!isAllowedUrl(rawUrl)) return res.status(400).json({ error: 'URL immagine non valido' })

  try {
    const upstream = await fetch(rawUrl, {
      redirect: 'follow',
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'Telovendo-Magazzino/1.0',
      },
    })

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Immagine non disponibile (${upstream.status})` })
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    if (!contentType.toLowerCase().startsWith('image/')) {
      return res.status(415).json({ error: 'Il file non e una immagine' })
    }

    const contentLength = Number(upstream.headers.get('content-length') || 0)
    if (contentLength > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'Immagine troppo grande' })

    const buffer = Buffer.from(await upstream.arrayBuffer())
    if (buffer.byteLength > MAX_IMAGE_BYTES) return res.status(413).json({ error: 'Immagine troppo grande' })

    res.setHeader('Content-Type', contentType)
    return res.status(200).send(buffer)
  } catch (error) {
    console.error('[image-proxy]', error)
    return res.status(502).json({ error: error.message || 'Proxy immagine fallito' })
  }
}
