import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Source of truth for DDL is supabase/migrations/*.sql (applied via Supabase).
// drizzle-kit uses this schema for type-safe queries, `generate` (to preview
// SQL), and `studio`. Avoid `db:push` against the Supabase project — apply
// schema changes as new files in supabase/migrations instead.
// NOTE: `db:generate` quotes the custom `geography(Point, 4326)` type as an
// identifier, so its output needs manual unquoting if you ever copy from it.
// Runtime queries are unaffected.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
