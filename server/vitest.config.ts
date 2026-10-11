import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Issue 4-6 (Lab 4) — creates connect-pg-simple's "session" table once, before the parallel test
    // workers start, so a brand-new database can't race on creating it (see tests/globalSetup.ts).
    globalSetup: ["./tests/globalSetup.ts"],
  },
});
