import { and, eq } from "drizzle-orm";
import type { Db } from "../../../db/client.ts";
import { payments } from "../../../db/schema.ts";
import { isUniqueViolation } from "../../../shared/pg-errors.ts";
import { enqueueDomainEvent } from "../../notifications/infra/outbox.ts";
import {
  issueTickets,
  lockOrder,
  releaseStock,
  setOrderStatus,
} from "../../orders/infra/order-store.ts";
import type { NewPayment, PaymentRepository } from "../application/ports.ts";
import {
  decideSettlement,
  type Payment,
  type PaymentInstructions,
  type PaymentMethod,
  type PaymentOutcome,
  type PaymentStatus,
  type SettlementAction,
} from "../domain/payment.ts";

const toPayment = (row: typeof payments.$inferSelect): Payment => ({
  id: row.id,
  orderId: row.orderId,
  method: row.method as PaymentMethod,
  providerRef: row.providerRef,
  status: row.status as PaymentStatus,
  amountCents: row.amountCents,
  instructions: row.instructions as PaymentInstructions,
  createdAt: row.createdAt,
});

export class DrizzlePaymentRepository implements PaymentRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async create(data: NewPayment): Promise<Payment | "duplicate"> {
    try {
      const [row] = await this.#db.insert(payments).values(data).returning();
      return toPayment(row!);
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate";
      throw error;
    }
  }

  async findPendingByOrder(orderId: string): Promise<Payment | null> {
    const [row] = await this.#db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.status, "pending")))
      .limit(1);
    return row ? toPayment(row) : null;
  }

  async settle(providerRef: string, outcome: PaymentOutcome): Promise<SettlementAction | null> {
    return this.#db.transaction(async (tx) => {
      // Bloqueia o pagamento: avisos repetidos e simultâneos são processados um por vez.
      const [row] = await tx
        .select()
        .from(payments)
        .where(eq(payments.providerRef, providerRef))
        .for("update");
      if (!row) return null;
      const order = await lockOrder(tx, row.orderId);
      if (!order) return null;

      const action = decideSettlement(row.status as PaymentStatus, order.status, outcome);
      const setPayment = (status: PaymentStatus) =>
        tx.update(payments).set({ status }).where(eq(payments.id, row.id));
      const event = { orderId: order.id, userId: order.userId };

      switch (action) {
        case "confirm":
          await setPayment("approved");
          await setOrderStatus(tx, order.id, "paid");
          await issueTickets(tx, order);
          await enqueueDomainEvent(tx, "order.paid", event);
          break;
        case "refund":
          // Sandbox: o estorno é só o registro. Em um provedor real, chamaria a API de estorno.
          await setPayment("refunded");
          await enqueueDomainEvent(tx, "payment.refunded", event);
          break;
        case "cancel_order":
          await setPayment("declined");
          await setOrderStatus(tx, order.id, "cancelled");
          await releaseStock(tx, order);
          await enqueueDomainEvent(tx, "order.cancelled", event);
          break;
        case "mark_declined":
          await setPayment("declined");
          break;
        case "ignore":
          break;
      }
      return action;
    });
  }
}
