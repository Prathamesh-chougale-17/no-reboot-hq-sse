CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_response_status" integer,
	"last_error" text,
	"next_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret_hash" text NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"event_types" text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_idx" ON "webhook_deliveries" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_organization_idx" ON "webhook_deliveries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_organization_idx" ON "webhook_endpoints" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_active_idx" ON "webhook_endpoints" USING btree ("active");