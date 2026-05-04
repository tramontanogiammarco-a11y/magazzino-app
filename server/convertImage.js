import sharp from 'sharp'

const DEFAULT_MAX_EDGE = 1600
const DEFAULT_QUALITY = 82

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export async function readRequestBuffer(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)
  if (req.body && typeof req.body === 'object' && typeof req.body.base64 === 'string') {
    return Buffer.from(req.body.base64, 'base64')
  }

  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export async function convertImageBuffer(input, options = {}) {
  if (!input || input.length === 0) {
    const err = new Error('File immagine vuoto')
    err.status = 400
    throw err
  }

  const maxEdge = clampNumber(options.maxEdge, DEFAULT_MAX_EDGE, 400, 2400)
  const quality = clampNumber(options.quality, DEFAULT_QUALITY, 55, 92)

  const output = await sharp(input, { limitInputPixels: false })
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({
      quality,
      mozjpeg: true,
    })
    .toBuffer()

  return {
    buffer: output,
    mimeType: 'image/jpeg',
    extension: 'jpg',
  }
}
