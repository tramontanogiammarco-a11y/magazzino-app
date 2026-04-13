import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'

const UploadPage = lazy(() => import('./pages/UploadPage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const DeletedItemsPage = lazy(() => import('./pages/DeletedItemsPage'))
const ClientsPage = lazy(() => import('./pages/ClientsPage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 px-6 py-16 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-[#0ABAB5] border-t-transparent"
        aria-hidden
      />
      <p className="text-base font-medium">Caricamento sezione…</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/inventario" element={<InventoryPage />} />
            <Route path="/eliminati" element={<DeletedItemsPage />} />
            <Route path="/clienti" element={<ClientsPage />} />
            <Route path="/statistiche" element={<StatsPage />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  )
}
