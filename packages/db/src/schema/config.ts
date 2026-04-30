import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./auth";

export const configApps = pgTable(
  "config_apps",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("config_apps_org_slug_uidx").on(
      table.organizationId,
      table.slug,
    ),
    index("config_apps_org_created_idx").on(
      table.organizationId,
      table.createdAt.desc(),
    ),
  ],
);

export const configEnvironments = pgTable(
  "config_environments",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    appId: uuid("app_id")
      .notNull()
      .references(() => configApps.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    revision: integer("revision").default(0).notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("config_environments_app_slug_uidx").on(
      table.appId,
      table.slug,
    ),
    index("config_environments_org_idx").on(table.organizationId),
  ],
);

export const configEntries = pgTable(
  "config_entries",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => configEnvironments.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueType: text("value_type").notNull(),
    description: text("description"),
    currentVersion: integer("current_version").default(0).notNull(),
    currentVersionId: uuid("current_version_id"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("config_entries_environment_key_uidx").on(
      table.environmentId,
      table.key,
    ),
    index("config_entries_org_idx").on(table.organizationId),
  ],
);

export const configEntryVersions = pgTable(
  "config_entry_versions",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => configEntries.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => configEnvironments.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    valueType: text("value_type").notNull(),
    valueJson: jsonb("value_json").$type<unknown>(),
    valueCiphertext: text("value_ciphertext"),
    checksum: text("checksum").notNull(),
    changeReason: text("change_reason"),
    rollbackFromVersion: integer("rollback_from_version"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("config_entry_versions_entry_version_uidx").on(
      table.entryId,
      table.version,
    ),
    index("config_entry_versions_environment_created_idx").on(
      table.environmentId,
      table.createdAt.desc(),
    ),
  ],
);

export const configServiceTokens = pgTable(
  "config_service_tokens",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => configEnvironments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    active: boolean("active").default(true).notNull(),
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("config_service_tokens_hash_uidx").on(table.tokenHash),
    index("config_service_tokens_environment_idx").on(table.environmentId),
    index("config_service_tokens_org_idx").on(table.organizationId),
  ],
);

export const configEventOutbox = pgTable(
  "config_event_outbox",
  {
    id: uuid("id")
      .default(sql`pg_catalog.gen_random_uuid()`)
      .primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    appId: uuid("app_id").references(() => configApps.id, {
      onDelete: "set null",
    }),
    environmentId: uuid("environment_id").references(
      () => configEnvironments.id,
      {
        onDelete: "set null",
      },
    ),
    entryId: uuid("entry_id").references(() => configEntries.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("config_event_outbox_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("config_event_outbox_environment_idx").on(table.environmentId),
  ],
);
