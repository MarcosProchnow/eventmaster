import { and, eq, ne } from "drizzle-orm";
import type { Db } from "../../../db/client.ts";
import { notifications } from "../../../db/schema.ts";
import type { NotificationLog } from "../application/ports.ts";

export class DrizzleNotificationLog implements NotificationLog {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async begin(entry: { outboxId: string; userId: string; type: string }) {
    await this.#db
      .insert(notifications)
      .values(entry)
      .onConflictDoNothing({ target: notifications.outboxId });
    const [row] = await this.#db
      .select({ status: notifications.status })
      .from(notifications)
      .where(eq(notifications.outboxId, entry.outboxId))
      .limit(1);
    return row?.status === "sent" ? ("already_sent" as const) : ("pending" as const);
  }

  async markSent(outboxId: string): Promise<void> {
    await this.#db
      .update(notifications)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(notifications.outboxId, outboxId));
  }

  async markFailed(outboxId: string): Promise<void> {
    // Não rebaixa um e-mail que já foi entregue.
    await this.#db
      .update(notifications)
      .set({ status: "failed" })
      .where(and(eq(notifications.outboxId, outboxId), ne(notifications.status, "sent")));
  }
}
