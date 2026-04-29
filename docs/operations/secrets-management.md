# Secrets Management

This repo uses platform-native secret stores as the source of truth for deployed environments.

Use this ownership model:

- Vercel owns web runtime envs for `preview`, `staging`, and `production`
- Railway owns API runtime envs for `staging` and `production`
- Supabase owns database infrastructure, but not runtime secret distribution
- GitHub Actions owns CI and future deploy credentials only

## Environment Matrix

### Local

- Files: `.env`, `apps/web/.env`, `apps/api/.env`
- Ownership: developer-managed only
- Allowed email modes: capture, SMTP, or Resend
- Never copy local files into Vercel, Railway, Supabase, or GitHub

### CI

- Source of truth: GitHub Actions plus `.github/actions/write-ci-env/action.yml`
- Uses only synthetic env values for normal checks
- Must not contain production DB, auth, or email secrets
- Reserve GitHub secrets for provider tokens and protected deployment workflows

### Preview

- Vercel owns preview web envs
- Use non-production `DATABASE_URL`
- Preview apps reuse staging database credentials in this phase
- Use non-production `BETTER_AUTH_SECRET`
- Use non-production email credentials
- Never reuse production DB, auth, or email secrets

### Staging

- Vercel owns staging web envs
- Railway owns staging API envs
- Use dedicated staging DB credentials
- Use a staging-only `BETTER_AUTH_SECRET`
- Use staging email credentials or a provider-safe shared non-production sender

### Production

- Vercel owns production web envs
- Railway owns production API envs
- Use dedicated production DB credentials
- Use a production-only `BETTER_AUTH_SECRET`
- Use production email credentials only here

## Secret Classification

### Real secrets

- `DATABASE_URL`
- `DATABASE_MIGRATION_URL`
- `BETTER_AUTH_SECRET`
- `RESEND_API_KEY`
- `SMTP_PASSWORD`
- `API_SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`

### Sensitive but not secret

- `AUTH_FROM_EMAIL`
- `SMTP_USER`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`

### Environment-specific config

- `BETTER_AUTH_URL`
- `APP_ORIGIN`
- `API_CORS_ORIGIN`
- `API_UPSTREAM_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_APP_ENV`
- `PORT`
- `API_SERVICE_NAME`
- `API_LOG_LEVEL`
- `API_LOG_TO_LOKI`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `LOKI_URL`

## Shared Compatibility Rules

- `BETTER_AUTH_SECRET` must match between web and API within one environment
- `BETTER_AUTH_SECRET` must differ across preview, staging, and production
- When SMTP is active, leave `RESEND_API_KEY` empty
- When Resend is active, leave `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASSWORD` empty
- Vercel web should use the Supabase pooler-style DB URL that matches its runtime constraints
- Railway API may keep its working DB connection style unless a later staging rollout changes it

## Platform Ownership

### Vercel web envs

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_API_BASE_URL`
- `API_UPSTREAM_URL`
- `NEXT_PUBLIC_SENTRY_DSN`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `AUTH_FROM_EMAIL`
- `RESEND_API_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`

### Railway API envs

- `PORT`
- `DATABASE_URL`
- `APP_ORIGIN`
- `API_CORS_ORIGIN`
- `API_SERVICE_NAME`
- `API_SENTRY_DSN`
- `API_LOG_LEVEL`
- `API_LOG_TO_LOKI`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `LOKI_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `AUTH_FROM_EMAIL`
- `RESEND_API_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`

### GitHub Actions

- CI provider and deploy tokens only
- Examples:
  - `VERCEL_TOKEN`
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
  - `RAILWAY_TOKEN`
- `DATABASE_MIGRATION_URL` is allowed in protected GitHub Environments for manual staging and production migration workflows
- Do not store production `DATABASE_URL`, `BETTER_AUTH_SECRET`, or email provider runtime secrets for normal CI jobs

## Rotation Checklist

Rotate immediately if a value has been pasted into chat, terminals, screenshots, or ad-hoc notes.

### Database URL

1. Rotate the password or issue a fresh connection string in Supabase
2. Update Vercel envs that depend on that database
3. Update Railway envs that depend on that database
4. Redeploy the affected services
5. Verify sign-up, sign-in, `/users`, and `/health`

### Better Auth secret

1. Generate a fresh secret per environment
2. Update web and API envs together for that environment
3. Redeploy both services
4. Verify sign-in, invite acceptance, password reset, and email verification
5. Expect old sessions in that environment to become invalid

### SMTP or Resend credentials

1. Rotate provider credentials in the provider dashboard
2. Update Vercel and Railway envs for the affected environment
3. Redeploy the affected services
4. Verify verification email, password reset, and invitation email flows

### Sentry DSNs

1. Rotate or replace the DSN in Sentry
2. Update the affected runtime envs
3. Redeploy the affected services
4. Verify new events arrive in the intended project

## Deployment Checklist

1. Update platform envs first
2. Confirm web and API use the intended environment-specific values
3. Redeploy the affected service or services
4. Verify:
   - sign up
   - sign in
   - password reset
   - email verification
   - invite member
   - accept invite
   - `/users`
   - `/health` role gating
5. Confirm preview and staging do not point to production DB or production auth secrets

Related runbook:

- [database-environments.md](./database-environments.md)

## Guardrails

- Never commit live secrets to the repo
- Never paste production secrets into `.env.example`
- Never use local `.env` files as the source of truth for deployed environments
- Never point preview at production DB or production auth secrets
- Keep GitHub CI fork-safe and synthetic by default
- Keep environment-sensitive variables represented in Turbo env hashing so builds do not reuse invalid caches
