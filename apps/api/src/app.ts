import {
  createAuditRepository,
  createUsersRepository,
  createWebhookRepository,
  type AuditRepository,
  type UsersRepository,
  type WebhookRepository,
} from '@acme/db';
import { loadApiEnv, resolveServerFeatureFlags, type ApiEnv } from '@acme/config';
import { createLogger } from '@acme/logger';
import { APP_VERSION, API_V1_PREFIX } from '@acme/shared';
import * as Sentry from '@sentry/node';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { AppError, jsonError } from './lib/http';
import { metricsContentType, renderMetrics } from './lib/metrics';
import { hydrateAuthContext } from './middleware/auth-context';
import { requestContextMiddleware, type AppContext } from './middleware/request-context';
import { createV1Routes } from './routes/v1';
import { HealthService } from './services/health-service';
import { UserService } from './services/user-service';
import { WebhookService } from './services/webhook-service';

const splitCorsOrigins = (origins: string): string[] =>
  origins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

let sentryInitialized = false;

const initSentry = (env: ApiEnv): void => {
  if (sentryInitialized) {
    return;
  }

  Sentry.init({
    dsn: env.API_SENTRY_DSN,
    enabled: Boolean(env.API_SENTRY_DSN) && env.NODE_ENV !== 'development',
    environment: env.NODE_ENV,
    release: APP_VERSION,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 0,
  });

  sentryInitialized = true;
};

export type CreateAppOptions = {
  env?: ApiEnv;
  usersRepository?: UsersRepository;
  auditRepository?: AuditRepository;
  webhookRepository?: WebhookRepository;
};

export const createApp = (options: CreateAppOptions = {}) => {
  const env = options.env ?? loadApiEnv(process.env);
  const enableLoki = env.API_LOG_TO_LOKI && Boolean(env.LOKI_URL);
  const logger = createLogger({
    serviceName: env.API_SERVICE_NAME,
    environment: env.NODE_ENV,
    level: env.API_LOG_LEVEL,
    ...(env.LOKI_URL ? { lokiUrl: env.LOKI_URL } : {}),
    enablePretty: env.NODE_ENV !== 'production',
    enableLoki,
  });

  initSentry(env);

  const usersRepository = options.usersRepository ?? createUsersRepository();
  const auditRepository = options.auditRepository ?? createAuditRepository();
  const webhookRepository = options.webhookRepository ?? createWebhookRepository();
  const featureFlags = resolveServerFeatureFlags(process.env);
  const userService = new UserService(
    usersRepository,
    auditRepository,
    webhookRepository,
    featureFlags,
  );
  const healthService = new HealthService(usersRepository, env);
  const webhookService = new WebhookService(webhookRepository, env.BETTER_AUTH_SECRET);

  const app = new Hono<AppContext>();

  app.use(
    '*',
    cors({
      origin: (origin) => {
        const allowedOrigins = splitCorsOrigins(env.API_CORS_ORIGIN);

        if (!origin) {
          return allowedOrigins[0] ?? env.APP_ORIGIN;
        }

        return allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] ?? env.APP_ORIGIN);
      },
      allowHeaders: ['Content-Type', 'x-request-id'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      exposeHeaders: ['x-request-id'],
      credentials: true,
    }),
  );
  app.use('*', requestContextMiddleware({ env, logger }));
  app.use(`${API_V1_PREFIX}/*`, hydrateAuthContext());

  app.get(
    '/metrics',
    async () =>
      new Response(await renderMetrics(), {
        status: 200,
        headers: {
          'Content-Type': metricsContentType,
        },
      }),
  );

  app.route(
    API_V1_PREFIX,
    createV1Routes({
      env,
      userService,
      healthService,
      webhookService,
    }),
  );

  app.onError((error, c) => {
    const statusCode = (error instanceof AppError ? error.statusCode : 500) as ContentfulStatusCode;

    const loggerInstance = c.get('logger');
    loggerInstance?.error(
      {
        err: error,
        statusCode,
      },
      'request failed',
    );

    Sentry.captureException(error);

    if (error instanceof AppError) {
      return jsonError(
        c,
        error.statusCode as ContentfulStatusCode,
        error.code,
        error.message,
        error.details,
      );
    }

    return jsonError(c, 500, 'INTERNAL_ERROR', 'Unexpected server error');
  });

  app.notFound((c) => jsonError(c, 404, 'NOT_FOUND', 'Route not found'));

  return app;
};
