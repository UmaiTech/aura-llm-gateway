import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.d.ts'],
      thresholds: {
        // Core modules carry the logic; aim high there.
        'src/client.ts': { statements: 80, branches: 70 },
        'src/streaming.ts': { statements: 85, branches: 75 },
        'src/errors.ts': { statements: 85, branches: 70 },
      },
    },
  },
})
