import { auth, canManageMembers, type ResolvedAuthContext } from '@acme/auth';
import type { ServerFeatureFlags } from '@acme/config';
import type { AuditRepository, UsersRepository, WebhookRepository } from '@acme/db';
import { recordOrganizationAccessEvent } from '@acme/jobs';
import type {
  AuditLogListDto,
  CreateInvitationInput,
  CreateInvitationResultDto,
  CreateWorkspaceInput,
  CreateWorkspaceResultDto,
  CurrentUserDto,
  InvitationPreviewDto,
  OnboardingStateDto,
  UsersWorkspaceDto,
  AcceptInvitationResultDto,
} from '@acme/shared';

import { AppError } from '../lib/http';

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';

const isBetterAuthConflict = (
  error: unknown,
  code: string,
): error is {
  statusCode?: number;
  message?: string;
  body?: {
    code?: string;
    message?: string;
  };
} => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as {
    statusCode?: number;
    message?: string;
    body?: {
      code?: string;
      message?: string;
    };
  };

  if (candidate.body?.code === code) {
    return true;
  }

  const normalizedMessage = candidate.message?.toLowerCase();
  const normalizedBodyMessage = candidate.body?.message?.toLowerCase();

  return Boolean(
    normalizedMessage && normalizedBodyMessage && normalizedMessage.includes(normalizedBodyMessage),
  );
};

const getBetterAuthError = (
  error: unknown,
):
  | {
      statusCode: number;
      message: string;
    }
  | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const candidate = error as {
    statusCode?: number;
    message?: string;
    body?: {
      message?: string;
    };
  };

  if (typeof candidate.statusCode !== 'number') {
    return undefined;
  }

  return {
    statusCode: candidate.statusCode,
    message:
      candidate.body?.message ??
      candidate.message ??
      'The authentication service rejected the request.',
  };
};

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

type AuditRequestMetadata = {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const toCurrentUserDto = (authContext: ResolvedAuthContext): CurrentUserDto => ({
  user: {
    id: authContext.user.id,
    name: authContext.user.name ?? null,
    email: authContext.user.email,
    emailVerified: authContext.user.emailVerified,
    image: authContext.user.image ?? null,
    createdAt: toIsoString(authContext.user.createdAt),
    updatedAt: toIsoString(authContext.user.updatedAt),
  },
  organization: authContext.organization,
  organizations: authContext.organizations,
  role: authContext.role,
});

export class UserService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly auditRepository: AuditRepository,
    private readonly webhookRepository: WebhookRepository,
    private readonly featureFlags: ServerFeatureFlags,
  ) {}

  getCurrentUser(authContext: ResolvedAuthContext): CurrentUserDto {
    return toCurrentUserDto(authContext);
  }

  async getOnboardingState(authContext: ResolvedAuthContext): Promise<OnboardingStateDto> {
    const pendingInvitations = await this.usersRepository.listPendingInvitationsByEmail(
      authContext.user.email,
    );

    const nextStep: OnboardingStateDto['nextStep'] = authContext.organizationId
      ? 'ready'
      : authContext.organizations.length > 0
        ? 'select-workspace'
        : pendingInvitations.length > 0
          ? 'join-invitation'
          : 'create-workspace';

    return {
      viewer: toCurrentUserDto(authContext),
      pendingInvitations,
      nextStep,
      canCreateWorkspace: authContext.organizations.length === 0,
    };
  }

  async getInvitationPreview(invitationId: string): Promise<InvitationPreviewDto> {
    const invitation = await this.usersRepository.findInvitationById(invitationId);

    if (!invitation) {
      throw new AppError(404, 'NOT_FOUND', 'Invitation not found');
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationName: invitation.organizationName,
    };
  }

  async getUsersWorkspace(authContext: ResolvedAuthContext): Promise<UsersWorkspaceDto> {
    if (!authContext.organizationId || !authContext.organization) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'An active organization is required before member data can be loaded',
      );
    }

    const [members, invitations] = await Promise.all([
      this.usersRepository.listOrganizationMembers(authContext.organizationId),
      canManageMembers(authContext.role)
        ? this.usersRepository.listPendingInvitations(authContext.organizationId)
        : Promise.resolve([]),
    ]);

    return {
      viewer: toCurrentUserDto(authContext),
      members,
      invitations,
    };
  }

  async createInvitation(
    authContext: ResolvedAuthContext,
    requestHeaders: Headers,
    input: CreateInvitationInput,
    auditRequestMetadata: AuditRequestMetadata,
  ): Promise<CreateInvitationResultDto> {
    if (!authContext.organizationId) {
      throw new AppError(403, 'FORBIDDEN', 'An active organization is required to invite members');
    }

    if (!canManageMembers(authContext.role)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only owners and admins can invite teammates into the active organization',
      );
    }

    try {
      const invitation = await auth.api.createInvitation({
        body: {
          ...input,
          organizationId: authContext.organizationId,
        },
        headers: requestHeaders,
      });

      await recordOrganizationAccessEvent({
        auditRepository: this.auditRepository,
        webhookRepository: this.webhookRepository,
        featureFlags: this.featureFlags,
        event: {
          organizationId: authContext.organizationId,
          eventType: 'invitation.created',
          auditLog: {
            organizationId: authContext.organizationId,
            eventType: 'invitation.created',
            actorUserId: authContext.user.id,
            actorRole: authContext.role,
            targetEmail: input.email,
            targetInvitationId: invitation.id,
            requestId: auditRequestMetadata.requestId ?? null,
            ipAddress: auditRequestMetadata.ipAddress ?? null,
            userAgent: auditRequestMetadata.userAgent ?? null,
            metadata: {
              invitedRole: input.role,
            },
          },
          webhookPayload: {
            occurredAt: new Date().toISOString(),
            organizationId: authContext.organizationId,
            eventType: 'invitation.created',
            actor: {
              userId: authContext.user.id,
              role: authContext.role,
            },
            target: {
              email: input.email,
              invitationId: invitation.id,
            },
            metadata: {
              invitedRole: input.role,
            },
          },
        },
      });

      return {
        invitationId: invitation.id,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'CONFLICT', 'A pending invitation already exists for that email');
      }

      if (
        isBetterAuthConflict(error, 'USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION') ||
        isBetterAuthConflict(error, 'USER_ALREADY_MEMBER_OF_ORGANIZATION')
      ) {
        throw new AppError(
          409,
          'CONFLICT',
          error.body?.message ?? 'A pending invitation already exists for that email',
        );
      }

      throw error;
    }
  }

  async createWorkspace(
    authContext: ResolvedAuthContext,
    requestHeaders: Headers,
    input: CreateWorkspaceInput,
    auditRequestMetadata: AuditRequestMetadata,
  ): Promise<CreateWorkspaceResultDto> {
    const hasAnyMembership =
      authContext.organizations.length > 0 ||
      Boolean(authContext.organizationId) ||
      (await this.usersRepository.hasAnyMembership(authContext.user.id));

    if (hasAnyMembership) {
      throw new AppError(
        409,
        'CONFLICT',
        'This starter allows one self-created workspace per account by default.',
      );
    }

    try {
      const organization = await auth.api.createOrganization({
        body: {
          ...input,
          keepCurrentActiveOrganization: false,
        },
        headers: requestHeaders,
      });

      if (!organization || typeof organization !== 'object' || !('id' in organization)) {
        throw new AppError(
          500,
          'INTERNAL_ERROR',
          'Organization provisioning completed without a valid response payload',
        );
      }

      const organizationId = organization.id;

      if (typeof organizationId !== 'string') {
        throw new AppError(
          500,
          'INTERNAL_ERROR',
          'Organization provisioning completed without a valid organization id',
        );
      }

      await auth.api.setActiveOrganization({
        body: {
          organizationId,
        },
        headers: requestHeaders,
      });

      await recordOrganizationAccessEvent({
        auditRepository: this.auditRepository,
        webhookRepository: this.webhookRepository,
        featureFlags: this.featureFlags,
        event: {
          organizationId,
          eventType: 'organization.created',
          auditLog: {
            organizationId,
            eventType: 'organization.created',
            actorUserId: authContext.user.id,
            actorRole: 'owner',
            requestId: auditRequestMetadata.requestId ?? null,
            ipAddress: auditRequestMetadata.ipAddress ?? null,
            userAgent: auditRequestMetadata.userAgent ?? null,
            metadata: {
              organizationName: input.name,
              organizationSlug: input.slug,
            },
          },
          webhookPayload: {
            occurredAt: new Date().toISOString(),
            organizationId,
            eventType: 'organization.created',
            actor: {
              userId: authContext.user.id,
              role: 'owner',
            },
            target: {},
            metadata: {
              organizationName: input.name,
              organizationSlug: input.slug,
            },
          },
        },
      });

      return {
        workspaceId: organizationId,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(
          409,
          'CONFLICT',
          'An organization with that slug already exists. Choose a different slug.',
        );
      }

      const betterAuthError = getBetterAuthError(error);

      if (
        betterAuthError &&
        (betterAuthError.statusCode === 400 || betterAuthError.statusCode === 409)
      ) {
        throw new AppError(
          betterAuthError.statusCode === 409 ? 409 : 400,
          betterAuthError.statusCode === 409 ? 'CONFLICT' : 'BAD_REQUEST',
          betterAuthError.message,
        );
      }

      throw error;
    }
  }

  async acceptInvitation(
    authContext: ResolvedAuthContext,
    requestHeaders: Headers,
    invitationId: string,
    auditRequestMetadata: AuditRequestMetadata,
  ): Promise<AcceptInvitationResultDto> {
    const invitation = await this.usersRepository.findInvitationById(invitationId);

    if (!invitation) {
      throw new AppError(404, 'NOT_FOUND', 'Invitation not found');
    }

    if (normalizeEmail(invitation.email) !== normalizeEmail(authContext.user.email)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        `This invitation is for ${invitation.email}. Sign in with that email address to continue.`,
      );
    }

    const isAlreadyMember = authContext.organizations.some(
      (organization) => organization.id === invitation.organizationId,
    );

    try {
      if (isAlreadyMember) {
        await auth.api.setActiveOrganization({
          body: {
            organizationId: invitation.organizationId,
          },
          headers: requestHeaders,
        });

        return {
          invitationId: invitation.id,
          organizationId: invitation.organizationId,
        };
      }

      if (invitation.status !== 'pending') {
        throw new AppError(
          409,
          'CONFLICT',
          'This invitation has already been used or is no longer pending.',
        );
      }

      await auth.api.acceptInvitation({
        body: {
          invitationId,
        },
        headers: requestHeaders,
      });

      await auth.api.setActiveOrganization({
        body: {
          organizationId: invitation.organizationId,
        },
        headers: requestHeaders,
      });

      await recordOrganizationAccessEvent({
        auditRepository: this.auditRepository,
        webhookRepository: this.webhookRepository,
        featureFlags: this.featureFlags,
        event: {
          organizationId: invitation.organizationId,
          eventType: 'invitation.accepted',
          auditLog: {
            organizationId: invitation.organizationId,
            eventType: 'invitation.accepted',
            actorUserId: authContext.user.id,
            actorRole: invitation.role,
            targetUserId: authContext.user.id,
            targetEmail: invitation.email,
            targetInvitationId: invitation.id,
            requestId: auditRequestMetadata.requestId ?? null,
            ipAddress: auditRequestMetadata.ipAddress ?? null,
            userAgent: auditRequestMetadata.userAgent ?? null,
            metadata: {
              invitedRole: invitation.role,
            },
          },
          webhookPayload: {
            occurredAt: new Date().toISOString(),
            organizationId: invitation.organizationId,
            eventType: 'invitation.accepted',
            actor: {
              userId: authContext.user.id,
              role: invitation.role,
            },
            target: {
              userId: authContext.user.id,
              email: invitation.email,
              invitationId: invitation.id,
            },
            metadata: {
              invitedRole: invitation.role,
            },
          },
        },
      });

      return {
        invitationId: invitation.id,
        organizationId: invitation.organizationId,
      };
    } catch (error) {
      const betterAuthError = getBetterAuthError(error);

      if (
        betterAuthError &&
        (betterAuthError.statusCode === 400 || betterAuthError.statusCode === 409)
      ) {
        throw new AppError(
          betterAuthError.statusCode === 409 ? 409 : 400,
          betterAuthError.statusCode === 409 ? 'CONFLICT' : 'BAD_REQUEST',
          betterAuthError.message,
        );
      }

      throw error;
    }
  }

  async getAuditLogs(authContext: ResolvedAuthContext, limit: number): Promise<AuditLogListDto> {
    if (!authContext.organizationId) {
      throw new AppError(403, 'FORBIDDEN', 'An active organization is required to view audit logs');
    }

    if (!canManageMembers(authContext.role)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only owners and admins can access organization audit activity',
      );
    }

    return this.auditRepository.listOrganizationAuditLogs(authContext.organizationId, limit);
  }
}
