import { randomBytes, randomInt } from "node:crypto";
import type { ChargeRequest, PaymentGateway } from "../application/ports.ts";
import type { PaymentInstructions, PaymentMethod } from "../domain/payment.ts";

/**
 * Strategy (GoF): cada forma de pagamento sabe montar as próprias instruções.
 * Acrescentar um método novo é criar outra estratégia, sem tocar nas existentes.
 */
interface PaymentMethodStrategy {
  instructions(charge: ChargeRequest, now: Date): PaymentInstructions;
}

const pix: PaymentMethodStrategy = {
  instructions: (_charge, now) => ({
    kind: "pix",
    // Código fictício e independente da referência interna do gateway.
    copyPaste: `SANDBOX-PIX-${randomBytes(16).toString("hex")}`,
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
  }),
};

const boleto: PaymentMethodStrategy = {
  instructions: (_charge, now) => ({
    kind: "boleto",
    // Linha fictícia: 47 dígitos aleatórios, sem valor fora do sandbox.
    digitableLine: Array.from({ length: 47 }, () => randomInt(10)).join(""),
    dueDate: new Date(now.getTime() + 3 * 24 * 3_600_000).toISOString().slice(0, 10),
  }),
};

const card: PaymentMethodStrategy = {
  instructions: () => ({
    kind: "card",
    message: "Pagamento em análise. Em um provedor real, os dados do cartão são coletados pelo provedor, nunca por esta API.",
  }),
};

/** Factory: escolhe a estratégia pelo método. */
const STRATEGIES: Record<PaymentMethod, PaymentMethodStrategy> = { pix, boleto, card };

/**
 * Adaptador sandbox do gateway: não fala com provedor nenhum e não movimenta
 * dinheiro. A confirmação chega depois pelo webhook, como em um provedor real.
 */
export class SandboxPaymentGateway implements PaymentGateway {
  readonly #now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  async createCharge(request: ChargeRequest) {
    const providerRef = `sbx_${randomBytes(12).toString("hex")}`;
    const instructions = STRATEGIES[request.method].instructions(request, this.#now());
    return { providerRef, instructions };
  }
}
