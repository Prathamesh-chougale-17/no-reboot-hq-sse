import { describe, expect, it } from 'vitest';

import {
  AUTH_MANAGE_ROLES,
  canManageMembers,
  canViewOperationalDashboards,
  isPrivilegedRole,
} from './authorization';

describe('authorization helpers', () => {
  it('keeps owner and admin as the managed invitation roles', () => {
    expect(AUTH_MANAGE_ROLES).toEqual(['owner', 'admin']);
  });

  it('recognizes privileged roles', () => {
    expect(isPrivilegedRole('owner')).toBe(true);
    expect(isPrivilegedRole('admin')).toBe(true);
    expect(isPrivilegedRole('member')).toBe(false);
    expect(isPrivilegedRole(null)).toBe(false);
    expect(isPrivilegedRole(undefined)).toBe(false);
  });

  it('uses the same privilege boundary for member management and operational dashboards', () => {
    expect(canManageMembers('owner')).toBe(true);
    expect(canManageMembers('admin')).toBe(true);
    expect(canManageMembers('member')).toBe(false);

    expect(canViewOperationalDashboards('owner')).toBe(true);
    expect(canViewOperationalDashboards('admin')).toBe(true);
    expect(canViewOperationalDashboards('member')).toBe(false);
  });
});
