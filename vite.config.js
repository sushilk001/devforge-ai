import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/stage1": "http://localhost:8000",
      "/stage2": "http://localhost:8000",
      "/stage3": "http://localhost:8000",
      "/stage4": "http://localhost:8000",
      "/stats":  "http://localhost:8000",
      "/qa":     "http://localhost:8000",
      "/prd":    "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
});
