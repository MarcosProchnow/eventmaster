import { createHash } from "node:crypto";
import type { Actor } from "../../../shared/actor.ts";
import { BusinessRuleError, NotFoundError } from "../../../shared/errors.ts";
import type { Order, RequestedItem, Ticket } from "../domain/order.ts";
import type { OrderRepository } from "./ports.ts";

/** Hash estável do conteúdo do pedido, independente da ordem dos itens. */
function hashRequest(eventId: string, items: RequestedItem[]): string {
  const canonical = items
    .toSorted((a, b) => a.ticketTypeId.localeCompare(b.ticketTypeId))
    .map((i) => `${i.ticketTypeId}:${i.quantity}`)
    .join(",");
  return createHash("sha256").update(`${eventId}|${canonical}`).digest("hex");
}

export class OrdersService {
  readonly #repo: OrderRepository;
  readonly #now: () => Date;

  constructor(repo: OrderRepository, now: () => Date = () => new Date()) {
    this.#repo = repo;
    this.#now = now;
  }

  /**
   * Reserva ingressos. Repetir a requisição com a mesma `Idempotency-Key`
   * devolve o pedido já criado, sem reservar de novo (RNF02).
   */
  async reserve(
    actor: Actor,
    eventId: string,
    idempotencyKey: string,
    items: RequestedItem[],
  ): Promise<{ order: Order; replayed: boolean }> {
    const requestHash = hashRequest(eventId, items);
    const replay = await this.#findReplay(actor.id, idempotencyKey, requestHash);
    if (replay) return { order: replay, replayed: true };

    const result = await this.#repo.reserve({
      userId: actor.id,
      eventId,
      idempotencyKey,
      requestHash,
      items,
      now: this.#now(),
    });
    if (result !== "duplicate") return { order: result, replayed: false };

    // Duas requisições iguais chegaram juntas: a outra criou o pedido.
    const winner = await this.#findReplay(actor.id, idempotencyKey, requestHash);
    if (!winner) throw new Error("pedido duplicado não encontrado após conflito");
    return { order: winner, replayed: true };
  }

  /** Pedido de outra pessoa responde "não encontrado" (BOLA, RNF04). */
  async getOrder(actor: Actor, id: string): Promise<Order> {
    const order = await this.#repo.findById(id);
    if (!order || (order.userId !== actor.id && actor.role !== "admin")) {
      throw new NotFoundError("Pedido não encontrado");
    }
    return order;
  }

  listMine(actor: Actor): Promise<Order[]> {
    return this.#repo.listByUser(actor.id);
  }

  async listTickets(actor: Actor, orderId: string): Promise<Ticket[]> {
    await this.getOrder(actor, orderId);
    return this.#repo.listTickets(orderId);
  }

  expireDue(): Promise<number> {
    return this.#repo.expireDue(this.#now());
  }

  async #findReplay(userId: string, key: string, requestHash: string): Promise<Order | null> {
    const existing = await this.#repo.findByIdempotencyKey(userId, key);
    if (!existing) return null;
    if (existing.requestHash !== requestHash) {
      throw new BusinessRuleError("Idempotency-Key já usada com outro conteúdo");
    }
    return existing.order;
  }
}
