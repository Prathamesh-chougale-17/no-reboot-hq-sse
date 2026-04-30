import { and, count, desc, eq, isNull, lte, or, sql } from "drizzle-orm";

import type {
  AuditEventType,
  AuthRole,
  ConfigAppDto,
  ConfigEntryDto,
  ConfigEntryVersionDto,
  ConfigEnvironmentDto,
  ConfigEventDto,
  ConfigServiceTokenDto,
  ConfigValueType,
} from "@acme/shared";

import { getDb } from "../client";
import {
  auditLogs,
  configApps,
  configEntries,
  configEntryVersions,
  configEnvironments,
  configEventOutbox,
  configServiceTokens,
} from "../schema";

export class ConfigVersionConflictError extends Error {
  constructor(message = "The config entry has changed since it was loaded.") {
    super(message);
    this.name = "ConfigVersionConflictError";
  }
}

type StoredConfigValue = {
  valueType: ConfigValueType;
  valueJson?: unknown;
  valueCiphertext?: string | null;
  checksum: string;
};

type AuditInput = {
  organizationId: string;
  eventType: AuditEventType;
  actorUserId?: string | null;
  actorRole?: AuthRole | null;
  targetUserId?: string | null;
  targetEmail?: string | null;
  targetInvitationId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CreateConfigAppRepositoryInput = {
  organizationId: string;
  name: string;
  slug: string;
  description?: string | null;
  createdBy?: string | null;
  auditLog?: AuditInput;
};

export type CreateConfigEnvironmentRepositoryInput =
  CreateConfigAppRepositoryInput & {
    appId: string;
  };

export type UpsertConfigEntryRepositoryInput = StoredConfigValue & {
  organizationId: string;
  environmentId: string;
  key: string;
  description?: string | null;
  expectedVersion?: number | null;
  changeReason?: string | null;
  createdBy?: string | null;
  auditLog?: AuditInput;
};

export type RollbackConfigEntryRepositoryInput = {
  organizationId: string;
  entryId: string;
  targetVersion: number;
  expectedVersion: number;
  changeReason?: string | null;
  createdBy?: string | null;
  auditLog?: AuditInput;
};

export type CreateServiceTokenRepositoryInput = {
  organizationId: string;
  environmentId: string;
  name: string;
  tokenPrefix: string;
  tokenHash: string;
  expiresAt?: Date | null;
  createdBy?: string | null;
  auditLog?: AuditInput;
};

export type ServiceTokenRecord = {
  id: string;
  organizationId: string;
  environmentId: string;
  appId: string;
  active: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type SnapshotEntryRecord = {
  key: string;
  valueType: ConfigValueType;
  valueJson: unknown;
  valueCiphertext: string | null;
  checksum: string;
};

export type EnvironmentSnapshotRecord = {
  app: {
    id: string;
    name: string;
    slug: string;
  };
  environment: {
    id: string;
    name: string;
    slug: string;
    revision: number;
  };
  entries: SnapshotEntryRecord[];
};

export type ConfigOutboxEventRecord = {
  id: string;
  status: string;
  attempts: number;
  payload: ConfigEventDto;
};

export interface ConfigRepository {
  listApps(organizationId: string): Promise<ConfigAppDto[]>;
  createApp(input: CreateConfigAppRepositoryInput): Promise<ConfigAppDto>;
  listEnvironments(
    organizationId: string,
    appId: string,
  ): Promise<ConfigEnvironmentDto[]>;
  createEnvironment(
    input: CreateConfigEnvironmentRepositoryInput,
  ): Promise<ConfigEnvironmentDto>;
  getEnvironment(
    organizationId: string,
    environmentId: string,
  ): Promise<ConfigEnvironmentDto | null>;
  listEntries(
    organizationId: string,
    environmentId: string,
  ): Promise<ConfigEntryDto[]>;
  upsertEntry(
    input: UpsertConfigEntryRepositoryInput,
  ): Promise<{ entry: ConfigEntryDto; event: ConfigEventDto }>;
  listEntryVersions(
    organizationId: string,
    entryId: string,
  ): Promise<ConfigEntryVersionDto[]>;
  rollbackEntry(
    input: RollbackConfigEntryRepositoryInput,
  ): Promise<{ entry: ConfigEntryDto; event: ConfigEventDto }>;
  listServiceTokens(
    organizationId: string,
    environmentId: string,
  ): Promise<ConfigServiceTokenDto[]>;
  createServiceToken(
    input: CreateServiceTokenRepositoryInput,
  ): Promise<ConfigServiceTokenDto>;
  revokeServiceToken(
    organizationId: string,
    tokenId: string,
    auditLog?: AuditInput,
  ): Promise<boolean>;
  findServiceTokenByHash(tokenHash: string): Promise<ServiceTokenRecord | null>;
  touchServiceToken(tokenId: string): Promise<void>;
  getEnvironmentSnapshot(
    environmentId: string,
  ): Promise<EnvironmentSnapshotRecord | null>;
  listPendingOutboxEvents(limit: number): Promise<ConfigOutboxEventRecord[]>;
  markOutboxPublished(eventId: string): Promise<void>;
  markOutboxFailed(
    eventId: string,
    errorMessage: string,
    retryAt?: Date | null,
  ): Promise<void>;
}

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const maskSecretValue = (valueType: string, value: unknown) =>
  valueType === "secret" ? "********" : value;

const parseValueType = (valueType: string): ConfigValueType => {
  if (
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean" ||
    valueType === "json" ||
    valueType === "secret"
  ) {
    return valueType;
  }

  return "json";
};

const toAppDto = (
  app: typeof configApps.$inferSelect,
  environmentCount = 0,
): ConfigAppDto => ({
  id: app.id,
  organizationId: app.organizationId,
  name: app.name,
  slug: app.slug,
  description: app.description ?? null,
  environmentCount,
  createdAt: toIso(app.createdAt),
  updatedAt: toIso(app.updatedAt),
});

const toEnvironmentDto = (
  environment: typeof configEnvironments.$inferSelect,
  entryCount = 0,
  tokenCount = 0,
): ConfigEnvironmentDto => ({
  id: environment.id,
  organizationId: environment.organizationId,
  appId: environment.appId,
  name: environment.name,
  slug: environment.slug,
  description: environment.description ?? null,
  revision: environment.revision,
  entryCount,
  tokenCount,
  createdAt: toIso(environment.createdAt),
  updatedAt: toIso(environment.updatedAt),
});

const toEntryDto = (
  entry: typeof configEntries.$inferSelect,
  version?: typeof configEntryVersions.$inferSelect | null,
): ConfigEntryDto => ({
  id: entry.id,
  organizationId: entry.organizationId,
  environmentId: entry.environmentId,
  key: entry.key,
  valueType: parseValueType(entry.valueType),
  description: entry.description ?? null,
  currentVersion: entry.currentVersion,
  value: maskSecretValue(entry.valueType, version?.valueJson ?? null),
  checksum: version?.checksum ?? null,
  createdAt: toIso(entry.createdAt),
  updatedAt: toIso(entry.updatedAt),
});

const toVersionDto = (
  version: typeof configEntryVersions.$inferSelect,
): ConfigEntryVersionDto => ({
  id: version.id,
  entryId: version.entryId,
  organizationId: version.organizationId,
  environmentId: version.environmentId,
  version: version.version,
  valueType: parseValueType(version.valueType),
  value: maskSecretValue(version.valueType, version.valueJson ?? null),
  checksum: version.checksum,
  changeReason: version.changeReason ?? null,
  rollbackFromVersion: version.rollbackFromVersion ?? null,
  createdBy: version.createdBy ?? null,
  createdAt: toIso(version.createdAt),
});

const toTokenDto = (
  token: typeof configServiceTokens.$inferSelect,
): ConfigServiceTokenDto => ({
  id: token.id,
  organizationId: token.organizationId,
  environmentId: token.environmentId,
  name: token.name,
  tokenPrefix: token.tokenPrefix,
  active: token.active,
  expiresAt: token.expiresAt ? toIso(token.expiresAt) : null,
  lastUsedAt: token.lastUsedAt ? toIso(token.lastUsedAt) : null,
  revokedAt: token.revokedAt ? toIso(token.revokedAt) : null,
  createdAt: toIso(token.createdAt),
});

const appendAuditLog = async (
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  input: AuditInput | undefined,
) => {
  if (!input) {
    return;
  }

  await tx.insert(auditLogs).values({
    organizationId: input.organizationId,
    eventType: input.eventType,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    targetUserId: input.targetUserId ?? null,
    targetEmail: input.targetEmail ?? null,
    targetInvitationId: input.targetInvitationId ?? null,
    requestId: input.requestId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: input.metadata ?? {},
  });
};

const insertOutboxEvent = async (
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  event: ConfigEventDto,
) => {
  await tx.insert(configEventOutbox).values({
    id: event.id,
    organizationId: event.organizationId,
    appId: event.appId,
    environmentId: event.environmentId,
    entryId: event.entryId,
    eventType: event.eventType,
    payload: event,
  });
};

const createEvent = (
  input: Omit<ConfigEventDto, "id" | "occurredAt">,
): ConfigEventDto => ({
  id: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  ...input,
});

const createBackoffDate = (attempts: number) =>
  new Date(Date.now() + Math.min(60_000, 2 ** Math.min(attempts, 6) * 1_000));

export const createConfigRepository = (): ConfigRepository => ({
  async listApps(organizationId) {
    const database = getDb();
    const [apps, counts] = await Promise.all([
      database
        .select()
        .from(configApps)
        .where(eq(configApps.organizationId, organizationId))
        .orderBy(desc(configApps.createdAt)),
      database
        .select({
          appId: configEnvironments.appId,
          value: count(),
        })
        .from(configEnvironments)
        .where(eq(configEnvironments.organizationId, organizationId))
        .groupBy(configEnvironments.appId),
    ]);
    const countByApp = new Map(
      counts.map((row) => [row.appId, Number(row.value)]),
    );

    return apps.map((app) => toAppDto(app, countByApp.get(app.id) ?? 0));
  },

  async createApp(input) {
    const database = getDb();

    return database.transaction(async (tx) => {
      const [app] = await tx
        .insert(configApps)
        .values({
          organizationId: input.organizationId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          createdBy: input.createdBy ?? null,
        })
        .returning();

      if (!app) {
        throw new Error("Failed to create config app.");
      }

      const event = createEvent({
        eventType: "config.app.created",
        organizationId: app.organizationId,
        appId: app.id,
        environmentId: null,
        entryId: null,
        entryKey: null,
        version: null,
        revision: null,
        checksum: null,
      });
      await insertOutboxEvent(tx, event);
      await appendAuditLog(tx, input.auditLog);

      return toAppDto(app, 0);
    });
  },

  async listEnvironments(organizationId, appId) {
    const database = getDb();
    const [environments, entryCounts, tokenCounts] = await Promise.all([
      database
        .select()
        .from(configEnvironments)
        .where(
          and(
            eq(configEnvironments.organizationId, organizationId),
            eq(configEnvironments.appId, appId),
          ),
        )
        .orderBy(desc(configEnvironments.createdAt)),
      database
        .select({
          environmentId: configEntries.environmentId,
          value: count(),
        })
        .from(configEntries)
        .where(eq(configEntries.organizationId, organizationId))
        .groupBy(configEntries.environmentId),
      database
        .select({
          environmentId: configServiceTokens.environmentId,
          value: count(),
        })
        .from(configServiceTokens)
        .where(eq(configServiceTokens.organizationId, organizationId))
        .groupBy(configServiceTokens.environmentId),
    ]);
    const entriesByEnvironment = new Map(
      entryCounts.map((row) => [row.environmentId, Number(row.value)]),
    );
    const tokensByEnvironment = new Map(
      tokenCounts.map((row) => [row.environmentId, Number(row.value)]),
    );

    return environments.map((environment) =>
      toEnvironmentDto(
        environment,
        entriesByEnvironment.get(environment.id) ?? 0,
        tokensByEnvironment.get(environment.id) ?? 0,
      ),
    );
  },

  async createEnvironment(input) {
    const database = getDb();

    return database.transaction(async (tx) => {
      const [environment] = await tx
        .insert(configEnvironments)
        .values({
          organizationId: input.organizationId,
          appId: input.appId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          createdBy: input.createdBy ?? null,
        })
        .returning();

      if (!environment) {
        throw new Error("Failed to create config environment.");
      }

      const event = createEvent({
        eventType: "config.environment.created",
        organizationId: environment.organizationId,
        appId: environment.appId,
        environmentId: environment.id,
        entryId: null,
        entryKey: null,
        version: null,
        revision: environment.revision,
        checksum: null,
      });
      await insertOutboxEvent(tx, event);
      await appendAuditLog(tx, input.auditLog);

      return toEnvironmentDto(environment, 0, 0);
    });
  },

  async getEnvironment(organizationId, environmentId) {
    const database = getDb();
    const [environment] = await database
      .select()
      .from(configEnvironments)
      .where(
        and(
          eq(configEnvironments.organizationId, organizationId),
          eq(configEnvironments.id, environmentId),
        ),
      )
      .limit(1);

    return environment ? toEnvironmentDto(environment) : null;
  },

  async listEntries(organizationId, environmentId) {
    const database = getDb();
    const rows = await database
      .select({
        entry: configEntries,
        version: configEntryVersions,
      })
      .from(configEntries)
      .leftJoin(
        configEntryVersions,
        eq(configEntries.currentVersionId, configEntryVersions.id),
      )
      .where(
        and(
          eq(configEntries.organizationId, organizationId),
          eq(configEntries.environmentId, environmentId),
        ),
      )
      .orderBy(configEntries.key);

    return rows.map((row) => toEntryDto(row.entry, row.version));
  },

  async upsertEntry(input) {
    const database = getDb();

    return database.transaction(async (tx) => {
      const [environment] = await tx
        .select()
        .from(configEnvironments)
        .where(
          and(
            eq(configEnvironments.organizationId, input.organizationId),
            eq(configEnvironments.id, input.environmentId),
          ),
        )
        .limit(1);

      if (!environment) {
        throw new Error("Config environment not found.");
      }

      const [existingEntry] = await tx
        .select()
        .from(configEntries)
        .where(
          and(
            eq(configEntries.environmentId, input.environmentId),
            eq(configEntries.key, input.key),
          ),
        )
        .limit(1);

      const currentVersion = existingEntry?.currentVersion ?? 0;
      const expectedVersion = input.expectedVersion ?? currentVersion;

      if (expectedVersion !== currentVersion) {
        throw new ConfigVersionConflictError();
      }

      const nextVersion = currentVersion + 1;
      const [entry] = existingEntry
        ? await tx
            .update(configEntries)
            .set({
              valueType: input.valueType,
              description: input.description ?? existingEntry.description,
            })
            .where(eq(configEntries.id, existingEntry.id))
            .returning()
        : await tx
            .insert(configEntries)
            .values({
              organizationId: input.organizationId,
              environmentId: input.environmentId,
              key: input.key,
              valueType: input.valueType,
              description: input.description ?? null,
              createdBy: input.createdBy ?? null,
            })
            .returning();

      if (!entry) {
        throw new Error("Failed to write config entry.");
      }

      const [version] = await tx
        .insert(configEntryVersions)
        .values({
          entryId: entry.id,
          organizationId: input.organizationId,
          environmentId: input.environmentId,
          version: nextVersion,
          valueType: input.valueType,
          valueJson: input.valueType === "secret" ? null : input.valueJson,
          valueCiphertext:
            input.valueType === "secret"
              ? (input.valueCiphertext ?? null)
              : null,
          checksum: input.checksum,
          changeReason: input.changeReason ?? null,
          createdBy: input.createdBy ?? null,
        })
        .returning();

      if (!version) {
        throw new Error("Failed to write config version.");
      }

      const [updatedEntry] = await tx
        .update(configEntries)
        .set({
          currentVersion: nextVersion,
          currentVersionId: version.id,
          valueType: input.valueType,
          description: input.description ?? entry.description,
        })
        .where(eq(configEntries.id, entry.id))
        .returning();
      const [updatedEnvironment] = await tx
        .update(configEnvironments)
        .set({
          revision: sql`${configEnvironments.revision} + 1`,
        })
        .where(eq(configEnvironments.id, input.environmentId))
        .returning();

      if (!updatedEntry || !updatedEnvironment) {
        throw new Error("Failed to finalize config write.");
      }

      const event = createEvent({
        eventType: existingEntry
          ? "config.entry.updated"
          : "config.entry.created",
        organizationId: input.organizationId,
        appId: environment.appId,
        environmentId: input.environmentId,
        entryId: updatedEntry.id,
        entryKey: updatedEntry.key,
        version: nextVersion,
        revision: updatedEnvironment.revision,
        checksum: input.checksum,
      });
      await insertOutboxEvent(tx, event);
      await appendAuditLog(tx, input.auditLog);

      return {
        entry: toEntryDto(updatedEntry, version),
        event,
      };
    });
  },

  async listEntryVersions(organizationId, entryId) {
    const database = getDb();
    const versions = await database
      .select()
      .from(configEntryVersions)
      .where(
        and(
          eq(configEntryVersions.organizationId, organizationId),
          eq(configEntryVersions.entryId, entryId),
        ),
      )
      .orderBy(desc(configEntryVersions.version));

    return versions.map(toVersionDto);
  },

  async rollbackEntry(input) {
    const database = getDb();

    return database.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(configEntries)
        .where(
          and(
            eq(configEntries.organizationId, input.organizationId),
            eq(configEntries.id, input.entryId),
          ),
        )
        .limit(1);

      if (!entry) {
        throw new Error("Config entry not found.");
      }

      if (entry.currentVersion !== input.expectedVersion) {
        throw new ConfigVersionConflictError();
      }

      const [targetVersion] = await tx
        .select()
        .from(configEntryVersions)
        .where(
          and(
            eq(configEntryVersions.entryId, input.entryId),
            eq(configEntryVersions.version, input.targetVersion),
          ),
        )
        .limit(1);

      if (!targetVersion) {
        throw new Error("Rollback target version not found.");
      }

      const [environment] = await tx
        .select()
        .from(configEnvironments)
        .where(eq(configEnvironments.id, entry.environmentId))
        .limit(1);

      if (!environment) {
        throw new Error("Config environment not found.");
      }

      const nextVersion = entry.currentVersion + 1;
      const [newVersion] = await tx
        .insert(configEntryVersions)
        .values({
          entryId: entry.id,
          organizationId: input.organizationId,
          environmentId: entry.environmentId,
          version: nextVersion,
          valueType: targetVersion.valueType,
          valueJson: targetVersion.valueJson,
          valueCiphertext: targetVersion.valueCiphertext,
          checksum: targetVersion.checksum,
          changeReason:
            input.changeReason ?? `Rollback to version ${input.targetVersion}`,
          rollbackFromVersion: input.targetVersion,
          createdBy: input.createdBy ?? null,
        })
        .returning();

      if (!newVersion) {
        throw new Error("Failed to write rollback version.");
      }

      const [updatedEntry] = await tx
        .update(configEntries)
        .set({
          currentVersion: nextVersion,
          currentVersionId: newVersion.id,
          valueType: targetVersion.valueType,
        })
        .where(eq(configEntries.id, entry.id))
        .returning();
      const [updatedEnvironment] = await tx
        .update(configEnvironments)
        .set({
          revision: sql`${configEnvironments.revision} + 1`,
        })
        .where(eq(configEnvironments.id, entry.environmentId))
        .returning();

      if (!updatedEntry || !updatedEnvironment) {
        throw new Error("Failed to finalize rollback.");
      }

      const event = createEvent({
        eventType: "config.entry.rollback",
        organizationId: input.organizationId,
        appId: environment.appId,
        environmentId: entry.environmentId,
        entryId: entry.id,
        entryKey: entry.key,
        version: nextVersion,
        revision: updatedEnvironment.revision,
        checksum: targetVersion.checksum,
      });
      await insertOutboxEvent(tx, event);
      await appendAuditLog(tx, input.auditLog);

      return {
        entry: toEntryDto(updatedEntry, newVersion),
        event,
      };
    });
  },

  async listServiceTokens(organizationId, environmentId) {
    const database = getDb();
    const tokens = await database
      .select()
      .from(configServiceTokens)
      .where(
        and(
          eq(configServiceTokens.organizationId, organizationId),
          eq(configServiceTokens.environmentId, environmentId),
        ),
      )
      .orderBy(desc(configServiceTokens.createdAt));

    return tokens.map(toTokenDto);
  },

  async createServiceToken(input) {
    const database = getDb();

    return database.transaction(async (tx) => {
      const [token] = await tx
        .insert(configServiceTokens)
        .values({
          organizationId: input.organizationId,
          environmentId: input.environmentId,
          name: input.name,
          tokenPrefix: input.tokenPrefix,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt ?? null,
          createdBy: input.createdBy ?? null,
        })
        .returning();

      if (!token) {
        throw new Error("Failed to create service token.");
      }

      const [environment] = await tx
        .select()
        .from(configEnvironments)
        .where(eq(configEnvironments.id, input.environmentId))
        .limit(1);

      const event = createEvent({
        eventType: "config.token.created",
        organizationId: input.organizationId,
        appId: environment?.appId ?? null,
        environmentId: input.environmentId,
        entryId: null,
        entryKey: null,
        version: null,
        revision: environment?.revision ?? null,
        checksum: null,
      });
      await insertOutboxEvent(tx, event);
      await appendAuditLog(tx, input.auditLog);

      return toTokenDto(token);
    });
  },

  async revokeServiceToken(organizationId, tokenId, auditLog) {
    const database = getDb();

    return database.transaction(async (tx) => {
      const [token] = await tx
        .update(configServiceTokens)
        .set({
          active: false,
          revokedAt: new Date(),
        })
        .where(
          and(
            eq(configServiceTokens.organizationId, organizationId),
            eq(configServiceTokens.id, tokenId),
          ),
        )
        .returning();

      if (!token) {
        return false;
      }

      const [environment] = await tx
        .select()
        .from(configEnvironments)
        .where(eq(configEnvironments.id, token.environmentId))
        .limit(1);

      const event = createEvent({
        eventType: "config.token.revoked",
        organizationId,
        appId: environment?.appId ?? null,
        environmentId: token.environmentId,
        entryId: null,
        entryKey: null,
        version: null,
        revision: environment?.revision ?? null,
        checksum: null,
      });
      await insertOutboxEvent(tx, event);
      await appendAuditLog(tx, auditLog);

      return true;
    });
  },

  async findServiceTokenByHash(tokenHash) {
    const database = getDb();
    const [row] = await database
      .select({
        token: configServiceTokens,
        environment: configEnvironments,
      })
      .from(configServiceTokens)
      .innerJoin(
        configEnvironments,
        eq(configServiceTokens.environmentId, configEnvironments.id),
      )
      .where(eq(configServiceTokens.tokenHash, tokenHash))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.token.id,
      organizationId: row.token.organizationId,
      environmentId: row.token.environmentId,
      appId: row.environment.appId,
      active: row.token.active,
      expiresAt: row.token.expiresAt ?? null,
      revokedAt: row.token.revokedAt ?? null,
    };
  },

  async touchServiceToken(tokenId) {
    const database = getDb();
    await database
      .update(configServiceTokens)
      .set({
        lastUsedAt: new Date(),
      })
      .where(eq(configServiceTokens.id, tokenId));
  },

  async getEnvironmentSnapshot(environmentId) {
    const database = getDb();
    const [environmentRow] = await database
      .select({
        environment: configEnvironments,
        app: configApps,
      })
      .from(configEnvironments)
      .innerJoin(configApps, eq(configEnvironments.appId, configApps.id))
      .where(eq(configEnvironments.id, environmentId))
      .limit(1);

    if (!environmentRow) {
      return null;
    }

    const rows = await database
      .select({
        entry: configEntries,
        version: configEntryVersions,
      })
      .from(configEntries)
      .innerJoin(
        configEntryVersions,
        eq(configEntries.currentVersionId, configEntryVersions.id),
      )
      .where(eq(configEntries.environmentId, environmentId))
      .orderBy(configEntries.key);

    return {
      app: {
        id: environmentRow.app.id,
        name: environmentRow.app.name,
        slug: environmentRow.app.slug,
      },
      environment: {
        id: environmentRow.environment.id,
        name: environmentRow.environment.name,
        slug: environmentRow.environment.slug,
        revision: environmentRow.environment.revision,
      },
      entries: rows.map((row) => ({
        key: row.entry.key,
        valueType: parseValueType(row.version.valueType),
        valueJson: row.version.valueJson,
        valueCiphertext: row.version.valueCiphertext ?? null,
        checksum: row.version.checksum,
      })),
    };
  },

  async listPendingOutboxEvents(limit) {
    const database = getDb();
    const now = new Date();
    const rows = await database
      .select()
      .from(configEventOutbox)
      .where(
        or(
          eq(configEventOutbox.status, "pending"),
          and(
            eq(configEventOutbox.status, "failed"),
            or(
              isNull(configEventOutbox.nextAttemptAt),
              lte(configEventOutbox.nextAttemptAt, now),
            ),
          ),
        ),
      )
      .orderBy(configEventOutbox.createdAt)
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      attempts: row.attempts,
      payload: row.payload as ConfigEventDto,
    }));
  },

  async markOutboxPublished(eventId) {
    const database = getDb();
    await database
      .update(configEventOutbox)
      .set({
        status: "published",
        publishedAt: new Date(),
        lastError: null,
        nextAttemptAt: null,
      })
      .where(eq(configEventOutbox.id, eventId));
  },

  async markOutboxFailed(eventId, errorMessage, retryAt) {
    const database = getDb();
    const [existing] = await database
      .select()
      .from(configEventOutbox)
      .where(eq(configEventOutbox.id, eventId))
      .limit(1);

    await database
      .update(configEventOutbox)
      .set({
        status: "failed",
        attempts: sql`${configEventOutbox.attempts} + 1`,
        lastError: errorMessage,
        nextAttemptAt:
          retryAt ?? createBackoffDate((existing?.attempts ?? 0) + 1),
      })
      .where(eq(configEventOutbox.id, eventId));
  },
});
