import { defineConfig, devices } from "@playwright/test";

/**
 * Browser regression tests. `pnpm --filter @ozvi/e2e e2e` starts a throwaway Ozvi cloud (scripts/e2e-server.sh,
 * own database, production build) and runs every spec in Chromium and WebKit (Safari's engine).
 * Needs `docker compose` (Postgres + Mailpit) like local dev.
 */
export const BASE = "http://e2e.localhost:3410";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // one database, specs create their own data with unique names
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: { baseURL: BASE, locale: "sk-SK", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 15"] }, grep: /@mobile/ },
  ],
  webServer: {
    command: "../../scripts/e2e-server.sh",
    url: `${BASE}/api/health`,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
