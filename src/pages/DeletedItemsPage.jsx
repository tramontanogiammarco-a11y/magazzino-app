import { useCallback, useEffect, useState } from 'react'
import { DELETED_STATUS, isDeletedStatus } from '../constants/statuses'
import { notifyGoogleSheetsNewProduct } from '../lib/googleSheets'
import { displayOptionalColumn, displaySku, supabase } from '../lib/supabase'
import { formatDate } from '../utils/date'

export default function DeletedItemsPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [message, setMessage] = useState('')

  const loadDeleted = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('status', DELETED_STATUS)
      .order('created_at', { ascending: false })
    if (error) {
      setMessage(error.message || 'Caricamento non riuscito')
      setProducts([])
    } else {
      setProducts((data || []).filter((p) => isDeletedStatus(p.status)))
      setMessage('')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadDeleted()
  }, [loadDeleted])

  const restoreProduct = async (product) => {
    if (!product?.id) return
    setBusyId(product.id)
    setMessage('')

    const { error } = await supabase.from('products').update({ status: 'Magazzino' }).eq('id', product.id)
    if (error) {
      setBusyId(null)
      setMessage(error.message || 'Ripristino non riuscito')
      return
    }

    const sheetResult = await notifyGoogleSheetsNewProduct({
      productId: product.id,
      action: 'update',
      description: String(product.description ?? '').trim() || 'Articolo',
      status: 'Magazzino',
      price: product.price,
      client_name: product.client_name ?? '',
      sku: product.sku ?? '',
      slot: product.slot ?? '',
    })

    setBusyId(null)
    setMessage(
      sheetResult.ok
        ? 'Articolo ripristinato.'
        : `Articolo ripristinato. Foglio Google: ${sheetResult.message || 'aggiornamento non riuscito'}.`,
    )
    await loadDeleted()
  }

  return (
    <section className="space-y-6">
      {message ? <div className="app-inline-message">{message}</div> : null}

      <div className="app-card p-4 sm:p-6">
        {loading ? (
          <p className="app-text-muted">Caricamento…</p>
        ) : products.length === 0 ? (
          <p className="app-text-muted">Nessun articolo eliminato.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="app-table-head">
                  <th className="p-3 text-left">Descrizione</th>
                  <th className="p-3 text-left">SKU</th>
                  <th className="p-3 text-left">Cliente</th>
                  <th className="p-3 text-left">Slot</th>
                  <th className="p-3 text-left">Prezzo</th>
                  <th className="p-3 text-left">Creato</th>
                  <th className="p-3 text-left">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="app-table-row">
                    <td className="p-3 text-zinc-800 dark:text-zinc-200">{p.description || 'Articolo'}</td>
                    <td className="p-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">{displaySku(p.sku) || '—'}</td>
                    <td className="p-3 text-zinc-700 dark:text-zinc-300">{displayOptionalColumn(p.client_name) || '—'}</td>
                    <td className="p-3 text-zinc-700 dark:text-zinc-300">{displayOptionalColumn(p.slot) || '—'}</td>
                    <td className="p-3 tabular-nums text-zinc-800 dark:text-zinc-200">EUR {Number(p.price || 0).toFixed(2)}</td>
                    <td className="p-3 text-xs text-zinc-500 dark:text-zinc-400">{formatDate(p.created_at)}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => void restoreProduct(p)}
                        disabled={busyId === p.id}
                        className="app-btn-secondary px-3 py-1.5 text-sm disabled:opacity-60"
                      >
                        {busyId === p.id ? 'Ripristino…' : 'Ripristina'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
