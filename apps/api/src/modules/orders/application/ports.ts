import type { Order, RequestedItem, Ticket } from "../domain/order.ts";

export interface ReserveCommand {
  userId: string;
  eventId: string;
  idempotencyKey: string;
  requestHash: string;
  items: RequestedItem[];
  now: Date;
  maxActiveReservations: number;
}

export interface OrderRepository {
  /**
   * Reserva o estoque e cria o pedido em uma única transação. Retorna
   * `"duplicate"` se outra requisição com a mesma chave venceu a corrida.
   */
  reserve(command: ReserveCommand): Promise<Order | "duplicate">;
  findById(id: string): Promise<Order | null>;
  findByIdempotencyKey(
    userId: string,
    key: string,
  ): Promise<{ order: Order; requestHash: string } | null>;
  listByUser(userId: string): Promise<Order[]>;
  listTickets(orderId: string): Promise<Ticket[]>;
  /** Expira reservas vencidas e devolve o estoque. Retorna quantas expirou. */
  expireDue(now: Date): Promise<number>;
}
