import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./full-app-tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["list"], ["github"], ["html", { open: "never", outputFolder: "playwright-report/full-app" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report/full-app" }]],
  outputDir: "test-results/full-app",
  use: {
    baseURL: process.env.FULL_APP_BASE_URL || "http://127.0.0.1:8000",
    trace: "on-first-retry",
    viewport: { width: 1440, height: 1100 }
  },
  projects: [
    {
      name: "full-app-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } }
    }
  ]
});

