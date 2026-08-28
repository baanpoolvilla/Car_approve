import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * Neon over plain TCP (node-postgres), not the WebSocket serverless driver.
 * Vercel Functions cannot open a WebSocket to Neon's proxy — it times out — but
 * TCP works and supports interactive transactions, which this app needs for
 * every state change. Point DATABASE_URL at Neon's *pooled* endpoint so
 * PgBouncer does the connection pooling that serverless can't do itself.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("[db] DATABASE_URL is not set — copy .env.example to .env.local and fill it in.");
}

declare global {
  // eslint-disable-next-line no-var
  var __carApprovePool: pg.Pool | undefined;
}

function createPool() {
  const pool = new pg.Pool({
    connectionString: connectionString ?? "postgresql://invalid/invalid",
    // Neon's pooler is the real pool; each function instance needs very few.
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  // A dropped idle socket (frozen serverless container, Neon scale-to-zero)
  // must not take the process down; the pool simply opens a new connection.
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  return pool;
}

const pool = global.__carApprovePool ?? createPool();
if (process.env.NODE_ENV !== "production") global.__carApprovePool = pool;

export const db = drizzle(pool, { schema });
export { schema, pool };
export type Db = typeof db;

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbLike = Pick<Db, "insert" | "select" | "update" | "delete" | "execute">;
