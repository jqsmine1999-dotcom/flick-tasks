import { defineConfig, devices } from '@playwright/test'

const PORT = 5173

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone-webkit', use: { ...devices['iPhone 15 Pro'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx wrangler d1 migrations apply flick-tasks --local && npx vite --port ${PORT}`,
    url: `http://localhost:${PORT}/api/me`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
