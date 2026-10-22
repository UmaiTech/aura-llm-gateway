import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkGfm from 'remark-gfm'

export default defineConfig({
  plugins: [
    {
      enforce: 'pre',
      ...mdx({
        include: /\.mdx$/,
        remarkPlugins: [
          remarkFrontmatter,
          remarkMdxFrontmatter,
          remarkGfm,
        ],
      }),
    },
    react(),
  ],
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
    port: 3002,
    fs: { allow: [path.resolve(__dirname, '../..')] },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
