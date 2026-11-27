// Browser tests on the built site under its base path. Run through `npm run test:e2e`.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: 'test/e2e',
  // One emulator database for all tests.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/neighbor-food/`,
    ...devices['Pixel 7'],
    locale: 'en-GB',
    timezoneId: 'Europe/Warsaw',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/neighbor-food/`,
    reuseExistingServer: false,
  },
});
