# Observability

The local observability stack runs entirely in Docker and requires no external accounts.

## Stack

```
API → Pino logger ──────────────────────────────→ Loki ──┐
API → OTel SDK → OTel Collector → Tempo ─────────────────┤→ Grafana
API → Prometheus metrics ← Prometheus scrape ────────────┘
```

| Service        | Role                                                      | Local Port               |
| -------------- | --------------------------------------------------------- | ------------------------ |
| Grafana        | Unified UI for logs, traces, metrics                      | 3002                     |
| Loki           | Log aggregation                                           | 3100                     |
| Tempo          | Distributed tracing backend                               | 3200                     |
| Prometheus     | Metrics store                                             | 9090                     |
| OTel Collector | Receives spans from API, forwards to Tempo and Prometheus | 4317 (gRPC), 4318 (HTTP) |

## Enabling Each Signal

### Logs → Loki

Set in `apps/api/.env`:

```env
API_LOG_TO_LOKI=true
LOKI_URL=http://localhost:3100
```

Restart the API. Logs are emitted by `@acme/logger` via a Pino transport that ships to Loki.

Without this flag, logs are only printed to the terminal.

### Traces → Tempo

Set in `apps/api/.env`:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

The `@acme/observability` package initializes the OTel NodeSDK on startup. Spans flow to the OTel Collector, which forwards them to Tempo.

Without this variable, `initOtel()` is a no-op — no spans are created.

### Metrics → Prometheus

The API always exposes Prometheus metrics at `http://localhost:3001/metrics`. Prometheus scrapes this endpoint automatically based on `infra/observability/prometheus.yml`.

No env var is needed.

## Grafana

Open http://localhost:3002 (default credentials: `admin` / value of `GRAFANA_ADMIN_PASSWORD` in root `.env`).

Datasources are provisioned automatically from `infra/observability/grafana/provisioning/datasources/`.

### Exploring Logs

1. Go to **Explore** → select **Loki**
2. Run a basic query:

```logql
{service="acme-api", environment="development"}
```

Useful filters:

```logql
# Only completed requests
{service="acme-api"} |= "request completed"

# Specific route
{service="acme-api"} |= "/api/v1/invitations"

# Errors only
{service="acme-api"} | json | level="error"

# Requests from a specific user
{service="acme-api"} | json | userId="<id>"
```

### Exploring Traces

1. Go to **Explore** → select **Tempo**
2. Search recent traces or use TraceQL:

```traceql
{}
```

```traceql
{ resource.service.name = "acme-api" }
```

```traceql
{ resource.service.name = "acme-api" && span.http.route = "/api/v1/users" }
```

```traceql
{ duration > 200ms }
```

### Dashboards

Starter dashboards are provisioned from `infra/observability/grafana/provisioning/dashboards/`. Import additional community dashboards for Node.js or PostgreSQL from the Grafana dashboard registry as needed.

## Prometheus

Direct UI at http://localhost:9090.

Useful queries:

```promql
# Check all scrape targets are up
up

# Request rate by route
sum by (route, status_code) (rate(acme_api_http_requests_total[5m]))

# p95 request latency
histogram_quantile(0.95, sum by (le) (rate(acme_api_http_request_duration_ms_bucket[5m])))

# Span throughput from Tempo metrics-generator
sum by (service) (rate(traces_spanmetrics_calls_total[5m]))
```

## Tempo TraceQL Metrics

Tempo is configured with a metrics-generator that remote-writes span-derived metrics into Prometheus. This enables TraceQL metric queries like:

```traceql
{ } | rate()
{ span.http.route = "/api/v1/users" } | rate()
```

If Tempo returns `500` or `empty ring` errors, recreate the container:

```bash
docker compose up -d --force-recreate tempo prometheus grafana
```

## Restarting After Config Changes

```bash
# Restart all observability services
docker compose up -d --force-recreate tempo otel-collector prometheus grafana loki

# Restart individual services
docker compose restart grafana
docker compose restart otel-collector
```

## Sentry (Optional)

Sentry is wired as a safe placeholder. It only activates when a DSN is present and `NODE_ENV` is not `development`.

| Variable                 | Service                              |
| ------------------------ | ------------------------------------ |
| `API_SENTRY_DSN`         | `apps/api` — `@sentry/node`          |
| `NEXT_PUBLIC_SENTRY_DSN` | `apps/web` — Next.js instrumentation |

Recommended setup: create separate Sentry projects for `web` and `api` so issues are grouped by service.

Authenticated requests automatically enrich the Sentry scope with `userId`, `organizationId`, and `role` without logging secrets.
