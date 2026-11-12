import { defineConfig, devices } from "@playwright/test";
import { API_PORT, API_URL, DATABASE_URL, JWT_SECRET, WEB_PORT, WEB_URL, WEBHOOK_SECRET } from "./env";

const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests",
  // Os cenários compartilham o banco e seguem uma jornada (organizador publica, participante compra).
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: WEB_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Sobe a API (com migrations) e o front de verdade; o navegador fala só com o front,
  // que repassa `/v1` à API, como em produção (mesma origem, ADR 0009).
  webServer: [
    {
      name: "api",
      command: "pnpm --filter @eventmaster/api run db:migrate && pnpm --filter @eventmaster/api start",
      cwd: "..",
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        DATABASE_URL,
        PORT: String(API_PORT),
        JWT_SECRET,
        WEBHOOK_SECRET,
        WEB_ORIGIN: WEB_URL,
      },
    },
    {
      name: "web",
      command: `pnpm --filter @eventmaster/web exec vite --port ${WEB_PORT} --strictPort`,
      cwd: "..",
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_URL },
    },
  ],
});
