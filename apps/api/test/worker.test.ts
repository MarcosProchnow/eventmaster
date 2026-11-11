import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../src/db/client.ts";
import { signWebhook } from "../src/modules/payments/infra/hmac-webhook-verifier.ts";
import { startWorker, type Worker } from "../src/worker/start-worker.ts";
import {
  buildTestApp,
  registerUser,
  TEST_DATABASE_URL,
  WEB_ORIGIN,
  WEBHOOK_SECRET,
} from "./helpers.ts";

const pool = createPool(TEST_DATABASE_URL);
let app: FastifyInstance;
let worker: Worker;
const sent: { to: string; subject: string; text: string }[] = [];

beforeAll(async () => {
  app = await buildTestApp(pool);
  worker = await startWorker({
    pool,
    databaseUrl: TEST_DATABASE_URL,
    mailer: { send: async (message) => void sent.push(message) },
    webOrigin: WEB_ORIGIN,
    logger: { info: () => undefined, error: () => undefined },
    relayIntervalMs: 60_000, // os testes disparam o relay manualmente
  });
}, 60_000);

afterAll(async () => {
  await worker.stop();
  await app.close();
  await pool.end();
});

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("condição não atendida a tempo");
}

/** Compra completa pela API: evento, reserva, pagamento e webhook aprovado. */
async function buyAndPay() {
  const organizer = (await registerUser(app, "organizer")).cookies;
  const buyer = await registerUser(app);
  const event = await app.inject({
    method: "POST",
    url: "/v1/events",
    cookies: organizer,
    payload: {
      title: "Evento do Worker",
      venue: "Sala",
      city: "Curitiba",
      startsAt: "2027-07-01T20:00:00Z",
      endsAt: "2027-07-01T23:00:00Z",
    },
  });
  const eventId = event.json().id;
  const type = await app.inject({
    method: "POST",
    url: `/v1/events/${eventId}/ticket-types`,
    cookies: organizer,
    payload: { name: "Geral", priceCents: 1000, quantity: 10 },
  });
  await app.inject({ method: "POST", url: `/v1/events/${eventId}/publish`, cookies: organizer });
  const order = await app.inject({
    method: "POST",
    url: `/v1/events/${eventId}/orders`,
    cookies: buyer.cookies,
    headers: { "idempotency-key": `worker-${randomUUID()}` },
    payload: { items: [{ ticketTypeId: type.json().id, quantity: 1 }] },
  });
  const orderId = order.json().id as string;
  await app.inject({
    method: "POST",
    url: `/v1/orders/${orderId}/pay`,
    cookies: buyer.cookies,
    payload: { method: "pix" },
  });
  const { rows } = await pool.query(
    "select provider_ref from payments.payments where order_id = $1",
    [orderId],
  );
  const body = JSON.stringify({ providerRef: rows[0].provider_ref, status: "approved" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const res = await app.inject({
    method: "POST",
    url: "/v1/webhooks/payments",
    headers: {
      "content-type": "application/json",
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signWebhook(WEBHOOK_SECRET, timestamp, body),
    },
    payload: body,
  });
  expect(res.statusCode).toBe(200);
  return { orderId, email: buyer.email };
}

const mailsTo = (email: string) => sent.filter((m) => m.to === email);

describe("worker: outbox -> fila -> e-mail", () => {
  it("envia o e-mail de confirmação depois do pagamento e registra a notificação", async () => {
    const { orderId, email } = await buyAndPay();
    expect(mailsTo(email)).toHaveLength(0); // a API não envia e-mail na requisição

    expect(await worker.relayNow()).toBeGreaterThanOrEqual(1);
    await waitFor(() => mailsTo(email).length === 1);

    expect(mailsTo(email)[0]!.subject).toContain("confirmado");
    expect(mailsTo(email)[0]!.text).toContain(`${WEB_ORIGIN}/pedidos/${orderId}`);
    const { rows } = await pool.query(
      `select n.status, o.processed_at
         from notifications.notifications n
         join notifications.outbox o on o.id = n.outbox_id
        where o.payload->>'orderId' = $1`,
      [orderId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].processed_at).not.toBeNull();
    expect(await worker.relayNow()).toBe(0);
  });

  it("evento publicado duas vezes na fila não gera e-mail repetido", async () => {
    const { orderId, email } = await buyAndPay();
    await worker.relayNow();
    await waitFor(() => mailsTo(email).length === 1);

    // Simula a queda do relay depois de publicar e antes de marcar: o evento volta a ficar pendente.
    await pool.query(
      "update notifications.outbox set processed_at = null where payload->>'orderId' = $1",
      [orderId],
    );
    expect(await worker.relayNow()).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(mailsTo(email)).toHaveLength(1);
  });
});
