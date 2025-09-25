import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { ensureCoreSchema } from '../../shared/schemaFixes.js';

let db: PostgresJsDatabase | null = null;
let client: ReturnType<typeof postgres> | null = null;
let schemaEnsuredPromise: Promise<void> | null = null;

export async function getDb(): Promise<PostgresJsDatabase> {
  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('[DB] DATABASE_URL environment variable is not set');
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Reuse connection in serverless environment
  if (!db) {
    try {
      console.log('[DB] Creating new database connection...');
      
      // Optimized settings for Vercel serverless
      client = postgres(process.env.DATABASE_URL, {
        max: 1, // Single connection for serverless
        ssl: 'require',
        idle_timeout: 10, // Reduced from 20
        max_lifetime: 60, // Reduced from 120
        connect_timeout: 5, // Reduced from 10 for faster failures
        prepare: false, // Disable prepared statements for serverless
      });

      db = drizzle(client);
      
      // Test the connection
      await db.execute(sql`SELECT 1`);
      console.log('[DB] Database connection established successfully');

      if (!schemaEnsuredPromise) {
        schemaEnsuredPromise = ensureCoreSchema(db).catch((error: unknown) => {
          schemaEnsuredPromise = null;
          throw error;
        });
      }
    } catch (error) {
      console.error('[DB] Failed to connect to database:', error);
      // Reset on error
      db = null;
      client = null;
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (schemaEnsuredPromise) {
    await schemaEnsuredPromise;
  }

  return db;
}

// Cleanup function for serverless environments
export async function closeDb(): Promise<void> {
  if (client) {
    try {
      await client.end();
      client = null;
      db = null;
    } catch (error) {
      console.error('[DB] Error closing database connection:', error);
    }
  }
}