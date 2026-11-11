import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { createPool } from "../src/db/client.ts";

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  "postgres://eventmaster:eventmaster@localhost:5432/eventmaster_test";

export const WEB_ORIGIN = "http://localhost:5173";

export function buildTestApp(pool: ReturnType<typeof createPool>, authRateLimitMax = 10_000) {
  return buildApp({
    pool,
    jwtSecret: "segredo-somente-para-os-testes-automatizados",
    webOrigin: WEB_ORIGIN,
    cookieSecure: false,
    authRateLimitMax,
  });
}

export type Cookies = Record<string, string>;

type InjectResponse = Awaited<ReturnType<FastifyInstance["inject"]>>;

/** Cookies definidos pela resposta, no formato aceito por `app.inject({ cookies })`. */
export function cookiesOf(response: InjectResponse): Cookies {
  return Object.fromEntries(response.cookies.map((c) => [c.name, c.value]));
}

export const PASSWORD = "senha-de-teste-123";
export const uniqueEmail = () => `user-${randomUUID()}@example.com`;

/** Cadastra um usuário pela API e devolve os cookies da sessão. */
export async function registerUser(
  app: FastifyInstance,
  role: "attendee" | "organizer" = "attendee",
) {
  const email = uniqueEmail();
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { name: "Pessoa de Teste", email, password: PASSWORD, role },
  });
  if (response.statusCode !== 201) throw new Error(`cadastro falhou: ${response.body}`);
  return { email, id: response.json().id as string, cookies: cookiesOf(response) };
}
