import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getMigrationDatabaseUrl, loadDbEnv } from '@acme/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const migrationsFolder = path.resolve(currentDir, '../drizzle');

const getMigrationGuidance = (migrationUrl: string, error: unknown): string | null => {
  const cause =
    error &&
    typeof error === 'object' &&
    'cause' in error &&
    error.cause &&
    typeof error.cause === 'object'
      ? error.cause
      : error;

  const code =
    cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string'
      ? cause.code
      : undefined;

  if (code !== 'ENETUNREACH' && code !== 'ENOTFOUND') {
    return null;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(migrationUrl);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname;
  const port = parsedUrl.port || '5432';
  const isSupabaseDirectHost = /^db\.[^.]+\.supabase\.co$/i.test(hostname);
  const isSupabaseTransactionPooler = /\.pooler\.supabase\.com$/i.test(hostname) && port === '6543';

  if (isSupabaseDirectHost) {
    return [
      'DATABASE_MIGRATION_URL is using a Supabase direct host.',
      'GitHub-hosted runners often cannot reach Supabase direct IPv6-only endpoints.',
      'For GitHub Actions migrations, use the Supabase session pooler URL on port 5432 instead.',
    ].join(' ');
  }

  if (isSupabaseTransactionPooler) {
    return [
      'DATABASE_MIGRATION_URL is using the Supabase transaction pooler.',
      'For migration workflows, prefer the Supabase session pooler URL on port 5432 so Drizzle can run over a connection-oriented path.',
    ].join(' ');
  }

  return null;
};

const main = async () => {
  const env = loadDbEnv(process.env);
  const migrationUrl = getMigrationDatabaseUrl(env);
  const client = postgres(migrationUrl, {
    max: 1,
    prepare: false,
  });

  try {
    console.info(`Applying migrations from ${migrationsFolder}`);

    const db = drizzle(client);
    await migrate(db, { migrationsFolder });

    console.info('Database migrations applied successfully');
  } finally {
    await client.end({ timeout: 5 });
  }
};

try {
  await main();
} catch (error) {
  console.error('Database migration failed');
  const env = loadDbEnv(process.env);
  const migrationGuidance = getMigrationGuidance(getMigrationDatabaseUrl(env), error);
  if (migrationGuidance) {
    console.error(migrationGuidance);
  }
  console.error(error);
  process.exit(1);
}
