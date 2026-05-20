/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,md,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        'canvas-elevated': 'var(--canvas-elevated)',
        'canvas-overlay': 'var(--canvas-overlay)',
        ink: 'var(--ink)',
        'ink-muted': 'var(--ink-muted)',
        'ink-dim': 'var(--ink-dim)',
        rule: 'var(--rule)',
        'rule-strong': 'var(--rule-strong)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        'code-bg': 'var(--code-bg)',
        'code-highlight': 'var(--code-highlight)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        sans: 'var(--font-body)',
        mono: 'var(--font-mono)',
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        7: 'var(--space-7)',
        8: 'var(--space-8)',
      },
      zIndex: {
        nav: 'var(--z-nav)',
        sticky: 'var(--z-sticky)',
        overlay: 'var(--z-overlay)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        md: '6px',
        full: '9999px',
      },
    },
  },
  plugins: [],
}

/* Hallmark · genre: editorial-minimal · design-system: design.md · designed-as-app */
