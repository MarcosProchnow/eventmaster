import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../../../db/client.ts";
import { refreshTokens } from "../../../db/schema.ts";
import type { RefreshTokenStore, StoredRefreshToken } from "../application/ports.ts";

export class DrizzleRefreshTokenStore implements RefreshTokenStore {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async save(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.#db.insert(refreshTokens).values(data);
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const [row] = await this.#db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    if (!row) return null;
    return { id: row.id, userId: row.userId, expiresAt: row.expiresAt, revokedAt: row.revokedAt };
  }

  /** O `WHERE revoked_at IS NULL` garante que só uma requisição concorrente vence. */
  async revoke(id: string): Promise<boolean> {
    const rows = await this.#db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    return rows.length === 1;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.#db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}
