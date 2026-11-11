import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type pg from "pg";
import { createDb } from "./db/client.ts";
import { EventsService } from "./modules/events/application/events-service.ts";
import { eventsRoutes } from "./modules/events/http/routes.ts";
import { DrizzleEventRepository } from "./modules/events/infra/drizzle-event-repository.ts";
import { makeActorResolver } from "./shared/actor.ts";
import { AppError } from "./shared/errors.ts";

export interface AppOptions {
  pool: pg.Pool;
  allowDevAuth: boolean;
  logger?: boolean;
}

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  unauthorized: 401,
  forbidden: 403,
  conflict: 409,
  business_rule: 422,
};

/**
 * Composition root: monta os adaptadores e injeta as dependências.
 * Exporta a fábrica (sem `listen`) para os testes usarem `app.inject()`.
 */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .code(STATUS_BY_CODE[error.code] ?? 400)
        .send({ error: { code: error.code, message: error.message } });
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        error: {
          code: "validation",
          message: "Dados de entrada inválidos",
          details: error.validation.map((issue) => ({
            path: issue.instancePath,
            message: issue.message ?? "inválido",
          })),
        },
      });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return reply
        .code(status)
        .send({ error: { code: "bad_request", message: "Requisição inválida" } });
    }
    // Erro inesperado: registra o detalhe e não o expõe ao cliente.
    request.log.error(error);
    return reply.code(500).send({ error: { code: "internal", message: "Erro interno" } });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: { code: "not_found", message: "Rota não encontrada" } }),
  );

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "EventMaster API",
        version: "0.1.0",
        description: "API de gestão de eventos e ingressos.",
      },
      tags: [{ name: "Eventos" }, { name: "Operação" }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  const db = createDb(options.pool);
  const eventsService = new EventsService(new DrizzleEventRepository(db));
  const resolveActor = makeActorResolver(options.allowDevAuth);

  app.get("/health", { schema: { tags: ["Operação"], summary: "Liveness" } }, async () => ({
    status: "ok",
  }));

  app.get(
    "/ready",
    { schema: { tags: ["Operação"], summary: "Readiness (verifica o banco)" } },
    async (_request, reply) => {
      try {
        await options.pool.query("select 1");
        return { status: "ready" };
      } catch {
        return reply.code(503).send({ status: "unavailable" });
      }
    },
  );

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  await app.register(eventsRoutes({ service: eventsService, resolveActor }), { prefix: "/v1" });

  return app;
}
