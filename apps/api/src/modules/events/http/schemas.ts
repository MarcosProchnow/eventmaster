import { z } from "zod";
import type { Event, TicketType } from "../domain/event.ts";

export const eventIdParams = z.object({ id: z.uuid() });

const title = z.string().trim().min(3).max(120);
const description = z.string().trim().max(5000);
const venue = z.string().trim().min(2).max(120);
const city = z.string().trim().min(2).max(80);
const dateTime = z.iso.datetime({ offset: true });

export const createEventBody = z.strictObject({
  title,
  description: description.default(""),
  venue,
  city,
  startsAt: dateTime,
  endsAt: dateTime,
});

export const updateEventBody = z.strictObject({
  title: title.optional(),
  description: description.optional(),
  venue: venue.optional(),
  city: city.optional(),
  startsAt: dateTime.optional(),
  endsAt: dateTime.optional(),
});

export const listEventsQuery = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  city: city.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const eventResponse = z.object({
  id: z.uuid(),
  organizerId: z.uuid(),
  title: z.string(),
  description: z.string(),
  venue: z.string(),
  city: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(["draft", "published", "cancelled"]),
});

export const eventListResponse = z.object({
  items: z.array(eventResponse),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export const createTicketTypeBody = z.strictObject({
  name: z.string().trim().min(1).max(60),
  priceCents: z.number().int().min(0).max(100_000_000),
  quantity: z.number().int().min(1).max(1_000_000),
});

export const ticketTypeResponse = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  name: z.string(),
  priceCents: z.number().int(),
  quantity: z.number().int(),
  available: z.number().int(),
});

export const toEventDto = (e: Event): z.infer<typeof eventResponse> => ({
  id: e.id,
  organizerId: e.organizerId,
  title: e.title,
  description: e.description,
  venue: e.venue,
  city: e.city,
  startsAt: e.startsAt.toISOString(),
  endsAt: e.endsAt.toISOString(),
  status: e.status,
});

/** Expõe "disponíveis" em vez do contador interno `sold`. */
export const toTicketTypeDto = (t: TicketType): z.infer<typeof ticketTypeResponse> => ({
  id: t.id,
  eventId: t.eventId,
  name: t.name,
  priceCents: t.priceCents,
  quantity: t.quantity,
  available: t.quantity - t.sold,
});
