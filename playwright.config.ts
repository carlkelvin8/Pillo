import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // verify-*.spec.ts are slow, data-creating sweeps (run them with `pnpm e2e:verify`, dev mode, QA project only).
  testIgnore: process.env.E2E_VERIFY ? undefined : "**/verify-*.spec.ts",
  // The dev server compiles pages on first visit, so allow generous time. One worker keeps it steady.
  timeout: 120_000,
  workers: 1,
  expect: { timeout: 30_000 },
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  // Skipped when E2E_BASE_URL points at an already running (for example production-mode) server.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: true },
});
