import { and, desc, eq } from 'drizzle-orm';

import type { WebhookEndpointDto, WebhookEndpointListDto, WebhookEventType } from '@acme/shared';

import { getDb } from '../client';
import { webhookDeliveries, webhookEndpoints } from '../schema';

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed';

export type CreateWebhookEndpointRecordInput = {
  organizationId: string;
  url: string;
  secretHash: string;
  secretCiphertext: string;
  eventTypes: WebhookEventType[];
  createdBy?: string | null;
};

export type CreateWebhookDeliveryInput = {
  organizationId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
};

export type WebhookDeliveryRecord = {
  id: string;
  endpointId: string;
  organizationId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  lastResponseStatus: number | null;
  lastError: string | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  endpoint: {
    id: string;
    url: string;
    active: boolean;
    secretHash: string;
    secretCiphertext: string;
  };
};

export interface WebhookRepository {
  listOrganizationWebhookEndpoints(organizationId: string): Promise<WebhookEndpointListDto>;
  createWebhookEndpoint(input: CreateWebhookEndpointRecordInput): Promise<WebhookEndpointDto>;
  deleteWebhookEndpoint(organizationId: string, endpointId: string): Promise<boolean>;
  createWebhookDeliveriesForEvent(
    input: CreateWebhookDeliveryInput,
  ): Promise<Array<{ id: string }>>;
  findWebhookDeliveryById(deliveryId: string): Promise<WebhookDeliveryRecord | null>;
  markWebhookDeliverySuccess(
    deliveryId: string,
    responseStatus: number,
    attemptCount: number,
  ): Promise<void>;
  markWebhookDeliveryFailure(input: {
    deliveryId: string;
    responseStatus?: number | null;
    errorMessage: string;
    attemptCount: number;
    nextAttemptAt?: Date | null;
    shouldRetry: boolean;
  }): Promise<void>;
}

const parseWebhookEventTypes = (value: string[] | null): WebhookEventType[] =>
  (value ?? []).filter(
    (eventType): eventType is WebhookEventType =>
      eventType === 'organization.created' ||
      eventType === 'invitation.created' ||
      eventType === 'invitation.accepted',
  );

const parseWebhookDeliveryStatus = (value: string): WebhookDeliveryStatus =>
  value === 'delivered' || value === 'failed' ? value : 'pending';

const toWebhookEndpointDto = (
  record: typeof webhookEndpoints.$inferSelect,
): WebhookEndpointDto => ({
  id: record.id,
  organizationId: record.organizationId,
  url: record.url,
  eventTypes: parseWebhookEventTypes(record.eventTypes),
  active: record.active,
  createdBy: record.createdBy ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export const createWebhookRepository = (): WebhookRepository => ({
  async listOrganizationWebhookEndpoints(organizationId) {
    const database = getDb();
    const rows = await database
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.organizationId, organizationId))
      .orderBy(desc(webhookEndpoints.createdAt));

    return {
      items: rows.map(toWebhookEndpointDto),
    };
  },

  async createWebhookEndpoint(input) {
    const database = getDb();
    const [created] = await database
      .insert(webhookEndpoints)
      .values({
        organizationId: input.organizationId,
        url: input.url,
        secretHash: input.secretHash,
        secretCiphertext: input.secretCiphertext,
        eventTypes: input.eventTypes,
        createdBy: input.createdBy ?? null,
      })
      .returning();

    if (!created) {
      throw new Error('Webhook endpoint creation returned no row.');
    }

    return toWebhookEndpointDto(created);
  },

  async deleteWebhookEndpoint(organizationId, endpointId) {
    const database = getDb();
    const deleted = await database
      .delete(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.organizationId, organizationId),
          eq(webhookEndpoints.id, endpointId),
        ),
      )
      .returning({
        id: webhookEndpoints.id,
      });

    return deleted.length > 0;
  },

  async createWebhookDeliveriesForEvent(input) {
    const database = getDb();
    const endpoints = await database
      .select({
        id: webhookEndpoints.id,
        eventTypes: webhookEndpoints.eventTypes,
      })
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.organizationId, input.organizationId),
          eq(webhookEndpoints.active, true),
        ),
      );

    const matchingEndpoints = endpoints.filter((endpoint) =>
      parseWebhookEventTypes(endpoint.eventTypes).includes(input.eventType),
    );

    if (matchingEndpoints.length === 0) {
      return [];
    }

    return database
      .insert(webhookDeliveries)
      .values(
        matchingEndpoints.map((endpoint) => ({
          endpointId: endpoint.id,
          organizationId: input.organizationId,
          eventType: input.eventType,
          payload: input.payload,
        })),
      )
      .returning({
        id: webhookDeliveries.id,
      });
  },

  async findWebhookDeliveryById(deliveryId) {
    const database = getDb();
    const [row] = await database
      .select({
        delivery: webhookDeliveries,
        endpoint: {
          id: webhookEndpoints.id,
          url: webhookEndpoints.url,
          active: webhookEndpoints.active,
          secretHash: webhookEndpoints.secretHash,
          secretCiphertext: webhookEndpoints.secretCiphertext,
        },
      })
      .from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
      .where(eq(webhookDeliveries.id, deliveryId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.delivery.id,
      endpointId: row.delivery.endpointId,
      organizationId: row.delivery.organizationId,
      eventType: row.delivery.eventType as WebhookEventType,
      payload:
        row.delivery.payload && typeof row.delivery.payload === 'object'
          ? row.delivery.payload
          : {},
      status: parseWebhookDeliveryStatus(row.delivery.status),
      attemptCount: row.delivery.attemptCount,
      lastResponseStatus: row.delivery.lastResponseStatus ?? null,
      lastError: row.delivery.lastError ?? null,
      nextAttemptAt: row.delivery.nextAttemptAt ?? null,
      createdAt: row.delivery.createdAt,
      updatedAt: row.delivery.updatedAt,
      endpoint: row.endpoint,
    };
  },

  async markWebhookDeliverySuccess(deliveryId, responseStatus, attemptCount) {
    const database = getDb();

    await database
      .update(webhookDeliveries)
      .set({
        status: 'delivered',
        attemptCount,
        lastResponseStatus: responseStatus,
        lastError: null,
        nextAttemptAt: null,
      })
      .where(eq(webhookDeliveries.id, deliveryId));
  },

  async markWebhookDeliveryFailure({
    deliveryId,
    responseStatus,
    errorMessage,
    attemptCount,
    nextAttemptAt,
    shouldRetry,
  }) {
    const database = getDb();

    await database
      .update(webhookDeliveries)
      .set({
        status: shouldRetry ? 'pending' : 'failed',
        attemptCount,
        lastResponseStatus: responseStatus ?? null,
        lastError: errorMessage,
        nextAttemptAt: shouldRetry ? (nextAttemptAt ?? null) : null,
      })
      .where(eq(webhookDeliveries.id, deliveryId));
  },
});
