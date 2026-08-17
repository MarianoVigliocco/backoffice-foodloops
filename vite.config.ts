import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { sites } from './build/sites-vite-plugin'

export default defineConfig({
  plugins: [react(), sites(), cloudflare()],
  server: { host: true, port: 5173 },
  preview: { port: 4173 }
})
