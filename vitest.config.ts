import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@crawlbrulee/sdk',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Auto-restore vi.spyOn between tests so stubs of CwblInstrumentation
    // (and any other module) don't leak across files.
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/types/**'],
    },
  },
})
