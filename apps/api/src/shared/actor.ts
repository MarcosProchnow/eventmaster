import { UnauthorizedError } from "./errors.ts";

export type Role = "attendee" | "organizer" | "admin";

/** Quem está fazendo a requisição, extraído do token de acesso (ADR 0009). */
export interface Actor {
  id: string;
  role: Role;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Preenchido por um hook em app.ts; `null` para requisições anônimas. */
    actor: Actor | null;
  }
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new UnauthorizedError();
  return actor;
}
