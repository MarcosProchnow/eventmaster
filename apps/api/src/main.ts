import { buildApp } from "./app.ts";
import { createPool } from "./db/client.ts";
import { loadConfig } from "./shared/config.ts";

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const app = await buildApp({ pool, allowDevAuth: config.allowDevAuth, logger: true });

async function shutdown(signal: string) {
  app.log.info({ signal }, "encerrando");
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: config.port, host: "0.0.0.0" });
