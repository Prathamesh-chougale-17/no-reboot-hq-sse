import { resolveAuthContext, requireRole, requireSession } from '@acme/auth';
import type { CurrentUserDto } from '@acme/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

const getRequestHeaders = async () => new Headers(await headers());

const toCurrentUserDto = (
  context: Awaited<ReturnType<typeof resolveAuthContext>>,
): CurrentUserDto | null => {
  if (!context) {
    return null;
  }

  return {
    user: {
      id: context.user.id,
      name: context.user.name ?? null,
      email: context.user.email,
      emailVerified: context.user.emailVerified,
      image: context.user.image ?? null,
      createdAt: context.user.createdAt.toISOString(),
      updatedAt: context.user.updatedAt.toISOString(),
    },
    organization: context.organization,
    organizations: context.organizations,
    role: context.role,
  };
};

export const getCurrentUser = async (): Promise<CurrentUserDto | null> =>
  toCurrentUserDto(await resolveAuthContext(await getRequestHeaders()));

export const getRequiredUser = async (redirectTo = '/users'): Promise<CurrentUserDto> => {
  try {
    return toCurrentUserDto(await requireSession(await getRequestHeaders()))!;
  } catch {
    redirect(`/sign-in?redirectTo=${encodeURIComponent(redirectTo)}` as never);
  }
};

export const getRequiredRoleUser = async (
  roles: Parameters<typeof requireRole>[1],
  redirectTo = '/users',
): Promise<CurrentUserDto> => {
  try {
    return toCurrentUserDto(await requireRole(await getRequestHeaders(), roles))!;
  } catch {
    redirect(`/users?denied=${encodeURIComponent(redirectTo)}` as never);
  }
};
