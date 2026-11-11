/**
 * Simula o aviso do gateway em desenvolvimento:
 *   pnpm run sandbox:webhook <providerRef> approved|declined
 * O providerRef aparece em `payments.payments.provider_ref`.
 */
import { signWebhook } from "./hmac-webhook-verifier.ts";

const [providerRef, status] = process.argv.slice(2);
const secret = process.env.WEBHOOK_SECRET;
const baseUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

if (!providerRef || (status !== "approved" && status !== "declined") || !secret) {
  console.error("Uso: WEBHOOK_SECRET=... sandbox:webhook <providerRef> approved|declined");
  process.exit(1);
}

const body = JSON.stringify({ providerRef, status });
const timestamp = String(Math.floor(Date.now() / 1000));
const response = await fetch(`${baseUrl}/v1/webhooks/payments`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-webhook-timestamp": timestamp,
    "x-webhook-signature": signWebhook(secret, timestamp, body),
  },
  body,
});
console.log(response.status, await response.text());
