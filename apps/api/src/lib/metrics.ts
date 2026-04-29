import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

const register = new Registry();

collectDefaultMetrics({
  register,
  prefix: 'acme_api_',
});

const requestCounter = new Counter({
  name: 'acme_api_http_requests_total',
  help: 'Total number of HTTP requests handled by the API',
  labelNames: ['route', 'method', 'status_code'] as const,
  registers: [register],
});

const requestDuration = new Histogram({
  name: 'acme_api_http_request_duration_ms',
  help: 'Latency of API requests in milliseconds',
  labelNames: ['route', 'method', 'status_code'] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000],
  registers: [register],
});

export const metricsContentType = register.contentType;

export const observeRequest = (input: {
  route: string;
  method: string;
  statusCode: number;
  latency: number;
}) => {
  const labels = {
    route: input.route,
    method: input.method,
    status_code: String(input.statusCode),
  } as const;

  requestCounter.inc(labels);
  requestDuration.observe(labels, input.latency);
};

export const renderMetrics = async () => register.metrics();
