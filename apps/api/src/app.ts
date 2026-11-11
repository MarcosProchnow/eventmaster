import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
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
import { AuthService } from "./modules/identity/application/auth-service.ts";
import { ACCESS_COOKIE, authRoutes } from "./modules/identity/http/routes.ts";
import { Argon2PasswordHasher } from "./modules/identity/infra/argon2-password-hasher.ts";
import { DrizzleRefreshTokenStore } from "./modules/identity/infra/drizzle-refresh-token-store.ts";
import { DrizzleUserRepository } from "./modules/identity/infra/drizzle-user-repository.ts";
import { JoseAccessToken } from "./modules/identity/infra/jose-access-token.ts";
import { OrdersService } from "./modules/orders/application/orders-service.ts";
import { ordersRoutes } from "./modules/orders/http/routes.ts";
import { DrizzleOrderRepository } from "./modules/orders/infra/drizzle-order-repository.ts";
import { PaymentsService } from "./modules/payments/application/payments-service.ts";
import { paymentsRoutes } from "./modules/payments/http/routes.ts";
import { DrizzlePaymentRepository } from "./modules/payments/infra/drizzle-payment-repository.ts";
import { HmacWebhookVerifier } from "./modules/payments/infra/hmac-webhook-verifier.ts";
import { SandboxPaymentGateway } from "./modules/payments/infra/sandbox-gateway.ts";
import "./shared/actor.ts";
import { AppError } from "./shared/errors.ts";

export interface AppOptions {
  pool: pg.Pool;
  jwtSecret: string;
  /** Segredo compartilhado com o gateway para assinar os webhooks. */
  webhookSecret: string;
  /** Origem do front-end autorizada a fazer requisições de escrita. */
  webOrigin: string;
  cookieSecure: boolean;
  /** Tentativas por minuto e por IP em cadastro, login e refresh. */
  authRateLimitMax?: number;
  logger?: boolean;
}

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  unauthorized: 401,
  forbidden: 403,
  conflict: 409,
  business_rule: 422,
};

declare module "fastify" {
  interface FastifyInstance {
    /** Rotinas periódicas, disparadas por main.ts (e pelo worker na Fase 6). */
    jobs: { expireOrders: () => Promise<number> };
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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
    if (status === 429) {
      return reply.code(429).send({
        error: { code: "rate_limited", message: "Muitas tentativas. Tente novamente em instantes." },
      });
    }
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

  // A API só serve JSON; a CSP das páginas de documentação vem do swagger-ui (staticCSP).
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  // Limite em memória: suficiente para instância única (limitação registrada no ADR 0009).
  await app.register(rateLimit, { global: false });

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "EventMaster API",
        version: "0.3.0",
        description: "API de gestão de eventos e ingressos.",
      },
      tags: [
        { name: "Autenticação" },
        { name: "Eventos" },
        { name: "Pedidos" },
        { name: "Pagamentos" },
        { name: "Operação" },
      ],
      components: {
        securitySchemes: {
          cookieAuth: { type: "apiKey", in: "cookie", name: ACCESS_COOKIE },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs", staticCSP: true });

  const db = createDb(options.pool);
  const signer = new JoseAccessToken(options.jwtSecret);
  const authService = new AuthService({
    users: new DrizzleUserRepository(db),
    refreshTokens: new DrizzleRefreshTokenStore(db),
    hasher: new Argon2PasswordHasher(),
    signer,
  });
  const eventsService = new EventsService(new DrizzleEventRepository(db));
  const ordersService = new OrdersService(new DrizzleOrderRepository(db));
  const paymentsService = new PaymentsService({
    orders: ordersService,
    payments: new DrizzlePaymentRepository(db),
    gateway: new SandboxPaymentGateway(),
    webhookVerifier: new HmacWebhookVerifier(options.webhookSecret),
  });
  app.decorate("jobs", { expireOrders: () => ordersService.expireDue() });

  // Defesa extra contra CSRF: um navegador sempre envia `Origin` em requisições
  // de escrita vindas de outro site. Clientes sem `Origin` (curl, testes) não
  // carregam cookies de terceiros.
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (!SAFE_METHODS.has(request.method) && origin && origin !== options.webOrigin) {
      return reply
        .code(403)
        .send({ error: { code: "forbidden", message: "Origem não permitida" } });
    }
  });

  // Identifica o usuário pelo JWT de acesso no cookie httpOnly (ADR 0009).
  app.decorateRequest("actor", null);
  app.addHook("onRequest", async (request) => {
    const token = request.cookies[ACCESS_COOKIE];
    request.actor = token ? await signer.verify(token) : null;
  });

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

  await app.register(
    authRoutes({
      service: authService,
      cookieSecure: options.cookieSecure,
      rateLimitMax: options.authRateLimitMax ?? 10,
    }),
    { prefix: "/v1" },
  );
  await app.register(eventsRoutes({ service: eventsService }), { prefix: "/v1" });
  await app.register(ordersRoutes({ service: ordersService }), { prefix: "/v1" });
  await app.register(paymentsRoutes({ service: paymentsService }), { prefix: "/v1" });

  return app;
}
