import { HealthDtoSchema } from '@acme/shared';
import { z } from '@hono/zod-openapi';

const ErrorCodeSchema = z
  .enum([
    'BAD_REQUEST',
    'CONFLICT',
    'FORBIDDEN',
    'INTERNAL_ERROR',
    'NOT_FOUND',
    'SERVICE_UNAVAILABLE',
    'UNAUTHORIZED',
    'UPSTREAM_UNAVAILABLE',
    'VALIDATION_ERROR',
  ])
  .openapi('ApiErrorCode');

export const ApiMetaSchema = z
  .object({
    requestId: z.string().optional(),
    traceId: z.string().optional(),
    timestamp: z.iso.datetime(),
    version: z.string().optional(),
  })
  .openapi('ApiMeta');

export const ApiErrorSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  })
  .openapi('ApiError');

export const ApiFailureSchema = z
  .object({
    success: z.literal(false),
    error: ApiErrorSchema,
    meta: ApiMetaSchema,
  })
  .openapi('ApiFailure');

export const createSuccessEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: ApiMetaSchema,
  });

export const HealthSuccessResponseSchema =
  createSuccessEnvelopeSchema(HealthDtoSchema).openapi('HealthSuccessResponse');
