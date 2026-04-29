import * as Sentry from '@sentry/node';
import { Hono } from 'hono';

import { AppError, jsonSuccess } from '../../lib/http';
import { requireRole } from '../../middleware/auth-context';
import type { AppContext } from '../../middleware/request-context';
import type { ApiEnv } from '@acme/config';

export const createDiagnosticRoutes = ({ env }: { env: ApiEnv }) => {
  const router = new Hono<AppContext>();

  if (env.NODE_ENV !== 'development') {
    router.use('/logs-test', requireRole(['owner', 'admin']));
    router.use('/error-test', requireRole(['owner', 'admin']));
  }

  router.get('/logs-test', (c) => {
    const logger = c.get('logger');

    logger.info({ route: c.req.path }, 'info log emitted from diagnostics route');
    logger.warn({ route: c.req.path }, 'warn log emitted from diagnostics route');
    logger.error(
      {
        route: c.req.path,
        err: new Error('sample diagnostics error log'),
      },
      'error log emitted from diagnostics route',
    );

    return jsonSuccess(c, 200, {
      message: 'Diagnostic logs emitted',
      service: env.API_SERVICE_NAME,
    });
  });

  router.get('/error-test', () => {
    const error = new AppError(
      500,
      'INTERNAL_ERROR',
      'Intentional error route for local Sentry and error handling verification',
    );

    Sentry.captureException(error);
    throw error;
  });

  return router;
};
