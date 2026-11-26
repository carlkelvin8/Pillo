import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // The dev server compiles pages on first visit, so allow generous time. One worker keeps it steady.
  timeout: 120_000,
  workers: 1,
  expect: { timeout: 30_000 },
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: true },
});
