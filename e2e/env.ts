/**
 * Ambiente dos testes E2E. Portas próprias (não colidem com `pnpm dev`) e
 * segredos fixos só de teste: a API sobe com eles e o teste assina o webhook
 * com o mesmo segredo, fazendo o papel do gateway de pagamento.
 */
export const API_PORT = 3100;
export const WEB_PORT = 5174;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://eventmaster:eventmaster@localhost:5432/eventmaster_test";

export const WEBHOOK_SECRET = "segredo-de-webhook-somente-para-testes-e2e";
export const JWT_SECRET = "segredo-jwt-somente-para-testes-e2e-0123456789";
