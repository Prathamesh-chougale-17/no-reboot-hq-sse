import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { loadAsyncPlatformEnv } from '@acme/config';
import { z } from 'zod';

const InviteEmailJobPayloadSchema = z.object({
  invitationId: z.uuid(),
});

const WebhookDeliveryJobPayloadSchema = z.object({
  deliveryId: z.uuid(),
});

export type InviteEmailJobPayload = z.infer<typeof InviteEmailJobPayloadSchema>;
export type WebhookDeliveryJobPayload = z.infer<typeof WebhookDeliveryJobPayloadSchema>;

export const JOB_QUEUE_NAMES = {
  inviteEmail: 'invite-email',
  webhookDelivery: 'webhook-delivery',
} as const;

type QueueName = (typeof JOB_QUEUE_NAMES)[keyof typeof JOB_QUEUE_NAMES];

const DEFAULT_QUEUE_OPTIONS = {
  removeOnComplete: 500,
  removeOnFail: 500,
} satisfies Pick<JobsOptions, 'removeOnComplete' | 'removeOnFail'>;

const producerConnectionCache = new Map<string, IORedis>();
const queueCache = new Map<string, Queue>();

const getQueueKey = (name: QueueName, prefix: string) => `${prefix}:${name}`;

const createRedisConnection = (url: string, mode: 'producer' | 'worker') =>
  new IORedis(url, {
    maxRetriesPerRequest: mode === 'worker' ? null : 1,
    enableReadyCheck: true,
  });

export const getRedisConnection = (mode: 'producer' | 'worker' = 'producer'): IORedis => {
  const env = loadAsyncPlatformEnv(process.env);

  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL is not configured.');
  }

  const cacheKey = `${mode}:${env.REDIS_URL}`;
  const cached = producerConnectionCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const connection = createRedisConnection(env.REDIS_URL, mode);
  producerConnectionCache.set(cacheKey, connection);
  return connection;
};

export const isRedisConfigured = (
  source: Record<string, string | undefined> = process.env,
): boolean => Boolean(loadAsyncPlatformEnv(source).REDIS_URL);

const getQueue = (name: QueueName): Queue => {
  const env = loadAsyncPlatformEnv(process.env);

  if (!env.REDIS_URL) {
    throw new Error(`Cannot create queue "${name}" because REDIS_URL is not configured.`);
  }

  const cacheKey = getQueueKey(name, env.REDIS_PREFIX);
  const cached = queueCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const queue = new Queue(name, {
    prefix: env.REDIS_PREFIX,
    connection: getRedisConnection('producer'),
    defaultJobOptions: DEFAULT_QUEUE_OPTIONS,
  });

  queueCache.set(cacheKey, queue);
  return queue;
};

export const inviteEmailJobPayloadSchema = InviteEmailJobPayloadSchema;
export const webhookDeliveryJobPayloadSchema = WebhookDeliveryJobPayloadSchema;

export const enqueueInviteEmailJob = async (payload: InviteEmailJobPayload): Promise<void> => {
  const parsed = InviteEmailJobPayloadSchema.parse(payload);

  await getQueue(JOB_QUEUE_NAMES.inviteEmail).add(JOB_QUEUE_NAMES.inviteEmail, parsed, {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 30_000,
    },
    jobId: `invite-email-${parsed.invitationId}`,
  });
};

export const enqueueWebhookDeliveryJob = async (
  payload: WebhookDeliveryJobPayload,
): Promise<void> => {
  const parsed = WebhookDeliveryJobPayloadSchema.parse(payload);

  await getQueue(JOB_QUEUE_NAMES.webhookDelivery).add(JOB_QUEUE_NAMES.webhookDelivery, parsed, {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 15_000,
    },
    jobId: `webhook-delivery-${parsed.deliveryId}`,
  });
};

export const closeJobQueues = async (): Promise<void> => {
  await Promise.all([...queueCache.values()].map((queue) => queue.close()));
  queueCache.clear();
};

export const closeRedisConnections = async (): Promise<void> => {
  await Promise.all([...producerConnectionCache.values()].map((connection) => connection.quit()));
  producerConnectionCache.clear();
};
