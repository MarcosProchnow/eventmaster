import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { EventsService } from "../src/modules/events/application/events-service.ts";
import type {
  EventFilter,
  EventPatch,
  EventRepository,
  NewEvent,
  NewTicketType,
} from "../src/modules/events/application/ports.ts";
import type { Event, TicketType } from "../src/modules/events/domain/event.ts";
import type { Actor } from "../src/shared/actor.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../src/shared/errors.ts";

/** Adaptador falso em memória: testa os casos de uso sem banco. */
class InMemoryEventRepository implements EventRepository {
  events = new Map<string, Event>();
  ticketTypes: TicketType[] = [];

  async create(data: NewEvent): Promise<Event> {
    const event: Event = { ...data, id: randomUUID(), status: "draft", createdAt: new Date() };
    this.events.set(event.id, event);
    return event;
  }
  async findById(id: string) {
    return this.events.get(id) ?? null;
  }
  async update(id: string, patch: EventPatch): Promise<Event> {
    const updated = { ...this.events.get(id)!, ...patch };
    this.events.set(id, updated);
    return updated;
  }
  async listPublished(filter: EventFilter) {
    const items = [...this.events.values()].filter((e) => e.status === "published");
    return { items: items.slice(0, filter.pageSize), total: items.length };
  }
  async countTicketTypes(eventId: string) {
    return this.ticketTypes.filter((t) => t.eventId === eventId).length;
  }
  async listTicketTypes(eventId: string) {
    return this.ticketTypes.filter((t) => t.eventId === eventId);
  }
  async addTicketType(data: NewTicketType): Promise<TicketType> {
    if (this.ticketTypes.some((t) => t.eventId === data.eventId && t.name === data.name)) {
      throw new ConflictError("duplicado");
    }
    const created = { ...data, id: randomUUID(), sold: 0 };
    this.ticketTypes.push(created);
    return created;
  }
}

const NOW = new Date("2026-11-01T00:00:00Z");
const organizer: Actor = { id: randomUUID(), role: "organizer" };
const otherOrganizer: Actor = { id: randomUUID(), role: "organizer" };
const attendee: Actor = { id: randomUUID(), role: "attendee" };
const admin: Actor = { id: randomUUID(), role: "admin" };

const input = {
  title: "Conferência",
  description: "",
  venue: "Centro",
  city: "Curitiba",
  startsAt: new Date("2027-01-10T10:00:00Z"),
  endsAt: new Date("2027-01-10T18:00:00Z"),
};
const ticket = { name: "Geral", priceCents: 5000, quantity: 10 };

let repo: InMemoryEventRepository;
let service: EventsService;

beforeEach(() => {
  repo = new InMemoryEventRepository();
  service = new EventsService(repo, () => NOW);
});

describe("criar evento", () => {
  it("cria em rascunho com o ator como organizador", async () => {
    const event = await service.createEvent(organizer, input);
    expect(event.status).toBe("draft");
    expect(event.organizerId).toBe(organizer.id);
  });

  it("recusa participante", async () => {
    await expect(service.createEvent(attendee, input)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("recusa período invertido", async () => {
    await expect(
      service.createEvent(organizer, { ...input, endsAt: input.startsAt }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe("publicar evento", () => {
  it("exige ao menos um tipo de ingresso", async () => {
    const event = await service.createEvent(organizer, input);
    await expect(service.publishEvent(organizer, event.id)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });

  it("publica quando há ingresso e a data é futura", async () => {
    const event = await service.createEvent(organizer, input);
    await service.addTicketType(organizer, event.id, ticket);
    expect((await service.publishEvent(organizer, event.id)).status).toBe("published");
  });

  it("recusa evento que já começou", async () => {
    const event = await service.createEvent(organizer, {
      ...input,
      startsAt: new Date("2026-10-01T10:00:00Z"),
      endsAt: new Date("2026-10-01T12:00:00Z"),
    });
    await service.addTicketType(organizer, event.id, ticket);
    await expect(service.publishEvent(organizer, event.id)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });

  it("recusa publicar duas vezes", async () => {
    const event = await service.createEvent(organizer, input);
    await service.addTicketType(organizer, event.id, ticket);
    await service.publishEvent(organizer, event.id);
    await expect(service.publishEvent(organizer, event.id)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });
});

describe("autorização por objeto (BOLA)", () => {
  it("outro organizador não altera, publica, cancela nem adiciona ingresso", async () => {
    const event = await service.createEvent(organizer, input);
    await expect(
      service.updateEvent(otherOrganizer, event.id, { title: "Hack" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.publishEvent(otherOrganizer, event.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.cancelEvent(otherOrganizer, event.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      service.addTicketType(otherOrganizer, event.id, ticket),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect((await repo.findById(event.id))!.title).toBe("Conferência");
  });

  it("rascunho é invisível para anônimos e terceiros, visível ao dono e ao admin", async () => {
    const event = await service.createEvent(organizer, input);
    await expect(service.getEvent(null, event.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getEvent(attendee, event.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.listTicketTypes(null, event.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await service.getEvent(organizer, event.id)).id).toBe(event.id);
    expect((await service.getEvent(admin, event.id)).id).toBe(event.id);
  });
});

describe("alterar e cancelar", () => {
  it("altera campos e valida o período resultante", async () => {
    const event = await service.createEvent(organizer, input);
    const updated = await service.updateEvent(organizer, event.id, { title: "Novo título" });
    expect(updated.title).toBe("Novo título");
    await expect(
      service.updateEvent(organizer, event.id, { endsAt: new Date("2027-01-10T09:00:00Z") }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("evento cancelado não pode ser alterado nem receber ingressos", async () => {
    const event = await service.createEvent(organizer, input);
    await service.cancelEvent(organizer, event.id);
    await expect(
      service.updateEvent(organizer, event.id, { title: "X novo" }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(service.addTicketType(organizer, event.id, ticket)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    await expect(service.cancelEvent(organizer, event.id)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });
});
