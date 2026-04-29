import {
  context,
  trace,
  type Attributes,
  type SpanStatus,
  SpanStatusCode,
} from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';

export type ObservabilityOptions = {
  serviceName: string;
  environment: string;
  endpoint?: string | undefined;
};

let sdk: NodeSDK | undefined;
let hasStarted = false;

export const startObservability = async (options: ObservabilityOptions): Promise<void> => {
  if (hasStarted) {
    return;
  }

  if (!options.endpoint) {
    return;
  }

  const exporter = new OTLPTraceExporter({
    url: `${options.endpoint.replace(/\/$/, '')}/v1/traces`,
  });

  sdk = new NodeSDK({
    traceExporter: exporter,
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: options.serviceName,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: options.environment,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  await sdk.start();
  hasStarted = true;
};

export const stopObservability = async (): Promise<void> => {
  if (!sdk) {
    return;
  }

  await sdk.shutdown();
  sdk = undefined;
  hasStarted = false;
};

export const getTraceId = (): string | undefined =>
  trace.getSpan(context.active())?.spanContext().traceId;

export const withRequestSpan = async <T>(
  serviceName: string,
  spanName: string,
  attributes: Attributes,
  handler: (traceId: string) => Promise<T>,
): Promise<T> => {
  const tracer = trace.getTracer(serviceName);

  return tracer.startActiveSpan(spanName, { attributes }, async (span) => {
    const traceId = span.spanContext().traceId;

    try {
      return await handler(traceId);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unhandled request error',
      } satisfies SpanStatus);
      throw error;
    } finally {
      span.end();
    }
  });
};
