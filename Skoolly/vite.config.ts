import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'

// Root-level JSON that the app fetches but that lives outside `public/`.
// Served from disk in dev and copied into the build output at build time, so
// there is exactly one copy of the 660 KB OPEC dataset in the repo.
const ROOT_ASSETS: Record<string, string> = {
  '/results.json': 'results.json',
  '/scrape_log.json': 'scrape_log.json',
  '/data/international_schools_thailand_opec.json': 'data/international_schools_thailand_opec.json',
}

function rootJsonAssets(): Plugin {
  const resolveRoot = (rel: string) => path.resolve(import.meta.dirname, rel)

  return {
    name: 'root-json-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        const rel = url ? ROOT_ASSETS[url] : undefined
        if (!rel) return next()

        const filePath = resolveRoot(rel)
        if (!fs.existsSync(filePath)) return next()

        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(fs.readFileSync(filePath))
      })
    },
    writeBundle(options) {
      const outDir = options.dir ?? resolveRoot('dist')
      for (const [url, rel] of Object.entries(ROOT_ASSETS)) {
        const src = resolveRoot(rel)
        if (!fs.existsSync(src)) continue
        const dest = path.join(outDir, url.replace(/^\//, ''))
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(src, dest)
      }
    },
  }
}

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    rootJsonAssets(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'leaflet'],
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '8443'),
    strictPort: true,
    watch: {
      ignored: (filePath: string) => {
        const norm = filePath.replace(/\\/g, '/');
        return (
          norm.includes('/data/') ||
          norm.includes('/public/data/') ||
          norm.includes('/microservices/') ||
          norm.includes('/dump/') ||
          norm.includes('/reference/') ||
          norm.endsWith('.tmp') ||
          norm.endsWith('.csv') ||
          norm.endsWith('.bak') ||
          norm.endsWith('results.json') ||
          norm.endsWith('scrape_log.json')
        );
      },
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8004',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '8443'),
  },
})
