import { defineConfig } from "@playwright/test";

// Boots the Worker locally (applies the D1 schema, then `wrangler dev`) and runs
// the smoke tests against it.
export default defineConfig({
  testDir: "./playwright-tests",
  timeout: 30_000,
  fullyParallel: false,
  use: { baseURL: "http://localhost:8787" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8787",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
