import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET deve ter ao menos 32 caracteres"),
  WEBHOOK_SECRET: z.string().min(32, "WEBHOOK_SECRET deve ter ao menos 32 caracteres"),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
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
  };
}
