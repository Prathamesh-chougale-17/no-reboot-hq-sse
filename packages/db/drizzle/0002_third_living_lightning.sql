CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"target_user_id" uuid,
	"target_email" text,
	"target_invitation_id" uuid,
	"request_id" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_logs_organization_created_idx" ON "audit_logs" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_user_id","created_at" DESC NULLS LAST);