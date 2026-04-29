import {
  CreateWebhookEndpointInputSchema,
  DeleteWebhookEndpointResultDtoSchema,
  WebhookEndpointListDtoSchema,
  CreateWebhookEndpointResultDtoSchema,
} from '@acme/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { AppError, jsonSuccess } from '../../lib/http';
import { requireAuthenticatedUser, requireRole } from '../../middleware/auth-context';
import type { AppContext } from '../../middleware/request-context';
import type { WebhookService } from '../../services/webhook-service';

const WebhookEndpointParamsSchema = z.object({
  endpointId: z.uuid(),
});

export const createWebhookRoutes = ({ webhookService }: { webhookService: WebhookService }) => {
  const router = new Hono<AppContext>();

  router.use('/webhooks', requireAuthenticatedUser());
  router.use('/webhooks/:endpointId', requireAuthenticatedUser());

  router.get('/webhooks', async (c) => {
    const authContext = c.get('auth');

    if (!authContext) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const endpoints = await webhookService.listEndpoints(authContext);
    return jsonSuccess(c, 200, WebhookEndpointListDtoSchema.parse(endpoints));
  });

  router.post(
    '/webhooks',
    requireRole(['owner', 'admin']),
    zValidator('json', CreateWebhookEndpointInputSchema, (result) => {
      if (!result.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Webhook endpoint payload is invalid', {
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
      const endpoint = await webhookService.createEndpoint(authContext, payload);

      return jsonSuccess(c, 201, CreateWebhookEndpointResultDtoSchema.parse(endpoint));
    },
  );

  router.delete(
    '/webhooks/:endpointId',
    requireRole(['owner', 'admin']),
    zValidator('param', WebhookEndpointParamsSchema, (result) => {
      if (!result.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Webhook endpoint id is invalid', {
          issues: result.error.issues,
        });
      }
    }),
    async (c) => {
      const authContext = c.get('auth');

      if (!authContext) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      const { endpointId } = c.req.valid('param');
      const deleted = await webhookService.deleteEndpoint(authContext, endpointId);

      return jsonSuccess(c, 200, DeleteWebhookEndpointResultDtoSchema.parse(deleted));
    },
  );

  return router;
};
