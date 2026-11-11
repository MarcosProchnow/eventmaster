import type { Event, EventStatus, TicketType } from "../domain/event.ts";

export interface NewEvent {
  organizerId: string;
  title: string;
  description: string;
  venue: string;
  city: string;
  startsAt: Date;
  endsAt: Date;
}

export type EventPatch = Partial<
  Pick<Event, "title" | "description" | "venue" | "city" | "startsAt" | "endsAt">
> & { status?: EventStatus };

export interface EventFilter {
  q?: string | undefined;
  city?: string | undefined;
  page: number;
  pageSize: number;
}

export interface NewTicketType {
  eventId: string;
  name: string;
  priceCents: number;
  quantity: number;
}

/** Porta de saída: o domínio depende desta interface, não do Drizzle. */
export interface EventRepository {
  create(data: NewEvent): Promise<Event>;
  findById(id: string): Promise<Event | null>;
  update(id: string, patch: EventPatch): Promise<Event>;
  listPublished(filter: EventFilter): Promise<{ items: Event[]; total: number }>;
  countTicketTypes(eventId: string): Promise<number>;
  listTicketTypes(eventId: string): Promise<TicketType[]>;
  /** Lança ConflictError se já existir um tipo com o mesmo nome no evento. */
  addTicketType(data: NewTicketType): Promise<TicketType>;
}
