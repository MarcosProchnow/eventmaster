ALTER TABLE "sales"."orders" ADD COLUMN "request_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "payments"."payments" ADD COLUMN "instructions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_reserved_expiry_idx" ON "sales"."orders" USING btree ("expires_at") WHERE "sales"."orders"."status" = 'reserved';--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "sales"."orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_pending_unique" ON "payments"."payments" USING btree ("order_id") WHERE "payments"."payments"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments"."payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "tickets_order_idx" ON "sales"."tickets" USING btree ("order_id");