/**
 * API pública do módulo de eventos para outros módulos que participam de uma
 * mesma transação (ADR 0001). Só o módulo de eventos toca nas próprias tabelas.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "../../../db/client.ts";
import { events, ticketTypes } from "../../../db/schema.ts";
import type { Event, EventStatus, TicketType } from "../domain/event.ts";

export async function findEvent(tx: Tx, eventId: string): Promise<Event | null> {
  const [row] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
  return row ? { ...row, status: row.status as EventStatus } : null;
}

/**
 * Bloqueia as linhas dos tipos de ingresso (`SELECT ... FOR UPDATE`) até o fim
 * da transação (ADR 0006). A ordenação por id evita deadlock entre compras
 * simultâneas que envolvem os mesmos tipos.
 */
export async function lockTicketTypes(tx: Tx, ids: string[]): Promise<TicketType[]> {
  if (ids.length === 0) return [];
  const rows = await tx
    .select()
    .from(ticketTypes)
    .where(inArray(ticketTypes.id, ids))
    .orderBy(asc(ticketTypes.id))
    .for("update");
  return rows.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    name: r.name,
    priceCents: r.priceCents,
    quantity: r.quantity,
    sold: r.sold,
  }));
}

/** Soma (reserva) ou subtrai (devolução) do contador de ingressos comprometidos. */
export async function adjustSold(tx: Tx, ticketTypeId: string, delta: number): Promise<void> {
  await tx
    .update(ticketTypes)
    .set({ sold: sql`${ticketTypes.sold} + ${delta}` })
    .where(eq(ticketTypes.id, ticketTypeId));
}
