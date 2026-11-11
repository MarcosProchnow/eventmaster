import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { UnauthorizedError } from "./errors.ts";

export type Role = "attendee" | "organizer" | "admin";

export interface Actor {
  id: string;
  role: Role;
}

const headerSchema = z.object({
  id: z.uuid(),
  role: z.enum(["attendee", "organizer", "admin"]),
});

/**
 * PROVISÓRIO (Fase 3): identifica o usuário pelos cabeçalhos `x-dev-user-id` e
 * `x-dev-role`, apenas quando ALLOW_DEV_AUTH=true. Não é autenticação real e
 * será substituído por JWT + cookie na Fase 4 (ADR 0009).
 */
export function makeActorResolver(allowDevAuth: boolean) {
  return function resolveActor(request: FastifyRequest): Actor | null {
    if (!allowDevAuth) return null;
    const parsed = headerSchema.safeParse({
      id: request.headers["x-dev-user-id"],
      role: request.headers["x-dev-role"],
    });
    return parsed.success ? parsed.data : null;
  };
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new UnauthorizedError();
  return actor;
}
