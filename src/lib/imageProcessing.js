import heic2any from 'heic2any'

export const PHOTO_UPLOAD_MAX_EDGE = 1600
export const PHOTO_UPLOAD_QUALITY = 0.78
export const PHOTO_UPLOAD_SKIP_BELOW_BYTES = 900 * 1024

export function isHeicFile(file) {
  const name = String(file?.name || '').toLowerCase()
  const type = String(file?.type || '').toLowerCase()
  return type.includes('heic') || type.includes('heif') || /\.(heic|heif)$/i.test(name)
}

export function fileExtFromMime(mimeType) {
  const t = String(mimeType || '').toLowerCase()
  if (t.includes('webp')) return 'webp'
  if (t.includes('png')) return 'png'
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg'
  if (t.includes('heic')) return 'heic'
  if (t.includes('heif')) return 'heif'
  return ''
}

export function fileExtFromName(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  const ext = match?.[1] || ''
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext
  }
  return ''
}

export function mimeFromExt(ext) {
  switch (String(ext || '').toLowerCase()) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'heic':
      return 'image/heic'
    case 'heif':
      return 'image/heif'
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg'
  }
}

export function formatFileSize(bytes) {
  const n = Number(bytes || 0)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function baseNameForFile(file) {
  return String(file?.name || 'foto').replace(/\.[^.]+$/, '')
}

export async function convertHeicToJpegFile(file, quality = 0.86) {
  if (!isHeicFile(file)) return file
  const output = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality,
  })
  const blob = Array.isArray(output) ? output[0] : output
  if (!blob || !blob.size) throw new Error('Conversione HEIC non riuscita')
  return new File([blob], `${baseNameForFile(file)}.jpg`, {
    type: 'image/jpeg',
    lastModified: file.lastModified || Date.now(),
  })
}

export async function ensureBrowserReadableImage(file) {
  return convertHeicToJpegFile(file)
}

export function loadImageElement(file) {
  const objectUrl = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('image decode'))
    }
    img.src = objectUrl
  })
}

export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

export async function preparePhotoForUpload(file) {
  if (!file) return file
  const readableFile = await ensureBrowserReadableImage(file)
  const originalType = String(readableFile?.type || '').toLowerCase()
  const isProbablyImage = originalType.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(readableFile?.name || '')
  if (!isProbablyImage) return readableFile

  const img = await loadImageElement(readableFile)
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  if (!width || !height) return readableFile

  const largestEdge = Math.max(width, height)
  const shouldResize = largestEdge > PHOTO_UPLOAD_MAX_EDGE
  const shouldCompress = readableFile.size > PHOTO_UPLOAD_SKIP_BELOW_BYTES
  if (!shouldResize && !shouldCompress && (originalType === 'image/jpeg' || originalType === 'image/webp')) {
    return readableFile
  }

  const scale = shouldResize ? PHOTO_UPLOAD_MAX_EDGE / largestEdge : 1
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return readableFile
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

  const outputType = 'image/jpeg'
  const blob = await canvasToBlob(canvas, outputType, PHOTO_UPLOAD_QUALITY)
  if (!blob || !blob.size || (!isHeicFile(file) && blob.size >= readableFile.size)) return readableFile

  return new File([blob], `${baseNameForFile(file)}.jpg`, {
    type: outputType,
    lastModified: file.lastModified || Date.now(),
  })
}
