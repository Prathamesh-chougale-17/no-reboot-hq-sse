import { canManageMembers, type ResolvedAuthContext } from "@acme/auth";
import type { ApiEnv } from "@acme/config";
import type { ConfigRepository, ServiceTokenRecord } from "@acme/db";
import { ConfigVersionConflictError } from "@acme/db";
import type {
  ConfigAppDto,
  ConfigEntryListDto,
  ConfigEntryVersionListDto,
  ConfigEnvironmentDto,
  ConfigEventDto,
  ConfigServiceTokenListDto,
  ConfigSnapshotDto,
  CreateConfigAppInput,
  CreateConfigAppResultDto,
  CreateConfigEnvironmentInput,
  CreateConfigEnvironmentResultDto,
  CreateConfigServiceTokenInput,
  CreateConfigServiceTokenResultDto,
  DeleteConfigServiceTokenResultDto,
  RollbackConfigEntryInput,
  RollbackConfigEntryResultDto,
  UpsertConfigEntryInput,
  UpsertConfigEntryResultDto,
} from "@acme/shared";

import { AppError } from "../lib/http";
import {
  createConfigChecksum,
  decryptConfigSecret,
  encryptConfigSecret,
  generateServiceTokenSecret,
  getServiceTokenPrefix,
  hashServiceToken,
  normalizeConfigValue,
} from "../lib/config-security";
import { observeConfigSnapshot } from "../lib/metrics";

type AuditRequestMetadata = {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const toSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const assertOrganization = (authContext: ResolvedAuthContext): string => {
  if (!authContext.organizationId) {
    throw new AppError(403, "FORBIDDEN", "An active organization is required");
  }

  return authContext.organizationId;
};

const assertConfigManager = (authContext: ResolvedAuthContext): string => {
  const organizationId = assertOrganization(authContext);

  if (!canManageMembers(authContext.role)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only owners and admins can manage dynamic configuration",
    );
  }

  return organizationId;
};

const handleRepositoryError = (error: unknown): never => {
  if (error instanceof ConfigVersionConflictError) {
    throw new AppError(409, "CONFLICT", error.message);
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  ) {
    throw new AppError(
      409,
      "CONFLICT",
      "A config resource with that slug or key already exists",
    );
  }

  throw error;
};

const getBearerSecret = (headers: Headers): string | null => {
  const authorization = headers.get("authorization");

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice("bearer ".length).trim();
};

export class ConfigService {
  constructor(
    private readonly configRepository: ConfigRepository,
    private readonly env: ApiEnv,
  ) {}

  async listApps(authContext: ResolvedAuthContext): Promise<ConfigAppDto[]> {
    return this.configRepository.listApps(assertOrganization(authContext));
  }

  async createApp(
    authContext: ResolvedAuthContext,
    input: CreateConfigAppInput,
    auditMetadata: AuditRequestMetadata,
  ): Promise<CreateConfigAppResultDto> {
    const organizationId = assertConfigManager(authContext);
    const slug = input.slug ?? toSlug(input.name);

    try {
      const app = await this.configRepository.createApp({
        organizationId,
        name: input.name,
        slug,
        description: input.description ?? null,
        createdBy: authContext.user.id,
        auditLog: {
          organizationId,
          eventType: "config.app.created",
          actorUserId: authContext.user.id,
          actorRole: authContext.role,
          requestId: auditMetadata.requestId ?? null,
          ipAddress: auditMetadata.ipAddress ?? null,
          userAgent: auditMetadata.userAgent ?? null,
          metadata: {
            appName: input.name,
            appSlug: slug,
          },
        },
      });

      return { app };
    } catch (error) {
      return handleRepositoryError(error);
    }
  }

  async listEnvironments(
    authContext: ResolvedAuthContext,
    appId: string,
  ): Promise<ConfigEnvironmentDto[]> {
    return this.configRepository.listEnvironments(
      assertOrganization(authContext),
      appId,
    );
  }

  async createEnvironment(
    authContext: ResolvedAuthContext,
    appId: string,
    input: CreateConfigEnvironmentInput,
    auditMetadata: AuditRequestMetadata,
  ): Promise<CreateConfigEnvironmentResultDto> {
    const organizationId = assertConfigManager(authContext);
    const slug = input.slug ?? toSlug(input.name);

    try {
      const environment = await this.configRepository.createEnvironment({
        organizationId,
        appId,
        name: input.name,
        slug,
        description: input.description ?? null,
        createdBy: authContext.user.id,
        auditLog: {
          organizationId,
          eventType: "config.environment.created",
          actorUserId: authContext.user.id,
          actorRole: authContext.role,
          requestId: auditMetadata.requestId ?? null,
          ipAddress: auditMetadata.ipAddress ?? null,
          userAgent: auditMetadata.userAgent ?? null,
          metadata: {
            appId,
            environmentName: input.name,
            environmentSlug: slug,
          },
        },
      });

      return { environment };
    } catch (error) {
      return handleRepositoryError(error);
    }
  }

  async listEntries(
    authContext: ResolvedAuthContext,
    environmentId: string,
  ): Promise<ConfigEntryListDto> {
    const organizationId = assertOrganization(authContext);
    const environment = await this.configRepository.getEnvironment(
      organizationId,
      environmentId,
    );

    if (!environment) {
      throw new AppError(404, "NOT_FOUND", "Config environment not found");
    }

    return {
      items: await this.configRepository.listEntries(
        organizationId,
        environmentId,
      ),
    };
  }

  async upsertEntry(
    authContext: ResolvedAuthContext,
    environmentId: string,
    input: UpsertConfigEntryInput,
    auditMetadata: AuditRequestMetadata,
  ): Promise<UpsertConfigEntryResultDto> {
    const organizationId = assertConfigManager(authContext);
    const normalizedValue = normalizeConfigValue(input.valueType, input.value);
    const checksum = createConfigChecksum(normalizedValue);

    try {
      return await this.configRepository.upsertEntry({
        organizationId,
        environmentId,
        key: input.key,
        valueType: input.valueType,
        valueJson: input.valueType === "secret" ? undefined : normalizedValue,
        valueCiphertext:
          input.valueType === "secret"
            ? encryptConfigSecret(
                normalizedValue,
                this.env.CONFIG_ENCRYPTION_KEY,
              )
            : null,
        checksum,
        expectedVersion: input.expectedVersion ?? null,
        description: input.description ?? null,
        changeReason: input.changeReason ?? null,
        createdBy: authContext.user.id,
        auditLog: {
          organizationId,
          eventType:
            input.expectedVersion === 0 || input.expectedVersion === null
              ? "config.entry.created"
              : "config.entry.updated",
          actorUserId: authContext.user.id,
          actorRole: authContext.role,
          requestId: auditMetadata.requestId ?? null,
          ipAddress: auditMetadata.ipAddress ?? null,
          userAgent: auditMetadata.userAgent ?? null,
          metadata: {
            environmentId,
            key: input.key,
            valueType: input.valueType,
            secret: input.valueType === "secret",
          },
        },
      });
    } catch (error) {
      return handleRepositoryError(error);
    }
  }

  async listEntryVersions(
    authContext: ResolvedAuthContext,
    entryId: string,
  ): Promise<ConfigEntryVersionListDto> {
    return {
      items: await this.configRepository.listEntryVersions(
        assertOrganization(authContext),
        entryId,
      ),
    };
  }

  async rollbackEntry(
    authContext: ResolvedAuthContext,
    entryId: string,
    input: RollbackConfigEntryInput,
    auditMetadata: AuditRequestMetadata,
  ): Promise<RollbackConfigEntryResultDto> {
    const organizationId = assertConfigManager(authContext);

    try {
      return await this.configRepository.rollbackEntry({
        organizationId,
        entryId,
        targetVersion: input.targetVersion,
        expectedVersion: input.expectedVersion,
        changeReason: input.changeReason ?? null,
        createdBy: authContext.user.id,
        auditLog: {
          organizationId,
          eventType: "config.entry.rollback",
          actorUserId: authContext.user.id,
          actorRole: authContext.role,
          requestId: auditMetadata.requestId ?? null,
          ipAddress: auditMetadata.ipAddress ?? null,
          userAgent: auditMetadata.userAgent ?? null,
          metadata: {
            entryId,
            targetVersion: input.targetVersion,
          },
        },
      });
    } catch (error) {
      return handleRepositoryError(error);
    }
  }

  async listServiceTokens(
    authContext: ResolvedAuthContext,
    environmentId: string,
  ): Promise<ConfigServiceTokenListDto> {
    const organizationId = assertConfigManager(authContext);

    return {
      items: await this.configRepository.listServiceTokens(
        organizationId,
        environmentId,
      ),
    };
  }

  async createServiceToken(
    authContext: ResolvedAuthContext,
    environmentId: string,
    input: CreateConfigServiceTokenInput,
    auditMetadata: AuditRequestMetadata,
  ): Promise<CreateConfigServiceTokenResultDto> {
    const organizationId = assertConfigManager(authContext);
    const secret = generateServiceTokenSecret();

    try {
      const token = await this.configRepository.createServiceToken({
        organizationId,
        environmentId,
        name: input.name,
        tokenPrefix: getServiceTokenPrefix(secret),
        tokenHash: hashServiceToken(secret, this.env.CONFIG_TOKEN_PEPPER),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: authContext.user.id,
        auditLog: {
          organizationId,
          eventType: "config.token.created",
          actorUserId: authContext.user.id,
          actorRole: authContext.role,
          requestId: auditMetadata.requestId ?? null,
          ipAddress: auditMetadata.ipAddress ?? null,
          userAgent: auditMetadata.userAgent ?? null,
          metadata: {
            environmentId,
            tokenName: input.name,
          },
        },
      });

      return {
        token,
        secret,
      };
    } catch (error) {
      return handleRepositoryError(error);
    }
  }

  async revokeServiceToken(
    authContext: ResolvedAuthContext,
    tokenId: string,
    auditMetadata: AuditRequestMetadata,
  ): Promise<DeleteConfigServiceTokenResultDto> {
    const organizationId = assertConfigManager(authContext);
    const deleted = await this.configRepository.revokeServiceToken(
      organizationId,
      tokenId,
      {
        organizationId,
        eventType: "config.token.revoked",
        actorUserId: authContext.user.id,
        actorRole: authContext.role,
        requestId: auditMetadata.requestId ?? null,
        ipAddress: auditMetadata.ipAddress ?? null,
        userAgent: auditMetadata.userAgent ?? null,
        metadata: {
          tokenId,
        },
      },
    );

    if (!deleted) {
      throw new AppError(404, "NOT_FOUND", "Service token not found");
    }

    return { tokenId };
  }

  async authenticateServiceClient(
    headers: Headers,
  ): Promise<ServiceTokenRecord> {
    const secret = getBearerSecret(headers);

    if (!secret) {
      throw new AppError(401, "UNAUTHORIZED", "A service token is required");
    }

    const token = await this.configRepository.findServiceTokenByHash(
      hashServiceToken(secret, this.env.CONFIG_TOKEN_PEPPER),
    );

    if (!token || !token.active || token.revokedAt) {
      throw new AppError(401, "UNAUTHORIZED", "Service token is invalid");
    }

    if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) {
      throw new AppError(401, "UNAUTHORIZED", "Service token has expired");
    }

    await this.configRepository.touchServiceToken(token.id);
    return token;
  }

  async getServiceSnapshot(
    serviceToken: ServiceTokenRecord,
  ): Promise<ConfigSnapshotDto> {
    const snapshot = await this.configRepository.getEnvironmentSnapshot(
      serviceToken.environmentId,
    );

    if (!snapshot) {
      throw new AppError(404, "NOT_FOUND", "Config environment not found");
    }

    const config = snapshot.entries.reduce<Record<string, unknown>>(
      (accumulator, entry) => {
        accumulator[entry.key] =
          entry.valueType === "secret" && entry.valueCiphertext
            ? decryptConfigSecret(
                entry.valueCiphertext,
                this.env.CONFIG_ENCRYPTION_KEY,
              )
            : entry.valueJson;

        return accumulator;
      },
      {},
    );

    observeConfigSnapshot(snapshot.environment.id);

    return {
      app: snapshot.app,
      environment: {
        id: snapshot.environment.id,
        name: snapshot.environment.name,
        slug: snapshot.environment.slug,
      },
      revision: snapshot.environment.revision,
      config,
      generatedAt: new Date().toISOString(),
    };
  }

  canReadEnvironmentEvent(
    authContext: ResolvedAuthContext,
    environmentId: string,
  ): Promise<ConfigEnvironmentDto | null> {
    const organizationId = assertOrganization(authContext);
    return this.configRepository.getEnvironment(organizationId, environmentId);
  }

  serviceTokenCanReadEvent(
    serviceToken: ServiceTokenRecord,
    event: ConfigEventDto,
  ): boolean {
    return (
      event.environmentId === serviceToken.environmentId ||
      event.environmentId === null ||
      event.appId === serviceToken.appId
    );
  }
}
