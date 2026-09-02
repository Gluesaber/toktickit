import { defineConfig } from "@playwright/test";

// Issue 2-8 (Lab 2) — E2E + responsive verification. docs/lab-02/tests.md §5's documented command
// is `npx playwright test e2e/lab-02` (from the repo root).
//
// Prerequisite (not managed by this config, same convention as server/client's own `npm test`):
// the dev Postgres container must be running and migrated/seeded, and the backend
// (`cd server && npm run dev`) must already be up on port 3000. Only the Vite client dev server is
// auto-started below, since it doesn't depend on the database.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // the E2E flow spec is one connected user journey — keep runs sequential
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 800 }, // desktop default; visual-responsive.spec.ts overrides per block
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    cwd: "./client",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
