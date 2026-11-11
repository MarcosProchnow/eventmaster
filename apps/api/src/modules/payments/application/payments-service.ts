import { z } from "zod";
import type { Actor } from "../../../shared/actor.ts";
import {
  BusinessRuleError,
  NotFoundError,
  UnauthorizedError,
} from "../../../shared/errors.ts";
import type { OrdersService } from "../../orders/application/orders-service.ts";
import { isExpired } from "../../orders/domain/order.ts";
import type { Payment, PaymentMethod, SettlementAction } from "../domain/payment.ts";
import type { PaymentGateway, PaymentRepository, WebhookVerifier } from "./ports.ts";

const webhookPayload = z.object({
  providerRef: z.string().min(1).max(200),
  status: z.enum(["approved", "declined"]),
});

interface Deps {
  orders: OrdersService;
  payments: PaymentRepository;
  gateway: PaymentGateway;
  webhookVerifier: WebhookVerifier;
  now?: () => Date;
}

export class PaymentsService {
  readonly #orders: OrdersService;
  readonly #payments: PaymentRepository;
  readonly #gateway: PaymentGateway;
  readonly #verifier: WebhookVerifier;
  readonly #now: () => Date;

  constructor(deps: Deps) {
    this.#orders = deps.orders;
    this.#payments = deps.payments;
    this.#gateway = deps.gateway;
    this.#verifier = deps.webhookVerifier;
    this.#now = deps.now ?? (() => new Date());
  }

  /**
   * Inicia o pagamento de um pedido reservado. Repetir a chamada devolve o
   * pagamento pendente já existente, sem criar outra cobrança.
   */
  async pay(actor: Actor, orderId: string, method: PaymentMethod): Promise<Payment> {
    const order = await this.#orders.getOrder(actor, orderId); // dono ou admin; senão 404
    if (order.status !== "reserved") {
      throw new BusinessRuleError("Este pedido não está aguardando pagamento");
    }
    if (isExpired(order, this.#now())) throw new BusinessRuleError("A reserva expirou");

    const pending = await this.#payments.findPendingByOrder(orderId);
    if (pending) return pending;

    const charge = await this.#gateway.createCharge({
      orderId,
      amountCents: order.totalCents,
      method,
    });
    const created = await this.#payments.create({
      orderId,
      method,
      providerRef: charge.providerRef,
      amountCents: order.totalCents,
      instructions: charge.instructions,
    });
    if (created !== "duplicate") return created;

    // Duas chamadas simultâneas: a outra criou o pagamento.
    const winner = await this.#payments.findPendingByOrder(orderId);
    if (!winner) throw new BusinessRuleError("Este pedido não está aguardando pagamento");
    return winner;
  }

  /**
   * Processa o aviso do gateway. A assinatura é verificada sobre o corpo
   * bruto ANTES de interpretar o conteúdo.
   */
  async handleWebhook(
    rawBody: string,
    timestamp: string | undefined,
    signature: string | undefined,
  ): Promise<SettlementAction> {
    if (!this.#verifier.verify(rawBody, timestamp, signature)) {
      throw new UnauthorizedError("Assinatura do webhook inválida");
    }
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new BusinessRuleError("Corpo do webhook inválido");
    }
    const parsed = webhookPayload.safeParse(json);
    if (!parsed.success) throw new BusinessRuleError("Corpo do webhook inválido");

    const action = await this.#payments.settle(parsed.data.providerRef, parsed.data.status);
    if (!action) throw new NotFoundError("Pagamento não encontrado");
    return action;
  }
}
