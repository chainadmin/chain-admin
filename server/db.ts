import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure for both Neon and Supabase compatibility
neonConfig.webSocketConstructor = ws;

const databaseUrl = process.env.DATABASE_URL;
const suppressDb = process.env.SUPPRESS_DB_CONNECTION === '1';

if (!databaseUrl && !suppressDb) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

let pool: Pool;
let db: ReturnType<typeof drizzle>;

if (suppressDb) {
  pool = {
    end: async () => {},
  } as unknown as Pool;
  db = new Proxy({}, {
    get() {
      throw new Error('Database access is disabled in this environment.');
    }
  }) as ReturnType<typeof drizzle>;
} else {
  pool = new Pool({ connectionString: databaseUrl });
  db = drizzle({ client: pool, schema });
}

export { pool, db };
