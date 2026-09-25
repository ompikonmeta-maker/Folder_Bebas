import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = "http://localhost:8080";
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: { host: true, port: 5173, proxy: { "/api": api, "/struk": api } },
});
