import { neon, neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import ws from "ws";
import pg from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

neonConfig.webSocketConstructor = ws;

/**
 * Temporary connectivity probe: reports which Neon access strategy works from
 * this runtime. Never returns credentials. Delete once the driver is settled.
 */
export async function GET() {
  const url = process.env.DATABASE_URL;
  const results: Record<string, string> = {
    region: process.env.VERCEL_REGION ?? "-",
    hasDatabaseUrl: String(Boolean(url)),
    pooledHost: String(Boolean(url?.includes("-pooler"))),
  };

  const withTimeout = <T,>(p: Promise<T>, ms: number) =>
    Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms)),
    ]);

  const time = async (name: string, fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    try {
      await withTimeout(fn(), 12_000);
      results[name] = `ok ${Date.now() - t0}ms`;
    } catch (err) {
      results[name] = `FAIL ${Date.now() - t0}ms: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  };

  if (!url) return Response.json(results);

  await time("a_neon_http", async () => {
    const q = neon(url);
    await q`SELECT count(*) FROM users`;
  });

  await time("b_neon_ws_query", async () => {
    const pool = new NeonPool({ connectionString: url, max: 1 });
    try {
      await pool.query("SELECT count(*) FROM users");
    } finally {
      pool.end().catch(() => {});
    }
  });

  await time("c_pg_tcp_query", async () => {
    const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
    try {
      await pool.query("SELECT count(*) FROM users");
    } finally {
      pool.end().catch(() => {});
    }
  });

  await time("d_pg_tcp_transaction", async () => {
    const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
    try {
      const d = drizzlePg(pool);
      await d.transaction(async (tx) => {
        await tx.execute(sql`SELECT 1`);
      });
    } finally {
      pool.end().catch(() => {});
    }
  });

  await time("e_neon_ws_transaction", async () => {
    const pool = new NeonPool({ connectionString: url, max: 1 });
    try {
      const d = drizzleNeon(pool);
      await d.transaction(async (tx) => {
        await tx.execute(sql`SELECT 1`);
      });
    } finally {
      pool.end().catch(() => {});
    }
  });

  return Response.json(results);
}
