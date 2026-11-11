/**
 * Transactional Outbox (ADR 0007): o evento de domínio é gravado na MESMA
 * transação da mudança de estado. Um worker (Fase 6) lê e entrega depois.
 */
import type { Tx } from "../../../db/client.ts";
import { outbox } from "../../../db/schema.ts";

export type DomainEventType = "order.paid" | "order.cancelled" | "order.expired" | "payment.refunded";

export async function enqueueDomainEvent(
  tx: Tx,
  type: DomainEventType,
  payload: Record<string, string | number>,
): Promise<void> {
  await tx.insert(outbox).values({ type, payload });
}
