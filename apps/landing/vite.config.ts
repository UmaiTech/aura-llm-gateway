import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'

export default defineConfig({
  plugins: [
    { enforce: 'pre', ...mdx({ remarkPlugins: [remarkGfm, remarkFrontmatter] }) },
    react()
  ],
  server: {
    port: 3001,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
