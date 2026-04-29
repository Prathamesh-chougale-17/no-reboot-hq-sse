import { describe, expect, it } from 'vitest';

import { loadApiEnv } from './api';
import { loadBetterAuthEnv } from './auth';
import { getMigrationDatabaseUrl, loadDbEnv } from './db';
import { loadAsyncPlatformEnv, resolveServerFeatureFlags } from './platform';
import { loadWebEnv } from './web';

describe('config', () => {
  it('parses api env with defaults', () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/acme_platform',
    });

    expect(env.PORT).toBe(3001);
    expect(env.API_SERVICE_NAME).toBe('acme-api');
    expect(env.REDIS_PREFIX).toBe('acme-platform');
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    expect(env.LOKI_URL).toBeUndefined();
  });

  it('parses optional api observability endpoints when provided', () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/acme_platform',
      LOKI_URL: 'http://localhost:3100',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
    });

    expect(env.LOKI_URL).toBe('http://localhost:3100');
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://localhost:4318');
  });

  it('rejects invalid web env values', () => {
    expect(() =>
      loadWebEnv({
        NEXT_PUBLIC_API_BASE_URL: 'not-a-url',
      }),
    ).toThrowError();
  });

  it('falls back to DATABASE_URL when DATABASE_MIGRATION_URL is absent', () => {
    const env = loadDbEnv({
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/acme_platform',
    });

    expect(getMigrationDatabaseUrl(env)).toBe(
      'postgres://postgres:postgres@localhost:5432/acme_platform',
    );
  });

  it('prefers DATABASE_MIGRATION_URL when provided', () => {
    const env = loadDbEnv({
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/acme_platform',
      DATABASE_MIGRATION_URL: 'postgres://postgres:postgres@localhost:5433/acme_platform',
    });

    expect(getMigrationDatabaseUrl(env)).toBe(
      'postgres://postgres:postgres@localhost:5433/acme_platform',
    );
  });

  it('parses better-auth env with defaults', () => {
    const env = loadBetterAuthEnv({
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/acme_platform',
      BETTER_AUTH_SECRET: '12345678901234567890123456789012',
    });

    expect(env.BETTER_AUTH_URL).toBe('http://localhost:3000');
    expect(env.AUTH_FROM_EMAIL).toContain('auth@acme-platform.local');
    expect(env.REDIS_PREFIX).toBe('acme-platform');
  });

  it('parses smtp auth env values when provided', () => {
    const env = loadBetterAuthEnv({
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/acme_platform',
      BETTER_AUTH_SECRET: '12345678901234567890123456789012',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'password',
    });

    expect(env.SMTP_HOST).toBe('smtp.example.com');
    expect(env.SMTP_PORT).toBe(465);
    expect(env.SMTP_SECURE).toBe(true);
    expect(env.SMTP_USER).toBe('mailer');
  });

  it('rejects missing better-auth secrets', () => {
    expect(() =>
      loadBetterAuthEnv({
        DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/acme_platform',
      }),
    ).toThrowError();
  });

  it('parses async platform env values with defaults', () => {
    const env = loadAsyncPlatformEnv({});

    expect(env.REDIS_URL).toBeUndefined();
    expect(env.REDIS_PREFIX).toBe('acme-platform');
  });

  it('defaults server feature flags off when redis is not configured', () => {
    expect(resolveServerFeatureFlags({})).toEqual({
      asyncInviteEmail: false,
      outgoingWebhooks: false,
    });
  });

  it('defaults server feature flags on when redis is configured', () => {
    expect(
      resolveServerFeatureFlags({
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toEqual({
      asyncInviteEmail: true,
      outgoingWebhooks: true,
    });
  });

  it('allows explicit feature flag overrides', () => {
    expect(
      resolveServerFeatureFlags({
        REDIS_URL: 'redis://localhost:6379',
        FEATURE_FLAGS_JSON: JSON.stringify({
          asyncInviteEmail: false,
          outgoingWebhooks: true,
        }),
      }),
    ).toEqual({
      asyncInviteEmail: false,
      outgoingWebhooks: true,
    });
  });
});
