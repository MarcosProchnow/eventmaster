import type pg from "pg";
import { PgBoss } from "pg-boss";
import { createDb } from "../db/client.ts";
import { findUserContact } from "../modules/identity/infra/user-directory.ts";
import { NotificationService } from "../modules/notifications/application/notification-service.ts";
import type { Mailer, OutboxMessage } from "../modules/notifications/application/ports.ts";
import { DrizzleNotificationLog } from "../modules/notifications/infra/drizzle-notification-log.ts";
import { relayOutbox } from "../modules/notifications/infra/outbox-relay.ts";
import { OrdersService } from "../modules/orders/application/orders-service.ts";
import { DrizzleOrderRepository } from "../modules/orders/infra/drizzle-order-repository.ts";

const EVENTS_QUEUE = "domain-events";
const DEAD_LETTER_QUEUE = "domain-events-dead";
const EXPIRE_QUEUE = "expire-orders";

interface Logger {
  info(data: object, message: string): void;
  error(data: object, message: string): void;
}

export interface WorkerOptions {
  pool: pg.Pool;
  databaseUrl: string;
  mailer: Mailer;
  webOrigin: string;
  logger: Logger;
  /** Intervalo do relay do outbox. */
  relayIntervalMs?: number;
  /** Tentativas de entrega antes de o evento ir para a dead-letter. */
  retryLimit?: number;
}

export interface Worker {
  /** Publica agora os eventos pendentes do outbox (usado nos testes). */
  relayNow(): Promise<number>;
  stop(): Promise<void>;
}

/**
 * Processo de segundo plano: publica o outbox na fila (pg-boss, sobre o próprio
 * PostgreSQL), envia os e-mails e expira reservas vencidas.
 */
export async function startWorker(options: WorkerOptions): Promise<Worker> {
  const { logger } = options;
  const db = createDb(options.pool);
  const notifications = new NotificationService({
    mailer: options.mailer,
    log: new DrizzleNotificationLog(db),
    contacts: { find: (userId) => findUserContact(db, userId) },
    webOrigin: options.webOrigin,
  });
  const orders = new OrdersService(new DrizzleOrderRepository(db));

  const boss = new PgBoss({ connectionString: options.databaseUrl, schema: "pgboss" });
  boss.on("error", (error) => logger.error({ err: error }, "erro na fila"));
  await boss.start();

  const ensureQueue = async (name: string, queueOptions: Parameters<PgBoss["createQueue"]>[1] = {}) => {
    if (!(await boss.getQueue(name))) await boss.createQueue(name, queueOptions);
  };
  await ensureQueue(DEAD_LETTER_QUEUE);
  await ensureQueue(EVENTS_QUEUE, {
    retryLimit: options.retryLimit ?? 5,
    retryDelay: 2,
    retryBackoff: true, // 2 s, 4 s, 8 s... entre as tentativas
    deadLetter: DEAD_LETTER_QUEUE,
  });
  await ensureQueue(EXPIRE_QUEUE);

  await boss.work<OutboxMessage>(EVENTS_QUEUE, { pollingIntervalSeconds: 0.5 }, async ([job]) => {
    if (!job) return;
    const result = await notifications.handle(job.data);
    logger.info({ outboxId: job.data.outboxId, type: job.data.type, result }, "evento tratado");
  });

  await boss.work<OutboxMessage>(DEAD_LETTER_QUEUE, async ([job]) => {
    if (!job) return;
    await notifications.markDead(job.data);
    logger.error({ outboxId: job.data.outboxId, type: job.data.type }, "notificação desistida");
  });

  // Tarefa agendada: a cada minuto, libera o estoque de reservas vencidas.
  await boss.schedule(EXPIRE_QUEUE, "* * * * *");
  await boss.work(EXPIRE_QUEUE, async () => {
    const count = await orders.expireDue();
    if (count > 0) logger.info({ count }, "reservas expiradas");
  });

  const relayNow = () =>
    relayOutbox(db, async (message) => {
      await boss.send(EVENTS_QUEUE, message);
    });

  let relaying = false;
  const timer = setInterval(() => {
    if (relaying) return; // não sobrepõe execuções
    relaying = true;
    relayNow()
      .then((count) => count > 0 && logger.info({ count }, "eventos publicados"))
      .catch((error: unknown) => logger.error({ err: error }, "falha no relay do outbox"))
      .finally(() => {
        relaying = false;
      });
  }, options.relayIntervalMs ?? 2000);

  return {
    relayNow,
    async stop() {
      clearInterval(timer);
      await boss.stop();
    },
  };
}
