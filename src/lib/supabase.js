import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function getDistinctProductFields() {
  const { data, error } = await supabase.from('products').select('client_name, slot')
  if (error) throw error

  const clients = [...new Set((data || []).map((row) => row.client_name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'it-IT'),
  )
  const slots = [...new Set((data || []).map((row) => row.slot).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'it-IT'),
  )

  return { clients, slots }
}

export async function fetchClientProfiles() {
  const { data, error } = await supabase.from('client_profiles').select('*')
  if (error) throw error
  return data || []
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
