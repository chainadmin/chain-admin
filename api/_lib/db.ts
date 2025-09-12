import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

let db: PostgresJsDatabase | null = null;
let client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  // Reuse connection in serverless environment
  if (!db) {
    client = postgres(process.env.DATABASE_URL, {
      max: 1,
      ssl: 'require',
      idle_timeout: 20,
      max_lifetime: 60 * 2,
      connect_timeout: 10
    });
    
    db = drizzle(client);
  }
  
  return db;
}