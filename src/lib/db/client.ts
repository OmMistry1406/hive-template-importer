import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { Pool, type PoolClient } from "pg";

export type Queryable = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

export type Db = Queryable & {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
};

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

function poolDb(connectionString: string): Db {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  const pool = new Pool({
    connectionString: url.toString(),
    max: 3,
    ssl: isLocal ? false : ca ? { ca } : { rejectUnauthorized: false },
  });
  const wrap = (c: Pool | PoolClient): Queryable => ({
    query: async <T,>(sql: string, params?: unknown[]) => {
      const result = await c.query(sql, params as unknown[]);
      return { rows: result.rows as T[] };
    },
  });
  return {
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const value = await fn(wrap(client));
        await client.query("commit");
        return value;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

function pgliteDb(pg: PGlite): Db {
  const wrap = (c: Pick<PGlite, "query">): Queryable => ({
    query: async <T,>(sql: string, params?: unknown[]) => {
      const result = await c.query<T>(sql, params as unknown[]);
      return { rows: result.rows };
    },
  });
  return {
    ...wrap(pg),
    tx: async (fn) => {
      let value: Awaited<ReturnType<typeof fn>>;
      await pg.transaction(async (t) => {
        value = await fn(wrap(t as unknown as Pick<PGlite, "query">));
      });
      return value!;
    },
  };
}

export async function applyMigrations(run: (sql: string) => Promise<unknown>, q: Queryable) {
  await run(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const { rows } = await q.query<{ name: string }>("select name from schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !applied.has(f))
    .sort();
  for (const name of pending) {
    await run(readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"));
    await q.query("insert into schema_migrations (name) values ($1)", [name]);
  }
  return pending;
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create(dataDir ? { dataDir } : undefined);
  const db = pgliteDb(pg);
  await applyMigrations((sql) => pg.exec(sql), db);
  return db;
}

// PGlite lets the app run and be tested with no credentials. Vercel's disk does
// not persist, so a deployment without DATABASE_URL must fail loudly instead.
const shared = globalThis as unknown as { __db?: Promise<Db> };

export function getDb(): Promise<Db> {
  shared.__db ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (url) return poolDb(url);
    if (process.env.VERCEL) {
      throw new Error("DATABASE_URL is not set. Add it in the Vercel project settings.");
    }
    return createPgliteDb(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
  })().catch((error) => {
    shared.__db = undefined;
    throw error;
  });
  return shared.__db;
}
