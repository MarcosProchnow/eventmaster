import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { type Actor, requireActor } from "../../../shared/actor.ts";
import type { EventsService } from "../application/events-service.ts";
import {
  createEventBody,
  createTicketTypeBody,
  errorResponse,
  eventIdParams,
  eventListResponse,
  eventResponse,
  listEventsQuery,
  ticketTypeResponse,
  toEventDto,
  toTicketTypeDto,
  updateEventBody,
} from "./schemas.ts";

interface Deps {
  service: EventsService;
  resolveActor: (request: FastifyRequest) => Actor | null;
}

const toDate = (value: string | undefined) => (value === undefined ? undefined : new Date(value));

/** Adaptador de entrada: traduz HTTP para casos de uso. Sem regra de negócio aqui. */
export function eventsRoutes({ service, resolveActor }: Deps): FastifyPluginAsyncZod {
  return async (app) => {
    const tags = ["Eventos"];

    app.get(
      "/events",
      {
        schema: {
          tags,
          summary: "Lista eventos publicados",
          querystring: listEventsQuery,
          response: { 200: eventListResponse },
        },
      },
      async (request) => {
        const { page, pageSize, q, city } = request.query;
        const { items, total } = await service.listPublished({ page, pageSize, q, city });
        return { items: items.map(toEventDto), total, page, pageSize };
      },
    );

    app.post(
      "/events",
      {
        schema: {
          tags,
          summary: "Cria um evento em rascunho",
          body: createEventBody,
          response: { 201: eventResponse, 401: errorResponse, 403: errorResponse, 422: errorResponse },
        },
      },
      async (request, reply) => {
        const actor = requireActor(resolveActor(request));
        const event = await service.createEvent(actor, {
          ...request.body,
          startsAt: new Date(request.body.startsAt),
          endsAt: new Date(request.body.endsAt),
        });
        return reply.code(201).send(toEventDto(event));
      },
    );

    app.get(
      "/events/:id",
      {
        schema: {
          tags,
          summary: "Detalhe de um evento",
          params: eventIdParams,
          response: { 200: eventResponse, 404: errorResponse },
        },
      },
      async (request) => toEventDto(await service.getEvent(resolveActor(request), request.params.id)),
    );

    app.patch(
      "/events/:id",
      {
        schema: {
          tags,
          summary: "Altera um evento",
          params: eventIdParams,
          body: updateEventBody,
          response: { 200: eventResponse, 401: errorResponse, 404: errorResponse, 422: errorResponse },
        },
      },
      async (request) => {
        const actor = requireActor(resolveActor(request));
        const { startsAt, endsAt, title, description, venue, city } = request.body;
        const event = await service.updateEvent(actor, request.params.id, {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(venue !== undefined && { venue }),
          ...(city !== undefined && { city }),
          ...(startsAt !== undefined && { startsAt: toDate(startsAt)! }),
          ...(endsAt !== undefined && { endsAt: toDate(endsAt)! }),
        });
        return toEventDto(event);
      },
    );

    app.post(
      "/events/:id/publish",
      {
        schema: {
          tags,
          summary: "Publica um evento em rascunho",
          params: eventIdParams,
          response: { 200: eventResponse, 401: errorResponse, 404: errorResponse, 422: errorResponse },
        },
      },
      async (request) =>
        toEventDto(
          await service.publishEvent(requireActor(resolveActor(request)), request.params.id),
        ),
    );

    app.post(
      "/events/:id/cancel",
      {
        schema: {
          tags,
          summary: "Cancela um evento",
          params: eventIdParams,
          response: { 200: eventResponse, 401: errorResponse, 404: errorResponse, 422: errorResponse },
        },
      },
      async (request) =>
        toEventDto(
          await service.cancelEvent(requireActor(resolveActor(request)), request.params.id),
        ),
    );

    app.get(
      "/events/:id/ticket-types",
      {
        schema: {
          tags,
          summary: "Lista os tipos de ingresso de um evento",
          params: eventIdParams,
          response: { 200: z.array(ticketTypeResponse), 404: errorResponse },
        },
      },
      async (request) => {
        const list = await service.listTicketTypes(resolveActor(request), request.params.id);
        return list.map(toTicketTypeDto);
      },
    );

    app.post(
      "/events/:id/ticket-types",
      {
        schema: {
          tags,
          summary: "Adiciona um tipo de ingresso ao evento",
          params: eventIdParams,
          body: createTicketTypeBody,
          response: {
            201: ticketTypeResponse,
            401: errorResponse,
            404: errorResponse,
            409: errorResponse,
            422: errorResponse,
          },
        },
      },
      async (request, reply) => {
        const actor = requireActor(resolveActor(request));
        const created = await service.addTicketType(actor, request.params.id, request.body);
        return reply.code(201).send(toTicketTypeDto(created));
      },
    );
  };
}
