import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // Built assets ship under /app/ on app.aura-llm.dev (bolted into the
  // gateway Vercel project's output — see /vercel.json). Without this,
  // index.html would reference /assets/... at the root and break.
  base: '/app/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Shared tokens, brand marks and routing inspector (packages/aura-ui),
      // consumed as source.
      '@aura/ui': path.resolve(__dirname, '../../packages/aura-ui/src'),
    },
    // Shared source sits outside this app; resolve its React imports to
    // this app's single copy.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 3001,
    fs: { allow: [path.resolve(__dirname, '../..')] },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/admin': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
