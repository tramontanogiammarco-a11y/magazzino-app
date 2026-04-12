/**
 * Regole Telovendo sul prezzo di vendita Vinted (stesso prezzo salvato in magazzino).
 * - fino a 20 € inclusi: 50% cliente, 50% Telovendo
 * - oltre 20 € fino a 50 € inclusi: 60% cliente, 40% Telovendo
 * - oltre 50 €: 70% cliente, 30% Telovendo
 */

export function salePriceNumber(price) {
  const n = Number(price)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Parte in euro spettante al cliente. */
export function clientShareFromSalePrice(price) {
  const p = salePriceNumber(price)
  if (p <= 20) return p * 0.5
  if (p <= 50) return p * 0.6
  return p * 0.7
}

/** Parte in euro spettante a Telovendo. */
export function telovendoShareFromSalePrice(price) {
  const p = salePriceNumber(price)
  if (p <= 20) return p * 0.5
  if (p <= 50) return p * 0.4
  return p * 0.3
}

/** Breve descrizione della fascia (per legenda / tooltip). */
export function commissionBracketSummary(price) {
  const p = salePriceNumber(price)
  if (p <= 20) return '≤20 € → 50% / 50%'
  if (p <= 50) return '21–50 € → 60% cliente · 40% Telovendo'
  return '>50 € → 70% cliente · 30% Telovendo'
}
