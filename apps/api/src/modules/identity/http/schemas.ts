import { z } from "zod";
import type { User } from "../domain/user.ts";

const email = z.email().max(254);

export const registerBody = z.strictObject({
  name: z.string().trim().min(2).max(120),
  email,
  // Comprimento importa mais que regras de composição; o máximo evita abuso do hash.
  password: z.string().min(10).max(128),
  role: z.enum(["attendee", "organizer"]).default("attendee"),
});

export const loginBody = z.strictObject({
  email,
  password: z.string().min(1).max(128),
});

export const userResponse = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: z.enum(["attendee", "organizer", "admin"]),
});

/** Nunca inclui `passwordHash`. */
export const toUserDto = (u: User): z.infer<typeof userResponse> => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
});
