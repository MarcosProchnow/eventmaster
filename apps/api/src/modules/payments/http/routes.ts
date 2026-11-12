import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor } from "../../../shared/actor.ts";
import { errorResponse } from "../../../shared/http-schemas.ts";
import { orderIdParams } from "../../orders/http/schemas.ts";
import type { PaymentsService } from "../application/payments-service.ts";
import type { Payment } from "../domain/payment.ts";

const payBody = z.strictObject({ method: z.enum(["pix", "card", "boleto"]) });

const instructions = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pix"), copyPaste: z.string(), expiresAt: z.string() }),
  z.object({ kind: z.literal("boleto"), digitableLine: z.string(), dueDate: z.string() }),
  z.object({ kind: z.literal("card"), message: z.string() }),
]);

const paymentResponse = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  method: z.enum(["pix", "card", "boleto"]),
  status: z.enum(["pending", "approved", "declined", "refunded"]),
  amountCents: z.number().int(),
  instructions,
});

/** Não expõe `providerRef`: é o identificador usado pelo gateway no webhook. */
const toPaymentDto = (p: Payment): z.infer<typeof paymentResponse> => ({
  id: p.id,
  orderId: p.orderId,
  method: p.method,
  status: p.status,
  amountCents: p.amountCents,
  instructions: p.instructions,
});

const header = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function paymentsRoutes({ service }: { service: PaymentsService }): FastifyPluginAsyncZod {
  return async (app) => {
    const tags = ["Pagamentos"];

    app.post(
      "/orders/:id/pay",
      {
        schema: {
          tags,
          summary: "Inicia o pagamento de um pedido reservado",
          description:
            "Devolve as instruções de pagamento. A confirmação chega depois, pelo webhook do gateway. Repetir a chamada devolve o pagamento pendente existente.",
          security: [{ cookieAuth: [] }],
          params: orderIdParams,
          body: payBody,
          response: {
            201: paymentResponse,
            401: errorResponse,
            404: errorResponse,
            422: errorResponse,
          },
        },
      },
      async (request, reply) => {
        const payment = await service.pay(
          requireActor(request.actor),
          request.params.id,
          request.body.method,
        );
        return reply.code(201).send(toPaymentDto(payment));
      },
    );

    // Plugin encapsulado: só aqui o corpo JSON chega como texto bruto, porque a
    // assinatura do webhook é calculada sobre os bytes exatos enviados.
    await app.register(async (webhooks) => {
      webhooks.addContentTypeParser(
        "application/json",
        { parseAs: "string", bodyLimit: 16_384 },
        (_request, body, done) => done(null, body),
      );

      webhooks.post(
        "/webhooks/payments",
        {
          schema: {
            tags,
            summary: "Aviso do gateway de pagamento (webhook assinado)",
            description:
              "Autenticado por HMAC-SHA256 de `<x-webhook-timestamp>.<corpo>` no cabeçalho `x-webhook-signature`. Avisos repetidos não têm efeito.",
            response: {
              200: z.object({ received: z.literal(true) }),
              401: errorResponse,
              404: errorResponse,
              422: errorResponse,
            },
          },
        },
        async (request) => {
          await service.handleWebhook(
            typeof request.body === "string" ? request.body : "",
            header(request.headers["x-webhook-timestamp"]),
            header(request.headers["x-webhook-signature"]),
          );
          return { received: true as const };
        },
      );
    });
  };
}
