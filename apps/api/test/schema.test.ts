import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb, createPool } from "../src/db/client.ts";
import { events, orders, payments, ticketTypes, users } from "../src/db/schema.ts";

const url =
  process.env.DATABASE_URL_TEST ??
  "postgres://eventmaster:eventmaster@localhost:5432/eventmaster_test";
const pool = createPool(url);
const db = createDb(pool);

let organizerId: string;
let eventId: string;

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({ email: "org@example.com", name: "Org", passwordHash: "x", role: "organizer" })
    .returning();
  organizerId = u!.id;
  const [e] = await db
    .insert(events)
    .values({
      organizerId,
      title: "Evento de teste",
      venue: "Local",
      city: "Curitiba",
      startsAt: new Date("2027-01-01T10:00:00Z"),
      endsAt: new Date("2027-01-01T12:00:00Z"),
    })
    .returning();
  eventId = e!.id;
});

afterAll(async () => {
  await pool.end();
});

async function newTicketType(name: string, quantity: number) {
  const [t] = await db
    .insert(ticketTypes)
    .values({ eventId, name, priceCents: 1000, quantity })
    .returning();
  return t!;
}

describe("constraints do modelo de dados", () => {
  it("recusa e-mail repetido ignorando maiúsculas", async () => {
    await expect(
      db.insert(users).values({ email: "ORG@example.com", name: "Outro", passwordHash: "x" }),
    ).rejects.toThrow();
  });

  it("recusa evento que termina antes de começar", async () => {
    await expect(
      db.insert(events).values({
        organizerId,
        title: "Inválido",
        venue: "L",
        city: "C",
        startsAt: new Date("2027-01-02T10:00:00Z"),
        endsAt: new Date("2027-01-02T09:00:00Z"),
      }),
    ).rejects.toThrow();
  });

  it("recusa preço negativo e quantidade zero", async () => {
    await expect(
      db.insert(ticketTypes).values({ eventId, name: "Neg", priceCents: -1, quantity: 5 }),
    ).rejects.toThrow();
    await expect(
      db.insert(ticketTypes).values({ eventId, name: "Zero", priceCents: 0, quantity: 0 }),
    ).rejects.toThrow();
  });

  it("recusa pedido repetido com a mesma Idempotency-Key do usuário (RNF02)", async () => {
    const values = {
      userId: organizerId,
      eventId,
      totalCents: 1000,
      idempotencyKey: "chave-1",
      requestHash: "hash",
      expiresAt: new Date(Date.now() + 15 * 60_000),
    };
    await db.insert(orders).values(values);
    await expect(db.insert(orders).values(values)).rejects.toThrow();
  });

  it("recusa segundo pagamento com o mesmo providerRef (webhook repetido)", async () => {
    const [o] = await db
      .insert(orders)
      .values({
        userId: organizerId,
        eventId,
        totalCents: 500,
        idempotencyKey: "chave-pagto",
        requestHash: "hash",
        expiresAt: new Date(Date.now() + 15 * 60_000),
      })
      .returning();
    const p = { orderId: o!.id, method: "pix", providerRef: "prov-123", amountCents: 500 };
    await db.insert(payments).values(p);
    await expect(db.insert(payments).values(p)).rejects.toThrow();
  });
});

describe("estoque de ingressos (RNF01)", () => {
  it("nunca passa da quantidade com 20 reservas concorrentes de 5 vagas", async () => {
    const tt = await newTicketType("Concorrência", 5);

    const attempts = Array.from({ length: 20 }, () =>
      db
        .update(ticketTypes)
        .set({ sold: sql`${ticketTypes.sold} + 1` })
        .where(eq(ticketTypes.id, tt.id))
        .then(() => "ok" as const)
        .catch(() => "recusada" as const),
    );
    const results = await Promise.all(attempts);

    const [after] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, tt.id));
    expect(results.filter((r) => r === "ok")).toHaveLength(5);
    expect(after!.sold).toBe(5);
  });

  it("não deixa o estoque ficar negativo", async () => {
    const tt = await newTicketType("Negativo", 3);
    await expect(
      db
        .update(ticketTypes)
        .set({ sold: sql`${ticketTypes.sold} - 1` })
        .where(eq(ticketTypes.id, tt.id)),
    ).rejects.toThrow();
  });
});
