import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  const client = postgres(process.env.DATABASE_URL, {
    max: 1,
    ssl: 'require',
    idle_timeout: 20,
    max_lifetime: 60 * 2
  });
  
  return drizzle(client);
}