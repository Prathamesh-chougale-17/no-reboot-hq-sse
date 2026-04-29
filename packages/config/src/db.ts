import { z } from 'zod';

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(z.url().optional());

export const DbEnvSchema = z.object({
  DATABASE_URL: z.url(),
  DATABASE_MIGRATION_URL: optionalUrl,
});

export type DbEnv = z.infer<typeof DbEnvSchema>;

export const loadDbEnv = (source: Record<string, string | undefined> = process.env): DbEnv =>
  DbEnvSchema.parse(source);

export const getMigrationDatabaseUrl = (env: DbEnv): string =>
  env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL;
