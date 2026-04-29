import { createRoute, OpenAPIHono } from '@hono/zod-openapi';

import { jsonSuccess } from '../../lib/http';
import { HealthSuccessResponseSchema } from '../../lib/openapi';
import type { AppContext } from '../../middleware/request-context';
import type { HealthService } from '../../services/health-service';

const getHealthRoute = createRoute({
  method: 'get',
  path: '/health',
  operationId: 'getHealth',
  summary: 'Get current API health',
  tags: ['Public'],
  responses: {
    200: {
      description: 'Current health and dependency status for the API service.',
      content: {
        'application/json': {
          schema: HealthSuccessResponseSchema,
        },
      },
    },
  },
});

export const createHealthRoutes = ({ healthService }: { healthService: HealthService }) => {
  const router = new OpenAPIHono<AppContext>();

  router.openapi(getHealthRoute, async (c) => {
    const health = await healthService.getHealth();
    return jsonSuccess(c, 200, health);
  });

  return router;
};
