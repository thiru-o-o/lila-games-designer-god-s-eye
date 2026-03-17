import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// NOTE: @tailwindcss/vite removed — we use hand-written utility CSS in index.css.
// The plugin was intercepting and transforming @import 'leaflet/dist/leaflet.css',
// which broke the Leaflet map rendering.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
})
