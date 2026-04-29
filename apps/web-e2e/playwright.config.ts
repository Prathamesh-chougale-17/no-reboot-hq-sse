import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const configDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = path.resolve(configDir, '../..');

export default defineConfig({
  testDir: './tests',
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm exec tsx apps/api/src/index.ts',
      cwd: repoRoot,
      url: 'http://127.0.0.1:3001/api/v1/openapi.json',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NODE_ENV: 'development',
        PORT: '3001',
        DATABASE_URL: 'postgres://postgres:postgres@localhost:5433/acme_platform',
        APP_ORIGIN: 'http://127.0.0.1:3000',
        API_CORS_ORIGIN: 'http://127.0.0.1:3000',
        BETTER_AUTH_SECRET: 'playwright-auth-secret-123456789012345',
        NEXT_PUBLIC_SENTRY_DSN: '',
      },
    },
    {
      command: 'pnpm --filter @acme/web dev',
      cwd: repoRoot,
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgres://postgres:postgres@localhost:5433/acme_platform',
        APP_ORIGIN: 'http://127.0.0.1:3000',
        API_CORS_ORIGIN: 'http://127.0.0.1:3000',
        BETTER_AUTH_SECRET: 'playwright-auth-secret-123456789012345',
        BETTER_AUTH_URL: 'http://127.0.0.1:3000',
        AUTH_FROM_EMAIL: 'Acme Platform <auth@acme-platform.local>',
        RESEND_API_KEY: '',
        SMTP_HOST: '',
        SMTP_PORT: '',
        SMTP_SECURE: 'false',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
        NEXT_PUBLIC_APP_ENV: 'development',
        NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:3001',
        API_UPSTREAM_URL: 'http://127.0.0.1:3001',
        NEXT_PUBLIC_SENTRY_DSN: '',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
