import { buildApp } from "./app.ts";
import { createPool } from "./db/client.ts";
import { loadConfig } from "./shared/config.ts";

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const app = await buildApp({
  pool,
  jwtSecret: config.jwtSecret,
  webhookSecret: config.webhookSecret,
  webOrigin: config.webOrigin,
  cookieSecure: config.cookieSecure,
  logger: true,
});

// Libera o estoque de reservas vencidas. Na Fase 6 isso passa para o worker.
const expireTimer = setInterval(() => {
  app.jobs
    .expireOrders()
    .then((count) => count > 0 && app.log.info({ count }, "reservas expiradas"))
    .catch((error: unknown) => app.log.error(error, "falha ao expirar reservas"));
}, 30_000);

async function shutdown(signal: string) {
  clearInterval(expireTimer);
  app.log.info({ signal }, "encerrando");
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.port, host: "0.0.0.0" });
