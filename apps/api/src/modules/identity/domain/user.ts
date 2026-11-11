import type { Role } from "../../../shared/actor.ts";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  createdAt: Date;
}

/** Papéis que alguém pode escolher ao se cadastrar. `admin` nunca é auto-atribuído. */
export type SelfAssignableRole = Exclude<Role, "admin">;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
