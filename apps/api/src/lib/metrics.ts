import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

const register = new Registry();

collectDefaultMetrics({
  register,
  prefix: "no_reboot_hq_api_",
});

const requestCounter = new Counter({
  name: "no_reboot_hq_api_http_requests_total",
  help: "Total number of HTTP requests handled by the API",
  labelNames: ["route", "method", "status_code"] as const,
  registers: [register],
});

const requestDuration = new Histogram({
  name: "no_reboot_hq_api_http_request_duration_ms",
  help: "Latency of API requests in milliseconds",
  labelNames: ["route", "method", "status_code"] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000],
  registers: [register],
});

const configSnapshotCounter = new Counter({
  name: "no_reboot_hq_api_config_snapshots_total",
  help: "Total number of config snapshots served to service clients",
  labelNames: ["environment_id"] as const,
  registers: [register],
});

const configOutboxPublishCounter = new Counter({
  name: "no_reboot_hq_api_config_outbox_publish_total",
  help: "Total number of config outbox publish attempts",
  labelNames: ["status"] as const,
  registers: [register],
});

const configOutboxPublishLatency = new Histogram({
  name: "no_reboot_hq_api_config_outbox_publish_latency_ms",
  help: "Latency of config outbox publish attempts in milliseconds",
  labelNames: ["status"] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
});

const configSseConnections = new Gauge({
  name: "no_reboot_hq_api_config_sse_connections",
  help: "Current number of open config SSE connections",
  labelNames: ["kind"] as const,
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

export const observeConfigSnapshot = (environmentId: string) => {
  configSnapshotCounter.inc({
    environment_id: environmentId,
  });
};

export const observeConfigOutboxPublish = (input: {
  status: "published" | "failed" | "skipped";
  latency: number;
}) => {
  configOutboxPublishCounter.inc({
    status: input.status,
  });
  configOutboxPublishLatency.observe(
    {
      status: input.status,
    },
    input.latency,
  );
};

export const incrementConfigSseConnections = (kind: "dashboard" | "client") => {
  configSseConnections.inc({
    kind,
  });
};

export const decrementConfigSseConnections = (kind: "dashboard" | "client") => {
  configSseConnections.dec({
    kind,
  });
};

export const renderMetrics = async () => register.metrics();
