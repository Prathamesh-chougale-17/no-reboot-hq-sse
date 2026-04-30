import { loadApiEnv } from "@acme/config";
import type { ConfigOutboxEventRecord, ConfigRepository } from "@acme/db";
import type { AppLogger } from "@acme/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureConfigEventsTopicMock, publishConfigEventMock } = vi.hoisted(
  () => ({
    ensureConfigEventsTopicMock: vi.fn(),
    publishConfigEventMock: vi.fn(),
  }),
);

vi.mock("@acme/events", () => ({
  ensureConfigEventsTopic: ensureConfigEventsTopicMock,
  publishConfigEvent: publishConfigEventMock,
}));

import { ConfigOutboxPublisher } from "./config-outbox-publisher";

const env = loadApiEnv({
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/acme_platform",
  KAFKA_BROKERS: "localhost:19092",
  CONFIG_EVENTS_TOPIC: "config.events",
});

const event: ConfigOutboxEventRecord = {
  id: "d0c91e92-8f65-46d7-9d2e-dbd59f072a1a",
  status: "pending",
  attempts: 0,
  payload: {
    id: "d0c91e92-8f65-46d7-9d2e-dbd59f072a1a",
    eventType: "config.entry.updated",
    organizationId: "0faef1a3-1a0f-4cf6-96a0-a9382c006f17",
    appId: "79d2b571-0bb3-445d-9c5c-2a2523df0f68",
    environmentId: "6db490ed-fbda-4c58-9d65-c6eb4734c769",
    entryId: "e780a0cf-f0f1-4a9b-8d2e-c8ecde52a31c",
    entryKey: "FEATURE_CHECKOUT_ENABLED",
    version: 2,
    revision: 4,
    checksum: "checksum",
    occurredAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
  },
};

const createRepository = (
  overrides: Partial<ConfigRepository> = {},
): ConfigRepository =>
  ({
    listApps: vi.fn(),
    createApp: vi.fn(),
    listEnvironments: vi.fn(),
    createEnvironment: vi.fn(),
    getEnvironment: vi.fn(),
    listEntries: vi.fn(),
    upsertEntry: vi.fn(),
    listEntryVersions: vi.fn(),
    rollbackEntry: vi.fn(),
    listServiceTokens: vi.fn(),
    createServiceToken: vi.fn(),
    revokeServiceToken: vi.fn(),
    findServiceTokenByHash: vi.fn(),
    touchServiceToken: vi.fn(),
    getEnvironmentSnapshot: vi.fn(),
    listPendingOutboxEvents: vi.fn(async () => [event]),
    markOutboxPublished: vi.fn(async () => undefined),
    markOutboxFailed: vi.fn(async () => undefined),
    ...overrides,
  }) as ConfigRepository;

const logger = {
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as AppLogger;

describe("ConfigOutboxPublisher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes pending config events and marks them published", async () => {
    publishConfigEventMock.mockResolvedValueOnce(true);
    const repository = createRepository();
    const publisher = new ConfigOutboxPublisher(repository, env, logger);

    await publisher.publishBatch();

    expect(repository.listPendingOutboxEvents).toHaveBeenCalledWith(50);
    expect(publishConfigEventMock).toHaveBeenCalledWith(event.payload, env);
    expect(repository.markOutboxPublished).toHaveBeenCalledWith(event.id);
    expect(repository.markOutboxFailed).not.toHaveBeenCalled();
  });

  it("keeps outbox events retryable when Kafka publishing is disabled", async () => {
    publishConfigEventMock.mockResolvedValueOnce(false);
    const repository = createRepository();
    const publisher = new ConfigOutboxPublisher(repository, env, logger);

    await publisher.publishBatch();

    expect(repository.markOutboxPublished).not.toHaveBeenCalled();
    expect(repository.markOutboxFailed).toHaveBeenCalledWith(
      event.id,
      "KAFKA_BROKERS is not configured; config event streaming is disabled.",
    );
  });
});
