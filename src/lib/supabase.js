import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

/** Valori auto-insert se il form lascia vuoto (DB con NOT NULL / check stretti). */
export const DB_OPTIONAL_EMPTY = '\uE000'
export const PLACEHOLDER_CLIENT_NAME = 'N/D'
export const PLACEHOLDER_SLOT = '—'
/** SKU quando il form è vuoto: fisso così non si confonde con valori casuali (in UI si vede vuoto). */
export const PLACEHOLDER_SKU = '9999'

function isOptionalPlaceholderText(s) {
  const t = String(s).trim()
  if (!t) return true
  if (t === DB_OPTIONAL_EMPTY || t === PLACEHOLDER_CLIENT_NAME) return true
  if (t === PLACEHOLDER_SLOT || t === '-' || t === '–' || t === '—') return true
  return false
}

export function displayOptionalColumn(v) {
  if (v == null) return ''
  if (isOptionalPlaceholderText(v)) return ''
  return String(v).trim()
}

function isPlaceholderDistinctValue(x) {
  return !x || isOptionalPlaceholderText(x)
}

export async function getDistinctProductFields() {
  const { data, error } = await supabase.from('products').select('client_name, slot')
  if (error) throw error

  const clients = [
    ...new Set((data || []).map((row) => row.client_name).filter((x) => !isPlaceholderDistinctValue(x))),
  ].sort((a, b) => a.localeCompare(b, 'it-IT'))
  const slots = [
    ...new Set((data || []).map((row) => row.slot).filter((x) => !isPlaceholderDistinctValue(x))),
  ].sort((a, b) => a.localeCompare(b, 'it-IT'))

  return { clients, slots }
}

/** In UI: vuoto per nessuno SKU / segnaposto `0`, `9999` o solo trattini. */
export function displaySku(sku) {
  const s = sku == null ? '' : String(sku).trim()
  if (!s || s === '0' || s === PLACEHOLDER_SKU || s === '-' || s === '–' || s === '—') return ''
  return s
}

export async function fetchClientProfiles() {
  const { data, error } = await supabase.from('client_profiles').select('*')
  if (error) throw error
  return data || []
}

/** Profilo anagrafico considerato completo (allineato alla pagina Clienti). */
export function isClientProfileComplete(row) {
  if (!row || !String(row.client_name ?? '').trim()) return false
  const t = (v) => String(v ?? '').trim().length > 0
  return t(row.first_name) && t(row.last_name) && t(row.phone) && t(row.email) && t(row.iban)
}

export async function upsertClientProfile(row) {
  const { error } = await supabase.from('client_profiles').upsert(row, { onConflict: 'client_name' })
  if (error) throw error
}

export async function uploadProductPhoto(file) {
  const ext = file.name.split('.').pop() || 'jpg'
  const fileName = `${crypto.randomUUID()}.${ext}`
  const path = `products/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('products')
    .upload(path, file, { upsert: false })

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('products').getPublicUrl(path)
  return data.publicUrl
}

/** Carica più file in ordine; restituisce gli URL pubblici. */
export async function uploadProductPhotos(files) {
  const urls = []
  for (const file of files) {
    urls.push(await uploadProductPhoto(file))
  }
  return urls
}
