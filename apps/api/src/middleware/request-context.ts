import type { ResolvedAuthContext } from '@acme/auth';
import type { AppLogger } from '@acme/logger';
import { getLoggerBindings } from '@acme/logger';
import { withRequestSpan } from '@acme/observability';
import type { MiddlewareHandler } from 'hono';

import { observeRequest } from '../lib/metrics';

import type { ApiEnv } from '@acme/config';

export type AppVariables = {
  requestId: string;
  traceId?: string;
  logger: AppLogger;
  auth: ResolvedAuthContext | null;
};

export type AppContext = {
  Variables: AppVariables;
};

export const requestContextMiddleware = ({
  env,
  logger,
}: {
  env: ApiEnv;
  logger: AppLogger;
}): MiddlewareHandler<AppContext> => {
  return async (c, next) => {
    const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
    const startedAt = performance.now();

    c.set('requestId', requestId);
    c.set('auth', null);
    c.header('x-request-id', requestId);

    await withRequestSpan(
      env.API_SERVICE_NAME,
      `${c.req.method} ${c.req.path}`,
      {
        'http.method': c.req.method,
        'http.route': c.req.path,
      },
      async (traceId) => {
        c.set('traceId', traceId);

        const requestLogger = logger.child(
          getLoggerBindings({
            requestId,
            traceId,
            route: c.req.path,
            method: c.req.method,
          }),
        );

        c.set('logger', requestLogger);

        try {
          await next();
        } finally {
          const latency = Number((performance.now() - startedAt).toFixed(2));
          const statusCode = c.res.status || 200;

          observeRequest({
            route: c.req.path,
            method: c.req.method,
            statusCode,
            latency,
          });

          requestLogger.info(
            getLoggerBindings({
              statusCode,
              latency,
            }),
            'request completed',
          );
        }
      },
    );
  };
};
