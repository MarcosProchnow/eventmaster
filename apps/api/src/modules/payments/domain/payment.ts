import type { OrderStatus } from "../../orders/domain/order.ts";

export type PaymentMethod = "pix" | "card" | "boleto";
export type PaymentStatus = "pending" | "approved" | "declined" | "refunded";
export type PaymentOutcome = "approved" | "declined";

/** O que o cliente precisa para concluir o pagamento, conforme o método. */
export type PaymentInstructions =
  | { kind: "pix"; copyPaste: string; expiresAt: string }
  | { kind: "boleto"; digitableLine: string; dueDate: string }
  | { kind: "card"; message: string };

export interface Payment {
  id: string;
  orderId: string;
  method: PaymentMethod;
  providerRef: string | null;
  status: PaymentStatus;
  amountCents: number;
  instructions: PaymentInstructions;
  createdAt: Date;
}

export type SettlementAction =
  /** Pedido pago: confirma, emite ingressos. */
  | "confirm"
  /** Dinheiro chegou, mas a reserva já não existe: devolve. */
  | "refund"
  /** Pagamento recusado: cancela o pedido e devolve o estoque. */
  | "cancel_order"
  /** Pagamento recusado de um pedido que já não estava reservado. */
  | "mark_declined"
  /** Aviso repetido: nada a fazer (idempotência, RNF02). */
  | "ignore";

/**
 * Regra pura: o que fazer quando o gateway avisa o resultado de um pagamento.
 * Um pagamento só é liquidado uma vez; avisos repetidos são ignorados.
 */
export function decideSettlement(
  paymentStatus: PaymentStatus,
  orderStatus: OrderStatus,
  outcome: PaymentOutcome,
): SettlementAction {
  if (paymentStatus !== "pending") return "ignore";
  if (outcome === "approved") return orderStatus === "reserved" ? "confirm" : "refund";
  return orderStatus === "reserved" ? "cancel_order" : "mark_declined";
}
