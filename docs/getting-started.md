# Getting Started

## Prerequisites

- **Node.js 22+** — check with `node --version`
- **pnpm** — enabled via Corepack:
  ```bash
  corepack enable
  corepack prepare pnpm@latest --activate
  ```
- **Docker Desktop** or Docker Engine with Compose

## Install

```bash
pnpm install
```

## Environment Files

Three `.env` files are needed for local development. Start from the checked-in examples:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

### Root `.env`

Used by Docker Compose and local tooling. Controls infrastructure port mapping and Grafana credentials. Not read by the apps at runtime.

Key variables:

| Variable                 | Purpose                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `POSTGRES_PORT`          | Host port for Docker PostgreSQL (default 5433)                       |
| `REDIS_PORT`             | Host port for Docker Redis                                           |
| `GRAFANA_PORT`           | Host port for Grafana (default 3002)                                 |
| `GRAFANA_ADMIN_PASSWORD` | Grafana admin password                                               |
| `COMPOSE_PROJECT_NAME`   | Set this when running multiple local stacks to avoid name collisions |

### `apps/api/.env`

Runtime env for the Hono API and BullMQ worker. Also used by Drizzle CLI commands.

Required:

| Variable             | Notes                                                               |
| -------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string                                        |
| `BETTER_AUTH_SECRET` | Must match `apps/web/.env`. Generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL`    | `http://localhost:3000` for local dev                               |
| `APP_ORIGIN`         | `http://localhost:3000`                                             |
| `API_CORS_ORIGIN`    | `http://localhost:3000`                                             |

Optional:

| Variable                                                  | Notes                                                |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `REDIS_URL`                                               | Required for async jobs. Omit to run without queues  |
| `RESEND_API_KEY`                                          | Primary mailer. Falls back to SMTP if unset          |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Secondary mailer                                     |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                             | `http://localhost:4318` to enable tracing            |
| `API_LOG_TO_LOKI`                                         | `true` to ship logs to local Loki                    |
| `FEATURE_FLAGS_JSON`                                      | Override feature flags: `{"asyncInviteEmail":false}` |

### `apps/web/.env`

Runtime env for Next.js and the Better Auth route handler.

Required:

| Variable                   | Notes                                                       |
| -------------------------- | ----------------------------------------------------------- |
| `BETTER_AUTH_SECRET`       | Must match `apps/api/.env`                                  |
| `BETTER_AUTH_URL`          | `http://localhost:3000`                                     |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001`                                     |
| `API_UPSTREAM_URL`         | `http://localhost:3001` (server-side, used by bridge route) |

Optional:

| Variable                     | Notes                                          |
| ---------------------------- | ---------------------------------------------- |
| `REDIS_URL`                  | Only needed if the web process runs async jobs |
| `RESEND_API_KEY` / SMTP vars | Same as API — web hosts the auth mailer too    |

## Generating a Secret

```bash
openssl rand -base64 32
```

PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

Use the same value for `BETTER_AUTH_SECRET` in both `apps/api/.env` and `apps/web/.env`.

## Start Infrastructure

```bash
docker compose up -d
```

Services started:

| Service        | Host Port                |
| -------------- | ------------------------ |
| PostgreSQL     | 5433                     |
| Redis          | 6379                     |
| Loki           | 3100                     |
| Tempo          | 3200                     |
| OTel Collector | 4317 (gRPC), 4318 (HTTP) |
| Prometheus     | 9090                     |
| Grafana        | 3002                     |

## Database Setup

Run these once after first install, and again whenever the Better Auth config changes:

```bash
pnpm auth:generate   # regenerate packages/db/src/schema/auth.ts from Better Auth config
pnpm db:generate     # generate SQL migration files in packages/db/migrations/
pnpm db:migrate      # apply all pending migrations to the database
```

Check the database visually:

```bash
pnpm db:studio       # opens Drizzle Studio in the browser
```

## Start Development

```bash
pnpm dev
```

This starts `apps/web` and `apps/api` in watch mode via Turborepo.

To run apps individually:

```bash
pnpm --filter @acme/web dev
pnpm --filter @acme/api dev
```

To run the BullMQ worker separately (needed for async invitation emails and webhooks):

```bash
pnpm --filter @acme/api worker
```

## Local URLs

| Service            | URL                                 |
| ------------------ | ----------------------------------- |
| Web                | http://localhost:3000               |
| API                | http://localhost:3001               |
| API health         | http://localhost:3001/api/v1/health |
| API metrics        | http://localhost:3001/metrics       |
| Better Auth health | http://localhost:3000/api/auth/ok   |
| Grafana            | http://localhost:3002               |
| Prometheus         | http://localhost:9090               |

## Bootstrap the First User

1. Open http://localhost:3000/sign-up
2. Create an account
3. Open http://localhost:3000/users
4. Create your first organization

Once an organization exists, you can invite members from the `/users` page.

## Running Multiple Local Stacks

If you need two copies of the starter running at the same time (e.g. testing a migration against a clean DB), give each project unique host ports in its root `.env`:

```env
POSTGRES_PORT=5434
REDIS_PORT=6380
GRAFANA_PORT=3003
COMPOSE_PROJECT_NAME=my-second-stack
```

Then update `apps/api/.env` and `apps/web/.env` in that copy to point to the new ports.

## Troubleshooting

### `GET /api/auth/ok` returns 404 or fails

- Confirm `BETTER_AUTH_URL=http://localhost:3000` in both env files
- Confirm `BETTER_AUTH_SECRET` is present and matches between web and API
- Restart both apps after any env change

### Protected API calls fail after sign-in

- Confirm `APP_ORIGIN=http://localhost:3000` and `API_CORS_ORIGIN=http://localhost:3000` in `apps/api/.env`
- Confirm the browser has a `better_auth_session` cookie on `localhost:3000`
- Frontend requests must include credentials (`fetch` with `credentials: 'include'`)

### `db:generate` says `Invalid URL`

- Confirm `DATABASE_URL` is present in `apps/api/.env`
- URL-encode any special characters in the password

### `db:migrate` fails with `ENETUNREACH` in CI

Switch `DATABASE_MIGRATION_URL` to the Supabase session pooler URL on port 5432 instead of a direct host URL.

### Grafana shows no logs

- Set `API_LOG_TO_LOKI=true` in `apps/api/.env`
- Restart the API after the env change
- Confirm Loki is running: `docker compose ps loki`

### Async jobs not processing

- Confirm `REDIS_URL` is set and Redis is running
- Start the worker: `pnpm --filter @acme/api worker`
- Confirm `FEATURE_FLAGS_JSON` does not disable `asyncInviteEmail` or `outgoingWebhooks`
