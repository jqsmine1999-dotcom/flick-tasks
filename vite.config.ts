import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    // Workers AI only runs on Cloudflare's network. Set CF_REMOTE=1 (after `wrangler login`)
    // to use it in dev; otherwise /api/ai/split uses its local fallback.
    cloudflare({ remoteBindings: process.env.CF_REMOTE === '1' }),
  ],
  server: { port: 5173, strictPort: true },
})
