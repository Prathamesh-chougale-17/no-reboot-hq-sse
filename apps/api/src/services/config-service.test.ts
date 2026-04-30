import { loadApiEnv } from "@acme/config";
import type {
  ConfigRepository,
  EnvironmentSnapshotRecord,
  ServiceTokenRecord,
} from "@acme/db";
import type { ConfigEventDto } from "@acme/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("@acme/auth", () => ({
  canManageMembers: (role: string | null | undefined) =>
    role === "owner" || role === "admin",
}));

import { encryptConfigSecret, hashServiceToken } from "../lib/config-security";
import { AppError } from "../lib/http";
import { ConfigService } from "./config-service";

const organizationId = "0faef1a3-1a0f-4cf6-96a0-a9382c006f17";
const appId = "79d2b571-0bb3-445d-9c5c-2a2523df0f68";
const environmentId = "6db490ed-fbda-4c58-9d65-c6eb4734c769";
const otherEnvironmentId = "0f121687-c9dd-4568-9ec1-34ccb6df4f5c";
const tokenId = "aa20a6f7-85c2-4f03-8573-1a4074e3db0f";
const entryId = "e780a0cf-f0f1-4a9b-8d2e-c8ecde52a31c";
const encryptionKey = "local-config-encryption-key-32-bytes";
const tokenPepper = "local-config-token-pepper-32-bytes";

const env = loadApiEnv({
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/acme_platform",
  CONFIG_ENCRYPTION_KEY: encryptionKey,
  CONFIG_TOKEN_PEPPER: tokenPepper,
});

const serviceToken: ServiceTokenRecord = {
  id: tokenId,
  organizationId,
  environmentId,
  appId,
  active: true,
  expiresAt: null,
  revokedAt: null,
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
    listPendingOutboxEvents: vi.fn(),
    markOutboxPublished: vi.fn(),
    markOutboxFailed: vi.fn(),
    ...overrides,
  }) as ConfigRepository;

const createEvent = (
  overrides: Partial<ConfigEventDto> = {},
): ConfigEventDto => ({
  id: "d0c91e92-8f65-46d7-9d2e-dbd59f072a1a",
  eventType: "config.entry.updated",
  organizationId,
  appId,
  environmentId,
  entryId,
  entryKey: "FEATURE_CHECKOUT_ENABLED",
  version: 2,
  revision: 4,
  checksum: "checksum",
  occurredAt: new Date("2026-04-30T00:00:00.000Z").toISOString(),
  ...overrides,
});

describe("ConfigService no-reboot client contract", () => {
  it("authenticates active service tokens by hash and records usage", async () => {
    const secret = "nrhq_sk_test-token-secret";
    const findServiceTokenByHash = vi.fn(async () => serviceToken);
    const touchServiceToken = vi.fn(async () => undefined);
    const repository = createRepository({
      findServiceTokenByHash,
      touchServiceToken,
    });
    const service = new ConfigService(repository, env);

    const token = await service.authenticateServiceClient(
      new Headers({ authorization: `Bearer ${secret}` }),
    );

    expect(token).toEqual(serviceToken);
    expect(findServiceTokenByHash).toHaveBeenCalledWith(
      hashServiceToken(secret, tokenPepper),
    );
    expect(touchServiceToken).toHaveBeenCalledWith(tokenId);
  });

  it("rejects expired service tokens before touching usage metadata", async () => {
    const repository = createRepository({
      findServiceTokenByHash: vi.fn(async () => ({
        ...serviceToken,
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      })),
      touchServiceToken: vi.fn(async () => undefined),
    });
    const service = new ConfigService(repository, env);

    await expect(
      service.authenticateServiceClient(
        new Headers({ authorization: "Bearer nrhq_sk_expired" }),
      ),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: "UNAUTHORIZED",
    } satisfies Partial<AppError>);

    expect(repository.touchServiceToken).not.toHaveBeenCalled();
  });

  it("returns a typed snapshot with decrypted secrets for the scoped environment", async () => {
    const snapshotRecord: EnvironmentSnapshotRecord = {
      app: {
        id: appId,
        name: "Billing API",
        slug: "billing-api",
      },
      environment: {
        id: environmentId,
        name: "Production",
        slug: "production",
        revision: 7,
      },
      entries: [
        {
          key: "FEATURE_CHECKOUT_ENABLED",
          valueType: "boolean",
          valueJson: true,
          valueCiphertext: null,
          checksum: "feature-checksum",
        },
        {
          key: "PAYMENT_API_KEY",
          valueType: "secret",
          valueJson: null,
          valueCiphertext: encryptConfigSecret("live-secret", encryptionKey),
          checksum: "secret-checksum",
        },
      ],
    };
    const repository = createRepository({
      getEnvironmentSnapshot: vi.fn(async () => snapshotRecord),
    });
    const service = new ConfigService(repository, env);

    const snapshot = await service.getServiceSnapshot(serviceToken);

    expect(repository.getEnvironmentSnapshot).toHaveBeenCalledWith(
      environmentId,
    );
    expect(snapshot).toMatchObject({
      app: snapshotRecord.app,
      environment: {
        id: environmentId,
        name: "Production",
        slug: "production",
      },
      revision: 7,
      config: {
        FEATURE_CHECKOUT_ENABLED: true,
        PAYMENT_API_KEY: "live-secret",
      },
    });
  });

  it("limits service-token SSE events to the token environment only", () => {
    const service = new ConfigService(createRepository(), env);

    expect(service.serviceTokenCanReadEvent(serviceToken, createEvent())).toBe(
      true,
    );
    expect(
      service.serviceTokenCanReadEvent(
        serviceToken,
        createEvent({ environmentId: otherEnvironmentId }),
      ),
    ).toBe(false);
    expect(
      service.serviceTokenCanReadEvent(
        serviceToken,
        createEvent({ environmentId: null, entryId: null, entryKey: null }),
      ),
    ).toBe(false);
  });
});
