import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PasswordHasher } from "../application/ports.ts";

const argon2Async = promisify(argon2);

// Parâmetros mínimos recomendados pela OWASP para Argon2id (19 MiB, 2 passes, 1 thread).
const MEMORY_KIB = 19_456;
const PASSES = 2;
const PARALLELISM = 1;
const TAG_LENGTH = 32;

const derive = (password: string, salt: Buffer, memory: number, passes: number, parallelism: number) =>
  argon2Async("argon2id", {
    message: Buffer.from(password, "utf8"),
    nonce: salt,
    memory,
    passes,
    parallelism,
    tagLength: TAG_LENGTH,
  });

/**
 * Hash de senha com Argon2id nativo do Node (`node:crypto`), sem dependência
 * externa. Formato guardado: `argon2id$m,t,p$salt$hash` (base64url). Os
 * parâmetros ficam junto do hash para poderem ser aumentados no futuro.
 */
export class Argon2PasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const tag = await derive(password, salt, MEMORY_KIB, PASSES, PARALLELISM);
    return [
      "argon2id",
      `${MEMORY_KIB},${PASSES},${PARALLELISM}`,
      salt.toString("base64url"),
      tag.toString("base64url"),
    ].join("$");
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [algorithm, params, saltB64, tagB64] = stored.split("$");
    if (algorithm !== "argon2id" || !params || !saltB64 || !tagB64) return false;
    const [memory, passes, parallelism] = params.split(",").map(Number);
    if (!memory || !passes || !parallelism) return false;
    // Recusa parâmetros absurdos vindos de um hash corrompido.
    if (memory > 1_048_576 || passes > 10 || parallelism > 8) return false;
    const expected = Buffer.from(tagB64, "base64url");
    if (expected.length !== TAG_LENGTH) return false;
    try {
      const actual = await derive(password, Buffer.from(saltB64, "base64url"), memory, passes, parallelism);
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}
