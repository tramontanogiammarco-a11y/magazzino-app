import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import UploadPage from './pages/UploadPage'
import InventoryPage from './pages/InventoryPage'
import ClientsPage from './pages/ClientsPage'
import StatsPage from './pages/StatsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/inventario" element={<InventoryPage />} />
          <Route path="/clienti" element={<ClientsPage />} />
          <Route path="/statistiche" element={<StatsPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
