import { CreateInvitationInputSchema, CreateWorkspaceInputSchema } from '@acme/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { AppError, jsonSuccess } from '../../lib/http';
import { requireAuthenticatedUser, requireRole } from '../../middleware/auth-context';
import type { AppContext } from '../../middleware/request-context';
import type { UserService } from '../../services/user-service';

const AcceptInvitationParamsSchema = z.object({
  invitationId: z.uuid(),
});

const AuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const getClientIpAddress = (headers: Headers): string | null => {
  const forwardedFor = headers.get('x-forwarded-for');

  if (forwardedFor) {
    const [firstAddress] = forwardedFor
      .split(',')
      .map((candidate) => candidate.trim())
      .filter(Boolean);

    if (firstAddress) {
      return firstAddress;
    }
  }

  return headers.get('cf-connecting-ip') ?? headers.get('x-real-ip') ?? null;
};

const getAuditRequestMetadata = (c: Parameters<typeof jsonSuccess>[0]) => {
  const requestHeaders = new Headers(c.req.raw.headers);

  return {
    requestHeaders,
    requestMetadata: {
      requestId: c.get('requestId'),
      ipAddress: getClientIpAddress(requestHeaders),
      userAgent: requestHeaders.get('user-agent'),
    },
  };
};

export const createUserRoutes = ({ userService }: { userService: UserService }) => {
  const router = new Hono<AppContext>();

  router.use('/users', requireAuthenticatedUser());
  router.use('/me', requireAuthenticatedUser());
  router.use('/onboarding', requireAuthenticatedUser());
  router.use('/workspaces', requireAuthenticatedUser());
  router.use('/invitations/:invitationId/accept', requireAuthenticatedUser());
  router.use('/audit-logs', requireAuthenticatedUser());
  router.get('/users', async (c) => {
    const authContext = c.get('auth');

    if (!authContext) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const workspace = await userService.getUsersWorkspace(authContext);
    return jsonSuccess(c, 200, workspace);
  });

  router.get('/me', async (c) => {
    const authContext = c.get('auth');

    if (!authContext) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    return jsonSuccess(c, 200, userService.getCurrentUser(authContext));
  });

  router.get('/onboarding', async (c) => {
    const authContext = c.get('auth');

    if (!authContext) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const onboardingState = await userService.getOnboardingState(authContext);
    return jsonSuccess(c, 200, onboardingState);
  });

  router.get(
    '/invitations/:invitationId/preview',
    zValidator('param', AcceptInvitationParamsSchema, (result) => {
      if (!result.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invitation id is invalid', {
          issues: result.error.issues,
        });
      }
    }),
    async (c) => {
      const { invitationId } = c.req.valid('param');
      const invitation = await userService.getInvitationPreview(invitationId);

      return jsonSuccess(c, 200, invitation);
    },
  );

  router.post(
    '/invitations',
    requireRole(['owner', 'admin']),
    zValidator('json', CreateInvitationInputSchema, (result) => {
      if (!result.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Request payload is invalid', {
          issues: result.error.issues,
        });
      }
    }),
    async (c) => {
      const authContext = c.get('auth');

      if (!authContext) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      const payload = c.req.valid('json');
      const { requestHeaders, requestMetadata } = getAuditRequestMetadata(c);
      const invitation = await userService.createInvitation(
        authContext,
        requestHeaders,
        payload,
        requestMetadata,
      );

      return jsonSuccess(c, 201, invitation);
    },
  );

  router.post(
    '/workspaces',
    zValidator('json', CreateWorkspaceInputSchema, (result) => {
      if (!result.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Request payload is invalid', {
          issues: result.error.issues,
        });
      }
    }),
    async (c) => {
      const authContext = c.get('auth');

      if (!authContext) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      const payload = c.req.valid('json');
      const { requestHeaders, requestMetadata } = getAuditRequestMetadata(c);
      const workspace = await userService.createWorkspace(
        authContext,
        requestHeaders,
        payload,
        requestMetadata,
      );

      return jsonSuccess(c, 201, workspace);
    },
  );

  router.post(
    '/invitations/:invitationId/accept',
    zValidator('param', AcceptInvitationParamsSchema, (result) => {
      if (!result.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invitation id is invalid', {
          issues: result.error.issues,
        });
      }
    }),
    async (c) => {
      const authContext = c.get('auth');

      if (!authContext) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      const { invitationId } = c.req.valid('param');
      const { requestHeaders, requestMetadata } = getAuditRequestMetadata(c);
      const acceptedInvitation = await userService.acceptInvitation(
        authContext,
        requestHeaders,
        invitationId,
        requestMetadata,
      );

      return jsonSuccess(c, 200, acceptedInvitation);
    },
  );

  router.get(
    '/audit-logs',
    zValidator('query', AuditLogsQuerySchema, (result) => {
      if (!result.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Audit log query is invalid', {
          issues: result.error.issues,
        });
      }
    }),
    async (c) => {
      const authContext = c.get('auth');

      if (!authContext) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      const { limit } = c.req.valid('query');
      const auditLogs = await userService.getAuditLogs(authContext, limit);

      return jsonSuccess(c, 200, auditLogs);
    },
  );

  return router;
};
