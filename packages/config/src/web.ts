import { z } from 'zod';

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(z.url().optional());

export const WebEnvSchema = z.object({
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  NEXT_PUBLIC_API_BASE_URL: z.url().default('http://localhost:3001'),
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
});

export type WebEnv = z.infer<typeof WebEnvSchema>;

export const loadWebEnv = (source: Record<string, string | undefined> = process.env): WebEnv =>
  WebEnvSchema.parse(source);
