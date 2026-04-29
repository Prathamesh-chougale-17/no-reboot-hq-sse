import type { ActiveOrganizationDto, AuthRole, OrganizationSummaryDto } from '@acme/shared';
import {
  ActiveOrganizationDtoSchema,
  AuthRoleSchema,
  OrganizationSummaryDtoSchema,
} from '@acme/shared';

import { auth } from './server';

export type AuthSessionData = Awaited<ReturnType<typeof auth.api.getSession>>;

export type SessionEnvelope = NonNullable<AuthSessionData>;

export type ResolvedAuthContext = {
  session: SessionEnvelope['session'];
  user: SessionEnvelope['user'];
  organizationId: string | null;
  organization: ActiveOrganizationDto | null;
  organizations: OrganizationSummaryDto[];
  role: AuthRole | null;
};

export class UnauthorizedAuthError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedAuthError';
  }
}

export class ForbiddenAuthError extends Error {
  constructor(message = 'You do not have access to this resource') {
    super(message);
    this.name = 'ForbiddenAuthError';
  }
}

const normalizeRole = (value: unknown): AuthRole | null => {
  const parsed = AuthRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const normalizeOrganization = (value: unknown): OrganizationSummaryDto | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate =
    'organization' in value && value.organization && typeof value.organization === 'object'
      ? value.organization
      : value;

  const parsed = OrganizationSummaryDtoSchema.safeParse({
    id: (candidate as Record<string, unknown>).id,
    name: (candidate as Record<string, unknown>).name,
    slug: (candidate as Record<string, unknown>).slug,
    logo: (candidate as Record<string, unknown>).logo ?? null,
    createdAt:
      (candidate as Record<string, unknown>).createdAt instanceof Date
        ? (candidate as { createdAt: Date }).createdAt.toISOString()
        : (candidate as Record<string, unknown>).createdAt,
    metadata:
      typeof (candidate as Record<string, unknown>).metadata === 'string'
        ? JSON.parse((candidate as { metadata: string }).metadata)
        : ((candidate as Record<string, unknown>).metadata ?? {}),
  });

  return parsed.success ? parsed.data : null;
};

const normalizeActiveOrganization = (value: unknown): ActiveOrganizationDto | null => {
  const organization = normalizeOrganization(value);
  const parsed = ActiveOrganizationDtoSchema.safeParse(organization);
  return parsed.success ? parsed.data : null;
};

const listOrganizations = async (requestHeaders: Headers): Promise<OrganizationSummaryDto[]> => {
  const result = await auth.api.listOrganizations({
    headers: requestHeaders,
  });

  if (!Array.isArray(result)) {
    return [];
  }

  return result
    .map((organization) => normalizeOrganization(organization))
    .filter((organization): organization is OrganizationSummaryDto => organization !== null);
};

const setActiveOrganization = async (
  requestHeaders: Headers,
  organizationId: string | null,
): Promise<void> => {
  await auth.api.setActiveOrganization({
    body: {
      organizationId,
    },
    headers: requestHeaders,
  });
};

export const getServerSession = async (requestHeaders: Headers): Promise<AuthSessionData> =>
  auth.api.getSession({
    headers: requestHeaders,
  });

export const resolveAuthContext = async (
  requestHeaders: Headers,
): Promise<ResolvedAuthContext | null> => {
  const sessionData = await getServerSession(requestHeaders);

  if (!sessionData) {
    return null;
  }

  const sessionActiveOrganizationId =
    (sessionData.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
  const organizations = await listOrganizations(requestHeaders);
  let activeOrganizationId = sessionActiveOrganizationId;
  const hasActiveMembership =
    activeOrganizationId !== null &&
    organizations.some((organization) => organization.id === activeOrganizationId);

  if (activeOrganizationId && !hasActiveMembership) {
    await setActiveOrganization(requestHeaders, null);
    activeOrganizationId = null;
  }

  if (!activeOrganizationId && organizations.length === 1) {
    const [onlyOrganization] = organizations;

    if (onlyOrganization) {
      await setActiveOrganization(requestHeaders, onlyOrganization.id);
      activeOrganizationId = onlyOrganization.id;
    }
  }

  const [roleResult, organizationResult] = await Promise.allSettled([
    activeOrganizationId
      ? auth.api.getActiveMemberRole({
          headers: requestHeaders,
        })
      : Promise.resolve(null),
    activeOrganizationId
      ? auth.api.getFullOrganization({
          headers: requestHeaders,
          query: {
            organizationId: activeOrganizationId,
            membersLimit: 100,
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    session: sessionData.session,
    user: sessionData.user,
    organizationId: activeOrganizationId,
    organizations,
    organization: activeOrganizationId
      ? normalizeActiveOrganization(
          organizationResult.status === 'fulfilled'
            ? (organizationResult.value ??
                organizations.find((organization) => organization.id === activeOrganizationId) ??
                null)
            : (organizations.find((organization) => organization.id === activeOrganizationId) ??
                null),
        )
      : null,
    role:
      activeOrganizationId && roleResult.status === 'fulfilled'
        ? normalizeRole((roleResult.value as { role?: unknown } | null)?.role)
        : null,
  };
};

export const requireSession = async (requestHeaders: Headers): Promise<ResolvedAuthContext> => {
  const context = await resolveAuthContext(requestHeaders);

  if (!context) {
    throw new UnauthorizedAuthError();
  }

  return context;
};

export const requireRole = async (
  requestHeaders: Headers,
  roles: readonly AuthRole[],
): Promise<ResolvedAuthContext> => {
  const context = await requireSession(requestHeaders);

  if (!context.role || !roles.includes(context.role)) {
    throw new ForbiddenAuthError();
  }

  return context;
};
