import type { ServerFeatureFlags } from '@acme/config';
import type { AuditRepository, WebhookRepository } from '@acme/db';
import type { AppendAuditLogInput } from '@acme/db';
import type { AuditEventType } from '@acme/shared';
import type { WebhookEventType } from '@acme/shared';

import { enqueueWebhookDeliveryJob } from './queues';

export type OrganizationAccessEventInput = {
  organizationId: string;
  eventType: AuditEventType;
  auditLog: AppendAuditLogInput;
  webhookPayload: {
    occurredAt: string;
    organizationId: string;
    eventType: WebhookEventType;
    actor: {
      userId: string | null;
      role: string | null;
    };
    target: {
      userId?: string | null;
      email?: string | null;
      invitationId?: string | null;
    };
    metadata: Record<string, unknown>;
  };
};

export const recordOrganizationAccessEvent = async ({
  auditRepository,
  webhookRepository,
  featureFlags,
  event,
}: {
  auditRepository: AuditRepository;
  webhookRepository?: WebhookRepository;
  featureFlags: ServerFeatureFlags;
  event: OrganizationAccessEventInput;
}): Promise<void> => {
  await auditRepository.appendAuditLog(event.auditLog);

  if (!featureFlags.outgoingWebhooks || !webhookRepository) {
    return;
  }

  const deliveries = await webhookRepository.createWebhookDeliveriesForEvent({
    organizationId: event.organizationId,
    eventType: event.eventType,
    payload: event.webhookPayload,
  });

  const enqueueResults = await Promise.allSettled(
    deliveries.map((delivery) =>
      enqueueWebhookDeliveryJob({
        deliveryId: delivery.id,
      }),
    ),
  );

  for (const [index, result] of enqueueResults.entries()) {
    if (result.status === 'rejected') {
      console.error('[jobs] failed to enqueue webhook delivery', {
        deliveryId: deliveries[index]?.id,
        error: result.reason,
      });
    }
  }
};
