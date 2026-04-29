# Async Platform Runbook

Use this runbook when deploying or operating the Redis-backed async platform layer.

## Ownership

- Railway owns the shared Redis service in deployed environments.
- Railway API owns the worker process that consumes background jobs.
- Postgres remains the system of record for webhook endpoints, webhook deliveries, audit logs, and invitation state.

## Environment variables

- `REDIS_URL`
  - required for deployed async features
  - points to Railway Redis in staging and production
- `REDIS_PREFIX`
  - queue namespace prefix
  - default: `acme-platform`
- `FEATURE_FLAGS_JSON`
  - optional server-only JSON override map
  - supported keys:
    - `asyncInviteEmail`
    - `outgoingWebhooks`

Recommended defaults:

- local: `REDIS_URL=redis://localhost:6379`
- staging: Railway private Redis URL
- production: Railway private Redis URL
- preview: leave unset unless preview should exercise async infrastructure against staging Redis

## Worker deployment

Deploy the worker from the existing API codebase as a second Railway service.

- build command: `pnpm --filter @acme/api build`
- start command: `pnpm --filter @acme/api worker`

The HTTP API service continues to use:

- build command: `pnpm --filter @acme/api build`
- start command: `pnpm --filter @acme/api start`

Both services should share:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- email provider settings
- `REDIS_URL`
- `REDIS_PREFIX`
- `FEATURE_FLAGS_JSON`

## Queue behavior

Current queues:

- `invite-email`
- `webhook-delivery`

Retry behavior:

- invite email jobs retry with bounded exponential backoff
- webhook delivery jobs retry with bounded exponential backoff
- webhook delivery attempt state is persisted in `webhook_deliveries`

## Webhook signing

Outgoing webhooks are signed with HMAC SHA-256 per endpoint secret.

Headers:

- `x-acme-webhook-delivery-id`
- `x-acme-webhook-event`
- `x-acme-webhook-timestamp`
- `x-acme-webhook-signature`

Signature format:

- `v1=<hex digest>`

Signing secret behavior:

- generated once on endpoint creation
- returned only in the `POST /api/v1/webhooks` response
- encrypted at rest in the database
- never returned by `GET /api/v1/webhooks`

## Local development

Start local infra:

```bash
docker compose up -d
```

Then run:

```bash
pnpm dev
pnpm --filter @acme/api worker
```

## CI coverage

CI keeps normal jobs synthetic by default.

The dedicated `async-verify` job:

- provisions Redis
- writes synthetic env files with `REDIS_URL`
- runs Redis-backed queue verification tests

## Failure handling

If invite delivery slows down or fails:

- the invitation record still exists in Better Auth and Postgres
- the worker retries provider/network failures
- `/users` can reflect pending invitations even if email delivery is still catching up

If outgoing webhook delivery fails:

- the failure is written to `webhook_deliveries`
- retry metadata is updated in the same row
- the worker keeps retrying until the bounded attempt limit is reached

## Rollout controls

Use `FEATURE_FLAGS_JSON` for circuit breaking:

```json
{ "asyncInviteEmail": false, "outgoingWebhooks": true }
```

Default behavior:

- if `REDIS_URL` is set, both flags default on
- if `REDIS_URL` is absent, both flags default off
