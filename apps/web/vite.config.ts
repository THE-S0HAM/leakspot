// Vite build config for @leakspot/web: React plugin, no sourcemaps in the emitted bundle (Req 5.5).
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
  },
});
