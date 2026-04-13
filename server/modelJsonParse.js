/** Estrae il primo oggetto `{ ... }` bilanciato rispettando stringhe JSON (escape, virgolette). */
export function extractFirstBalancedJsonObject(s) {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (c === '\\') {
        escape = true
        continue
      }
      if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

export function parseJsonFromModelText(raw) {
  let clean = String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim()
  const tryParse = (str) => {
    try {
      return JSON.parse(str)
    } catch {
      return null
    }
  }
  const direct = tryParse(clean)
  if (direct) return direct
  const sub = extractFirstBalancedJsonObject(clean)
  if (sub) {
    const nested = tryParse(sub)
    if (nested) return nested
  }
  throw new Error('JSON non valido')
}
