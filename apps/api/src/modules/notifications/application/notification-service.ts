import { buildEmail } from "../domain/templates.ts";
import type { ContactDirectory, Mailer, NotificationLog, OutboxMessage } from "./ports.ts";

interface Deps {
  mailer: Mailer;
  log: NotificationLog;
  contacts: ContactDirectory;
  /** Endereço do front-end, para montar o link do pedido. */
  webOrigin: string;
}

export type HandleResult = "sent" | "already_sent" | "skipped";

/**
 * Consumidor dos eventos de domínio (o "observador" do pedido). A fila entrega
 * ao menos uma vez, então o tratamento é idempotente: o mesmo evento não gera
 * dois e-mails. Se o envio falhar, o erro sobe e a fila tenta de novo.
 */
export class NotificationService {
  readonly #deps: Deps;

  constructor(deps: Deps) {
    this.#deps = deps;
  }

  async handle(message: OutboxMessage): Promise<HandleResult> {
    const { orderId, userId } = message.payload;
    if (typeof orderId !== "string" || typeof userId !== "string") return "skipped";

    const contact = await this.#deps.contacts.find(userId);
    if (!contact) return "skipped";

    const email = buildEmail(message.type, {
      userName: contact.name,
      orderUrl: `${this.#deps.webOrigin}/pedidos/${orderId}`,
    });
    if (!email) return "skipped";

    const state = await this.#deps.log.begin({
      outboxId: message.outboxId,
      userId,
      type: message.type,
    });
    if (state === "already_sent") return "already_sent";

    await this.#deps.mailer.send({ to: contact.email, ...email });
    await this.#deps.log.markSent(message.outboxId);
    return "sent";
  }

  /** Chamado quando a fila desiste após esgotar as tentativas (dead-letter). */
  async markDead(message: OutboxMessage): Promise<void> {
    await this.#deps.log.markFailed(message.outboxId);
  }
}
