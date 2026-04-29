import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Queue, Worker } from 'bullmq';

import {
  JOB_QUEUE_NAMES,
  closeJobQueues,
  closeRedisConnections,
  enqueueInviteEmailJob,
  getRedisConnection,
  inviteEmailJobPayloadSchema,
} from './queues';

const hasRedis = Boolean(process.env.REDIS_URL);
const queuePrefix = process.env.REDIS_PREFIX ?? 'acme-platform';
const invitationId = '2f989fd7-cf87-4981-851d-2787de019324';

describe.skipIf(!hasRedis)('job queues', () => {
  let inviteQueue: Queue | undefined;
  let inviteWorker: Worker | undefined;

  beforeEach(async () => {
    inviteQueue = new Queue(JOB_QUEUE_NAMES.inviteEmail, {
      prefix: queuePrefix,
      connection: getRedisConnection('producer'),
    });

    await inviteQueue.obliterate({ force: true });
  });

  afterEach(async () => {
    await inviteWorker?.close();
    await inviteQueue?.obliterate({ force: true });
    await inviteQueue?.close();
    await closeJobQueues();
    await closeRedisConnections();
  });

  it('enqueues invite-email jobs that a worker can process', async () => {
    const seenInvitations: string[] = [];

    const jobHandled = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for Redis-backed invite job'));
      }, 10_000);

      inviteWorker = new Worker(
        JOB_QUEUE_NAMES.inviteEmail,
        async (job) => {
          const payload = inviteEmailJobPayloadSchema.parse(job.data);
          seenInvitations.push(payload.invitationId);
          clearTimeout(timeout);
          resolve();
          return {
            processed: true,
          };
        },
        {
          prefix: queuePrefix,
          connection: getRedisConnection('worker'),
        },
      );
    });

    await enqueueInviteEmailJob({ invitationId });
    await jobHandled;

    expect(seenInvitations).toEqual([invitationId]);
  });
});
