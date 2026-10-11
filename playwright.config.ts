import { defineConfig } from "@playwright/test";

// Issue 2-8 (Lab 2) — E2E + responsive verification.
// Issue 4-6 (Lab 4) — the documented command is now `npx playwright test e2e/lab-03 e2e/lab-04` (from the
// repo root); e2e/lab-02 was removed (its specs drove the Development Requester Selector that Lab 3
// replaced). Screenshots are only written with CAPTURE_SCREENSHOTS=1 (README §6).
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
