import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BetterAuthEnv } from '@acme/config';

import {
  clearCapturedAuthEmails,
  createAuthMailer,
  getCapturedAuthEmails,
  resolveAuthEmailProvider,
} from './mailer';

const createEnv = (overrides: Partial<BetterAuthEnv> = {}): BetterAuthEnv => ({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/acme_platform',
  BETTER_AUTH_SECRET: '12345678901234567890123456789012',
  BETTER_AUTH_URL: 'http://localhost:3000',
  APP_ORIGIN: 'http://localhost:3000',
  API_CORS_ORIGIN: 'http://localhost:3000',
  AUTH_FROM_EMAIL: 'Acme Platform <auth@acme-platform.local>',
  RESEND_API_KEY: undefined,
  SMTP_HOST: undefined,
  SMTP_PORT: undefined,
  SMTP_SECURE: false,
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  NEXT_PUBLIC_API_BASE_URL: undefined,
  REDIS_URL: undefined,
  REDIS_PREFIX: 'acme-platform',
  FEATURE_FLAGS_JSON: undefined,
  ...overrides,
});

describe('auth mailer', () => {
  beforeEach(() => {
    clearCapturedAuthEmails();
    vi.restoreAllMocks();
  });

  it('prefers resend when resend and smtp are both configured', async () => {
    const resendSend = vi.fn().mockResolvedValue(undefined);
    const smtpSend = vi.fn().mockResolvedValue(undefined);
    const env = createEnv({
      RESEND_API_KEY: 're_test',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'password',
    });

    const mailer = createAuthMailer(env, {
      resendClient: { emails: { send: resendSend } },
      smtpClient: { sendMail: smtpSend },
    });

    expect(resolveAuthEmailProvider(env)).toBe('resend');

    await mailer.sendInvitation({
      email: 'teammate@example.com',
      organizationName: 'Acme Platform',
      role: 'member',
      url: 'http://localhost:3000/accept-invite?invitationId=test',
    });

    expect(resendSend).toHaveBeenCalledOnce();
    expect(smtpSend).not.toHaveBeenCalled();
  });

  it('uses smtp when resend is not configured and smtp settings are complete', async () => {
    const smtpSend = vi.fn().mockResolvedValue(undefined);
    const env = createEnv({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'password',
    });

    const mailer = createAuthMailer(env, {
      smtpClient: { sendMail: smtpSend },
    });

    expect(resolveAuthEmailProvider(env)).toBe('smtp');

    await mailer.sendVerification({
      email: 'user@example.com',
      name: 'Acme User',
      url: 'http://localhost:3000/api/auth/verify',
    });

    expect(smtpSend).toHaveBeenCalledOnce();
  });

  it('falls back to capture in non-production when no providers are configured', async () => {
    const env = createEnv();
    const mailer = createAuthMailer(env);

    expect(resolveAuthEmailProvider(env)).toBe('capture');

    await mailer.sendPasswordReset({
      email: 'user@example.com',
      name: 'Acme User',
      url: 'http://localhost:3000/reset-password?token=test',
    });

    expect(getCapturedAuthEmails()).toHaveLength(1);
    expect(getCapturedAuthEmails()[0]?.type).toBe('password-reset');
  });

  it('throws in production when no providers are configured', async () => {
    const env = createEnv({ NODE_ENV: 'production' });
    const mailer = createAuthMailer(env);

    expect(() => resolveAuthEmailProvider(env)).toThrowError(/RESEND_API_KEY|SMTP_HOST/);
    await expect(
      mailer.sendInvitation({
        email: 'teammate@example.com',
        organizationName: 'Acme Platform',
        role: 'member',
        url: 'https://app.example.com/accept-invite?invitationId=test',
      }),
    ).rejects.toThrowError(/RESEND_API_KEY|SMTP_HOST/);
  });
});
