import { z } from "zod";
import { createPool } from "./db/client.ts";
import { SmtpMailer } from "./modules/notifications/infra/smtp-mailer.ts";
import { startWorker } from "./worker/start-worker.ts";

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    SMTP_URL: z.string().min(1).default("smtp://localhost:1025"),
    MAIL_FROM: z.string().min(3).default("EventMaster <nao-responda@eventmaster.local>"),
    WEB_ORIGIN: z.url().default("http://localhost:5173"),
  })
  .parse(process.env);

/** Log estruturado (JSON por linha). Erros viram texto, pois `JSON.stringify(Error)` é `{}`. */
const log = (level: string) => (data: object, msg: string) => {
  const fields = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v instanceof Error ? v.message : v]),
  );
  console.log(JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields }));
};
const logger = { info: log("info"), error: log("error") };

const pool = createPool(env.DATABASE_URL);
const mailer = new SmtpMailer(env.SMTP_URL, env.MAIL_FROM);
const worker = await startWorker({
  pool,
  databaseUrl: env.DATABASE_URL,
  mailer,
  webOrigin: new URL(env.WEB_ORIGIN).origin,
  logger,
});
logger.info({}, "worker iniciado");

async function shutdown(signal: string) {
  logger.info({ signal }, "encerrando");
  await worker.stop();
  mailer.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
