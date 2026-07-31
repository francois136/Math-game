import { defineConfig, devices } from '@playwright/test';

/**
 * Two servers, both real: the game server on its socket and Vite serving the
 * app. The test drives an actual browser against them — the only place in this
 * repository where the whole thing runs at once.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    ...devices['Desktop Chrome'],
    // Use the Chromium already on the machine when there is one. Downloading a
    // second copy to match a version number is not worth a hundred megabytes,
    // and on a sandbox without network access it is not possible at all.
    launchOptions: process.env['FW_CHROMIUM'] ? { executablePath: process.env['FW_CHROMIUM'] } : {},
  },
  webServer: [
    {
      command: 'node ../server/dist/main.js',
      env: { FW_PORT: '8788' },
      // A port, not a URL: this server speaks WebSocket and answers a plain GET
      // with a refusal, which a health check would read as "not up".
      port: 8788,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm exec vite --port 5173 --strictPort',
      env: { VITE_FW_SERVER: 'ws://127.0.0.1:8788' },
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
