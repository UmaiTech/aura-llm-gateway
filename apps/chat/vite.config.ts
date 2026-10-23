import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/playground/',
  resolve: {
    alias: {
      // Shared tokens, brand marks and routing inspector (packages/aura-ui),
      // consumed as source.
      '@aura/ui': path.resolve(__dirname, '../../packages/aura-ui/src'),
    },
    // Shared source sits outside this app; resolve its React imports to
    // this app's single copy.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 3000,
    fs: { allow: [path.resolve(__dirname, '../..')] },
    proxy: {
      '/v1': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
