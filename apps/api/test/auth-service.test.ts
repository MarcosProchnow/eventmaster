import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../src/modules/identity/application/auth-service.ts";
import type {
  AccessTokenSigner,
  NewUser,
  PasswordHasher,
  RefreshTokenStore,
  StoredRefreshToken,
  UserRepository,
} from "../src/modules/identity/application/ports.ts";
import type { User } from "../src/modules/identity/domain/user.ts";
import { Argon2PasswordHasher } from "../src/modules/identity/infra/argon2-password-hasher.ts";
import { JoseAccessToken } from "../src/modules/identity/infra/jose-access-token.ts";
import { ConflictError, UnauthorizedError } from "../src/shared/errors.ts";

class InMemoryUsers implements UserRepository {
  rows: User[] = [];
  async create(data: NewUser): Promise<User> {
    if (this.rows.some((u) => u.email === data.email)) throw new ConflictError("duplicado");
    const user: User = { ...data, id: randomUUID(), createdAt: new Date() };
    this.rows.push(user);
    return user;
  }
  async findByEmail(email: string) {
    return this.rows.find((u) => u.email === email) ?? null;
  }
  async findById(id: string) {
    return this.rows.find((u) => u.id === id) ?? null;
  }
}

class InMemoryRefreshTokens implements RefreshTokenStore {
  rows: (StoredRefreshToken & { tokenHash: string })[] = [];
  async save(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    this.rows.push({ ...data, id: randomUUID(), revokedAt: null });
  }
  async findByHash(tokenHash: string) {
    return this.rows.find((r) => r.tokenHash === tokenHash) ?? null;
  }
  async revoke(id: string) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.revokedAt) return false;
    row.revokedAt = new Date();
    return true;
  }
  async revokeAllForUser(userId: string) {
    for (const r of this.rows) if (r.userId === userId) r.revokedAt ??= new Date();
  }
  active = (userId: string) => this.rows.filter((r) => r.userId === userId && !r.revokedAt).length;
}

/** Hasher falso e rápido: os testes de caso de uso não precisam do Argon2 real. */
const fakeHasher: PasswordHasher = {
  hash: async (p) => `fake:${p}`,
  verify: async (p, stored) => stored === `fake:${p}`,
};
const fakeSigner: AccessTokenSigner = {
  sign: async (actor) => `token:${actor.id}:${actor.role}`,
  verify: async () => null,
};

const input = {
  name: "Ana",
  email: "  Ana@Example.com ",
  password: "uma-senha-longa",
  role: "attendee" as const,
};

let users: InMemoryUsers;
let tokens: InMemoryRefreshTokens;
let now: Date;
let service: AuthService;

beforeEach(() => {
  users = new InMemoryUsers();
  tokens = new InMemoryRefreshTokens();
  now = new Date("2026-11-11T12:00:00Z");
  service = new AuthService({
    users,
    refreshTokens: tokens,
    hasher: fakeHasher,
    signer: fakeSigner,
    now: () => now,
  });
});

describe("cadastro e login", () => {
  it("normaliza o e-mail, guarda só o hash da senha e abre a sessão", async () => {
    const session = await service.register(input);
    expect(session.user.email).toBe("ana@example.com");
    expect(session.user.passwordHash).not.toContain("uma-senha-longa".toUpperCase());
    expect(session.user.passwordHash).toBe("fake:uma-senha-longa");
    expect(session.accessToken).toBe(`token:${session.user.id}:attendee`);
    expect(tokens.rows[0]!.tokenHash).not.toBe(session.refreshToken);
  });

  it("recusa e-mail repetido", async () => {
    await service.register(input);
    await expect(service.register({ ...input, email: "ANA@example.com" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("entra com a senha certa, ignorando maiúsculas no e-mail", async () => {
    await service.register(input);
    const session = await service.login("ANA@EXAMPLE.COM", "uma-senha-longa");
    expect(session.user.name).toBe("Ana");
  });

  it("dá a mesma resposta para senha errada e e-mail inexistente", async () => {
    await service.register(input);
    const wrong = await service.login("ana@example.com", "errada").catch((e: Error) => e);
    const unknown = await service.login("ninguem@example.com", "errada").catch((e: Error) => e);
    expect(wrong).toBeInstanceOf(UnauthorizedError);
    expect(unknown).toBeInstanceOf(UnauthorizedError);
    expect((wrong as Error).message).toBe((unknown as Error).message);
  });
});

describe("refresh token", () => {
  it("rotaciona: o token antigo deixa de valer e o novo funciona", async () => {
    const first = await service.register(input);
    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(tokens.active(first.user.id)).toBe(1);
    await expect(service.refresh(second.refreshToken)).resolves.toBeDefined();
  });

  it("reuso de token já trocado encerra todas as sessões do usuário", async () => {
    const first = await service.register(input);
    const second = await service.refresh(first.refreshToken);
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(tokens.active(first.user.id)).toBe(0);
    await expect(service.refresh(second.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("recusa token desconhecido e token expirado", async () => {
    await expect(service.refresh("inexistente")).rejects.toBeInstanceOf(UnauthorizedError);
    const session = await service.register(input);
    now = new Date("2027-01-01T00:00:00Z");
    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("logout revoga o refresh token", async () => {
    const session = await service.register(input);
    await service.logout(session.refreshToken);
    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(service.logout(undefined)).resolves.toBeUndefined();
  });
});

describe("adaptadores reais de criptografia", () => {
  it("Argon2id: verifica a senha certa, recusa a errada e usa sal aleatório", async () => {
    const hasher = new Argon2PasswordHasher();
    const a = await hasher.hash("correta-cavalo-bateria");
    const b = await hasher.hash("correta-cavalo-bateria");
    expect(a).toMatch(/^argon2id\$19456,2,1\$/);
    expect(a).not.toBe(b);
    expect(await hasher.verify("correta-cavalo-bateria", a)).toBe(true);
    expect(await hasher.verify("outra-senha", a)).toBe(false);
    expect(await hasher.verify("x", "seed-sem-senha-real")).toBe(false);
    expect(await hasher.verify("x", "argon2id$999999999,2,1$AAAA$AAAA")).toBe(false);
  });

  it("JWT: aceita o próprio token e recusa adulterado, de outro segredo e 'alg: none'", async () => {
    const signer = new JoseAccessToken("um-segredo-de-teste-com-mais-de-32-caracteres");
    const actor = { id: randomUUID(), role: "organizer" as const };
    const token = await signer.sign(actor);
    expect(await signer.verify(token)).toEqual(actor);

    const [header, payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: actor.id, role: "admin" })).toString("base64url");
    expect(await signer.verify(`${header}.${forged}.${signature}`)).toBeNull();

    const other = new JoseAccessToken("outro-segredo-diferente-com-mais-de-32-caracteres");
    expect(await other.verify(token)).toBeNull();

    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    expect(await signer.verify(`${none}.${payload}.`)).toBeNull();
    expect(await signer.verify("lixo")).toBeNull();
  });
});
