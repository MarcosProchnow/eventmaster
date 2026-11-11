import type { Actor } from "../../../shared/actor.ts";
import type { SelfAssignableRole, User } from "../domain/user.ts";

export interface NewUser {
  email: string;
  name: string;
  passwordHash: string;
  role: SelfAssignableRole;
}

export interface UserRepository {
  /** Lança ConflictError se o e-mail já estiver cadastrado. */
  create(data: NewUser): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RefreshTokenStore {
  save(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  /** Revoga de forma atômica. Retorna `false` se já estava revogado. */
  revoke(id: string): Promise<boolean>;
  revokeAllForUser(userId: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}

export interface AccessTokenSigner {
  sign(actor: Actor): Promise<string>;
  /** Retorna `null` para token inválido, adulterado ou expirado. */
  verify(token: string): Promise<Actor | null>;
}
