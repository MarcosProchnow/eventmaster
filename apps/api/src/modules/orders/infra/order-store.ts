/**
 * API pública do módulo de pedidos para outros módulos dentro de uma mesma
 * transação (o módulo de pagamentos confirma, cancela e emite ingressos).
 */
import { randomBytes } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { DbOrTx, Tx } from "../../../db/client.ts";
import { orderItems, orders, tickets } from "../../../db/schema.ts";
import { adjustSold } from "../../events/infra/ticket-inventory.ts";
import type { Order, OrderItem, OrderStatus } from "../domain/order.ts";

type OrderRow = typeof orders.$inferSelect;

export async function loadItems(db: DbOrTx, orderId: string): Promise<OrderItem[]> {
  const rows = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.ticketTypeId));
  return rows.map((r) => ({
    ticketTypeId: r.ticketTypeId,
    quantity: r.quantity,
    unitPriceCents: r.unitPriceCents,
  }));
}

export const toOrder = (row: OrderRow, items: OrderItem[]): Order => ({
  id: row.id,
  userId: row.userId,
  eventId: row.eventId,
  status: row.status as OrderStatus,
  totalCents: row.totalCents,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
  items,
});

/** Bloqueia o pedido até o fim da transação. */
export async function lockOrder(tx: Tx, orderId: string): Promise<Order | null> {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  return row ? toOrder(row, await loadItems(tx, orderId)) : null;
}

export async function setOrderStatus(tx: Tx, orderId: string, status: OrderStatus): Promise<void> {
  await tx.update(orders).set({ status }).where(eq(orders.id, orderId));
}

/** Devolve ao estoque os ingressos reservados por um pedido. */
export async function releaseStock(tx: Tx, order: Order): Promise<void> {
  for (const item of order.items) await adjustSold(tx, item.ticketTypeId, -item.quantity);
}

/** Emite um ingresso por unidade comprada, com código aleatório não adivinhável. */
export async function issueTickets(tx: Tx, order: Order): Promise<void> {
  const values = order.items.flatMap((item) =>
    Array.from({ length: item.quantity }, () => ({
      orderId: order.id,
      ticketTypeId: item.ticketTypeId,
      code: randomBytes(16).toString("base64url"),
    })),
  );
  if (values.length > 0) await tx.insert(tickets).values(values);
}
