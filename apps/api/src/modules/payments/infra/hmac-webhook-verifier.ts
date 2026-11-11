import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookVerifier } from "../application/ports.ts";

const TOLERANCE_SECONDS = 5 * 60;

/** Assinatura esperada: HMAC-SHA256 de `"<timestamp>.<corpo>"`, em hexadecimal. */
export function signWebhook(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * Garante que o aviso veio de quem conhece o segredo e que não é um aviso
 * antigo reenviado (o timestamp faz parte do que é assinado).
 */
export class HmacWebhookVerifier implements WebhookVerifier {
  readonly #secret: string;
  readonly #now: () => Date;

  constructor(secret: string, now: () => Date = () => new Date()) {
    this.#secret = secret;
    this.#now = now;
  }

  verify(rawBody: string, timestamp: string | undefined, signature: string | undefined): boolean {
    if (!timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
    const age = Math.abs(this.#now().getTime() / 1000 - Number(timestamp));
    if (age > TOLERANCE_SECONDS) return false;
    const expected = Buffer.from(signWebhook(this.#secret, timestamp, rawBody), "hex");
    const received = Buffer.from(signature, "hex");
    // Comparação em tempo constante: não vaza quantos caracteres acertaram.
    return received.length === expected.length && timingSafeEqual(received, expected);
  }
}
