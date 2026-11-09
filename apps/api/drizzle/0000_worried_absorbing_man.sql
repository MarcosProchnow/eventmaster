CREATE SCHEMA "events";
--> statement-breakpoint
CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE SCHEMA "notifications";
--> statement-breakpoint
CREATE SCHEMA "payments";
--> statement-breakpoint
CREATE SCHEMA "sales";
--> statement-breakpoint
CREATE TABLE "events"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"venue" text NOT NULL,
	"city" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_status_check" CHECK ("events"."events"."status" in ('draft','published','cancelled')),
	CONSTRAINT "events_period_check" CHECK ("events"."events"."ends_at" > "events"."events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "notifications"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notifications_status_check" CHECK ("notifications"."notifications"."status" in ('pending','sent','failed'))
);
--> statement-breakpoint
CREATE TABLE "sales"."order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	CONSTRAINT "order_items_quantity_check" CHECK ("sales"."order_items"."quantity" > 0),
	CONSTRAINT "order_items_price_check" CHECK ("sales"."order_items"."unit_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sales"."orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"total_cents" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_status_check" CHECK ("sales"."orders"."status" in ('reserved','paid','expired','cancelled','refunded')),
	CONSTRAINT "orders_total_check" CHECK ("sales"."orders"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notifications"."outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"method" text NOT NULL,
	"provider_ref" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_method_check" CHECK ("payments"."payments"."method" in ('pix','card','boleto')),
	CONSTRAINT "payments_status_check" CHECK ("payments"."payments"."status" in ('pending','approved','declined','refunded')),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."payments"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "identity"."refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "events"."ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_types_price_check" CHECK ("events"."ticket_types"."price_cents" >= 0),
	CONSTRAINT "ticket_types_quantity_check" CHECK ("events"."ticket_types"."quantity" > 0),
	CONSTRAINT "ticket_types_sold_check" CHECK ("events"."ticket_types"."sold" >= 0 and "events"."ticket_types"."sold" <= "events"."ticket_types"."quantity")
);
--> statement-breakpoint
CREATE TABLE "sales"."tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"code" text NOT NULL,
	"checked_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "identity"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'attendee' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("identity"."users"."role" in ('attendee','organizer','admin'))
);
--> statement-breakpoint
ALTER TABLE "sales"."order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events"."ticket_types" ADD CONSTRAINT "ticket_types_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "events"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "sales"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_type_unique" ON "sales"."order_items" USING btree ("order_id","ticket_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_user_idempotency_unique" ON "sales"."orders" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "notifications"."outbox" USING btree ("created_at","id") WHERE "notifications"."outbox"."processed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_ref_unique" ON "payments"."payments" USING btree ("provider_ref") WHERE "payments"."payments"."provider_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_types_event_name_unique" ON "events"."ticket_types" USING btree ("event_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "identity"."users" USING btree (lower("email"));