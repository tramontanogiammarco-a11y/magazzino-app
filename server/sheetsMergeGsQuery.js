/**
 * Stessa logica di mergeGsParameters_ in SheetsWebhook.gs: i campi arrivano
 * nel body JSON e/o in query (?gs_action=update&gs_pid=…).
 */

export function mergeGsQueryIntoBody(body, query) {
  const base =
    typeof body === 'object' && body !== null && !Array.isArray(body) ? { ...body } : {}
  const q = query ?? {}
  const get = (k) => {
    const v = q[k]
    return Array.isArray(v) ? v[0] : v
  }
  if (get('gs_action') != null && String(get('gs_action')).trim()) {
    base.action = String(get('gs_action')).toLowerCase()
  }
  if (get('gs_pid') != null && String(get('gs_pid')).trim()) {
    base.productId = String(get('gs_pid'))
  }
  if (get('gs_date') != null && String(get('gs_date')).trim()) {
    base.date = String(get('gs_date'))
  }
  if (get('gs_status') != null && String(get('gs_status')).trim()) {
    base.status = String(get('gs_status'))
  }
  if (get('gs_price') != null && String(get('gs_price')).trim()) {
    base.price = String(get('gs_price'))
  }
  if (get('gs_sku') != null && String(get('gs_sku')).trim()) {
    base.sku = String(get('gs_sku'))
  }
  if (get('gs_slot') != null && String(get('gs_slot')).trim()) {
    base.slot = String(get('gs_slot'))
  }
  if (get('gs_client') != null && String(get('gs_client')).trim()) {
    base.client_name = String(get('gs_client'))
  }
  if (get('gs_desc') != null && String(get('gs_desc')).trim()) {
    base.description = String(get('gs_desc'))
  }
  return base
}

export function parseJsonBody(reqBody) {
  if (reqBody == null) return {}
  if (typeof reqBody === 'string') {
    try {
      return JSON.parse(reqBody.trim() || '{}')
    } catch {
      return {}
    }
  }
  if (typeof reqBody === 'object' && !Array.isArray(reqBody)) return reqBody
  return {}
}
