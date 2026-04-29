import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations, users } from './auth';

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id')
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    secretHash: text('secret_hash').notNull(),
    secretCiphertext: text('secret_ciphertext').notNull(),
    eventTypes: text('event_types').array().notNull(),
    active: boolean('active').default(true).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('webhook_endpoints_organization_idx').on(table.organizationId),
    index('webhook_endpoints_active_idx').on(table.active),
  ],
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id')
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status').default('pending').notNull(),
    attemptCount: integer('attempt_count').default(0).notNull(),
    lastResponseStatus: integer('last_response_status'),
    lastError: text('last_error'),
    nextAttemptAt: timestamp('next_attempt_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('webhook_deliveries_endpoint_idx').on(table.endpointId),
    index('webhook_deliveries_organization_idx').on(table.organizationId),
    index('webhook_deliveries_status_idx').on(table.status, table.createdAt),
  ],
);
