import JSZip from 'jszip'

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

/** Tutte le URL pubbliche dell'articolo (ordine galleria, senza duplicati). */
export function getAllProductPhotoUrls(product) {
  if (!product) return []

  const fromColumn = dedupeUrls(parsePhotoUrlsArray(product.photo_urls))
  const main = product.photo_url ? String(product.photo_url).trim() : ''

  if (fromColumn.length > 0) {
    return fromColumn
  }
  return main ? [main] : []
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
  const base = String(product.sku || product.id || 'articolo').replace(/[^\w.-]+/g, '-')

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
