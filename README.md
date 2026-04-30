# No Reboot HQ

Production-deep dynamic configuration platform for apps that need runtime config, encrypted secrets, durable propagation, and zero-restart reloads.

This repo still includes the original scaffold release tooling:

```bash
npm create acme-platform@latest my-app
# or
pnpm create acme-platform my-app
# opt out of project agent skills
npx create-acme-platform my-app --no-skills
```

## What You Get

| Layer         | Technology                                                                    |
| ------------- | ----------------------------------------------------------------------------- |
| Frontend      | Next.js 16 App Router + Tailwind CSS + TanStack Query                         |
| API           | Hono on Node.js, versioned routes, Zod validation                             |
| Auth          | Better Auth — email/password, org RBAC, invitations, password reset           |
| Database      | PostgreSQL + Drizzle ORM — schema, migrations, repositories                   |
| Async         | Redis + BullMQ — queued invitation emails, outgoing webhooks                  |
| Config Events | Redpanda Kafka API + transactional outbox + SSE live updates                  |
| Observability | Grafana · Loki · Tempo · Prometheus · OpenTelemetry                           |
| Tooling       | Turborepo · pnpm workspaces · ESLint · Prettier · Husky · Vitest · Playwright |

## Architecture

```mermaid
graph TB
    subgraph Client
        Browser["Browser"]
    end

    subgraph apps/web ["apps/web · Next.js"]
        WebApp["App Router Pages"]
        AuthRoute["Better Auth Route Handler\n/api/auth/*"]
        Middleware["Middleware · proxy.ts"]
    end

    subgraph apps/api ["apps/api · Hono"]
        API["HTTP Routes /api/v1/*"]
        Worker["BullMQ Worker + Config Outbox Publisher"]
        Metrics["/metrics"]
    end

    subgraph apps/config-simulator ["apps/config-simulator · Node"]
        Simulator["Service-token client\nSnapshot + SSE reload demo"]
    end

    subgraph packages
        Auth["@acme/auth\nBetter Auth config · session · RBAC · mailer"]
        DB["@acme/db\nDrizzle schema · migrations · repositories"]
        Events["@acme/events\nKafka-compatible config event bus"]
        Jobs["@acme/jobs\nQueue definitions · domain events"]
        Config["@acme/config\nZod env validation"]
        Logger["@acme/logger\nPino · Loki transport"]
        Obs["@acme/observability\nOpenTelemetry bootstrap"]
        Shared["@acme/shared\nContracts · DTOs · response types"]
    end

    subgraph infra ["Local Infrastructure · docker compose"]
        PG["PostgreSQL :5433"]
        Redis["Redis :6379"]
        Redpanda["Redpanda :19092"]
        Console["Redpanda Console :8080"]
        OTel["OTel Collector"]
        Loki["Loki"]
        Tempo["Tempo"]
        Prom["Prometheus"]
        Grafana["Grafana :3002"]
    end

    Browser --> Middleware
    Middleware --> WebApp
    Middleware --> AuthRoute
    Browser --> API
    Simulator --> API
    AuthRoute --> Auth
    Auth --> DB
    API --> Events
    API --> Auth
    API --> Jobs
    API --> Metrics
    Worker --> Events
    Worker --> Jobs
    Events --> Redpanda
    Redpanda --> API
    Redpanda --> Console
    Jobs --> Redis
    API --> Logger
    API --> Obs
    Logger --> Loki
    Obs --> OTel
    OTel --> Tempo
    OTel --> Prom
    Prom --> Grafana
    Loki --> Grafana
    Tempo --> Grafana
    DB --> PG
```

### Request Path

```
Browser → middleware (cookie check) → Next.js page (SSR session validate)
                                    → Better Auth route handler → PostgreSQL

Browser → Hono API → session resolve → service → repository → PostgreSQL
                   → BullMQ job enqueue → Redis → Worker picks up → mailer / webhook delivery
                   → config mutation → repository transaction → outbox → worker → Redpanda → SSE
                   → Pino logger → Loki
                   → OTel span → Collector → Tempo
```

## Workspace Layout

```
apps/
  api/          Hono API service + BullMQ worker entrypoint
  config-simulator/ Service-token snapshot + SSE reload demo
  web/          Next.js frontend + Better Auth route handler
  web-e2e/      Playwright smoke tests

packages/
  auth/         Better Auth config, RBAC helpers, auth mailer
  config/       Zod-based env validation (shared across apps)
  db/           Drizzle schema, migrations, repositories
  events/       Kafka-compatible Redpanda producer/consumer utilities
  cli/          TypeScript source for the create-acme-platform CLI
  jobs/         BullMQ queue definitions, domain event fan-out
  logger/       Pino structured logger + Loki transport
  observability/ OpenTelemetry bootstrap and span helpers
  shared/       Transport-neutral contracts, DTOs, response envelopes
  ui/           Shared React component primitives (shadcn-based)
  eslint-config/ Shared flat ESLint configs
  typescript-config/ Shared tsconfig presets

infra/
  observability/ Grafana, Loki, Tempo, Prometheus, OTel Collector config

skills-lock.json Agent skills manifest for scaffolded repos

scripts/
  build-create-package.mjs   Builds dist/create-acme-platform for npm publish
  verify-create-package.mjs  Smoke-tests the built CLI end-to-end
  write-release-notes.mjs    Extracts CHANGELOG entries for GitHub releases
```

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)
- Docker Desktop or Docker Engine with Compose

### 1. Install

```bash
pnpm install
```

### 2. Create env files

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Fill in `BETTER_AUTH_SECRET` (32+ chars), `DATABASE_URL`, and either `RESEND_API_KEY` or SMTP credentials. Both `apps/web` and `apps/api` must share the same `BETTER_AUTH_SECRET`.

### 3. Start infrastructure

```bash
docker compose up -d
```

### 4. Set up the database

```bash
pnpm auth:generate   # regenerate Better Auth schema
pnpm db:generate     # generate Drizzle migration files
pnpm db:migrate      # apply migrations
```

### 5. Develop

```bash
pnpm dev
```

| Service          | URL                   |
| ---------------- | --------------------- |
| Web              | http://localhost:3000 |
| API              | http://localhost:3001 |
| Redpanda Console | http://localhost:8080 |
| Grafana          | http://localhost:3002 |
| Prometheus       | http://localhost:9090 |

## Common Commands

```bash
pnpm dev              # start all apps in watch mode
pnpm build            # production build (all packages + apps)
pnpm lint             # ESLint across workspace
pnpm typecheck        # tsc --noEmit across workspace
pnpm test             # Vitest across workspace (excludes e2e)
pnpm test:e2e         # Playwright smoke tests
pnpm format           # Prettier write
pnpm db:migrate       # apply Drizzle migrations
pnpm db:studio        # open Drizzle Studio
CONFIG_SERVICE_TOKEN=<token> pnpm --filter @acme/config-simulator start
```

## Releasing the CLI

This repo publishes [`create-acme-platform`](https://www.npmjs.com/package/create-acme-platform) to npm.

```bash
pnpm release:patch    # bump patch, update CHANGELOG, create tag
pnpm release:minor    # bump minor
```

Pushing the `v*` tag triggers GitHub Actions, which runs the full CI gate and publishes `dist/create-acme-platform` to npm automatically. The pre-push hook blocks tag pushes unless `pnpm release:verify` passes first.

## Documentation

| Document                                                          | Description                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| [Architecture](docs/architecture.md)                              | Package responsibilities, data flow, design decisions |
| [Getting Started](docs/getting-started.md)                        | Full setup guide — env vars, auth, database, Docker   |
| [Packages Reference](docs/packages.md)                            | What each workspace package owns and exports          |
| [Observability](docs/observability.md)                            | Grafana, Prometheus, Loki, Tempo usage guide          |
| [Releasing](docs/releasing.md)                                    | How to release the CLI, CI pipeline, npm publishing   |
| [Secrets Management](docs/operations/secrets-management.md)       | Secret classes, rotation rules, platform stores       |
| [Database Environments](docs/operations/database-environments.md) | Local, staging, production DB strategy                |
| [Async Platform](docs/operations/async-platform.md)               | BullMQ queues, worker, feature flags                  |

## License

MIT
