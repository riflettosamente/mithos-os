import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

function requiresSsl(connectionString: string): boolean {
  if (process.env.DATABASE_SSL === "true") return true;
  if (process.env.DATABASE_SSL === "false") return false;
  try {
    const url = new URL(connectionString);
    const mode = url.searchParams.get("sslmode")?.toLowerCase();
    if (mode && mode !== "disable" && mode !== "allow" && mode !== "prefer") return true;
    // Gli URL PostgreSQL esterni di Render usano un hostname *.render.com.
    return url.hostname.endsWith(".render.com");
  } catch {
    return false;
  }
}

const globalForDb = globalThis as typeof globalThis & {
  __mythosPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__mythosPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? "10", 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 12_000,
    ...(requiresSsl(databaseUrl)
      ? {
          ssl: {
            // Il certificato del proxy PostgreSQL Render può non includere
            // la catena CA nel container Node. Il canale resta cifrato.
            rejectUnauthorized:
              process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true",
          },
        }
      : {}),
  });

// Anche in produzione: evita pool duplicati nei bundle dei route handler.
globalForDb.__mythosPostgresqlPool = pool;

export const db = drizzle(pool);
