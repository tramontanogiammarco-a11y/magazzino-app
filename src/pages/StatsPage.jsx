import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { displayOptionalColumn, supabase } from '../lib/supabase'
import { BRAND_BAR_FILL } from '../constants/brand'
import { STATUSES, STATUS_CHART_COLORS } from '../constants/statuses'

function eur(n) {
  return `EUR ${Number(n || 0).toFixed(2)}`
}

export default function StatsPage() {
  const [products, setProducts] = useState([])

  useEffect(() => {
    supabase.from('products').select('*').then(({ data }) => setProducts(data || []))
  }, [])

  const kpis = useMemo(() => {
    const total = products.length
    const valoreMagazzino = products
      .filter((p) => p.status === 'Magazzino' || p.status === 'Caricato')
      .reduce((s, p) => s + Number(p.price || 0), 0)
    const totaleDaPagareClienti = products.filter((p) => p.status === 'Venduto').reduce((s, p) => s + Number(p.price || 0), 0)
    return { total, valoreMagazzino, totaleDaPagareClienti }
  }, [products])

  const pieByStatus = useMemo(() => {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]))
    for (const p of products) {
      const st = STATUSES.includes(p.status) ? p.status : 'Magazzino'
      counts[st] = (counts[st] || 0) + 1
    }
    return STATUSES.map((status) => ({
      name: status,
      value: counts[status],
      fill: STATUS_CHART_COLORS[status] ?? '#94a3b8',
    })).filter((d) => d.value > 0)
  }, [products])

  const clientRows = useMemo(() => {
    const map = new Map()
    for (const p of products) {
      const name = displayOptionalColumn(p.client_name).trim() || 'Senza nome'
      if (!map.has(name)) {
        map.set(name, {
          clientName: name,
          total: 0,
          venduto: 0,
          totaleDaPagare: 0,
          magazzino: 0,
          caricato: 0,
        })
      }
      const row = map.get(name)
      row.total += 1
      if (p.status === 'Venduto') {
        row.venduto += 1
        row.totaleDaPagare += Number(p.price || 0)
      }
      if (p.status === 'Magazzino') row.magazzino += 1
      if (p.status === 'Caricato') row.caricato += 1
    }
    return [...map.values()].sort((a, b) => a.clientName.localeCompare(b.clientName, 'it-IT'))
  }, [products])

  const barByClient = useMemo(
    () =>
      clientRows
        .map((r) => ({
          name: r.clientName.length > 18 ? `${r.clientName.slice(0, 16)}…` : r.clientName,
          fullName: r.clientName,
          valore: Number(r.totaleDaPagare.toFixed(2)),
        }))
        .sort((a, b) => b.valore - a.valore),
    [clientRows],
  )

  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="app-card relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#0ABAB5]/10 blur-2xl" />
          <p className="app-kicker mb-2">Inventario</p>
          <p className="app-text-muted-sm">Totale articoli</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">{kpis.total}</p>
        </div>
        <div className="app-card relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#0ABAB5]/10 blur-2xl" />
          <p className="app-kicker mb-2">Valore</p>
          <p className="app-text-muted-sm">Totale valore magazzino</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">{eur(kpis.valoreMagazzino)}</p>
          <p className="app-text-muted-xs mt-2">Somma prezzi · stati Magazzino e Caricato</p>
        </div>
        <div className="app-card relative overflow-hidden border border-[#0ABAB5]/25 p-5 dark:border-[#0ABAB5]/35">
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#0ABAB5]/12 blur-2xl" />
          <p className="app-kicker mb-2">Da saldare</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Totale da pagare ai clienti</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">{eur(kpis.totaleDaPagareClienti)}</p>
          <p className="app-text-muted-xs mt-2">Solo articoli in stato Venduto</p>
        </div>
      </div>

      <div className="app-card p-5 sm:p-6">
        <h3 className="app-section-title mb-1">Distribuzione articoli per stato</h3>
        <p className="app-text-muted-sm mb-6">Panoramica quantità per ogni stato operativo</p>
        <div className="h-80 w-full min-h-[280px]">
          {pieByStatus.length === 0 ? (
            <p className="app-text-muted-sm">Nessun dato</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieByStatus}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieByStatus.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [value, name]}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid rgba(0,0,0,0.08)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="app-card overflow-hidden p-0">
        <div className="border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-700/80">
          <h3 className="app-section-title">Riepilogo per cliente</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="app-table-head">
                <th className="px-4 py-3">Nome cliente</th>
                <th className="px-4 py-3 tabular-nums">N° articoli totali</th>
                <th className="px-4 py-3 tabular-nums">N° Venduto</th>
                <th className="px-4 py-3 tabular-nums">Totale da pagare</th>
                <th className="px-4 py-3 tabular-nums">N° Magazzino</th>
                <th className="px-4 py-3 tabular-nums">N° Caricato</th>
              </tr>
            </thead>
            <tbody>
              {clientRows.length === 0 ? (
                <tr className="app-table-row">
                  <td className="app-text-muted-sm px-4 py-10 text-center" colSpan={6}>
                    Nessun articolo
                  </td>
                </tr>
              ) : (
                clientRows.map((row) => (
                  <tr key={row.clientName} className="app-table-row">
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{row.clientName}</td>
                    <td className="px-4 py-3 tabular-nums">{row.total}</td>
                    <td className="px-4 py-3 tabular-nums">{row.venduto}</td>
                    <td className="px-4 py-3 tabular-nums">{eur(row.totaleDaPagare)}</td>
                    <td className="px-4 py-3 tabular-nums">{row.magazzino}</td>
                    <td className="px-4 py-3 tabular-nums">{row.caricato}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="app-card p-5 sm:p-6">
        <h3 className="app-section-title mb-1">Totale da pagare per cliente (stato Venduto)</h3>
        <p className="app-text-muted-sm mb-6">Valore = somma prezzi degli articoli venduti</p>
        <div className="h-96 w-full min-h-[320px]">
          {barByClient.length === 0 ? (
            <p className="app-text-muted-sm">Nessun dato</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barByClient} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-600" />
                <XAxis type="number" tickFormatter={(v) => `€${v}`} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) => [eur(v), 'Totale']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid rgba(0,0,0,0.08)',
                  }}
                />
                <Bar dataKey="valore" fill={BRAND_BAR_FILL} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  )
}
