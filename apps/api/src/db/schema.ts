/**
 * Modelo de dados do EventMaster (ADR 0005).
 *
 * Um schema PostgreSQL por módulo. Referências entre módulos são colunas uuid
 * SEM chave estrangeira: cada módulo é dono das suas tabelas e a integridade
 * entre módulos é garantida pela aplicação (ADR 0001). Dentro do módulo há FKs.
 * Valores monetários em centavos (inteiros).
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------- identity ----------
export const identity = pgSchema("identity");

export const users = identity.table(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("attendee"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    check("users_role_check", sql`${t.role} in ('attendee','organizer','admin')`),
  ],
);

export const refreshTokens = identity.table("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------- events ----------
export const eventsSchema = pgSchema("events");

export const events = eventsSchema.table(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: uuid("organizer_id").notNull(), // identity.users (sem FK)
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    venue: text("venue").notNull(),
    city: text("city").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: createdAt(),
  },
  (t) => [
    check("events_status_check", sql`${t.status} in ('draft','published','cancelled')`),
    check("events_period_check", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const ticketTypes = eventsSchema.table(
  "ticket_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    // Reservados + vendidos. Última barreira contra overselling (RNF01, ADR 0006).
    sold: integer("sold").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check("ticket_types_price_check", sql`${t.priceCents} >= 0`),
    check("ticket_types_quantity_check", sql`${t.quantity} > 0`),
    check("ticket_types_sold_check", sql`${t.sold} >= 0 and ${t.sold} <= ${t.quantity}`),
    uniqueIndex("ticket_types_event_name_unique").on(t.eventId, t.name),
  ],
);

// ---------- sales (pedidos e ingressos) ----------
export const sales = pgSchema("sales");

export const orders = sales.table(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(), // identity.users (sem FK)
    eventId: uuid("event_id").notNull(), // events.events (sem FK)
    status: text("status").notNull().default("reserved"),
    totalCents: integer("total_cents").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    // Hash do conteúdo do pedido: a mesma chave com outro conteúdo é recusada.
    requestHash: text("request_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "orders_status_check",
      sql`${t.status} in ('reserved','paid','expired','cancelled','refunded')`,
    ),
    check("orders_total_check", sql`${t.totalCents} >= 0`),
    uniqueIndex("orders_user_idempotency_unique").on(t.userId, t.idempotencyKey),
    // Acelera a busca por reservas vencidas.
    index("orders_reserved_expiry_idx").on(t.expiresAt).where(sql`${t.status} = 'reserved'`),
    index("orders_user_idx").on(t.userId, t.createdAt),
  ],
);

export const orderItems = sales.table(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    ticketTypeId: uuid("ticket_type_id").notNull(), // events.ticket_types (sem FK)
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  (t) => [
    check("order_items_quantity_check", sql`${t.quantity} > 0`),
    check("order_items_price_check", sql`${t.unitPriceCents} >= 0`),
    uniqueIndex("order_items_order_type_unique").on(t.orderId, t.ticketTypeId),
  ],
);

export const tickets = sales.table(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    ticketTypeId: uuid("ticket_type_id").notNull(),
    code: text("code").notNull().unique(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("tickets_order_idx").on(t.orderId)],
);

// ---------- payments ----------
export const paymentsSchema = pgSchema("payments");

export const payments = paymentsSchema.table(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull(), // sales.orders (sem FK)
    method: text("method").notNull(),
    providerRef: text("provider_ref"),
    status: text("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    // Instruções devolvidas pelo gateway (código Pix, linha do boleto etc.).
    instructions: jsonb("instructions").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    check("payments_method_check", sql`${t.method} in ('pix','card','boleto')`),
    check(
      "payments_status_check",
      sql`${t.status} in ('pending','approved','declined','refunded')`,
    ),
    check("payments_amount_check", sql`${t.amountCents} >= 0`),
    // Webhook repetido do mesmo provedor não cria segundo pagamento (RNF02).
    uniqueIndex("payments_provider_ref_unique")
      .on(t.providerRef)
      .where(sql`${t.providerRef} is not null`),
    // No máximo um pagamento pendente por pedido.
    uniqueIndex("payments_order_pending_unique")
      .on(t.orderId)
      .where(sql`${t.status} = 'pending'`),
    index("payments_order_idx").on(t.orderId),
  ],
);

// ---------- notifications (inclui outbox) ----------
export const notificationsSchema = pgSchema("notifications");

export const outbox = notificationsSchema.table(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    // Acelera a busca por eventos pendentes.
    index("outbox_pending_idx")
      .on(t.createdAt, t.id)
      .where(sql`${t.processedAt} is null`),
  ],
);

export const notifications = notificationsSchema.table(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Um registro por evento do outbox: impede enviar o mesmo e-mail duas vezes.
    outboxId: uuid("outbox_id")
      .notNull()
      .unique()
      .references(() => outbox.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(), // identity.users (sem FK)
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    check("notifications_status_check", sql`${t.status} in ('pending','sent','failed')`),
  ],
);
