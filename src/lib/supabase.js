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

/** PostgREST: tabella assente o non ancora nella cache API (PGRST205 / "schema cache"). */
function isClientProfilesUnavailableError(error) {
  if (!error) return false
  const code = String(error.code ?? '')
  if (/PGRST205/i.test(code)) return true
  if (code === '42P01') return true
  const msg = [error.message, error.details, error.hint, code].filter(Boolean).join(' ')
  if (!/client_profiles/i.test(msg)) return false
  return /schema cache|Could not find the table|not find the table|does not exist|relation/i.test(msg)
}

/** Fallback se Supabase non espone `client_profiles`: stesso browser, stesso PC. */
const LOCAL_PROFILES_KEY = 'magazzino_client_profiles_v1'

function readLocalProfilesMap() {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LOCAL_PROFILES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

function writeLocalProfile(row) {
  if (typeof localStorage === 'undefined') return
  const map = readLocalProfilesMap()
  const key = String(row.client_name)
  map[key] = {
    client_name: key,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    phone: row.phone ?? null,
    expected_revenue: row.expected_revenue ?? null,
    email: row.email ?? null,
    iban: row.iban ?? null,
  }
  localStorage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(map))
}

function mergeRemoteAndLocalProfiles(remoteRows) {
  const remote = remoteRows || []
  const localMap = readLocalProfilesMap()
  const byName = new Map(remote.map((r) => [String(r.client_name), r]))
  for (const [name, loc] of Object.entries(localMap)) {
    if (!byName.has(name)) byName.set(name, loc)
  }
  return [...byName.values()]
}

export async function fetchClientProfiles() {
  const { data, error } = await supabase.from('client_profiles').select('*')
  if (!error) {
    return mergeRemoteAndLocalProfiles(data || [])
  }
  if (isClientProfilesUnavailableError(error)) {
    console.warn('[magazzino] client_profiles Supabase non disponibile; uso profili salvati nel browser.')
    return Object.values(readLocalProfilesMap())
  }
  throw error
}

/** Profilo anagrafico considerato completo (allineato alla pagina Clienti). */
export function isClientProfileComplete(row) {
  if (!row || !String(row.client_name ?? '').trim()) return false
  const t = (v) => String(v ?? '').trim().length > 0
  return t(row.first_name) && t(row.last_name) && t(row.phone) && t(row.email) && t(row.iban)
}

/**
 * @returns {'supabase' | 'local'} dove è stato salvato
 */
export async function upsertClientProfile(row) {
  const { error } = await supabase.from('client_profiles').upsert(row, { onConflict: 'client_name' })
  if (!error) {
    writeLocalProfile(row)
    return 'supabase'
  }
  if (isClientProfilesUnavailableError(error)) {
    writeLocalProfile(row)
    console.warn('[magazzino] client_profiles salvato solo nel browser (tabella non visibile all’API).')
    return 'local'
  }
  throw error
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

function storagePathFromPublicUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  const marker = '/storage/v1/object/public/products/'
  const idx = raw.indexOf(marker)
  if (idx === -1) return ''
  return raw.slice(idx + '/storage/v1/object/public/'.length)
}

/** Best-effort cleanup of uploaded product photos from Supabase Storage. */
export async function deleteProductPhotosByUrls(urls) {
  const paths = [...new Set((urls || []).map(storagePathFromPublicUrl).filter(Boolean))]
  if (!paths.length) return
  const { error } = await supabase.storage.from('products').remove(paths)
  if (error) throw error
}
