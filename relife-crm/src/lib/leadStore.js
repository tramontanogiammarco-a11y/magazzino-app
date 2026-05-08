import { createClient } from '@supabase/supabase-js'
import { readLeads, writeLeads } from './leads'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY
const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey)
const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseKey) : null

function toDbLead(lead) {
  return {
    id: lead.id,
    full_name: lead.fullName,
    phone: lead.phone,
    email: lead.email,
    city: lead.city,
    car: lead.car,
    status: lead.status,
    scheduled_date: lead.scheduledDate || null,
    notes: lead.notes,
    created_at: lead.createdAt,
    updated_at: lead.updatedAt,
    last_moved_at: lead.lastMovedAt,
  }
}

function fromDbLead(row) {
  return {
    id: row.id,
    fullName: row.full_name || '',
    phone: row.phone || '',
    email: row.email || '',
    city: row.city || '',
    car: row.car || '',
    status: row.status || 'conversazione',
    scheduledDate: row.scheduled_date || '',
    notes: row.notes || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    lastMovedAt: row.last_moved_at || row.updated_at || row.created_at || '',
  }
}

function sortLeads(leads) {
  return [...leads].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

function newerLead(a, b) {
  if (!a) return b
  if (!b) return a
  return String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')) >= 0 ? a : b
}

function mergeLeads(localLeads, remoteLeads) {
  const byId = new Map()
  for (const lead of remoteLeads) byId.set(lead.id, lead)
  for (const lead of localLeads) byId.set(lead.id, newerLead(lead, byId.get(lead.id)))
  return sortLeads([...byId.values()])
}

function upsertLocal(lead) {
  const current = readLeads()
  const next = current.some((item) => item.id === lead.id)
    ? current.map((item) => (item.id === lead.id ? lead : item))
    : [lead, ...current]
  writeLeads(sortLeads(next))
  return sortLeads(next)
}

function deleteLocal(id) {
  const next = readLeads().filter((lead) => lead.id !== id)
  writeLeads(next)
  return next
}

export async function loadLeads() {
  const localLeads = sortLeads(readLeads())
  if (!supabase) return { leads: localLeads, mode: 'locale' }

  const { data, error } = await supabase.from('relife_leads').select('*').order('updated_at', { ascending: false })
  if (error) {
    console.warn('[relife-crm] Supabase non disponibile, uso salvataggio locale.', error.message)
    return { leads: localLeads, mode: 'locale' }
  }

  const remoteLeads = (data || []).map(fromDbLead)
  const leads = mergeLeads(localLeads, remoteLeads)

  if (leads.length && localLeads.length) {
    const { error: syncError } = await supabase.from('relife_leads').upsert(leads.map(toDbLead), { onConflict: 'id' })
    if (syncError) {
      console.warn('[relife-crm] Merge locale/cloud non completato.', syncError.message)
    }
  }

  writeLeads(leads)
  return { leads, mode: 'cloud' }
}

export async function saveLead(lead) {
  const localLeads = upsertLocal(lead)
  if (!supabase) return { leads: localLeads, mode: 'locale' }

  const { error } = await supabase.from('relife_leads').upsert(toDbLead(lead), { onConflict: 'id' })
  if (error) {
    console.warn('[relife-crm] Lead salvato solo in locale.', error.message)
    return { leads: localLeads, mode: 'locale' }
  }
  return { leads: localLeads, mode: 'cloud' }
}

export async function deleteLeadById(id) {
  const localLeads = deleteLocal(id)
  if (!supabase) return { leads: localLeads, mode: 'locale' }

  const { error } = await supabase.from('relife_leads').delete().eq('id', id)
  if (error) {
    console.warn('[relife-crm] Lead eliminato solo in locale.', error.message)
    return { leads: localLeads, mode: 'locale' }
  }
  return { leads: localLeads, mode: 'cloud' }
}
