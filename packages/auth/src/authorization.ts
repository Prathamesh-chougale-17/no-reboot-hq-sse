import type { AuthRole } from '@acme/shared';

export const AUTH_MANAGE_ROLES = ['owner', 'admin'] as const satisfies readonly AuthRole[];

export const isPrivilegedRole = (role: AuthRole | null | undefined): role is 'owner' | 'admin' =>
  role === 'owner' || role === 'admin';

export const canManageMembers = (role: AuthRole | null | undefined): boolean =>
  isPrivilegedRole(role);

export const canViewOperationalDashboards = (role: AuthRole | null | undefined): boolean =>
  isPrivilegedRole(role);
