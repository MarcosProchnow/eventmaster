import { asc, inArray, isNull } from "drizzle-orm";
import type { Db } from "../../../db/client.ts";
import { outbox } from "../../../db/schema.ts";
import type { OutboxMessage } from "../application/ports.ts";

/**
 * Relay do Transactional Outbox (ADR 0007): lê os eventos ainda não publicados
 * e os entrega à fila. Só marca como publicado depois que a fila aceitou; se o
 * processo cair no meio, o evento é publicado de novo (entrega "ao menos uma
 * vez"), e o consumidor trata a repetição.
 */
export async function relayOutbox(
  db: Db,
  publish: (message: OutboxMessage) => Promise<void>,
  batchSize = 50,
): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(outbox)
      .where(isNull(outbox.processedAt))
      .orderBy(asc(outbox.createdAt), asc(outbox.id))
      .limit(batchSize)
      // SKIP LOCKED: dois workers não publicam o mesmo lote.
      .for("update", { skipLocked: true });
    if (rows.length === 0) return 0;
    for (const row of rows) {
      await publish({
        outboxId: row.id,
        type: row.type,
        payload: row.payload as Record<string, unknown>,
      });
    }
    await tx
      .update(outbox)
      .set({ processedAt: new Date() })
      .where(
        inArray(
          outbox.id,
          rows.map((r) => r.id),
        ),
      );
    return rows.length;
  });
}
