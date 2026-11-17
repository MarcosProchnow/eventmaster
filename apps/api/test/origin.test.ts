import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPool } from "../src/db/client.ts";
import { loadConfig } from "../src/shared/config.ts";
import { TEST_DATABASE_URL, WEBHOOK_SECRET } from "./helpers.ts";

const pool = createPool(TEST_DATABASE_URL);
afterAll(() => pool.end());

const PRINCIPAL = "https://app.example.com";
const EXTRA = "http://localhost:8080";

/** Código HTTP de um login com credenciais erradas, vindo da origem dada: 401 = passou pela checagem de origem. */
async function loginFrom(origin: string | undefined, extraWebOrigins?: string[]) {
  const app = await buildApp({
    pool,
    jwtSecret: "segredo-somente-para-os-testes-automatizados",
    webhookSecret: WEBHOOK_SECRET,
    webOrigin: PRINCIPAL,
    cookieSecure: false,
    authRateLimitMax: 10_000,
    extraWebOrigins,
  });
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: origin ? { origin } : {},
    payload: { email: "ninguem@example.com", password: "senha-errada-123" },
  });
  await app.close();
  return response.statusCode;
}

describe("origens aceitas em requisições de escrita (CSRF)", () => {
  it("aceita a origem principal e recusa as demais", async () => {
    expect(await loginFrom(PRINCIPAL)).toBe(401);
    expect(await loginFrom(EXTRA)).toBe(403);
    expect(await loginFrom("https://outro-site.example")).toBe(403);
  });

  it("aceita também as origens extras configuradas, e só elas", async () => {
    expect(await loginFrom(PRINCIPAL, [EXTRA])).toBe(401);
    expect(await loginFrom(EXTRA, [EXTRA])).toBe(401);
    expect(await loginFrom("https://outro-site.example", [EXTRA])).toBe(403);
  });

  it("cliente sem Origin (curl, testes) continua passando", async () => {
    expect(await loginFrom(undefined)).toBe(401);
  });

  it("lê a lista de origens extras da configuração (separadas por vírgula, normalizadas)", () => {
    const env = {
      DATABASE_URL: "postgres://x",
      JWT_SECRET: "a".repeat(32),
      WEBHOOK_SECRET: "b".repeat(32),
      WEB_ORIGIN: "https://app.example.com/",
    };
    expect(loadConfig(env).extraWebOrigins).toEqual([]);
    expect(
      loadConfig({ ...env, EXTRA_WEB_ORIGINS: "https://localhost:8080, http://localhost:8080/ ,," }).extraWebOrigins,
    ).toEqual(["https://localhost:8080", "http://localhost:8080"]);
  });
});
