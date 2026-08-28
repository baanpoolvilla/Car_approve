import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "drizzle");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Create .env.local from .env.example first.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

try {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`
  );

  const { rows } = await pool.query("SELECT name FROM _migrations");
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`- skip  ${file}`);
      continue;
    }
    process.stdout.write(`- apply ${file} ... `);
    const sql = readFileSync(join(dir, file), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
    console.log("ok");
  }
  console.log("Migrations complete.");
} catch (err) {
  console.error("\nMigration failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
