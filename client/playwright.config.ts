import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the Next.js client.
 *
 * Tests run against the dev server with the backend API mocked at the network
 * layer (see e2e/harness.ts), so they exercise real UI behaviour without
 * needing MongoDB, Firebase credentials or a running backend.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Start the dev server yourself before running:
  //   npx next dev --port 3100
  // Playwright's own webServer spawn is unreliable on Windows here, and running
  // it separately also keeps `.env.local` as the single source of Firebase config.
});
