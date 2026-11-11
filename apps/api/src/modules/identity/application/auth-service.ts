import { createHash, randomBytes } from "node:crypto";
import { NotFoundError, UnauthorizedError } from "../../../shared/errors.ts";
import {
  normalizeEmail,
  REFRESH_TOKEN_TTL_SECONDS,
  type SelfAssignableRole,
  type User,
} from "../domain/user.ts";
import type {
  AccessTokenSigner,
  PasswordHasher,
  RefreshTokenStore,
  UserRepository,
} from "./ports.ts";

export interface Session {
  user: User;
  accessToken: string;
  /** Valor opaco entregue ao cliente. No banco fica só o hash. */
  refreshToken: string;
}

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
  role: SelfAssignableRole;
}

interface Deps {
  users: UserRepository;
  refreshTokens: RefreshTokenStore;
  hasher: PasswordHasher;
  signer: AccessTokenSigner;
  now?: () => Date;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const INVALID_CREDENTIALS = "E-mail ou senha inválidos";
const INVALID_SESSION = "Sessão inválida ou expirada";

/** Casos de uso de autenticação (ADR 0009). */
export class AuthService {
  readonly #users: UserRepository;
  readonly #refreshTokens: RefreshTokenStore;
  readonly #hasher: PasswordHasher;
  readonly #signer: AccessTokenSigner;
  readonly #now: () => Date;
  /** Hash usado para gastar o mesmo tempo quando o e-mail não existe. */
  #decoyHash: Promise<string> | undefined;

  constructor(deps: Deps) {
    this.#users = deps.users;
    this.#refreshTokens = deps.refreshTokens;
    this.#hasher = deps.hasher;
    this.#signer = deps.signer;
    this.#now = deps.now ?? (() => new Date());
  }

  async register(input: RegisterInput): Promise<Session> {
    const user = await this.#users.create({
      email: normalizeEmail(input.email),
      name: input.name,
      role: input.role,
      passwordHash: await this.#hasher.hash(input.password),
    });
    return this.#openSession(user);
  }

  async login(email: string, password: string): Promise<Session> {
    const user = await this.#users.findByEmail(normalizeEmail(email));
    if (!user) {
      // Mesma mensagem e tempo parecido: não revela se o e-mail existe.
      this.#decoyHash ??= this.#hasher.hash(randomBytes(16).toString("hex"));
      await this.#hasher.verify(password, await this.#decoyHash);
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }
    if (!(await this.#hasher.verify(password, user.passwordHash))) {
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }
    return this.#openSession(user);
  }

  /**
   * Troca o refresh token por um novo (rotação). Um token já usado indica
   * possível roubo: todas as sessões do usuário são encerradas.
   */
  async refresh(refreshToken: string): Promise<Session> {
    const stored = await this.#refreshTokens.findByHash(hashToken(refreshToken));
    if (!stored) throw new UnauthorizedError(INVALID_SESSION);
    if (stored.revokedAt || !(await this.#refreshTokens.revoke(stored.id))) {
      await this.#refreshTokens.revokeAllForUser(stored.userId);
      throw new UnauthorizedError(INVALID_SESSION);
    }
    if (stored.expiresAt.getTime() <= this.#now().getTime()) {
      throw new UnauthorizedError(INVALID_SESSION);
    }
    const user = await this.#users.findById(stored.userId);
    if (!user) throw new UnauthorizedError(INVALID_SESSION);
    return this.#openSession(user);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const stored = await this.#refreshTokens.findByHash(hashToken(refreshToken));
    if (stored) await this.#refreshTokens.revoke(stored.id);
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.#users.findById(userId);
    if (!user) throw new NotFoundError("Usuário não encontrado");
    return user;
  }

  async #openSession(user: User): Promise<Session> {
    const refreshToken = randomBytes(32).toString("base64url");
    await this.#refreshTokens.save({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(this.#now().getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });
    const accessToken = await this.#signer.sign({ id: user.id, role: user.role });
    return { user, accessToken, refreshToken };
  }
}
