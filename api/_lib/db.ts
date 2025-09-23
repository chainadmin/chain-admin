import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

type SqlClient = ReturnType<typeof postgres>;

let db: PostgresJsDatabase | null = null;
let client: SqlClient | null = null;

function initConnection() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  if (!db || !client) {
    client = postgres(process.env.DATABASE_URL, {
      max: 1,
      ssl: 'require',
      idle_timeout: 20,
      max_lifetime: 60 * 2,
      connect_timeout: 10,
    });

    db = drizzle(client);
  }

  return { db, client };
}

export function getDb(): PostgresJsDatabase {
  return initConnection().db!;
}

export function getSqlClient(): SqlClient {
  const { client: sqlClient } = initConnection();
  if (!sqlClient) {
    throw new Error('Failed to initialize database client');
  }

  return sqlClient;
}
