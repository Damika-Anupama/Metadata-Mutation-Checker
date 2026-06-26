import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for the Metadata Mutation Checker frontend.
 *
 * The dev server is started automatically via `webServer` so the suite is
 * self-contained: `npm run test:e2e` boots Next.js, runs the specs against a
 * real Chromium browser, and tears the server down afterwards.
 *
 * These tests exercise the demo/sample-document path, which renders entirely
 * client-side (no backend required) — so they pass against the backend-free
 * Vercel preview deploy as well as local full-stack runs.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Only boot a local server when no external base URL is supplied
  // (e.g. when running against a deployed preview, set E2E_BASE_URL).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: "http://localhost:3000",
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
