import type { WebhookRepository } from '@acme/db';
import type {
  CreateWebhookEndpointInput,
  CreateWebhookEndpointResultDto,
  DeleteWebhookEndpointResultDto,
  WebhookEndpointListDto,
} from '@acme/shared';
import { canManageMembers, type ResolvedAuthContext } from '@acme/auth';

import { AppError } from '../lib/http';
import { encryptWebhookSecret, generateWebhookSecret, hashWebhookSecret } from '../lib/webhooks';

export class WebhookService {
  constructor(
    private readonly webhookRepository: WebhookRepository,
    private readonly webhookSecretSeed: string,
  ) {}

  async listEndpoints(authContext: ResolvedAuthContext): Promise<WebhookEndpointListDto> {
    if (!authContext.organizationId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'An active organization is required to manage outgoing webhooks',
      );
    }

    if (!canManageMembers(authContext.role)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only owners and admins can manage organization webhooks',
      );
    }

    return this.webhookRepository.listOrganizationWebhookEndpoints(authContext.organizationId);
  }

  async createEndpoint(
    authContext: ResolvedAuthContext,
    input: CreateWebhookEndpointInput,
  ): Promise<CreateWebhookEndpointResultDto> {
    if (!authContext.organizationId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'An active organization is required to manage outgoing webhooks',
      );
    }

    if (!canManageMembers(authContext.role)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only owners and admins can manage organization webhooks',
      );
    }

    const signingSecret = generateWebhookSecret();
    const endpoint = await this.webhookRepository.createWebhookEndpoint({
      organizationId: authContext.organizationId,
      url: input.url,
      eventTypes: input.eventTypes,
      createdBy: authContext.user.id,
      secretHash: hashWebhookSecret(signingSecret),
      secretCiphertext: encryptWebhookSecret(signingSecret, this.webhookSecretSeed),
    });

    return {
      endpoint,
      secret: signingSecret,
    };
  }

  async deleteEndpoint(
    authContext: ResolvedAuthContext,
    endpointId: string,
  ): Promise<DeleteWebhookEndpointResultDto> {
    if (!authContext.organizationId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'An active organization is required to manage outgoing webhooks',
      );
    }

    if (!canManageMembers(authContext.role)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only owners and admins can manage organization webhooks',
      );
    }

    const deleted = await this.webhookRepository.deleteWebhookEndpoint(
      authContext.organizationId,
      endpointId,
    );

    if (!deleted) {
      throw new AppError(404, 'NOT_FOUND', 'Webhook endpoint not found');
    }

    return {
      endpointId,
    };
  }
}
