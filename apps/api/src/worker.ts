import * as Sentry from '@sentry/node';
import { Job, Worker } from 'bullmq';
import { loadApiEnv, loadBetterAuthEnv } from '@acme/config';
import { createUsersRepository, createWebhookRepository } from '@acme/db';
import {
  JOB_QUEUE_NAMES,
  closeJobQueues,
  closeRedisConnections,
  getRedisConnection,
  type InviteEmailJobPayload,
  inviteEmailJobPayloadSchema,
  type WebhookDeliveryJobPayload,
  webhookDeliveryJobPayloadSchema,
} from '@acme/jobs';
import { createLogger } from '@acme/logger';
import { startObservability, stopObservability } from '@acme/observability';
import { createAuthMailer } from '@acme/auth';

import {
  createWebhookSignature,
  decryptWebhookSecret,
  getWebhookAttemptDelayMs,
} from './lib/webhooks';

const MAX_WEBHOOK_DELIVERY_ATTEMPTS = 5;
const SENTRY_FLUSH_TIMEOUT_MS = 2_000;

const env = loadApiEnv(process.env);
const enableLoki = env.API_LOG_TO_LOKI && Boolean(env.LOKI_URL);
const logger = createLogger({
  serviceName: `${env.API_SERVICE_NAME}-worker`,
  environment: env.NODE_ENV,
  level: env.API_LOG_LEVEL,
  ...(env.LOKI_URL ? { lokiUrl: env.LOKI_URL } : {}),
  enablePretty: env.NODE_ENV !== 'production',
  enableLoki,
});

const usersRepository = createUsersRepository();
const webhookRepository = createWebhookRepository();
const mailer = createAuthMailer(loadBetterAuthEnv(process.env));

const inviteWorker = new Worker(
  JOB_QUEUE_NAMES.inviteEmail,
  async (job: Job<InviteEmailJobPayload>) => {
    const payload = inviteEmailJobPayloadSchema.parse(job.data);
    const invitation = await usersRepository.findInvitationById(payload.invitationId);

    if (!invitation || invitation.status !== 'pending') {
      logger.info(
        {
          invitationId: payload.invitationId,
          status: invitation?.status ?? 'missing',
        },
        'skipping invitation email job',
      );
      return {
        skipped: true,
      };
    }

    await mailer.sendInvitation({
      email: invitation.email,
      inviterName: invitation.inviterName,
      organizationName: invitation.organizationName,
      role: invitation.role,
      url: `${env.APP_ORIGIN.replace(/\/$/, '')}/accept-invite?invitationId=${invitation.id}`,
    });

    logger.info({ invitationId: invitation.id }, 'invitation email delivered');

    return {
      delivered: true,
    };
  },
  {
    prefix: env.REDIS_PREFIX,
    connection: getRedisConnection('worker'),
    concurrency: 4,
  },
);

const webhookWorker = new Worker(
  JOB_QUEUE_NAMES.webhookDelivery,
  async (job: Job<WebhookDeliveryJobPayload>) => {
    const payload = webhookDeliveryJobPayloadSchema.parse(job.data);
    const delivery = await webhookRepository.findWebhookDeliveryById(payload.deliveryId);

    if (!delivery) {
      logger.warn({ deliveryId: payload.deliveryId }, 'webhook delivery record missing');
      return {
        skipped: true,
      };
    }

    if (delivery.status === 'delivered') {
      logger.info({ deliveryId: delivery.id }, 'webhook delivery already completed');
      return {
        skipped: true,
      };
    }

    const attemptCount = delivery.attemptCount + 1;

    if (!delivery.endpoint.active) {
      await webhookRepository.markWebhookDeliveryFailure({
        deliveryId: delivery.id,
        errorMessage: 'Webhook endpoint is inactive.',
        attemptCount,
        shouldRetry: false,
      });

      return {
        skipped: true,
      };
    }

    const secret = decryptWebhookSecret(delivery.endpoint.secretCiphertext, env.BETTER_AUTH_SECRET);
    const timestamp = new Date().toISOString();
    const serializedPayload = JSON.stringify(delivery.payload);
    const signature = createWebhookSignature({
      secret,
      timestamp,
      payload: serializedPayload,
    });

    try {
      const response = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-acme-webhook-delivery-id': delivery.id,
          'x-acme-webhook-event': delivery.eventType,
          'x-acme-webhook-timestamp': timestamp,
          'x-acme-webhook-signature': signature,
        },
        body: serializedPayload,
      });

      if (!response.ok) {
        throw new Error(`Webhook responded with HTTP ${response.status}`);
      }

      await webhookRepository.markWebhookDeliverySuccess(
        delivery.id,
        response.status,
        attemptCount,
      );
      logger.info(
        {
          deliveryId: delivery.id,
          endpointId: delivery.endpoint.id,
          responseStatus: response.status,
        },
        'webhook delivery completed',
      );

      return {
        delivered: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Webhook delivery failed';
      const shouldRetry = attemptCount < MAX_WEBHOOK_DELIVERY_ATTEMPTS;
      const nextAttemptAt = shouldRetry
        ? new Date(Date.now() + getWebhookAttemptDelayMs(attemptCount))
        : null;

      await webhookRepository.markWebhookDeliveryFailure({
        deliveryId: delivery.id,
        errorMessage,
        attemptCount,
        nextAttemptAt,
        shouldRetry,
      });

      logger.error(
        {
          deliveryId: delivery.id,
          endpointId: delivery.endpoint.id,
          attemptCount,
          shouldRetry,
          err: error,
        },
        'webhook delivery failed',
      );

      if (shouldRetry) {
        throw error;
      }

      return {
        delivered: false,
      };
    }
  },
  {
    prefix: env.REDIS_PREFIX,
    connection: getRedisConnection('worker'),
    concurrency: 6,
  },
);

const workers = [inviteWorker, webhookWorker];

const shutdown = async ({
  reason,
  exitCode,
  error,
}: {
  reason: string;
  exitCode: number;
  error?: unknown;
}): Promise<void> => {
  process.exitCode = exitCode;

  if (error) {
    logger.error({ reason, err: error }, 'worker shutting down after fatal error');
    Sentry.captureException(error);
  } else {
    logger.info({ reason }, 'worker shutting down');
  }

  await Promise.allSettled(workers.map((worker) => worker.close()));
  await Promise.allSettled([closeJobQueues(), closeRedisConnections(), stopObservability()]);
  await Sentry.close(SENTRY_FLUSH_TIMEOUT_MS);
  logger.flush?.();
};

const main = async () => {
  await startObservability({
    serviceName: `${env.API_SERVICE_NAME}-worker`,
    environment: env.NODE_ENV,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  logger.info(
    {
      queues: Object.values(JOB_QUEUE_NAMES),
      redisPrefix: env.REDIS_PREFIX,
    },
    'api worker started',
  );
};

process.on('SIGINT', () => {
  void shutdown({ reason: 'SIGINT', exitCode: 0 });
});

process.on('SIGTERM', () => {
  void shutdown({ reason: 'SIGTERM', exitCode: 0 });
});

process.on('uncaughtException', (error) => {
  void shutdown({ reason: 'uncaughtException', exitCode: 1, error });
});

process.on('unhandledRejection', (reason) => {
  void shutdown({
    reason: 'unhandledRejection',
    exitCode: 1,
    error: reason instanceof Error ? reason : new Error(String(reason)),
  });
});

void (async () => {
  try {
    await main();
  } catch (error) {
    await shutdown({ reason: 'startupFailure', exitCode: 1, error });
  }
})();
