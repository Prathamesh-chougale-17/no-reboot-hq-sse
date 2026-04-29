# Database Environments

This repo uses one database shape across environments, but different connection strategies for runtime and migrations.

## Environment Matrix

### Local

- Database: local Docker Postgres
- Runtime URL: `DATABASE_URL`
- Migration URL: `DATABASE_MIGRATION_URL`
- Default rule: if `DATABASE_MIGRATION_URL` is empty, Drizzle tooling falls back to `DATABASE_URL`

### Preview

- Database: reuse the Supabase staging project
- Web runtime: non-production Vercel envs
- API runtime: preview apps continue talking to staging-backed services
- Do not provision isolated preview databases in this phase

### Staging

- Database: dedicated Supabase staging project
- Web runtime `DATABASE_URL`: Supabase transaction pooler
- API runtime `DATABASE_URL`: pooled or direct connection string that works for the staging Railway runtime
- GitHub migration `DATABASE_MIGRATION_URL`: Supabase session pooler on port `5432` by default, or direct only if the runner can reach it

### Production

- Database: dedicated Supabase production project
- Web runtime `DATABASE_URL`: Supabase transaction pooler
- API runtime `DATABASE_URL`: pooled or direct connection string that works for the production Railway runtime
- GitHub migration `DATABASE_MIGRATION_URL`: Supabase session pooler on port `5432` by default, or direct only if the runner can reach it

## Connection Strategy

- `DATABASE_URL` is runtime-only
- `DATABASE_MIGRATION_URL` is migration-only
- Vercel web should use the Supabase transaction pooler because Better Auth and the web runtime run there
- Railway API may use a working pooled or direct connection string for runtime traffic
- GitHub migration workflows should use the Supabase session pooler by default because GitHub-hosted runners may not be able to reach Supabase direct IPv6-only endpoints

## Migration Promotion Flow

1. Generate schema changes locally with:
   - `pnpm auth:generate` when Better Auth schema changes
   - `pnpm db:generate` for Drizzle SQL artifacts
2. Commit generated migration files
3. Let CI verify migrations on ephemeral Postgres
4. Trigger `Database Migrate` for `staging`
5. Verify staging app flows
6. Trigger `Database Migrate` for `production` after approval
7. Verify production app flows

Do not auto-run production migrations from deploy hooks in this phase.

## Rollback Expectations

- Prefer backup or point-in-time recovery over ad-hoc reverse SQL
- Treat every production migration as forward-only unless a safe reverse migration is explicitly written and reviewed
- If a migration fails partway through, stop and inspect the target database before retrying

## Pre-Production Validation Checklist

Before running a staging or production migration:

1. Confirm the target GitHub Environment has the correct `DATABASE_MIGRATION_URL`
2. Confirm the migration files in `packages/db/drizzle` are committed
3. Confirm CI is green, especially `db-verify`
4. Confirm staging and production runtime envs still point at their intended database projects
5. Confirm preview still points at staging, not production

## Backup and PITR Check

Before production migration:

1. Confirm backups or point-in-time recovery are available in the production Supabase project
2. Confirm the recovery window is acceptable for the change
3. Record the migration start time and deployment identifier for incident response

## Ownership

- Vercel owns runtime `DATABASE_URL` for the web app
- Railway owns runtime `DATABASE_URL` for the API
- GitHub Environment secrets own `DATABASE_MIGRATION_URL` for staging and production migration workflows
- Supabase owns the actual database projects and connection string issuance
