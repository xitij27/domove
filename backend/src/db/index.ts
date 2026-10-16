import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and add your " +
        "Supabase connection string (Project Settings → Database). " +
        "Use the pooled (6543, transaction mode) URL for serverless.",
    );
  }
  return url;
}

/**
 * Shared postgres-js client + Drizzle instance.
 *
 * `prepare: false` is required for the Supabase shared pooler (port 6543,
 * PgBouncer transaction mode), which doesn't support prepared statements.
 * It's harmless for direct connections too, so keep it always on.
 *
 * Imported lazily inside route handlers (via `getDb()`) so the app can boot
 * without DATABASE_URL — only DB routes fail, with a clear 500 message.
 */
let client: ReturnType<typeof postgres> | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!_db) {
    client = postgres(connectionString(), { prepare: false, max: 1 });
    _db = drizzle(client, { schema });
  }
  return _db;
}

/** Close the underlying connection (tests / graceful shutdown). */
export async function closeDb() {
  if (client) {
    await client.end({ timeout: 2 });
    client = undefined;
    _db = undefined;
  }
}

export { schema };
