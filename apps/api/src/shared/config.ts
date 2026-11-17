import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET deve ter ao menos 32 caracteres"),
  WEBHOOK_SECRET: z.string().min(32, "WEBHOOK_SECRET deve ter ao menos 32 caracteres"),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  // Endereços dos proxies confiáveis à frente da API, separados por vírgula (IPs, CIDRs ou
  // `loopback`, `uniquelocal`). Vazio = ignora X-Forwarded-For, que o cliente poderia forjar.
  TRUST_PROXY: z.string().trim().default(""),
  // Vazio ou ausente = padrão do domínio. Acima do padrão só faz sentido em teste de carga.
  // Tentativas por minuto e IP em cadastro, login e refresh. Vazio = padrão (10). Só o teste de carga o aumenta.
  AUTH_RATE_LIMIT_MAX: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().int().min(1).max(100_000).optional(),
  ),
  MAX_ACTIVE_RESERVATIONS: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().int().min(1).max(100_000).optional(),
  ),
});

export interface Config {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  webhookSecret: string;
  webOrigin: string;
  /** Cookies só trafegam por HTTPS em produção. */
  cookieSecure: boolean;
  /** Proxies confiáveis; deles o IP do cliente (rate limit, logs) vem do X-Forwarded-For. */
  trustProxy: string | undefined;
  /** Reservas aguardando pagamento por pessoa e evento; `undefined` usa o padrão do domínio. */
  maxActiveReservations: number | undefined;
  authRateLimitMax: number | undefined;
}

/** Valida as variáveis de ambiente no boot (12-factor). Falha cedo se algo faltar. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    jwtSecret: parsed.JWT_SECRET,
    webhookSecret: parsed.WEBHOOK_SECRET,
    webOrigin: new URL(parsed.WEB_ORIGIN).origin,
    cookieSecure: parsed.NODE_ENV === "production",
    trustProxy: parsed.TRUST_PROXY || undefined,
    maxActiveReservations: parsed.MAX_ACTIVE_RESERVATIONS,
    authRateLimitMax: parsed.AUTH_RATE_LIMIT_MAX,
  };
}
