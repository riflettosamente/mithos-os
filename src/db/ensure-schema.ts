import { pool } from "@/db";

/**
 * Bootstrap/migrazione minima per ambienti PaaS (Render, Railway, Fly…).
 *
 * `drizzle-kit push` era stato eseguito nel sandbox di sviluppo, ma non è
 * automaticamente eseguito dal build di Render. Questa funzione rende il
 * deploy autosufficiente: crea le tabelle se mancano e aggiunge in modo
 * idempotente le colonne introdotte dopo il primo deploy.
 */

const globalForSchema = globalThis as typeof globalThis & {
  __mythosSchemaPromise?: Promise<void>;
};

async function applySchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Impedisce a due istanze Render appena avviate di migrare insieme.
    await client.query("SELECT pg_advisory_xact_lock(741852963)");

    await client.query(`
      CREATE TABLE IF NOT EXISTS myth_sessions (
        id text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        llm_provider text,
        llm_key text,
        llm_model text,
        llm_url text
      )
    `);

    // Migrazione del database precedente all'introduzione delle API key.
    await client.query(`ALTER TABLE myth_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`);
    await client.query(`ALTER TABLE myth_sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`);
    await client.query(`ALTER TABLE myth_sessions ADD COLUMN IF NOT EXISTS llm_provider text`);
    await client.query(`ALTER TABLE myth_sessions ADD COLUMN IF NOT EXISTS llm_key text`);
    await client.query(`ALTER TABLE myth_sessions ADD COLUMN IF NOT EXISTS llm_model text`);
    await client.query(`ALTER TABLE myth_sessions ADD COLUMN IF NOT EXISTS llm_url text`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS myth_entities (
        id serial PRIMARY KEY,
        session_id text NOT NULL REFERENCES myth_sessions(id) ON DELETE CASCADE,
        name text NOT NULL,
        kind text NOT NULL,
        x real NOT NULL,
        y real NOT NULL
      )
    `);
    await client.query(`ALTER TABLE myth_entities ADD COLUMN IF NOT EXISTS session_id text`);
    await client.query(`ALTER TABLE myth_entities ADD COLUMN IF NOT EXISTS name text`);
    await client.query(`ALTER TABLE myth_entities ADD COLUMN IF NOT EXISTS kind text`);
    await client.query(`ALTER TABLE myth_entities ADD COLUMN IF NOT EXISTS x real`);
    await client.query(`ALTER TABLE myth_entities ADD COLUMN IF NOT EXISTS y real`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS myth_relations (
        id serial PRIMARY KEY,
        session_id text NOT NULL REFERENCES myth_sessions(id) ON DELETE CASCADE,
        from_name text NOT NULL,
        to_name text NOT NULL,
        label text NOT NULL
      )
    `);
    await client.query(`ALTER TABLE myth_relations ADD COLUMN IF NOT EXISTS session_id text`);
    await client.query(`ALTER TABLE myth_relations ADD COLUMN IF NOT EXISTS from_name text`);
    await client.query(`ALTER TABLE myth_relations ADD COLUMN IF NOT EXISTS to_name text`);
    await client.query(`ALTER TABLE myth_relations ADD COLUMN IF NOT EXISTS label text`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS myth_pages (
        id serial PRIMARY KEY,
        session_id text NOT NULL REFERENCES myth_sessions(id) ON DELETE CASCADE,
        idx integer NOT NULL,
        action text NOT NULL,
        subject text,
        subject2 text,
        title text NOT NULL,
        body text NOT NULL,
        engine text NOT NULL DEFAULT '?',
        at bigint NOT NULL DEFAULT 0,
        entities_json text NOT NULL DEFAULT '[]',
        relations_json text NOT NULL DEFAULT '[]'
      )
    `);
    await client.query(`ALTER TABLE myth_pages ADD COLUMN IF NOT EXISTS session_id text`);
    await client.query(`ALTER TABLE myth_pages ADD COLUMN IF NOT EXISTS idx integer`);
    await client.query(`ALTER TABLE myth_pages ADD COLUMN IF NOT EXISTS action text`);
    await client.query(`ALTER TABLE myth_pages ADD COLUMN IF NOT EXISTS subject text`);
    await client.query(`ALTER TABLE myth_pages ADD COLUMN IF NOT EXISTS subject2 text`);
    await client.query(`ALTER TABLE myth_pages ADD COLUMN IF NOT EXISTS title text`);
    await client.query(`ALTER TABLE myth_pages ADD COLUMN IF NOT EXISTS body text`);
    await client.query(`ALTER TABLE myth_pages ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT '?'`);
    await client.query(`ALTER TABLE myth_pages ADD COLUMN IF NOT EXISTS at bigint NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE myth_pages ADD COLUMN IF NOT EXISTS entities_json text NOT NULL DEFAULT '[]'`);
    await client.query(`ALTER TABLE myth_pages ADD COLUMN IF NOT EXISTS relations_json text NOT NULL DEFAULT '[]'`);

    // Date.now() supera il limite di INTEGER PostgreSQL: migra i vecchi DB.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'myth_pages'
            AND column_name = 'at'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE myth_pages ALTER COLUMN at TYPE bigint USING at::bigint;
        END IF;
      END $$
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS myth_entities_session_idx ON myth_entities(session_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS myth_relations_session_idx ON myth_relations(session_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS myth_pages_session_idx ON myth_pages(session_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS myth_pages_session_order_idx ON myth_pages(session_id, idx)`);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function ensureMythosSchema(): Promise<void> {
  if (!globalForSchema.__mythosSchemaPromise) {
    globalForSchema.__mythosSchemaPromise = applySchema().catch((error) => {
      // Consente un nuovo tentativo dopo il risveglio di un DB Render sospeso.
      delete globalForSchema.__mythosSchemaPromise;
      throw error;
    });
  }
  return globalForSchema.__mythosSchemaPromise;
}

export function databaseErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (code === "42501") {
    return "Il database non autorizza l'aggiornamento dello schema. Verifica l'utente di DATABASE_URL su Render.";
  }
  if (["28P01", "28000"].includes(code)) {
    return "Autenticazione PostgreSQL fallita. Verifica DATABASE_URL su Render.";
  }
  if (["3D000", "42P01", "42703"].includes(code)) {
    return "Schema PostgreSQL non disponibile. Riavvia il deploy dopo aver verificato DATABASE_URL.";
  }
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P01", "57P03"].includes(code)) {
    return "PostgreSQL non raggiungibile. Il database Render potrebbe essere sospeso o DATABASE_URL non è corretto.";
  }
  return "Salvataggio fallito: PostgreSQL non disponibile o schema non aggiornabile.";
}
