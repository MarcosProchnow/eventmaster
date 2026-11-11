import { z } from "zod";
import { MAX_TICKETS_PER_ORDER, type Order, type Ticket } from "../domain/order.ts";

export const orderIdParams = z.object({ id: z.uuid() });

export const idempotencyHeaders = z.object({
  "idempotency-key": z
    .string()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/, "use apenas letras, números, '-' e '_'"),
});

export const createOrderBody = z.strictObject({
  items: z
    .array(
      z.strictObject({
        ticketTypeId: z.uuid(),
        quantity: z.number().int().min(1).max(MAX_TICKETS_PER_ORDER),
      }),
    )
    .min(1)
    .max(MAX_TICKETS_PER_ORDER),
});

export const orderResponse = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  status: z.enum(["reserved", "paid", "expired", "cancelled", "refunded"]),
  totalCents: z.number().int(),
  expiresAt: z.string(),
  items: z.array(
    z.object({
      ticketTypeId: z.uuid(),
      quantity: z.number().int(),
      unitPriceCents: z.number().int(),
    }),
  ),
});

export const ticketResponse = z.object({
  id: z.uuid(),
  ticketTypeId: z.uuid(),
  code: z.string(),
  checkedInAt: z.string().nullable(),
});

export const toOrderDto = (o: Order): z.infer<typeof orderResponse> => ({
  id: o.id,
  eventId: o.eventId,
  status: o.status,
  totalCents: o.totalCents,
  expiresAt: o.expiresAt.toISOString(),
  items: o.items,
});

export const toTicketDto = (t: Ticket): z.infer<typeof ticketResponse> => ({
  id: t.id,
  ticketTypeId: t.ticketTypeId,
  code: t.code,
  checkedInAt: t.checkedInAt?.toISOString() ?? null,
});
