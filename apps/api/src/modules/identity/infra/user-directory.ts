/** API pública do módulo de identidade: dados de contato para notificações. */
import { eq } from "drizzle-orm";
import type { Db } from "../../../db/client.ts";
import { users } from "../../../db/schema.ts";

export interface UserContact {
  name: string;
  email: string;
}

export async function findUserContact(db: Db, userId: string): Promise<UserContact | null> {
  const [row] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}
