import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../src/db/client.ts";
import { signWebhook } from "../src/modules/payments/infra/hmac-webhook-verifier.ts";
import {
  buildTestApp,
  type Cookies,
  registerUser,
  TEST_DATABASE_URL,
  WEBHOOK_SECRET,
} from "./helpers.ts";

const pool = createPool(TEST_DATABASE_URL);
let app: FastifyInstance;
let organizer: Cookies;
let buyer: Cookies;
let other: Cookies;

beforeAll(async () => {
  app = await buildTestApp(pool);
  organizer = (await registerUser(app, "organizer")).cookies;
  buyer = (await registerUser(app)).cookies;
  other = (await registerUser(app)).cookies;
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

const key = () => `teste-${randomUUID()}`;

/** Cria um evento com um tipo de ingresso; publica, a menos que `publish` seja false. */
async function createEvent(quantity: number, publish = true) {
  const event = await app.inject({
    method: "POST",
    url: "/v1/events",
    cookies: organizer,
    payload: {
      title: "Show de Teste",
      venue: "Arena",
      city: "Curitiba",
      startsAt: "2027-06-01T20:00:00Z",
      endsAt: "2027-06-01T23:00:00Z",
    },
  });
  const eventId = event.json().id as string;
  const type = await app.inject({
    method: "POST",
    url: `/v1/events/${eventId}/ticket-types`,
    cookies: organizer,
    payload: { name: "Geral", priceCents: 5000, quantity },
  });
  if (publish) {
    await app.inject({ method: "POST", url: `/v1/events/${eventId}/publish`, cookies: organizer });
  }
  return { eventId, ticketTypeId: type.json().id as string };
}

const reserve = (
  eventId: string,
  ticketTypeId: string,
  quantity: number,
  cookies: Cookies,
  idempotencyKey = key(),
) =>
  app.inject({
    method: "POST",
    url: `/v1/events/${eventId}/orders`,
    cookies,
    headers: { "idempotency-key": idempotencyKey },
    payload: { items: [{ ticketTypeId, quantity }] },
  });

async function available(eventId: string): Promise<number> {
  const res = await app.inject({ url: `/v1/events/${eventId}/ticket-types`, cookies: organizer });
  return res.json()[0].available;
}

const pay = (orderId: string, cookies: Cookies, method = "pix") =>
  app.inject({ method: "POST", url: `/v1/orders/${orderId}/pay`, cookies, payload: { method } });

const getOrder = async (orderId: string, cookies: Cookies = buyer) =>
  (await app.inject({ url: `/v1/orders/${orderId}`, cookies })).json();

async function providerRefOf(orderId: string): Promise<string> {
  const { rows } = await pool.query(
    "select provider_ref from payments.payments where order_id = $1 order by created_at desc limit 1",
    [orderId],
  );
  return rows[0].provider_ref;
}

/** Envia o aviso do gateway, assinado como o gateway assinaria. */
function webhook(providerRef: string, status: "approved" | "declined", secret = WEBHOOK_SECRET) {
  const body = JSON.stringify({ providerRef, status });
  const timestamp = String(Math.floor(Date.now() / 1000));
  return app.inject({
    method: "POST",
    url: "/v1/webhooks/payments",
    headers: {
      "content-type": "application/json",
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signWebhook(secret, timestamp, body),
    },
    payload: body,
  });
}

const count = async (sql: string, params: unknown[]) =>
  Number((await pool.query(sql, params)).rows[0].n);
const ticketCount = (orderId: string) =>
  count("select count(*) n from sales.tickets where order_id = $1", [orderId]);
const outboxCount = (orderId: string, type: string) =>
  count("select count(*) n from notifications.outbox where type = $2 and payload->>'orderId' = $1", [
    orderId,
    type,
  ]);

describe("reserva de ingressos", () => {
  it("exige sessão e o cabeçalho Idempotency-Key", async () => {
    const { eventId, ticketTypeId } = await createEvent(5);
    expect((await reserve(eventId, ticketTypeId, 1, {})).statusCode).toBe(401);
    const noKey = await app.inject({
      method: "POST",
      url: `/v1/events/${eventId}/orders`,
      cookies: buyer,
      payload: { items: [{ ticketTypeId, quantity: 1 }] },
    });
    expect(noKey.statusCode).toBe(400);
  });

  it("reserva, calcula o total e desconta do estoque", async () => {
    const { eventId, ticketTypeId } = await createEvent(5);
    const res = await reserve(eventId, ticketTypeId, 2, buyer);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: "reserved", totalCents: 10000 });
    expect(await available(eventId)).toBe(3);
    const mine = await app.inject({ url: "/v1/orders", cookies: buyer });
    expect(mine.json().some((o: { id: string }) => o.id === res.json().id)).toBe(true);
  });

  it("repetir com a mesma chave devolve o mesmo pedido sem reservar de novo (RNF02)", async () => {
    const { eventId, ticketTypeId } = await createEvent(5);
    const k = key();
    const first = await reserve(eventId, ticketTypeId, 2, buyer, k);
    const again = await reserve(eventId, ticketTypeId, 2, buyer, k);
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(first.json().id);
    expect(await available(eventId)).toBe(3);

    const changed = await reserve(eventId, ticketTypeId, 3, buyer, k);
    expect(changed.statusCode).toBe(422);
    expect(await available(eventId)).toBe(3);
  });

  it("duas requisições idênticas e simultâneas criam um único pedido", async () => {
    const { eventId, ticketTypeId } = await createEvent(5);
    const k = key();
    const results = await Promise.all([
      reserve(eventId, ticketTypeId, 1, buyer, k),
      reserve(eventId, ticketTypeId, 1, buyer, k),
      reserve(eventId, ticketTypeId, 1, buyer, k),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 200, 201]);
    expect(new Set(results.map((r) => r.json().id)).size).toBe(1);
    expect(await available(eventId)).toBe(4);
  });

  it("nunca vende além do estoque com 20 compras simultâneas de 5 vagas (RNF01)", async () => {
    const { eventId, ticketTypeId } = await createEvent(5);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => reserve(eventId, ticketTypeId, 1, buyer)),
    );
    const statuses = results.map((r) => r.statusCode);
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 409)).toHaveLength(15);
    expect(await available(eventId)).toBe(0);
  });

  it("recusa evento em rascunho, tipo de outro evento e quantidade acima do limite", async () => {
    const draft = await createEvent(5, false);
    expect((await reserve(draft.eventId, draft.ticketTypeId, 1, buyer)).statusCode).toBe(404);
    const a = await createEvent(5);
    const b = await createEvent(5);
    expect((await reserve(a.eventId, b.ticketTypeId, 1, buyer)).statusCode).toBe(422);
    expect((await reserve(a.eventId, a.ticketTypeId, 11, buyer)).statusCode).toBe(400);
    expect(await available(a.eventId)).toBe(5);
  });

  it("pedido de outra pessoa não é visível nem pagável (BOLA)", async () => {
    const { eventId, ticketTypeId } = await createEvent(5);
    const orderId = (await reserve(eventId, ticketTypeId, 1, buyer)).json().id;
    expect((await app.inject({ url: `/v1/orders/${orderId}`, cookies: other })).statusCode).toBe(404);
    expect((await pay(orderId, other)).statusCode).toBe(404);
    expect(
      (await app.inject({ url: `/v1/orders/${orderId}/tickets`, cookies: other })).statusCode,
    ).toBe(404);
  });
});

describe("pagamento e webhook", () => {
  async function reservedOrder(quantity = 2) {
    const { eventId, ticketTypeId } = await createEvent(5);
    const orderId = (await reserve(eventId, ticketTypeId, quantity, buyer)).json().id as string;
    return { eventId, orderId };
  }

  it("inicia o pagamento com instruções e não cria cobrança duplicada", async () => {
    const { orderId } = await reservedOrder();
    const first = await pay(orderId, buyer, "pix");
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ status: "pending", amountCents: 10000 });
    expect(first.json().instructions.kind).toBe("pix");
    expect(first.body).not.toContain(await providerRefOf(orderId));

    const again = await pay(orderId, buyer, "boleto");
    expect(again.json().id).toBe(first.json().id);
    expect(await count("select count(*) n from payments.payments where order_id = $1", [orderId])).toBe(1);
  });

  it("recusa webhook com assinatura inválida, sem alterar o pedido", async () => {
    const { orderId } = await reservedOrder();
    await pay(orderId, buyer);
    const ref = await providerRefOf(orderId);
    expect((await webhook(ref, "approved", "segredo-errado-de-um-atacante")).statusCode).toBe(401);
    const unsigned = await app.inject({
      method: "POST",
      url: "/v1/webhooks/payments",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ providerRef: ref, status: "approved" }),
    });
    expect(unsigned.statusCode).toBe(401);
    expect((await getOrder(orderId)).status).toBe("reserved");
    expect(await ticketCount(orderId)).toBe(0);
  });

  it("pagamento aprovado confirma o pedido, emite ingressos e grava o evento no outbox", async () => {
    const { orderId } = await reservedOrder(2);
    await pay(orderId, buyer);
    const res = await webhook(await providerRefOf(orderId), "approved");
    expect(res.statusCode).toBe(200);
    expect((await getOrder(orderId)).status).toBe("paid");

    const tickets = await app.inject({ url: `/v1/orders/${orderId}/tickets`, cookies: buyer });
    expect(tickets.json()).toHaveLength(2);
    expect(new Set(tickets.json().map((t: { code: string }) => t.code)).size).toBe(2);
    expect(await outboxCount(orderId, "order.paid")).toBe(1);
  });

  it("webhooks repetidos e simultâneos não emitem ingressos em dobro (RNF02)", async () => {
    const { orderId } = await reservedOrder(3);
    await pay(orderId, buyer);
    const ref = await providerRefOf(orderId);
    const results = await Promise.all(Array.from({ length: 5 }, () => webhook(ref, "approved")));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect((await webhook(ref, "declined")).statusCode).toBe(200);

    expect((await getOrder(orderId)).status).toBe("paid");
    expect(await ticketCount(orderId)).toBe(3);
    expect(await outboxCount(orderId, "order.paid")).toBe(1);
  });

  it("pagamento recusado cancela o pedido e devolve o estoque", async () => {
    const { eventId, orderId } = await reservedOrder(2);
    await pay(orderId, buyer, "card");
    expect(await available(eventId)).toBe(3);
    expect((await webhook(await providerRefOf(orderId), "declined")).statusCode).toBe(200);
    expect((await getOrder(orderId)).status).toBe("cancelled");
    expect(await available(eventId)).toBe(5);
    expect(await ticketCount(orderId)).toBe(0);
    expect((await pay(orderId, buyer)).statusCode).toBe(422);
  });

  it("responde 404 para referência de pagamento desconhecida", async () => {
    expect((await webhook("sbx_inexistente", "approved")).statusCode).toBe(404);
  });
});

describe("expiração da reserva", () => {
  it("devolve o estoque, bloqueia o pagamento e estorna pagamento que chega atrasado", async () => {
    const { eventId, ticketTypeId } = await createEvent(5);
    const orderId = (await reserve(eventId, ticketTypeId, 2, buyer)).json().id as string;
    await pay(orderId, buyer);
    const ref = await providerRefOf(orderId);

    // Simula a passagem dos 15 minutos.
    await pool.query(
      "update sales.orders set expires_at = now() - interval '1 minute' where id = $1",
      [orderId],
    );
    expect(await app.jobs.expireOrders()).toBeGreaterThanOrEqual(1);
    expect((await getOrder(orderId)).status).toBe("expired");
    expect(await available(eventId)).toBe(5);
    expect(await app.jobs.expireOrders()).toBe(0);
    expect(await available(eventId)).toBe(5);

    // O dinheiro chegou depois de a reserva ter sido liberada: estorna, não emite ingresso.
    expect((await webhook(ref, "approved")).statusCode).toBe(200);
    expect((await getOrder(orderId)).status).toBe("expired");
    expect(await ticketCount(orderId)).toBe(0);
    expect(await count("select count(*) n from payments.payments where order_id = $1 and status = 'refunded'", [orderId])).toBe(1);
    expect(await outboxCount(orderId, "payment.refunded")).toBe(1);
  });

  it("não aceita iniciar pagamento de reserva vencida ainda não liberada", async () => {
    const { eventId, ticketTypeId } = await createEvent(5);
    const orderId = (await reserve(eventId, ticketTypeId, 1, buyer)).json().id as string;
    await pool.query(
      "update sales.orders set expires_at = now() - interval '1 minute' where id = $1",
      [orderId],
    );
    const res = await pay(orderId, buyer);
    expect(res.statusCode).toBe(422);
  });
});
