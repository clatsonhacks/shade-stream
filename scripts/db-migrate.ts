import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://shade:shade@localhost:5432/shade";
const migrationsDir = resolve(process.env.SHADE_ROOT ?? process.cwd(), "db/migrations");

// Apply every db/migrations/*.sql in lexical order (001_, 002_, ...). Each file
// uses IF NOT EXISTS, so re-running is idempotent.
const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  for (const file of files) {
    const sql = await readFile(resolve(migrationsDir, file), "utf8");
    await pool.query(sql);
    console.log(`Applied: db/migrations/${file}`);
  }
  console.log(`Database migration PASS: ${files.length} migration(s)`);
} finally {
  await pool.end();
}
