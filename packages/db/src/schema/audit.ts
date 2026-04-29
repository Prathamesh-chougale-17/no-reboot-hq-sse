import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id')
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    eventType: text('event_type').notNull(),
    actorUserId: uuid('actor_user_id'),
    actorRole: text('actor_role'),
    targetUserId: uuid('target_user_id'),
    targetEmail: text('target_email'),
    targetInvitationId: uuid('target_invitation_id'),
    requestId: text('request_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_organization_created_idx').on(table.organizationId, table.createdAt.desc()),
    index('audit_logs_actor_created_idx').on(table.actorUserId, table.createdAt.desc()),
  ],
);
