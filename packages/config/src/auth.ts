import { z } from 'zod';
import { AsyncPlatformEnvSchema } from './platform';

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(z.url().optional());

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const optionalPort = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? Number(value) : undefined))
  .pipe(z.number().int().positive().optional());

const optionalBooleanFlag = z
  .string()
  .trim()
  .optional()
  .transform((value) => value?.toLowerCase())
  .pipe(z.enum(['true', 'false']).optional())
  .transform((value) => value === 'true');

const normalizeOptionalValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const deriveHostedUrl = (value: string | undefined): string | undefined => {
  const hostedUrl = normalizeOptionalValue(value);

  if (!hostedUrl) {
    return undefined;
  }

  return hostedUrl.startsWith('http://') || hostedUrl.startsWith('https://')
    ? hostedUrl
    : `https://${hostedUrl}`;
};

export const BetterAuthEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().trim().min(32),
    BETTER_AUTH_URL: z.url().default('http://localhost:3000'),
    APP_ORIGIN: z.url().default('http://localhost:3000'),
    API_CORS_ORIGIN: z.string().default('http://localhost:3000'),
    AUTH_FROM_EMAIL: z.string().trim().default('Acme Platform <auth@acme-platform.local>'),
    RESEND_API_KEY: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: optionalPort,
    SMTP_SECURE: optionalBooleanFlag.default(false),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    NEXT_PUBLIC_API_BASE_URL: optionalUrl,
  })
  .extend(AsyncPlatformEnvSchema.shape);

export type BetterAuthEnv = z.infer<typeof BetterAuthEnvSchema>;

export const loadBetterAuthEnv = (
  source: Record<string, string | undefined> = process.env,
): BetterAuthEnv => {
  const baseUrl =
    normalizeOptionalValue(source.BETTER_AUTH_URL) ??
    deriveHostedUrl(source.VERCEL_URL) ??
    'http://localhost:3000';
  const appOrigin = normalizeOptionalValue(source.APP_ORIGIN) ?? baseUrl;
  const apiCorsOrigin = normalizeOptionalValue(source.API_CORS_ORIGIN) ?? appOrigin;

  return BetterAuthEnvSchema.parse({
    ...source,
    BETTER_AUTH_URL: baseUrl,
    APP_ORIGIN: appOrigin,
    API_CORS_ORIGIN: apiCorsOrigin,
  });
};
