import type {
  Payment,
  PaymentInstructions,
  PaymentMethod,
  PaymentOutcome,
  SettlementAction,
} from "../domain/payment.ts";

export interface ChargeRequest {
  orderId: string;
  amountCents: number;
  method: PaymentMethod;
}

/**
 * Porta do gateway de pagamento (ADR 0008). O domínio não conhece o provedor:
 * trocar o adaptador sandbox por um provedor real não muda os casos de uso.
 */
export interface PaymentGateway {
  createCharge(
    request: ChargeRequest,
  ): Promise<{ providerRef: string; instructions: PaymentInstructions }>;
}

export interface NewPayment {
  orderId: string;
  method: PaymentMethod;
  providerRef: string;
  amountCents: number;
  instructions: PaymentInstructions;
}

export interface PaymentRepository {
  /** Retorna `"duplicate"` se já existe um pagamento pendente para o pedido. */
  create(data: NewPayment): Promise<Payment | "duplicate">;
  findPendingByOrder(orderId: string): Promise<Payment | null>;
  /**
   * Liquida o pagamento em uma única transação (pagamento, pedido, estoque,
   * ingressos e outbox). Retorna `null` se a referência não existir.
   */
  settle(providerRef: string, outcome: PaymentOutcome): Promise<SettlementAction | null>;
}

export interface WebhookVerifier {
  /** `true` só se a assinatura confere e o aviso é recente. */
  verify(rawBody: string, timestamp: string | undefined, signature: string | undefined): boolean;
}
