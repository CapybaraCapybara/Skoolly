import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
      // The data pipeline rewrites these while it runs; none of them is part of the app bundle
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
          norm.endsWith('.env') ||
          norm.includes('/.env') ||
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
