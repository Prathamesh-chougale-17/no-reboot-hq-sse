"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type {
  AuditLogListDto,
  ConfigAppListDto,
  ConfigEntryListDto,
  ConfigEntryVersionListDto,
  ConfigEnvironmentListDto,
  ConfigServiceTokenListDto,
  CurrentUserDto,
  HealthDto,
  InvitationPreviewDto,
  OnboardingStateDto,
  UsersWorkspaceDto,
} from "@acme/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export const useHealthQuery = (): UseQueryResult<HealthDto> =>
  useQuery({
    queryKey: queryKeys.health,
    queryFn: apiClient.getHealth,
    retry: false,
  });

export const useCurrentUserQuery = (): UseQueryResult<CurrentUserDto> =>
  useQuery({
    queryKey: queryKeys.me,
    queryFn: apiClient.getMe,
  });

export const useOnboardingQuery = (): UseQueryResult<OnboardingStateDto> =>
  useQuery({
    queryKey: queryKeys.onboarding,
    queryFn: apiClient.getOnboardingState,
  });

export const useInvitationPreviewQuery = (
  invitationId: string | undefined,
): UseQueryResult<InvitationPreviewDto> =>
  useQuery({
    queryKey: queryKeys.invitations.preview(invitationId ?? "missing"),
    queryFn: () => apiClient.getInvitationPreview(invitationId!),
    enabled: Boolean(invitationId),
    retry: false,
  });

export const useUsersWorkspaceQuery = (
  enabled = true,
): UseQueryResult<UsersWorkspaceDto> =>
  useQuery({
    queryKey: queryKeys.users.workspace,
    queryFn: apiClient.getUsersWorkspace,
    enabled,
  });

export const useAuditLogsQuery = (
  limit = 25,
  enabled = true,
): UseQueryResult<AuditLogListDto> =>
  useQuery({
    queryKey: queryKeys.users.audit(limit),
    queryFn: () => apiClient.getAuditLogs(limit),
    enabled,
  });

export const useConfigAppsQuery = (): UseQueryResult<ConfigAppListDto> =>
  useQuery({
    queryKey: queryKeys.config.apps,
    queryFn: apiClient.getConfigApps,
  });

export const useConfigEnvironmentsQuery = (
  appId: string | null,
): UseQueryResult<ConfigEnvironmentListDto> =>
  useQuery({
    queryKey: queryKeys.config.environments(appId),
    queryFn: () => apiClient.getConfigEnvironments(appId!),
    enabled: Boolean(appId),
  });

export const useConfigEntriesQuery = (
  environmentId: string | null,
): UseQueryResult<ConfigEntryListDto> =>
  useQuery({
    queryKey: queryKeys.config.entries(environmentId),
    queryFn: () => apiClient.getConfigEntries(environmentId!),
    enabled: Boolean(environmentId),
  });

export const useConfigServiceTokensQuery = (
  environmentId: string | null,
): UseQueryResult<ConfigServiceTokenListDto> =>
  useQuery({
    queryKey: queryKeys.config.tokens(environmentId),
    queryFn: () => apiClient.getConfigServiceTokens(environmentId!),
    enabled: Boolean(environmentId),
  });

export const useConfigEntryVersionsQuery = (
  entryId: string | null,
): UseQueryResult<ConfigEntryVersionListDto> =>
  useQuery({
    queryKey: queryKeys.config.versions(entryId),
    queryFn: () => apiClient.getConfigEntryVersions(entryId!),
    enabled: Boolean(entryId),
  });
