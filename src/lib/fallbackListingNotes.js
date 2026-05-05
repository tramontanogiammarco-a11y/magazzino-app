/** Numero di parole (sequenze separate da spazi). */
export function countWords(s) {
  return String(s || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

/** Tronca alla massimo N parole (nessun punto escluso a metà frase oltre il limite parole). */
export function clampToMaxWords(s, maxWords) {
  const parts = String(s || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length <= maxWords) return parts.join(' ')
  return parts.slice(0, maxWords).join(' ')
}

/**
 * Descrizione breve di riserva (10–40 parole) quando l’API non restituisce `notes` o è troppo corta.
 * Usato dal server (analyzeAnthropic) e dal client (gemini) per coerenza.
 */
export function buildFallbackListingNotes(description) {
  const titolo = String(description || '').trim() || 'Capo di seconda mano'
  const senzaPuntoFinale = titolo.endsWith('.') ? titolo.slice(0, -1).trim() : titolo
  const parts = [
    `${senzaPuntoFinale}.`,
    'In buone condizioni generali, come da foto.',
    'Ideale per outfit casual di tutti i giorni.',
  ]
  const out = parts.join('').replace(/\s+/g, ' ').trim()
  return clampToMaxWords(out, 60).slice(0, 4500)
}

function stripSkuMentions(notes) {
  return String(notes || '')
    .replace(/(?:^|\n)\s*(?:codice\s+)?sku\s*:?\s*\d{1,4}\s*[.!?]?\s*(?=\n|$)/gi, '\n')
    .replace(/\s*(?:codice\s+)?sku\s*:?\s*\d{1,4}\s*[.!?]?/gi, '')
    .replace(/[ \t]+([,.!?;:])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function formatListingNotesWithSku(notes, sku) {
  const cleanSku = String(sku || '').replace(/\D/g, '').slice(0, 4)
  const body = clampToMaxWords(stripSkuMentions(notes), 60)
  if (!cleanSku) return body
  return body ? `${body}\n\nSKU: ${cleanSku}` : `SKU: ${cleanSku}`
}
