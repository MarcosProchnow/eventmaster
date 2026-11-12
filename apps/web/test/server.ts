/**
 * Rede falsa dos testes (MSW). O app faz as requisições de verdade, com o
 * cliente tipado e o `fetch`; o MSW responde no nível da rede.
 */
import { http, HttpResponse } from "msw/http";
import { setupServer } from "msw/node";
import type { User } from "../src/api/client";

/** Mesmo formato de erro da API: `{ error: { code, message } }`. */
export const apiError = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status });

// Padrão: ninguém logado.
export const server = setupServer(
  http.get("*/v1/me", () => apiError(401, "unauthorized", "Faça login.")),
  http.post("*/v1/auth/refresh", () => apiError(401, "unauthorized", "Faça login.")),
);

export function signIn(user: User) {
  server.use(http.get("*/v1/me", () => HttpResponse.json(user)));
}
