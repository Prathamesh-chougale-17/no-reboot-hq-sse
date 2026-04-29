'use client';

import type { OrganizationSummaryDto } from '@acme/shared';
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

// Better Auth's inferred client type currently expands through internal module paths.
type AsyncClientMethod = (...args: unknown[]) => Promise<unknown>;
type AuthQueryResult<T> = {
  data: T | null | undefined;
  isPending: boolean;
  error?: {
    message?: string;
  } | null;
};

export const authClient = createAuthClient({
  plugins: [organizationClient()],
}) as unknown as ReturnType<typeof createAuthClient> & {
  useListOrganizations: () => AuthQueryResult<OrganizationSummaryDto[]>;
  useActiveOrganization: () => AuthQueryResult<OrganizationSummaryDto>;
  organization: {
    create: AsyncClientMethod;
    acceptInvitation: AsyncClientMethod;
    getInvitation: AsyncClientMethod;
    inviteMember: AsyncClientMethod;
    list: AsyncClientMethod;
    setActive: AsyncClientMethod;
  };
  requestPasswordReset: AsyncClientMethod;
  resetPassword: AsyncClientMethod;
};
