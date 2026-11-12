import type { Event, Order, Payment, Ticket, TicketType, User } from "../src/api/client";

const DAY = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

export const attendee: User = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.com",
  name: "Ana",
  role: "attendee",
};

export const organizer: User = {
  id: "11111111-1111-4111-8111-222222222222",
  email: "olga@example.com",
  name: "Olga",
  role: "organizer",
};

export const event: Event = {
  id: "22222222-2222-4222-8222-222222222222",
  organizerId: organizer.id,
  title: "Festival de Jazz",
  description: "Três palcos ao ar livre.",
  venue: "Parque Barigui",
  city: "Curitiba",
  startsAt: inDays(30),
  endsAt: inDays(31),
  status: "published",
};

export const fullPrice: TicketType = {
  id: "33333333-3333-4333-8333-333333333331",
  eventId: event.id,
  name: "Inteira",
  priceCents: 10_000,
  quantity: 100,
  available: 100,
};

export const halfPrice: TicketType = {
  id: "33333333-3333-4333-8333-333333333332",
  eventId: event.id,
  name: "Meia",
  priceCents: 5_000,
  quantity: 10,
  available: 2,
};

export const reservedOrder: Order = {
  id: "44444444-4444-4444-8444-444444444444",
  eventId: event.id,
  status: "reserved",
  totalCents: 25_000,
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  items: [
    { ticketTypeId: fullPrice.id, quantity: 2, unitPriceCents: 10_000 },
    { ticketTypeId: halfPrice.id, quantity: 1, unitPriceCents: 5_000 },
  ],
};

export const pixPayment: Payment = {
  id: "55555555-5555-4555-8555-555555555555",
  orderId: reservedOrder.id,
  method: "pix",
  status: "pending",
  amountCents: 25_000,
  instructions: { kind: "pix", copyPaste: "00020126PIXDETESTE", expiresAt: reservedOrder.expiresAt },
};

export const tickets: Ticket[] = [
  { id: "66666666-6666-4666-8666-666666666661", ticketTypeId: fullPrice.id, code: "TKT-AAA", checkedInAt: null },
  { id: "66666666-6666-4666-8666-666666666662", ticketTypeId: halfPrice.id, code: "TKT-BBB", checkedInAt: null },
];
