import type { ApiEnv } from '@acme/config';
import { API_V1_PREFIX, APP_NAME, APP_VERSION } from '@acme/shared';
import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';

import type { HealthService } from '../../services/health-service';
import type { UserService } from '../../services/user-service';
import type { AppContext } from '../../middleware/request-context';
import { createDiagnosticRoutes } from './logs';
import { createHealthRoutes } from './health';
import { createUserRoutes } from './users';
import { createWebhookRoutes } from './webhooks';
import type { WebhookService } from '../../services/webhook-service';

export const createV1Routes = ({
  env,
  userService,
  healthService,
  webhookService,
}: {
  env: ApiEnv;
  userService: UserService;
  healthService: HealthService;
  webhookService: WebhookService;
}) => {
  const router = new OpenAPIHono<AppContext>();

  router.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      title: `${APP_NAME} API`,
      version: APP_VERSION,
    },
    servers: [
      {
        url: API_V1_PREFIX,
      },
    ],
  });
  router.get(
    '/docs',
    Scalar({
      url: `${API_V1_PREFIX}/openapi.json`,
      pageTitle: `${APP_NAME} API`,
    }),
  );

  router.route('/', createHealthRoutes({ healthService }));
  router.route('/', createUserRoutes({ userService }));
  router.route('/', createWebhookRoutes({ webhookService }));
  router.route('/', createDiagnosticRoutes({ env }));

  return router;
};
