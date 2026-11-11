import { eq, sql } from "drizzle-orm";
import type { Db } from "../../../db/client.ts";
import { users } from "../../../db/schema.ts";
import type { Role } from "../../../shared/actor.ts";
import { ConflictError } from "../../../shared/errors.ts";
import { isUniqueViolation } from "../../../shared/pg-errors.ts";
import type { NewUser, UserRepository } from "../application/ports.ts";
import type { User } from "../domain/user.ts";

const toUser = (row: typeof users.$inferSelect): User => ({ ...row, role: row.role as Role });

export class DrizzleUserRepository implements UserRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async create(data: NewUser): Promise<User> {
    try {
      const [row] = await this.#db.insert(users).values(data).returning();
      return toUser(row!);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("E-mail já cadastrado");
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.#db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
      .limit(1);
    return row ? toUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const [row] = await this.#db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toUser(row) : null;
  }
}
