import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NEXT_PHASE !== "phase-production-build") {
  console.warn(
    "[db] DATABASE_URL is not set — copy .env.example to .env.local and fill it in."
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __carApprovePool: Pool | undefined;
}

// The pool is lazy: nothing connects until the first query runs, so `next build`
// works without database credentials.
const pool =
  global.__carApprovePool ??
  new Pool({
    connectionString: connectionString ?? "postgresql://invalid/invalid",
    max: 5,
    idleTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") global.__carApprovePool = pool;

export const db = drizzle(pool, { schema });
export { schema, pool };
export type Db = typeof db;

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbLike = Pick<Db, "insert" | "select" | "update" | "delete" | "execute">;
