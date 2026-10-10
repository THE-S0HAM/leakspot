// Vite build config for @leakspot/web: React plugin, no sourcemaps in the emitted bundle (Req 5.5).
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // `npm run dev` proxies /api to the local node:http API on :8787 (same-origin in dev).
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
  build: {
    sourcemap: false,
  },
});
