import { jwtVerify, SignJWT } from "jose";
import type { Actor, Role } from "../../../shared/actor.ts";
import type { AccessTokenSigner } from "../application/ports.ts";
import { ACCESS_TOKEN_TTL_SECONDS } from "../domain/user.ts";

const ISSUER = "eventmaster";
const AUDIENCE = "eventmaster-api";
const ALGORITHM = "HS256";
const ROLES: readonly string[] = ["attendee", "organizer", "admin"];

/** JWT de acesso de vida curta, assinado com HS256 (biblioteca `jose`). */
export class JoseAccessToken implements AccessTokenSigner {
  readonly #key: Uint8Array;

  constructor(secret: string) {
    this.#key = new TextEncoder().encode(secret);
  }

  sign(actor: Actor): Promise<string> {
    return new SignJWT({ role: actor.role })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(actor.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.#key);
  }

  async verify(token: string): Promise<Actor | null> {
    try {
      const { payload } = await jwtVerify(token, this.#key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: [ALGORITHM], // fixa o algoritmo: impede "alg: none" e troca de algoritmo
      });
      const role = payload["role"];
      if (!payload.sub || typeof role !== "string" || !ROLES.includes(role)) return null;
      return { id: payload.sub, role: role as Role };
    } catch {
      return null;
    }
  }
}
