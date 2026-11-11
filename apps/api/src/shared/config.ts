import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  ALLOW_DEV_AUTH: z.enum(["true", "false"]).default("false"),
});

export interface Config {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  allowDevAuth: boolean;
}

/** Valida as variáveis de ambiente no boot (12-factor). Falha cedo se algo faltar. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  const allowDevAuth = parsed.ALLOW_DEV_AUTH === "true";
  if (allowDevAuth && parsed.NODE_ENV === "production") {
    throw new Error("ALLOW_DEV_AUTH não pode ser usado em produção");
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    allowDevAuth,
  };
}
