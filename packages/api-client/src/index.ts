/**
 * Cliente tipado da API, gerado do contrato OpenAPI (ADR 0003).
 * `schema.d.ts` é gerado por `pnpm run generate`; não edite à mão.
 */
import createClient, { type ClientOptions } from "openapi-fetch";
import type { paths } from "./schema";

export type { paths };

export function createApiClient(options: ClientOptions = {}) {
  return createClient<paths>({ credentials: "include", ...options });
}

type Json<T> = T extends { content: { "application/json": infer B } } ? B : never;

/** Corpo JSON da resposta de sucesso de uma operação. */
export type ResponseOf<
  P extends keyof paths,
  M extends keyof paths[P],
  S extends number = 200,
> = paths[P][M] extends { responses: infer R } ? (S extends keyof R ? Json<R[S]> : never) : never;

export type User = ResponseOf<"/v1/me", "get">;
export type Event = ResponseOf<"/v1/events/{id}", "get">;
export type TicketType = ResponseOf<"/v1/events/{id}/ticket-types", "get">[number];
export type Order = ResponseOf<"/v1/orders/{id}", "get">;
export type Ticket = ResponseOf<"/v1/orders/{id}/tickets", "get">[number];
export type Payment = ResponseOf<"/v1/orders/{id}/pay", "post", 201>;
