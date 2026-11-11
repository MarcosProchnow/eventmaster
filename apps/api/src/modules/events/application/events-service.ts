import type { Actor } from "../../../shared/actor.ts";
import { ForbiddenError, NotFoundError } from "../../../shared/errors.ts";
import {
  assertCanCancel,
  assertCanPublish,
  assertEditable,
  assertValidPeriod,
  type Event,
  type TicketType,
} from "../domain/event.ts";
import type { EventFilter, EventPatch, EventRepository } from "./ports.ts";

export interface CreateEventInput {
  title: string;
  description: string;
  venue: string;
  city: string;
  startsAt: Date;
  endsAt: Date;
}

export type UpdateEventInput = Partial<CreateEventInput>;

export interface CreateTicketTypeInput {
  name: string;
  priceCents: number;
  quantity: number;
}

/** Casos de uso do módulo de eventos. */
export class EventsService {
  readonly #repo: EventRepository;
  readonly #now: () => Date;

  constructor(repo: EventRepository, now: () => Date = () => new Date()) {
    this.#repo = repo;
    this.#now = now;
  }

  async createEvent(actor: Actor, input: CreateEventInput): Promise<Event> {
    if (actor.role !== "organizer" && actor.role !== "admin") {
      throw new ForbiddenError("Apenas organizadores podem criar eventos");
    }
    assertValidPeriod(input.startsAt, input.endsAt);
    return this.#repo.create({ ...input, organizerId: actor.id });
  }

  listPublished(filter: EventFilter) {
    return this.#repo.listPublished(filter);
  }

  /** Eventos do próprio organizador, em qualquer status (painel do organizador). */
  async listMine(actor: Actor): Promise<Event[]> {
    if (actor.role !== "organizer" && actor.role !== "admin") {
      throw new ForbiddenError("Apenas organizadores têm eventos próprios");
    }
    return this.#repo.listByOrganizer(actor.id);
  }

  /** Rascunhos e cancelados só são visíveis ao dono ou a um admin. */
  async getEvent(actor: Actor | null, id: string): Promise<Event> {
    const event = await this.#repo.findById(id);
    if (!event) throw new NotFoundError("Evento não encontrado");
    if (event.status !== "published" && !canManage(actor, event)) {
      throw new NotFoundError("Evento não encontrado");
    }
    return event;
  }

  async updateEvent(actor: Actor, id: string, input: UpdateEventInput): Promise<Event> {
    const event = await this.#loadManaged(actor, id);
    assertEditable(event);
    assertValidPeriod(input.startsAt ?? event.startsAt, input.endsAt ?? event.endsAt);
    const patch: EventPatch = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.venue !== undefined) patch.venue = input.venue;
    if (input.city !== undefined) patch.city = input.city;
    if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
    if (input.endsAt !== undefined) patch.endsAt = input.endsAt;
    if (Object.keys(patch).length === 0) return event;
    return this.#repo.update(id, patch);
  }

  async publishEvent(actor: Actor, id: string): Promise<Event> {
    const event = await this.#loadManaged(actor, id);
    assertCanPublish(event, await this.#repo.countTicketTypes(id), this.#now());
    return this.#repo.update(id, { status: "published" });
  }

  async cancelEvent(actor: Actor, id: string): Promise<Event> {
    const event = await this.#loadManaged(actor, id);
    assertCanCancel(event);
    return this.#repo.update(id, { status: "cancelled" });
  }

  async addTicketType(
    actor: Actor,
    eventId: string,
    input: CreateTicketTypeInput,
  ): Promise<TicketType> {
    const event = await this.#loadManaged(actor, eventId);
    assertEditable(event);
    return this.#repo.addTicketType({ ...input, eventId });
  }

  async listTicketTypes(actor: Actor | null, eventId: string): Promise<TicketType[]> {
    await this.getEvent(actor, eventId);
    return this.#repo.listTicketTypes(eventId);
  }

  /**
   * Carrega o evento apenas se o ator puder gerenciá-lo. Responde "não
   * encontrado" a terceiros para não revelar a existência do recurso
   * (proteção contra BOLA, RNF04).
   */
  async #loadManaged(actor: Actor, id: string): Promise<Event> {
    const event = await this.#repo.findById(id);
    if (!event || !canManage(actor, event)) throw new NotFoundError("Evento não encontrado");
    return event;
  }
}

function canManage(actor: Actor | null, event: Event): boolean {
  if (!actor) return false;
  return actor.role === "admin" || (actor.role === "organizer" && actor.id === event.organizerId);
}
