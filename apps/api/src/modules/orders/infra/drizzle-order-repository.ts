import { and, asc, desc, eq, lte } from "drizzle-orm";
import type { Db } from "../../../db/client.ts";
import { orderItems, orders, tickets } from "../../../db/schema.ts";
import { isUniqueViolation } from "../../../shared/pg-errors.ts";
import { adjustSold, findEvent, lockTicketTypes } from "../../events/infra/ticket-inventory.ts";
import { enqueueDomainEvent } from "../../notifications/infra/outbox.ts";
import type { OrderRepository, ReserveCommand } from "../application/ports.ts";
import { type Order, planReservation, RESERVATION_TTL_SECONDS, type Ticket } from "../domain/order.ts";
import { loadItems, releaseStock, setOrderStatus, toOrder } from "./order-store.ts";

const EXPIRE_BATCH = 100;

export class DrizzleOrderRepository implements OrderRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async reserve(command: ReserveCommand): Promise<Order | "duplicate"> {
    try {
      return await this.#db.transaction(async (tx) => {
        const event = await findEvent(tx, command.eventId);
        // A partir daqui, compras concorrentes dos mesmos tipos esperam esta transação.
        const locked = await lockTicketTypes(
          tx,
          command.items.map((i) => i.ticketTypeId),
        );
        const plan = planReservation({
          event,
          ticketTypes: locked,
          items: command.items,
          now: command.now,
        });

        for (const item of plan.items) await adjustSold(tx, item.ticketTypeId, item.quantity);

        const [row] = await tx
          .insert(orders)
          .values({
            userId: command.userId,
            eventId: command.eventId,
            totalCents: plan.totalCents,
            idempotencyKey: command.idempotencyKey,
            requestHash: command.requestHash,
            expiresAt: new Date(command.now.getTime() + RESERVATION_TTL_SECONDS * 1000),
          })
          .returning();
        await tx.insert(orderItems).values(plan.items.map((i) => ({ ...i, orderId: row!.id })));
        return toOrder(row!, plan.items);
      });
    } catch (error) {
      // Chave de idempotência repetida: a transação foi desfeita, o estoque não mudou.
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }

  async findById(id: string): Promise<Order | null> {
    const [row] = await this.#db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return row ? toOrder(row, await loadItems(this.#db, id)) : null;
  }

  async findByIdempotencyKey(userId: string, key: string) {
    const [row] = await this.#db
      .select()
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, key)))
      .limit(1);
    if (!row) return null;
    return { order: toOrder(row, await loadItems(this.#db, row.id)), requestHash: row.requestHash };
  }

  async listByUser(userId: string): Promise<Order[]> {
    const rows = await this.#db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(100);
    return Promise.all(rows.map(async (r) => toOrder(r, await loadItems(this.#db, r.id))));
  }

  async listTickets(orderId: string): Promise<Ticket[]> {
    const rows = await this.#db
      .select()
      .from(tickets)
      .where(eq(tickets.orderId, orderId))
      .orderBy(asc(tickets.createdAt), asc(tickets.id));
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      ticketTypeId: r.ticketTypeId,
      code: r.code,
      checkedInAt: r.checkedInAt,
    }));
  }

  async expireDue(now: Date): Promise<number> {
    return this.#db.transaction(async (tx) => {
      // SKIP LOCKED: pedidos sendo pagos neste instante ficam para a próxima rodada.
      const due = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.status, "reserved"), lte(orders.expiresAt, now)))
        .orderBy(asc(orders.expiresAt))
        .limit(EXPIRE_BATCH)
        .for("update", { skipLocked: true });
      for (const row of due) {
        const order = toOrder(row, await loadItems(tx, row.id));
        await setOrderStatus(tx, order.id, "expired");
        await releaseStock(tx, order);
        await enqueueDomainEvent(tx, "order.expired", { orderId: order.id, userId: order.userId });
      }
      return due.length;
    });
  }
}
