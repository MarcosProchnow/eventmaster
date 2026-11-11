import { and, asc, count, desc, eq, ilike, sql } from "drizzle-orm";
import type { Db } from "../../../db/client.ts";
import { events, ticketTypes } from "../../../db/schema.ts";
import { ConflictError, NotFoundError } from "../../../shared/errors.ts";
import { isUniqueViolation } from "../../../shared/pg-errors.ts";
import type {
  EventFilter,
  EventPatch,
  EventRepository,
  NewEvent,
  NewTicketType,
} from "../application/ports.ts";
import type { Event, EventStatus, TicketType } from "../domain/event.ts";

type EventRow = typeof events.$inferSelect;
type TicketTypeRow = typeof ticketTypes.$inferSelect;

const toEvent = (row: EventRow): Event => ({ ...row, status: row.status as EventStatus });

const toTicketType = (row: TicketTypeRow): TicketType => ({
  id: row.id,
  eventId: row.eventId,
  name: row.name,
  priceCents: row.priceCents,
  quantity: row.quantity,
  sold: row.sold,
});

/** Escapa os curingas do LIKE para tratar a busca do usuário como texto literal. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Adaptador de saída: implementa a porta EventRepository com Drizzle/PostgreSQL. */
export class DrizzleEventRepository implements EventRepository {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  async create(data: NewEvent): Promise<Event> {
    const [row] = await this.#db.insert(events).values(data).returning();
    return toEvent(row!);
  }

  async findById(id: string): Promise<Event | null> {
    const [row] = await this.#db.select().from(events).where(eq(events.id, id)).limit(1);
    return row ? toEvent(row) : null;
  }

  async update(id: string, patch: EventPatch): Promise<Event> {
    const [row] = await this.#db.update(events).set(patch).where(eq(events.id, id)).returning();
    if (!row) throw new NotFoundError("Evento não encontrado");
    return toEvent(row);
  }

  async listPublished(filter: EventFilter): Promise<{ items: Event[]; total: number }> {
    const where = and(
      eq(events.status, "published"),
      filter.city ? eq(sql`lower(${events.city})`, filter.city.toLowerCase()) : undefined,
      filter.q ? ilike(events.title, `%${escapeLike(filter.q)}%`) : undefined,
    );
    const rows = await this.#db
      .select()
      .from(events)
      .where(where)
      .orderBy(asc(events.startsAt), asc(events.id))
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize);
    const [totals] = await this.#db.select({ total: count() }).from(events).where(where);
    return { items: rows.map(toEvent), total: totals?.total ?? 0 };
  }

  async listByOrganizer(organizerId: string): Promise<Event[]> {
    const rows = await this.#db
      .select()
      .from(events)
      .where(eq(events.organizerId, organizerId))
      .orderBy(desc(events.createdAt))
      .limit(200);
    return rows.map(toEvent);
  }

  async countTicketTypes(eventId: string): Promise<number> {
    const [row] = await this.#db
      .select({ total: count() })
      .from(ticketTypes)
      .where(eq(ticketTypes.eventId, eventId));
    return row?.total ?? 0;
  }

  async listTicketTypes(eventId: string): Promise<TicketType[]> {
    const rows = await this.#db
      .select()
      .from(ticketTypes)
      .where(eq(ticketTypes.eventId, eventId))
      .orderBy(asc(ticketTypes.priceCents), asc(ticketTypes.name));
    return rows.map(toTicketType);
  }

  async addTicketType(data: NewTicketType): Promise<TicketType> {
    try {
      const [row] = await this.#db.insert(ticketTypes).values(data).returning();
      return toTicketType(row!);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("Já existe um tipo de ingresso com esse nome neste evento");
      }
      throw error;
    }
  }
}
