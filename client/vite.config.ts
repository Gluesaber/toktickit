import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Issue 3-2 (Lab 3) — proxies /api same-origin to the backend so the session cookie (SameSite=Lax,
  // BR-09) is sent on every request without needing `credentials: "include"` anywhere on the client.
  // Pairs with VITE_API_URL="" in .env: every existing fetch(`${API_URL}/api/...`) call becomes a
  // same-origin relative path through this proxy, unchanged.
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.ts",
    include: ["tests/**/*.test.tsx"],
  },
});
