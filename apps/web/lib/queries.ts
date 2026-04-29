'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type {
  AuditLogListDto,
  CurrentUserDto,
  HealthDto,
  InvitationPreviewDto,
  OnboardingStateDto,
  UsersWorkspaceDto,
} from '@acme/shared';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

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
    queryKey: queryKeys.invitations.preview(invitationId ?? 'missing'),
    queryFn: () => apiClient.getInvitationPreview(invitationId!),
    enabled: Boolean(invitationId),
    retry: false,
  });

export const useUsersWorkspaceQuery = (enabled = true): UseQueryResult<UsersWorkspaceDto> =>
  useQuery({
    queryKey: queryKeys.users.workspace,
    queryFn: apiClient.getUsersWorkspace,
    enabled,
  });

export const useAuditLogsQuery = (limit = 25, enabled = true): UseQueryResult<AuditLogListDto> =>
  useQuery({
    queryKey: queryKeys.users.audit(limit),
    queryFn: () => apiClient.getAuditLogs(limit),
    enabled,
  });
