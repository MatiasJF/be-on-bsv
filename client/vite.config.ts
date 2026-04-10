import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Read .env from the monorepo root (same place server/src/env.ts loads it
  // from). Without this, Vite would only read client/.env and the
  // VITE_SUPABASE_* values would never reach the browser bundle.
  envDir: "../",
  server: {
    port: 5173,
    proxy: {
      // /api/* → Express server in dev
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
