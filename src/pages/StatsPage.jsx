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
import { clientShareFromSalePrice, telovendoShareFromSalePrice } from '../lib/vintedCommission'
import { BRAND_BAR_FILL } from '../constants/brand'
import { isDeletedStatus, normalizeStatus, STATUSES, STATUS_CHART_COLORS } from '../constants/statuses'

function eur(n) {
  return `EUR ${Number(n || 0).toFixed(2)}`
}

export default function StatsPage() {
  const [products, setProducts] = useState([])

  useEffect(() => {
    supabase.from('products').select('*').then(({ data }) => setProducts(data || []))
  }, [])

  const kpis = useMemo(() => {
    const visibleProducts = products.filter((p) => !isDeletedStatus(p.status))
    const total = visibleProducts.length
    const valoreMagazzino = visibleProducts
      .filter((p) => p.status === 'Magazzino' || p.status === 'Caricato')
      .reduce((s, p) => s + Number(p.price || 0), 0)
    const venduti = visibleProducts.filter((p) => p.status === 'Venduto')
    const lordoVenduto = venduti.reduce((s, p) => s + Number(p.price || 0), 0)
    const quotaClientiVenduto = venduti.reduce((s, p) => s + clientShareFromSalePrice(p.price), 0)
    const quotaTelovendoVenduto = venduti.reduce((s, p) => s + telovendoShareFromSalePrice(p.price), 0)
    return { total, valoreMagazzino, lordoVenduto, quotaClientiVenduto, quotaTelovendoVenduto }
  }, [products])

  const pieByStatus = useMemo(() => {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]))
    for (const p of products) {
      if (isDeletedStatus(p.status)) continue
      const st = normalizeStatus(p.status)
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
      if (isDeletedStatus(p.status)) continue
      const name = displayOptionalColumn(p.client_name).trim() || 'Senza nome'
      if (!map.has(name)) {
        map.set(name, {
          clientName: name,
          total: 0,
          venduto: 0,
          totaleDaPagare: 0,
          quotaTelovendo: 0,
          magazzino: 0,
          caricato: 0,
        })
      }
      const row = map.get(name)
      row.total += 1
      const status = normalizeStatus(p.status)
      if (status === 'Venduto') {
        row.venduto += 1
        row.totaleDaPagare += clientShareFromSalePrice(p.price)
        row.quotaTelovendo += telovendoShareFromSalePrice(p.price)
      }
      if (status === 'Magazzino') row.magazzino += 1
      if (status === 'Caricato') row.caricato += 1
    }
    return [...map.values()].sort((a, b) => a.clientName.localeCompare(b.clientName, 'it-IT'))
  }, [products])

  const barByClient = useMemo(
    () =>
      clientRows
        .map((r) => ({
          name: r.clientName.length > 18 ? `${r.clientName.slice(0, 16)}…` : r.clientName,
          fullName: r.clientName,
          cliente: Number(r.totaleDaPagare.toFixed(2)),
          telovendo: Number(r.quotaTelovendo.toFixed(2)),
        }))
        .filter((r) => r.cliente > 0 || r.telovendo > 0)
        .sort((a, b) => b.cliente + b.telovendo - (a.cliente + a.telovendo)),
    [clientRows],
  )

  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="app-card relative overflow-hidden border border-zinc-200/90 p-5 sm:col-span-2 lg:col-span-1 dark:border-zinc-600/80">
          <p className="app-kicker mb-2">Vendite registrate</p>
          <p className="app-text-muted-sm">Articoli in stato Venduto (prezzo = listino Vinted)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">{eur(kpis.lordoVenduto)}</p>
          <p className="app-text-muted-xs mt-2">Lordo incassato su vendite già marcate</p>
        </div>
      </div>

      <div className="app-card border border-[#0ABAB5]/20 p-5 dark:border-[#0ABAB5]/30 sm:p-6">
        <h3 className="app-section-title mb-1">Ripartizione vendite (Telovendo)</h3>
        <p className="app-text-muted-sm mb-5 max-w-3xl">
          Sul prezzo Vinted: fino a 20 € → 50% cliente e 50% Telovendo; da 20 € a 50 € → 60% cliente e 40% Telovendo; oltre 50 € → 70%
          cliente e 30% Telovendo. Qui sotto solo articoli <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Venduto</strong>.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border-2 border-emerald-200/80 bg-emerald-50/60 p-5 dark:border-emerald-800/50 dark:bg-emerald-950/25">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Da versare ai clienti</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-950 dark:text-emerald-50">{eur(kpis.quotaClientiVenduto)}</p>
            <p className="app-text-muted-xs mt-2">Somma quote cliente sulle vendite</p>
          </div>
          <div className="rounded-2xl border-2 border-[#0ABAB5]/40 bg-[#0ABAB5]/8 p-5 dark:border-[#0ABAB5]/50 dark:bg-[#0ABAB5]/12">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Ricavo Telovendo</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{eur(kpis.quotaTelovendoVenduto)}</p>
            <p className="app-text-muted-xs mt-2">Somma quote Telovendo sulle vendite</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-600 dark:bg-zinc-900/40 sm:col-span-2 lg:col-span-1">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Controllo</p>
            <p className="mt-2 text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
              Cliente + Telovendo = <span className="font-semibold text-zinc-900 dark:text-zinc-100">{eur(kpis.quotaClientiVenduto + kpis.quotaTelovendoVenduto)}</span>
              <span className="mx-1.5 text-zinc-400">≈</span>
              lordo <span className="font-semibold">{eur(kpis.lordoVenduto)}</span>
            </p>
          </div>
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
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="app-table-head">
                <th className="px-4 py-3">Nome cliente</th>
                <th className="px-4 py-3 tabular-nums">N° articoli totali</th>
                <th className="px-4 py-3 tabular-nums">N° Venduto</th>
                <th className="px-4 py-3 tabular-nums">Quota da pagare (cliente)</th>
                <th className="px-4 py-3 tabular-nums">Quota Telovendo</th>
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
                    <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">{eur(row.quotaTelovendo)}</td>
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
        <h3 className="app-section-title mb-1">Venduto per cliente: quota cliente vs Telovendo</h3>
        <p className="app-text-muted-sm mb-6">Barre impilate sulle stesse regole percentuali del listino Vinted</p>
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
                  formatter={(v, name) => [eur(v), name === 'cliente' ? 'Da pagare al cliente' : 'Telovendo']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid rgba(0,0,0,0.08)',
                  }}
                />
                <Legend formatter={(v) => (v === 'cliente' ? 'Cliente (da pagare)' : 'Telovendo')} />
                <Bar dataKey="cliente" stackId="split" name="cliente" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="telovendo" stackId="split" name="telovendo" fill={BRAND_BAR_FILL} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  )
}
