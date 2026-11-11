import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../src/db/client.ts";
import {
  buildTestApp,
  cookiesOf,
  PASSWORD,
  registerUser,
  TEST_DATABASE_URL,
  uniqueEmail,
  WEB_ORIGIN,
} from "./helpers.ts";

const pool = createPool(TEST_DATABASE_URL);
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp(pool);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

const register = (payload: object) =>
  app.inject({ method: "POST", url: "/v1/auth/register", payload });
const login = (email: string, password: string) =>
  app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });

describe("cadastro", () => {
  it("cria o usuário, não devolve a senha e define cookies httpOnly e SameSite=Strict", async () => {
    const email = uniqueEmail();
    const res = await register({ name: "Bia", email, password: PASSWORD });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ email, name: "Bia", role: "attendee" });
    expect(res.body).not.toContain("assword");

    const byName = Object.fromEntries(res.cookies.map((c) => [c.name, c]));
    expect(byName["access_token"]).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/" });
    expect(byName["refresh_token"]).toMatchObject({
      httpOnly: true,
      sameSite: "Strict",
      path: "/v1/auth",
    });
  });

  it("guarda a senha como hash Argon2id e o refresh token como hash", async () => {
    const user = await registerUser(app);
    const { rows } = await pool.query(
      "select password_hash from identity.users where id = $1",
      [user.id],
    );
    expect(rows[0].password_hash).toMatch(/^argon2id\$/);
    expect(rows[0].password_hash).not.toContain(PASSWORD);
    const tokens = await pool.query(
      "select token_hash from identity.refresh_tokens where user_id = $1",
      [user.id],
    );
    expect(tokens.rows[0].token_hash).not.toBe(user.cookies["refresh_token"]);
  });

  it("recusa e-mail repetido, senha curta, papel admin e campos extras", async () => {
    const user = await registerUser(app);
    const base = { name: "Caio", email: uniqueEmail(), password: PASSWORD };
    expect((await register({ ...base, email: user.email.toUpperCase() })).statusCode).toBe(409);
    expect((await register({ ...base, password: "curta" })).statusCode).toBe(400);
    expect((await register({ ...base, role: "admin" })).statusCode).toBe(400);
    expect((await register({ ...base, isAdmin: true })).statusCode).toBe(400);
  });
});

describe("login e sessão", () => {
  it("entra com a senha certa e acessa /me", async () => {
    const user = await registerUser(app, "organizer");
    const res = await login(user.email, PASSWORD);
    expect(res.statusCode).toBe(200);
    const me = await app.inject({ url: "/v1/me", cookies: cookiesOf(res) });
    expect(me.json()).toMatchObject({ id: user.id, role: "organizer" });
  });

  it("responde igual para senha errada e e-mail inexistente", async () => {
    const user = await registerUser(app);
    const wrong = await login(user.email, "senha-errada-123");
    const unknown = await login(uniqueEmail(), "senha-errada-123");
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
    expect(wrong.cookies).toHaveLength(0);
  });

  it("/me exige sessão e recusa token adulterado", async () => {
    expect((await app.inject({ url: "/v1/me" })).statusCode).toBe(401);
    const user = await registerUser(app);
    const tampered = `${user.cookies["access_token"]!.slice(0, -3)}abc`;
    const res = await app.inject({ url: "/v1/me", cookies: { access_token: tampered } });
    expect(res.statusCode).toBe(401);
  });
});

describe("refresh e logout", () => {
  const refresh = (token: string | undefined) =>
    app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      ...(token && { cookies: { refresh_token: token } }),
    });

  it("rotaciona o refresh token e detecta reuso", async () => {
    const user = await registerUser(app);
    const first = user.cookies["refresh_token"]!;
    const renewed = await refresh(first);
    expect(renewed.statusCode).toBe(200);
    const second = cookiesOf(renewed)["refresh_token"]!;
    expect(second).not.toBe(first);

    // Reuso do token antigo: recusa e derruba também a sessão nova.
    expect((await refresh(first)).statusCode).toBe(401);
    expect((await refresh(second)).statusCode).toBe(401);
  });

  it("sem cookie de refresh responde 401", async () => {
    expect((await refresh(undefined)).statusCode).toBe(401);
  });

  it("logout revoga o refresh token e limpa os cookies", async () => {
    const user = await registerUser(app);
    const out = await app.inject({ method: "POST", url: "/v1/auth/logout", cookies: user.cookies });
    expect(out.statusCode).toBe(204);
    expect(out.cookies.every((c) => c.value === "")).toBe(true);
    expect((await refresh(user.cookies["refresh_token"])).statusCode).toBe(401);
  });
});

describe("proteções HTTP", () => {
  it("recusa escrita vinda de outra origem (CSRF) e aceita a origem do front", async () => {
    const payload = { name: "Dani", email: uniqueEmail(), password: PASSWORD };
    const evil = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { origin: "https://site-malicioso.example" },
      payload,
    });
    expect(evil.statusCode).toBe(403);
    const ok = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { origin: WEB_ORIGIN },
      payload,
    });
    expect(ok.statusCode).toBe(201);
  });

  it("limita tentativas de login por IP", async () => {
    const limited = await buildTestApp(pool, 3);
    const attempt = () =>
      limited.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: "ninguem@example.com", password: "senha-errada-123" },
      });
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await attempt()).statusCode);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    await limited.close();
  });

  it("envia cabeçalhos de segurança", async () => {
    const res = await app.inject({ url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
