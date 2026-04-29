export type ErrorCode =
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'VALIDATION_ERROR';

export type ApiMeta = {
  requestId?: string;
  traceId?: string;
  timestamp: string;
  version?: string;
};

export type ApiError = {
  code: ErrorCode;
  message: string;
  details?: unknown;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta: ApiMeta;
};

export type ApiFailure = {
  success: false;
  error: ApiError;
  meta: ApiMeta;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const createApiMeta = (meta: Partial<ApiMeta> = {}): ApiMeta => ({
  timestamp: new Date().toISOString(),
  ...meta,
});

export const success = <T>(data: T, meta: Partial<ApiMeta> = {}): ApiSuccess<T> => ({
  success: true,
  data,
  meta: createApiMeta(meta),
});

export const failure = (error: ApiError, meta: Partial<ApiMeta> = {}): ApiFailure => ({
  success: false,
  error,
  meta: createApiMeta(meta),
});
