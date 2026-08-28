import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import ws from "ws";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

neonConfig.webSocketConstructor = ws;

/**
 * Temporary connectivity probe. Reports which Neon access strategy works from
 * this runtime. Never returns credentials. Delete once the driver is settled.
 */
export async function GET() {
  const url = process.env.DATABASE_URL;
  const results: Record<string, string> = {
    hasDatabaseUrl: String(Boolean(url)),
    pooledHost: String(Boolean(url && url.includes("-pooler"))),
    region: process.env.VERCEL_REGION ?? "-",
  };

  const time = async (name: string, fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    try {
      await fn();
      results[name] = `ok ${Date.now() - t0}ms`;
    } catch (err) {
      results[name] = `FAIL ${Date.now() - t0}ms: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  };

  if (!url) return Response.json(results);

  await time("a_http_driver", async () => {
    const q = neon(url);
    await q`SELECT count(*) FROM users`;
  });

  await time("b_fresh_ws_pool", async () => {
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      await pool.query("SELECT count(*) FROM users");
    } finally {
      await pool.end();
    }
  });

  await time("c_fresh_ws_transaction", async () => {
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      const d = drizzle(pool);
      await d.transaction(async (tx) => {
        await tx.execute(sql`SELECT 1`);
      });
    } finally {
      await pool.end();
    }
  });

  await time("d_shared_singleton", async () => {
    await db.execute(sql`SELECT count(*) FROM users`);
  });

  await time("e_shared_singleton_again", async () => {
    await db.execute(sql`SELECT 1`);
  });

  return Response.json(results);
}
