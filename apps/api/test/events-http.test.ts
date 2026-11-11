import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../src/db/client.ts";
import { buildTestApp, type Cookies, registerUser, TEST_DATABASE_URL } from "./helpers.ts";

const pool = createPool(TEST_DATABASE_URL);
let app: FastifyInstance;
let organizer: Cookies;
let intruder: Cookies;
let attendee: Cookies;

// Cidade única por execução, para isolar a listagem de outros testes.
const city = `Cidade-${randomUUID().slice(0, 8)}`;
const body = {
  title: "Festival de Teste",
  venue: "Parque",
  city,
  startsAt: "2027-05-01T18:00:00Z",
  endsAt: "2027-05-01T23:00:00Z",
};

beforeAll(async () => {
  app = await buildTestApp(pool);
  organizer = (await registerUser(app, "organizer")).cookies;
  intruder = (await registerUser(app, "organizer")).cookies;
  attendee = (await registerUser(app, "attendee")).cookies;
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

const post = (path: string, cookies: Cookies, payload?: object) =>
  payload === undefined
    ? app.inject({ method: "POST", url: path, cookies })
    : app.inject({ method: "POST", url: path, cookies, payload });

describe("API de eventos", () => {
  let eventId: string;

  it("responde health e ready", async () => {
    expect((await app.inject({ url: "/health" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/ready" })).json()).toEqual({ status: "ready" });
  });

  it("exige autenticação para criar", async () => {
    const res = await post("/v1/events", {}, body);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("unauthorized");
  });

  it("valida a entrada e recusa campos desconhecidos", async () => {
    const invalid = await post("/v1/events", organizer, { ...body, title: "x" });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("validation");
    const extra = await post("/v1/events", organizer, { ...body, status: "published" });
    expect(extra.statusCode).toBe(400);
  });

  it("cria um rascunho, que não aparece na listagem nem para anônimos", async () => {
    const res = await post("/v1/events", organizer, body);
    expect(res.statusCode).toBe(201);
    eventId = res.json().id;
    expect(res.json().status).toBe("draft");

    expect((await app.inject({ url: `/v1/events/${eventId}` })).statusCode).toBe(404);
    const list = await app.inject({ url: `/v1/events?city=${city}` });
    expect(list.json().total).toBe(0);
  });

  it("não deixa outro organizador mexer no evento (BOLA)", async () => {
    const patch = await app.inject({
      method: "PATCH",
      url: `/v1/events/${eventId}`,
      cookies: intruder,
      payload: { title: "Invadido" },
    });
    expect(patch.statusCode).toBe(404);
    expect((await post(`/v1/events/${eventId}/publish`, intruder)).statusCode).toBe(404);
  });

  it("não publica sem tipo de ingresso", async () => {
    const res = await post(`/v1/events/${eventId}/publish`, organizer);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("business_rule");
  });

  it("adiciona tipo de ingresso e recusa nome repetido", async () => {
    const ticket = { name: "Geral", priceCents: 8000, quantity: 50 };
    const created = await post(`/v1/events/${eventId}/ticket-types`, organizer, ticket);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: "Geral", available: 50 });
    expect(created.json().sold).toBeUndefined();

    const repeated = await post(`/v1/events/${eventId}/ticket-types`, organizer, ticket);
    expect(repeated.statusCode).toBe(409);
  });

  it("publica e passa a aparecer para todos, com busca e paginação", async () => {
    const published = await post(`/v1/events/${eventId}/publish`, organizer);
    expect(published.statusCode).toBe(200);
    expect(published.json().status).toBe("published");

    expect((await app.inject({ url: `/v1/events/${eventId}` })).statusCode).toBe(200);
    const list = await app.inject({ url: `/v1/events?city=${city.toUpperCase()}&q=festival` });
    expect(list.json()).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    const none = await app.inject({ url: `/v1/events?city=${city}&q=100%25` });
    expect(none.json().total).toBe(0);

    const types = await app.inject({ url: `/v1/events/${eventId}/ticket-types` });
    expect(types.json()).toHaveLength(1);
  });

  it("limita o tamanho da página e valida o id", async () => {
    expect((await app.inject({ url: "/v1/events?pageSize=500" })).statusCode).toBe(400);
    expect((await app.inject({ url: "/v1/events/nao-e-uuid" })).statusCode).toBe(400);
  });

  it("cancela e bloqueia alterações", async () => {
    expect((await post(`/v1/events/${eventId}/cancel`, organizer)).statusCode).toBe(200);
    const patch = await app.inject({
      method: "PATCH",
      url: `/v1/events/${eventId}`,
      cookies: organizer,
      payload: { title: "Depois de cancelado" },
    });
    expect(patch.statusCode).toBe(422);
    expect((await app.inject({ url: `/v1/events/${eventId}` })).statusCode).toBe(404);
  });

  it("participante não cria evento", async () => {
    const res = await post("/v1/events", attendee, body);
    expect(res.statusCode).toBe(403);
  });

  it("os antigos cabeçalhos de desenvolvimento não autenticam mais", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/events",
      headers: { "x-dev-user-id": randomUUID(), "x-dev-role": "organizer" },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it("publica o contrato OpenAPI 3.1", async () => {
    const doc = (await app.inject({ url: "/openapi.json" })).json();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toContain("/v1/events/{id}/ticket-types");
    expect(Object.keys(doc.paths)).toContain("/v1/auth/login");
  });
});
