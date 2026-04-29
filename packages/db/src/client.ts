import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { loadDbEnv } from '@acme/config';

import * as schema from './schema';

type Database = PostgresJsDatabase<typeof schema>;

type DatabaseCache = {
  client?: postgres.Sql;
  db?: Database;
};

const globalCache = globalThis as typeof globalThis & {
  __acmeDbCache__?: DatabaseCache;
};

const createDatabase = () => {
  const env = loadDbEnv(process.env);
  // Runtime traffic always uses DATABASE_URL. Migration traffic is handled separately.
  const client = postgres(env.DATABASE_URL, {
    max: 10,
    prepare: false,
    idle_timeout: 20,
  });

  return {
    client,
    db: drizzle(client, { schema }),
  };
};

export const getDb = (): Database => {
  if (!globalCache.__acmeDbCache__) {
    globalCache.__acmeDbCache__ = createDatabase();
  }

  return globalCache.__acmeDbCache__.db!;
};

export const getDbClient = (): postgres.Sql => {
  if (!globalCache.__acmeDbCache__) {
    globalCache.__acmeDbCache__ = createDatabase();
  }

  return globalCache.__acmeDbCache__.client!;
};
