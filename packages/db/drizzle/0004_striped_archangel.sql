CREATE TABLE "config_apps" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_entries" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value_type" text NOT NULL,
	"description" text,
	"current_version" integer DEFAULT 0 NOT NULL,
	"current_version_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_entry_versions" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"value_type" text NOT NULL,
	"value_json" jsonb,
	"value_ciphertext" text,
	"checksum" text NOT NULL,
	"change_reason" text,
	"rollback_from_version" integer,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_environments" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_event_outbox" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"app_id" uuid,
	"environment_id" uuid,
	"entry_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_service_tokens" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"created_by" uuid,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "config_apps" ADD CONSTRAINT "config_apps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_apps" ADD CONSTRAINT "config_apps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_entries" ADD CONSTRAINT "config_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_entries" ADD CONSTRAINT "config_entries_environment_id_config_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."config_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_entries" ADD CONSTRAINT "config_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_entry_versions" ADD CONSTRAINT "config_entry_versions_entry_id_config_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."config_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_entry_versions" ADD CONSTRAINT "config_entry_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_entry_versions" ADD CONSTRAINT "config_entry_versions_environment_id_config_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."config_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_entry_versions" ADD CONSTRAINT "config_entry_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_environments" ADD CONSTRAINT "config_environments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_environments" ADD CONSTRAINT "config_environments_app_id_config_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."config_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_environments" ADD CONSTRAINT "config_environments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_event_outbox" ADD CONSTRAINT "config_event_outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_event_outbox" ADD CONSTRAINT "config_event_outbox_app_id_config_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."config_apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_event_outbox" ADD CONSTRAINT "config_event_outbox_environment_id_config_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."config_environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_event_outbox" ADD CONSTRAINT "config_event_outbox_entry_id_config_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."config_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_service_tokens" ADD CONSTRAINT "config_service_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_service_tokens" ADD CONSTRAINT "config_service_tokens_environment_id_config_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."config_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_service_tokens" ADD CONSTRAINT "config_service_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "config_apps_org_slug_uidx" ON "config_apps" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "config_apps_org_created_idx" ON "config_apps" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "config_entries_environment_key_uidx" ON "config_entries" USING btree ("environment_id","key");--> statement-breakpoint
CREATE INDEX "config_entries_org_idx" ON "config_entries" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "config_entry_versions_entry_version_uidx" ON "config_entry_versions" USING btree ("entry_id","version");--> statement-breakpoint
CREATE INDEX "config_entry_versions_environment_created_idx" ON "config_entry_versions" USING btree ("environment_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "config_environments_app_slug_uidx" ON "config_environments" USING btree ("app_id","slug");--> statement-breakpoint
CREATE INDEX "config_environments_org_idx" ON "config_environments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "config_event_outbox_status_created_idx" ON "config_event_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "config_event_outbox_environment_idx" ON "config_event_outbox" USING btree ("environment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "config_service_tokens_hash_uidx" ON "config_service_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "config_service_tokens_environment_idx" ON "config_service_tokens" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "config_service_tokens_org_idx" ON "config_service_tokens" USING btree ("organization_id");