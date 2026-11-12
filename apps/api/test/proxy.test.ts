import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPool } from "../src/db/client.ts";
import { TEST_DATABASE_URL, WEB_ORIGIN, WEBHOOK_SECRET } from "./helpers.ts";

const pool = createPool(TEST_DATABASE_URL);
afterAll(() => pool.end());

const build = (trustProxy: string | undefined) =>
  buildApp({
    pool,
    jwtSecret: "segredo-somente-para-os-testes-automatizados",
    webhookSecret: WEBHOOK_SECRET,
    webOrigin: WEB_ORIGIN,
    cookieSecure: false,
    authRateLimitMax: 2,
    trustProxy,
  });

/** Três logins errados, cada um vindo (segundo o proxy) de um cliente diferente. */
async function loginsFromDifferentClients(trustProxy: string | undefined) {
  const app = await build(trustProxy);
  const statuses: number[] = [];
  for (const ip of ["203.0.113.1", "203.0.113.2", "203.0.113.3"]) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { "x-forwarded-for": ip },
      payload: { email: "ninguem@example.com", password: "senha-errada-123" },
    });
    statuses.push(response.statusCode);
  }
  await app.close();
  return statuses;
}

describe("API atrás de proxy (TRUST_PROXY)", () => {
  it("com o proxy confiável, cada cliente tem o próprio limite de tentativas", async () => {
    expect(await loginsFromDifferentClients("loopback")).toEqual([401, 401, 401]);
  });

  it("sem confiar no proxy, o X-Forwarded-For é ignorado (não pode ser forjado para driblar o limite)", async () => {
    expect(await loginsFromDifferentClients(undefined)).toEqual([401, 401, 429]);
  });
});
