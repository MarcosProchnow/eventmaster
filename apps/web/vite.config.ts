import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // O navegador fala só com o Vite; `/v1` é repassado à API. Assim front e
    // API ficam na mesma origem e os cookies SameSite=Strict funcionam (ADR 0009).
    proxy: { "/v1": process.env.API_URL ?? "http://localhost:3000" },
  },
});
