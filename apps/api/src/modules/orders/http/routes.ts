import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor } from "../../../shared/actor.ts";
import { errorResponse } from "../../../shared/http-schemas.ts";
import { eventIdParams } from "../../events/http/schemas.ts";
import type { OrdersService } from "../application/orders-service.ts";
import {
  createOrderBody,
  idempotencyHeaders,
  orderIdParams,
  orderResponse,
  ticketResponse,
  toOrderDto,
  toTicketDto,
} from "./schemas.ts";

export function ordersRoutes({ service }: { service: OrdersService }): FastifyPluginAsyncZod {
  return async (app) => {
    const tags = ["Pedidos"];
    const security = [{ cookieAuth: [] }];

    app.post(
      "/events/:id/orders",
      {
        schema: {
          tags,
          summary: "Reserva ingressos de um evento (válida por 15 minutos)",
          description:
            "Exige o cabeçalho `Idempotency-Key`. Repetir a requisição com a mesma chave devolve o pedido já criado (200) em vez de reservar de novo. " +
            "Cada pessoa pode ter poucas reservas aguardando pagamento por evento (3 por padrão); acima disso a resposta é 422.",
          security,
          params: eventIdParams,
          headers: idempotencyHeaders,
          body: createOrderBody,
          response: {
            200: orderResponse,
            201: orderResponse,
            401: errorResponse,
            404: errorResponse,
            409: errorResponse,
            422: errorResponse,
          },
        },
      },
      async (request, reply) => {
        const actor = requireActor(request.actor);
        const { order, replayed } = await service.reserve(
          actor,
          request.params.id,
          request.headers["idempotency-key"],
          request.body.items,
        );
        return reply.code(replayed ? 200 : 201).send(toOrderDto(order));
      },
    );

    app.get(
      "/orders",
      {
        schema: {
          tags,
          summary: "Lista os pedidos do usuário autenticado",
          security,
          response: { 200: z.array(orderResponse), 401: errorResponse },
        },
      },
      async (request) => (await service.listMine(requireActor(request.actor))).map(toOrderDto),
    );

    app.get(
      "/orders/:id",
      {
        schema: {
          tags,
          summary: "Detalhe de um pedido",
          security,
          params: orderIdParams,
          response: { 200: orderResponse, 401: errorResponse, 404: errorResponse },
        },
      },
      async (request) =>
        toOrderDto(await service.getOrder(requireActor(request.actor), request.params.id)),
    );

    app.get(
      "/orders/:id/tickets",
      {
        schema: {
          tags,
          summary: "Ingressos emitidos de um pedido pago",
          security,
          params: orderIdParams,
          response: { 200: z.array(ticketResponse), 401: errorResponse, 404: errorResponse },
        },
      },
      async (request) => {
        const list = await service.listTickets(requireActor(request.actor), request.params.id);
        return list.map(toTicketDto);
      },
    );
  };
}
