import {
  AcceptInvitationResultDtoSchema,
  AuditLogListDtoSchema,
  ConfigAppListDtoSchema,
  ConfigEntryListDtoSchema,
  ConfigEntryVersionListDtoSchema,
  ConfigEnvironmentListDtoSchema,
  ConfigServiceTokenListDtoSchema,
  CreateConfigAppInputSchema,
  CreateConfigAppResultDtoSchema,
  CreateConfigEnvironmentInputSchema,
  CreateConfigEnvironmentResultDtoSchema,
  CreateConfigServiceTokenInputSchema,
  CreateConfigServiceTokenResultDtoSchema,
  CreateInvitationInputSchema,
  CreateInvitationResultDtoSchema,
  CreateWorkspaceInputSchema,
  CreateWorkspaceResultDtoSchema,
  CurrentUserDtoSchema,
  DeleteConfigServiceTokenResultDtoSchema,
  HealthDtoSchema,
  InvitationPreviewDtoSchema,
  OnboardingStateDtoSchema,
  RollbackConfigEntryInputSchema,
  RollbackConfigEntryResultDtoSchema,
  UpsertConfigEntryInputSchema,
  UpsertConfigEntryResultDtoSchema,
  UsersWorkspaceDtoSchema,
  type AcceptInvitationResultDto,
  type AuditLogListDto,
  type ApiResponse,
  type ConfigAppListDto,
  type ConfigEntryListDto,
  type ConfigEntryVersionListDto,
  type ConfigEnvironmentListDto,
  type ConfigServiceTokenListDto,
  type CreateConfigAppInput,
  type CreateConfigAppResultDto,
  type CreateConfigEnvironmentInput,
  type CreateConfigEnvironmentResultDto,
  type CreateConfigServiceTokenInput,
  type CreateConfigServiceTokenResultDto,
  type CreateInvitationInput,
  type CreateInvitationResultDto,
  type CreateWorkspaceInput,
  type CreateWorkspaceResultDto,
  type CurrentUserDto,
  type DeleteConfigServiceTokenResultDto,
  type HealthDto,
  type InvitationPreviewDto,
  type OnboardingStateDto,
  type RollbackConfigEntryInput,
  type RollbackConfigEntryResultDto,
  type UpsertConfigEntryInput,
  type UpsertConfigEntryResultDto,
  type UsersWorkspaceDto,
} from "@acme/shared";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const REQUEST_TIMEOUT_MS = 20_000;
const INVITATION_REQUEST_TIMEOUT_MS = 45_000;

const parseApiResponse = async (
  response: Response,
): Promise<ApiResponse<unknown> | undefined> => {
  const text = await response.text();

  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as ApiResponse<unknown>;
  } catch {
    return undefined;
  }
};

const request = async <T>(
  path: string,
  init: RequestInit,
  schema: { parse(data: unknown): T },
  options?: {
    timeoutMs?: number;
    timeoutMessage?: string;
  },
): Promise<T> => {
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, {
      cache: "no-store",
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    const payload = await parseApiResponse(response);

    if (!response.ok) {
      throw new ApiClientError(
        payload?.success === false
          ? payload.error.message
          : `Request failed with status ${response.status}`,
        response.status,
        payload?.success === false ? payload.error.code : undefined,
      );
    }

    if (!payload?.success) {
      throw new ApiClientError(
        "API returned an invalid response payload",
        response.status,
      );
    }

    return schema.parse(payload.data);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError(
        options?.timeoutMessage ??
          `Request timed out after ${timeoutMs / 1000}s. Confirm the web API proxy is configured and the upstream API is reachable.`,
        504,
        "REQUEST_TIMEOUT",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const apiClient = {
  getHealth: () =>
    request<HealthDto>("/api/v1/health", { method: "GET" }, HealthDtoSchema),
  getMe: () =>
    request<CurrentUserDto>(
      "/api/v1/me",
      { method: "GET" },
      CurrentUserDtoSchema,
    ),
  getOnboardingState: () =>
    request<OnboardingStateDto>(
      "/api/v1/onboarding",
      { method: "GET" },
      OnboardingStateDtoSchema,
    ),
  getInvitationPreview: (invitationId: string) =>
    request<InvitationPreviewDto>(
      `/api/v1/invitations/${encodeURIComponent(invitationId)}/preview`,
      { method: "GET" },
      InvitationPreviewDtoSchema,
    ),
  getUsersWorkspace: () =>
    request<UsersWorkspaceDto>(
      "/api/v1/users",
      { method: "GET" },
      UsersWorkspaceDtoSchema,
    ),
  getAuditLogs: (limit = 25) =>
    request<AuditLogListDto>(
      `/api/v1/audit-logs?limit=${encodeURIComponent(String(limit))}`,
      { method: "GET" },
      AuditLogListDtoSchema,
    ),
  getConfigApps: () =>
    request<ConfigAppListDto>(
      "/api/v1/config/apps",
      { method: "GET" },
      ConfigAppListDtoSchema,
    ),
  createConfigApp: (input: CreateConfigAppInput) =>
    request<CreateConfigAppResultDto>(
      "/api/v1/config/apps",
      {
        method: "POST",
        body: JSON.stringify(CreateConfigAppInputSchema.parse(input)),
      },
      CreateConfigAppResultDtoSchema,
    ),
  getConfigEnvironments: (appId: string) =>
    request<ConfigEnvironmentListDto>(
      `/api/v1/config/apps/${encodeURIComponent(appId)}/environments`,
      { method: "GET" },
      ConfigEnvironmentListDtoSchema,
    ),
  createConfigEnvironment: (
    appId: string,
    input: CreateConfigEnvironmentInput,
  ) =>
    request<CreateConfigEnvironmentResultDto>(
      `/api/v1/config/apps/${encodeURIComponent(appId)}/environments`,
      {
        method: "POST",
        body: JSON.stringify(CreateConfigEnvironmentInputSchema.parse(input)),
      },
      CreateConfigEnvironmentResultDtoSchema,
    ),
  getConfigEntries: (environmentId: string) =>
    request<ConfigEntryListDto>(
      `/api/v1/config/environments/${encodeURIComponent(environmentId)}/entries`,
      { method: "GET" },
      ConfigEntryListDtoSchema,
    ),
  upsertConfigEntry: (environmentId: string, input: UpsertConfigEntryInput) =>
    request<UpsertConfigEntryResultDto>(
      `/api/v1/config/environments/${encodeURIComponent(environmentId)}/entries`,
      {
        method: "POST",
        body: JSON.stringify(UpsertConfigEntryInputSchema.parse(input)),
      },
      UpsertConfigEntryResultDtoSchema,
    ),
  getConfigEntryVersions: (entryId: string) =>
    request<ConfigEntryVersionListDto>(
      `/api/v1/config/entries/${encodeURIComponent(entryId)}/versions`,
      { method: "GET" },
      ConfigEntryVersionListDtoSchema,
    ),
  rollbackConfigEntry: (entryId: string, input: RollbackConfigEntryInput) =>
    request<RollbackConfigEntryResultDto>(
      `/api/v1/config/entries/${encodeURIComponent(entryId)}/rollback`,
      {
        method: "POST",
        body: JSON.stringify(RollbackConfigEntryInputSchema.parse(input)),
      },
      RollbackConfigEntryResultDtoSchema,
    ),
  getConfigServiceTokens: (environmentId: string) =>
    request<ConfigServiceTokenListDto>(
      `/api/v1/config/environments/${encodeURIComponent(environmentId)}/tokens`,
      { method: "GET" },
      ConfigServiceTokenListDtoSchema,
    ),
  createConfigServiceToken: (
    environmentId: string,
    input: CreateConfigServiceTokenInput,
  ) =>
    request<CreateConfigServiceTokenResultDto>(
      `/api/v1/config/environments/${encodeURIComponent(environmentId)}/tokens`,
      {
        method: "POST",
        body: JSON.stringify(CreateConfigServiceTokenInputSchema.parse(input)),
      },
      CreateConfigServiceTokenResultDtoSchema,
    ),
  revokeConfigServiceToken: (tokenId: string) =>
    request<DeleteConfigServiceTokenResultDto>(
      `/api/v1/config/tokens/${encodeURIComponent(tokenId)}`,
      {
        method: "DELETE",
      },
      DeleteConfigServiceTokenResultDtoSchema,
    ),
  createWorkspace: (input: CreateWorkspaceInput) =>
    request<CreateWorkspaceResultDto>(
      "/api/v1/workspaces",
      {
        method: "POST",
        body: JSON.stringify(CreateWorkspaceInputSchema.parse(input)),
      },
      CreateWorkspaceResultDtoSchema,
    ),
  createInvitation: (input: CreateInvitationInput) =>
    request<CreateInvitationResultDto>(
      "/api/v1/invitations",
      {
        method: "POST",
        body: JSON.stringify(CreateInvitationInputSchema.parse(input)),
      },
      CreateInvitationResultDtoSchema,
      {
        timeoutMs: INVITATION_REQUEST_TIMEOUT_MS,
        timeoutMessage: `Invitation request timed out after ${INVITATION_REQUEST_TIMEOUT_MS / 1000}s. The invite may still finish in the background. Refresh the workspace and confirm the email provider is healthy.`,
      },
    ),
  acceptInvitation: (invitationId: string) =>
    request<AcceptInvitationResultDto>(
      `/api/v1/invitations/${encodeURIComponent(invitationId)}/accept`,
      {
        method: "POST",
      },
      AcceptInvitationResultDtoSchema,
    ),
};
