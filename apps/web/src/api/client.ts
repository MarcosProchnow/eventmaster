import { createApiClient } from "@eventmaster/api-client";

export type {
  Event,
  Order,
  Payment,
  Ticket,
  TicketType,
  User,
} from "@eventmaster/api-client";

/** Erro devolvido pela API, no formato `{ error: { code, message } }`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshing: Promise<boolean> | null = null;

/** Várias requisições com 401 ao mesmo tempo disparam uma única renovação. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(new URL("/v1/auth/refresh", location.origin), { method: "POST", credentials: "include" })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * O token de acesso dura 15 minutos. Quando a API responde 401, renova a
 * sessão com o cookie de refresh e repete a requisição uma vez.
 */
const fetchWithRefresh: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const retry = request.clone();
  const response = await fetch(request);
  const isAuthRoute = new URL(request.url).pathname.startsWith("/v1/auth/");
  if (response.status !== 401 || isAuthRoute) return response;
  return (await refreshSession()) ? fetch(retry) : response;
};

// Origem explícita: no navegador é a do próprio front (o Vite/servidor repassa
// `/v1` à API); nos testes (Node) evita URL relativa, que o `Request` do Node não aceita.
export const api = createApiClient({ baseUrl: location.origin, fetch: fetchWithRefresh });

interface ApiResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Devolve o corpo em caso de sucesso; lança `ApiError` caso contrário. */
export async function call<T>(result: Promise<ApiResult<T>>): Promise<T> {
  const { data, error, response } = await result;
  if (response.ok) return data as T;
  const body = (error as { error?: { code?: string; message?: string } } | undefined)?.error;
  throw new ApiError(
    response.status,
    body?.code ?? "unknown",
    body?.message ?? "Não foi possível concluir a operação.",
  );
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Não foi possível concluir a operação.";
