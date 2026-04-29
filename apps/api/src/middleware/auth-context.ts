import { requireRole as requireAuthRole, requireSession, resolveAuthContext } from '@acme/auth';
import { getLoggerBindings } from '@acme/logger';
import { trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';
import type { MiddlewareHandler } from 'hono';

import { AppError } from '../lib/http';

import type { AppContext } from './request-context';

const getRequestHeaders = (request: Request) => new Headers(request.headers);

const applyAuthContext = (
  c: Parameters<MiddlewareHandler<AppContext>>[0],
  authContext: Awaited<ReturnType<typeof resolveAuthContext>>,
) => {
  const previousAuthContext = c.get('auth');
  c.set('auth', authContext);

  if (!authContext) {
    return;
  }

  const authBindings = getLoggerBindings({
    userId: authContext.user.id,
    ...(authContext.organizationId ? { organizationId: authContext.organizationId } : {}),
    ...(authContext.role ? { role: authContext.role } : {}),
  });

  const hasSameAuthBindings =
    previousAuthContext?.user.id === authContext.user.id &&
    previousAuthContext.organizationId === authContext.organizationId &&
    previousAuthContext.role === authContext.role;

  if (!hasSameAuthBindings) {
    c.set('logger', c.get('logger').child(authBindings));
  }

  Sentry.getCurrentScope().setUser({
    id: authContext.user.id,
    email: authContext.user.email,
  });
  Sentry.getCurrentScope().setTag('organization.id', authContext.organizationId ?? 'none');
  Sentry.getCurrentScope().setTag('organization.role', authContext.role ?? 'none');

  trace.getActiveSpan()?.setAttributes({
    'auth.user.id': authContext.user.id,
    'auth.organization.id': authContext.organizationId ?? '',
    'auth.role': authContext.role ?? '',
  });
};

export const hydrateAuthContext = (): MiddlewareHandler<AppContext> => {
  return async (c, next) => {
    const authContext = await resolveAuthContext(getRequestHeaders(c.req.raw));
    applyAuthContext(c, authContext);
    await next();
  };
};

export const requireAuthenticatedUser = (): MiddlewareHandler<AppContext> => {
  return async (c, next) => {
    try {
      const authContext = await requireSession(getRequestHeaders(c.req.raw));
      applyAuthContext(c, authContext);
      await next();
    } catch {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
  };
};

export const requireRole = (
  roles: Parameters<typeof requireAuthRole>[1],
): MiddlewareHandler<AppContext> => {
  return async (c, next) => {
    try {
      const authContext = await requireAuthRole(getRequestHeaders(c.req.raw), roles);
      applyAuthContext(c, authContext);
      await next();
    } catch (error) {
      if (error instanceof Error && error.name === 'UnauthorizedAuthError') {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this resource');
    }
  };
};
