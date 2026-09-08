import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/admin/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 2000,
    strictPort: true,
    proxy: {
      // Local dev usually runs the backend on 8002; when it isn't running,
      // point at the live Cloud Run backend instead so the console still works.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'https://auralock-backend-tjpy7sonwq-el.a.run.app',
        changeOrigin: true,
        secure: true
      },
      '/auth': {
        target: process.env.VITE_API_PROXY_TARGET || 'https://auralock-backend-tjpy7sonwq-el.a.run.app',
        changeOrigin: true,
        secure: true
      }
    }
  }
})
