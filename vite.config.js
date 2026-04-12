import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Consente accesso da altri dispositivi sulla stessa rete (es. iPhone): usa l’URL “Network” stampato da `npm run dev`
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    /** Apre subito il browser sull’URL giusto (http://localhost:5173/) — non basta digitare solo «localhost». */
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
