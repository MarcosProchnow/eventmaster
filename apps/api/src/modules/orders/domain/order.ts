import { BusinessRuleError, ConflictError, NotFoundError } from "../../../shared/errors.ts";
import type { Event, TicketType } from "../../events/domain/event.ts";

export type OrderStatus = "reserved" | "paid" | "expired" | "cancelled" | "refunded";

export interface OrderItem {
  ticketTypeId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  userId: string;
  eventId: string;
  status: OrderStatus;
  totalCents: number;
  expiresAt: Date;
  createdAt: Date;
  items: OrderItem[];
}

export interface Ticket {
  id: string;
  orderId: string;
  ticketTypeId: string;
  code: string;
  checkedInAt: Date | null;
}

export interface RequestedItem {
  ticketTypeId: string;
  quantity: number;
}

export const RESERVATION_TTL_SECONDS = 15 * 60;
export const MAX_TICKETS_PER_ORDER = 10;

/**
 * Regra pura da reserva: valida o pedido contra o evento e o estoque (já
 * bloqueado pela transação) e calcula itens e total. Sem banco, sem HTTP.
 */
export function planReservation(input: {
  event: Event | null;
  ticketTypes: TicketType[];
  items: RequestedItem[];
  now: Date;
}): { items: OrderItem[]; totalCents: number } {
  const { event, ticketTypes, items, now } = input;
  if (!event || event.status !== "published") throw new NotFoundError("Evento não encontrado");
  if (event.startsAt.getTime() <= now.getTime()) {
    throw new BusinessRuleError("As vendas deste evento estão encerradas");
  }
  if (items.length === 0) throw new BusinessRuleError("Escolha ao menos um ingresso");
  if (new Set(items.map((i) => i.ticketTypeId)).size !== items.length) {
    throw new BusinessRuleError("Tipo de ingresso repetido no pedido");
  }
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
  if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1)) {
    throw new BusinessRuleError("Quantidade inválida");
  }
  if (totalQuantity > MAX_TICKETS_PER_ORDER) {
    throw new BusinessRuleError(`Máximo de ${MAX_TICKETS_PER_ORDER} ingressos por pedido`);
  }

  const byId = new Map(ticketTypes.map((t) => [t.id, t]));
  const planned = items.map((item) => {
    const type = byId.get(item.ticketTypeId);
    if (!type || type.eventId !== event.id) {
      throw new BusinessRuleError("Tipo de ingresso não pertence a este evento");
    }
    if (type.quantity - type.sold < item.quantity) {
      throw new ConflictError(`Ingressos insuficientes para "${type.name}"`);
    }
    return {
      ticketTypeId: type.id,
      quantity: item.quantity,
      unitPriceCents: type.priceCents,
    };
  });
  const totalCents = planned.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);
  return { items: planned, totalCents };
}

export const isExpired = (order: Pick<Order, "expiresAt">, now: Date) =>
  order.expiresAt.getTime() <= now.getTime();
