import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'

// Vite plugin to serve scraper outputs from the root folder during development
function scraperDevServer(): Plugin {
  return {
    name: 'scraper-dev-server',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Do not intercept if Vite is importing it as an ES module (?import)
        if (req.url && (req.url.includes('?import') || req.url.includes('?raw'))) {
          return next()
        }

        const url = req.url?.split('?')[0]
        if (url === '/results.json' || url === '/scrape_log.json') {
          const filePath = path.resolve(__dirname, `.${url}`)
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(fs.readFileSync(filePath))
            return
          }
        }
        next()
      })
    }
  }
}

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    scraperDevServer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react-leaflet', 'leaflet'],
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '8443'),
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '8443'),
  },
})
