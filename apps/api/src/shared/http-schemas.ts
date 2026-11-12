import { z } from "zod";

/** Formato único de erro da API, usado por todos os módulos: `{ error: { code, message, details? } }`. */
export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
