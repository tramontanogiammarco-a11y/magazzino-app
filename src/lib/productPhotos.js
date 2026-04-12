import JSZip from 'jszip'
import { displaySku } from './supabase'

/** Suffisso in `notes` quando `photo_urls` non è disponibile su Supabase (stesso articolo, più URL). */
const MAG_GALLERY_MARK = '\n\n__MAG_GALLERY__\n'

/**
 * Normalizza il campo jsonb `photo_urls` da PostgREST/Supabase:
 * può essere array, stringa JSON, null, o oggetto con chiavi numeriche.
 */
function parsePhotoUrlsArray(raw) {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) {
    return raw.map((u) => String(u).trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return []
    try {
      const p = JSON.parse(s)
      return parsePhotoUrlsArray(p)
    } catch {
      return []
    }
  }
  if (typeof raw === 'object') {
    const keys = Object.keys(raw).filter((k) => /^\d+$/.test(k))
    if (keys.length) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => String(raw[k]).trim())
        .filter(Boolean)
    }
  }
  return []
}

function dedupeUrls(urls) {
  const seen = new Set()
  const out = []
  for (const u of urls) {
    const n = (u || '').trim()
    if (n && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out
}

/** Legge l’array URL salvato nel suffisso `__MAG_GALLERY__` delle note. */
export function parseGalleryUrlsFromNotes(notes) {
  if (!notes || typeof notes !== 'string') return []
  const i = notes.indexOf(MAG_GALLERY_MARK)
  if (i === -1) return []
  const jsonPart = notes.slice(i + MAG_GALLERY_MARK.length).trim()
  try {
    return dedupeUrls(parsePhotoUrlsArray(JSON.parse(jsonPart)))
  } catch {
    return []
  }
}

/** Rimuove il blocco galleria (per mostrare le note all’utente). */
export function stripGalleryFromNotes(notes) {
  if (!notes || typeof notes !== 'string') return ''
  const i = notes.indexOf(MAG_GALLERY_MARK)
  if (i === -1) return notes
  return notes.slice(0, i).trimEnd()
}

/** Note visibili in UI (senza blocco tecnico). */
export function notesVisibleToUser(notes) {
  return stripGalleryFromNotes(notes ?? '')
}

/** Accoda alle note il JSON delle URL (≥2). */
export function encodeNotesWithGallery(userNotes, urls) {
  const arr = dedupeUrls((urls || []).map((u) => String(u).trim()).filter(Boolean))
  if (arr.length < 2) return (userNotes || '').trim() || null
  const head = stripGalleryFromNotes(userNotes || '').trimEnd()
  const suffix = `${MAG_GALLERY_MARK}${JSON.stringify(arr)}`
  return head ? `${head}${suffix}` : suffix
}

/**
 * Dopo modifica note in inventario: mantiene il blocco galleria se c’era.
 * @param {string} previousFull note complete dal DB
 * @param {string} newVisible testo che l’utente vede/modifica
 */
export function mergeUserNotesEdit(previousFull, newVisible) {
  const preserved = parseGalleryUrlsFromNotes(previousFull ?? '')
  if (preserved.length >= 2) {
    return encodeNotesWithGallery(newVisible, preserved)
  }
  return newVisible
}

/**
 * URL miniatura per la tabella inventario: su Supabase Storage usa il rendering
 * (immagine più leggera). Se non è un URL Storage o il render fallisce, usa l’originale
 * (`onError` sull’`<img>`).
 */
export function getProductPhotoThumbnailSrc(url) {
  const u = String(url || '').trim()
  if (!u) return u
  const marker = '/storage/v1/object/public/'
  const i = u.indexOf(marker)
  if (i === -1) return u
  const pathFromBucket = u.slice(i + marker.length)
  const origin = u.slice(0, i)
  const renderBase = `${origin}/storage/v1/render/image/public/${pathFromBucket}`
  const join = renderBase.includes('?') ? '&' : '?'
  return `${renderBase}${join}width=360&height=360&resize=cover&quality=82`
}

/** Tutte le URL pubbliche dell'articolo (ordine galleria, senza duplicati). */
export function getAllProductPhotoUrls(product) {
  if (!product) return []

  const main = product.photo_url ? String(product.photo_url).trim() : ''
  const raw = product.photo_urls ?? product.photoUrls
  let fromColumn = dedupeUrls(parsePhotoUrlsArray(raw))
  const fromNotes = parseGalleryUrlsFromNotes(product.notes ?? '')

  if (fromColumn.length >= 2) {
    if (main && !fromColumn.includes(main)) fromColumn = [main, ...fromColumn]
    return dedupeUrls(fromColumn)
  }

  if (fromNotes.length >= 2) {
    let u = dedupeUrls(fromNotes)
    if (main && !u.includes(main)) u = [main, ...u]
    return u
  }

  let urls = fromColumn.length ? fromColumn : fromNotes
  if (main && urls.length && !urls.includes(main)) urls = [main, ...urls]
  if (urls.length === 0 && main) return [main]
  return dedupeUrls(urls)
}

function extFromMime(mime) {
  if (!mime) return 'jpg'
  const m = mime.toLowerCase()
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('gif')) return 'gif'
  if (m.includes('heic')) return 'heic'
  if (m.includes('heif')) return 'heif'
  return 'jpg'
}

/** Scarica tutte le foto dell'articolo in un unico ZIP (nome file: SKU + indice). */
export async function downloadProductPhotosZip(product) {
  const urls = getAllProductPhotoUrls(product)
  if (!urls.length) throw new Error('Nessuna foto da scaricare')

  const zip = new JSZip()
  const skuLabel = displaySku(product.sku)
  const base = String(skuLabel || product.id || 'articolo').replace(/[^\w.-]+/g, '-')

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    const res = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    })
    if (!res.ok) {
      throw new Error(`Foto ${i + 1} di ${urls.length}: HTTP ${res.status}`)
    }
    const buf = await res.arrayBuffer()
    if (!buf.byteLength) {
      throw new Error(`Foto ${i + 1} di ${urls.length}: file vuoto`)
    }
    const ext = extFromMime(res.headers.get('content-type') || '')
    zip.file(`${base}-${String(i + 1).padStart(3, '0')}.${ext}`, new Uint8Array(buf))
  }

  const out = await zip.generateAsync({ type: 'blob' })
  const name = `foto-${base}-${product.id ?? 'magazzino'}.zip`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(out)
  a.download = name
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(a.href)
}
