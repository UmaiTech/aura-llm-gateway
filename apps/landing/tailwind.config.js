/** @type {import('tailwindcss').Config} */

// Design-token colour (packages/aura-ui/src/tokens.css) with Tailwind
// opacity support.
const token = (name) => `rgb(var(--aura-rgb-${name}) / <alpha-value>)`
// Theme-aware grey ramp defined in src/index.css: the pages written for the
// old dark-only theme (gray-950 background, gray-100 text) flip correctly
// in light mode. New code should prefer the semantic `aura-*` colours.
const gray = (step) => `rgb(var(--gray-${step}) / <alpha-value>)`

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,md,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gray: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, gray(s)]),
        ),
        aura: {
          // Semantic tokens
          bg: token('bg'),
          surface: token('surface'),
          'surface-2': token('surface-2'),
          hover: token('hover'),
          text: token('text'),
          muted: token('muted'),
          dim: token('dim'),
          border: token('border'),
          accent: token('accent'),
          action: token('action'),
          green: token('green'),
          amber: token('amber'),
          red: token('red'),
          // Legacy numeric shades, now the single violet accent.
          300: token('accent'),
          400: token('accent'),
          500: token('action'),
          600: token('action'),
        },
        primary: {
          400: token('accent'),
          500: token('action'),
          600: token('action'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
        // Marketing titles only (self-hosted Fraunces 600, see index.css).
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      maxWidth: {
        content: '1200px',
      },
      borderRadius: {
        control: '7px',
        panel: '12px',
      },
    },
  },
  plugins: [],
}
