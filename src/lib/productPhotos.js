import JSZip from 'jszip'

/** Tutte le URL pubbliche dell'articolo (ordine galleria). */
export function getAllProductPhotoUrls(product) {
  if (!product) return []
  const raw = product.photo_urls
  if (Array.isArray(raw) && raw.length > 0) {
    const urls = raw.map(String).filter(Boolean)
    if (urls.length) return urls
  }
  return product.photo_url ? [String(product.photo_url)] : []
}

function extFromMime(mime) {
  if (mime?.includes('png')) return 'png'
  if (mime?.includes('webp')) return 'webp'
  if (mime?.includes('gif')) return 'gif'
  return 'jpg'
}

/** Scarica tutte le foto dell'articolo in un unico ZIP (nome file: SKU + indice). */
export async function downloadProductPhotosZip(product) {
  const urls = getAllProductPhotoUrls(product)
  if (!urls.length) throw new Error('Nessuna foto da scaricare')

  const zip = new JSZip()
  const base = String(product.sku || product.id || 'articolo').replace(/[^\w.-]+/g, '-')

  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i], { mode: 'cors', credentials: 'omit' })
    if (!res.ok) throw new Error(`Download foto ${i + 1}: HTTP ${res.status}`)
    const blob = await res.blob()
    const ext = extFromMime(blob.type)
    zip.file(`${base}-${String(i + 1).padStart(2, '0')}.${ext}`, blob)
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
