import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from other devices on the network (e.g. your phone)
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
