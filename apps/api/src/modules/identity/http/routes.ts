import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor } from "../../../shared/actor.ts";
import { UnauthorizedError } from "../../../shared/errors.ts";
import { errorResponse } from "../../../shared/http-schemas.ts";
import type { AuthService, Session } from "../application/auth-service.ts";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "../domain/user.ts";
import { loginBody, registerBody, toUserDto, userResponse } from "./schemas.ts";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
/** O refresh token só é enviado pelo navegador às rotas de autenticação. */
const REFRESH_PATH = "/v1/auth";

interface Deps {
  service: AuthService;
  cookieSecure: boolean;
  /** Máximo de tentativas por minuto e por IP nas rotas sensíveis. */
  rateLimitMax: number;
}

export function authRoutes({ service, cookieSecure, rateLimitMax }: Deps): FastifyPluginAsyncZod {
  // httpOnly: JavaScript da página não lê o token (reduz o impacto de XSS).
  // sameSite strict: o navegador não envia o cookie em requisições de outros sites (CSRF).
  const base = { httpOnly: true, secure: cookieSecure, sameSite: "strict" } as const;

  const setSession = (reply: FastifyReply, session: Session) =>
    reply
      .setCookie(ACCESS_COOKIE, session.accessToken, {
        ...base,
        path: "/",
        maxAge: ACCESS_TOKEN_TTL_SECONDS,
      })
      .setCookie(REFRESH_COOKIE, session.refreshToken, {
        ...base,
        path: REFRESH_PATH,
        maxAge: REFRESH_TOKEN_TTL_SECONDS,
      });

  const clearSession = (reply: FastifyReply) =>
    reply
      .clearCookie(ACCESS_COOKIE, { ...base, path: "/" })
      .clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });

  return async (app) => {
    const tags = ["Autenticação"];
    const rateLimit = { rateLimit: { max: rateLimitMax, timeWindow: "1 minute" } };

    app.post(
      "/auth/register",
      {
        config: rateLimit,
        schema: {
          tags,
          summary: "Cadastra um usuário e abre a sessão",
          body: registerBody,
          response: { 201: userResponse, 409: errorResponse, 429: errorResponse },
        },
      },
      async (request, reply) => {
        const session = await service.register(request.body);
        return setSession(reply, session).code(201).send(toUserDto(session.user));
      },
    );

    app.post(
      "/auth/login",
      {
        config: rateLimit,
        schema: {
          tags,
          summary: "Abre a sessão com e-mail e senha",
          body: loginBody,
          response: { 200: userResponse, 401: errorResponse, 429: errorResponse },
        },
      },
      async (request, reply) => {
        const session = await service.login(request.body.email, request.body.password);
        return setSession(reply, session).send(toUserDto(session.user));
      },
    );

    app.post(
      "/auth/refresh",
      {
        config: rateLimit,
        schema: {
          tags,
          summary: "Renova a sessão usando o cookie de refresh (rotação)",
          response: { 200: userResponse, 401: errorResponse, 429: errorResponse },
        },
      },
      async (request, reply) => {
        const token = request.cookies[REFRESH_COOKIE];
        try {
          if (!token) throw new UnauthorizedError("Sessão inválida ou expirada");
          const session = await service.refresh(token);
          return setSession(reply, session).send(toUserDto(session.user));
        } catch (error) {
          if (error instanceof UnauthorizedError) clearSession(reply);
          throw error;
        }
      },
    );

    app.post(
      "/auth/logout",
      {
        schema: {
          tags,
          summary: "Encerra a sessão",
          response: { 204: z.null().describe("Sessão encerrada") },
        },
      },
      async (request, reply) => {
        await service.logout(request.cookies[REFRESH_COOKIE]);
        return clearSession(reply).code(204).send(null);
      },
    );

    app.get(
      "/me",
      {
        schema: {
          tags,
          summary: "Dados do usuário autenticado",
          security: [{ cookieAuth: [] }],
          response: { 200: userResponse, 401: errorResponse },
        },
      },
      async (request) => toUserDto(await service.getProfile(requireActor(request.actor).id)),
    );
  };
}
