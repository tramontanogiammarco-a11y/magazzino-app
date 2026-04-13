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
    `Capo di seconda mano: ${senzaPuntoFinale}. `,
    'Vedi le foto per taglia sull’etichetta, colori e condizioni prima dell’acquisto.',
  ]
  const out = parts.join('').replace(/\s+/g, ' ').trim()
  return clampToMaxWords(out, 40).slice(0, 4500)
}
