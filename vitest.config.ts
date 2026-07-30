import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    // Map generation and the property suites are genuinely slow — a map at six
    // seats costs a second or more, and a fast-check run is thousands of
    // traces. The default five seconds passes on a quiet laptop and fails on a
    // loaded CI runner, which is the worst of both worlds.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.test.ts', 'packages/client/**'],
      thresholds: {
        // Raised as each package lands. Engine packages target 95 %; see AGENTS.md.
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
});
