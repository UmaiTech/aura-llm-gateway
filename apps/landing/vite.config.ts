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
  server: {
    port: 3002,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
