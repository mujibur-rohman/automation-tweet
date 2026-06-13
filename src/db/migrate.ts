// Migrasi sederhana: jalankan file .sql di migrations/ berurutan, sekali saja.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { sql } from "./client";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

export async function migrate(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;

  const applied = new Set<string>(
    (await sql`SELECT name FROM schema_migrations`).map((r: { name: string }) => r.name),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const ddl = await Bun.file(join(MIGRATIONS_DIR, file)).text();
    await sql.unsafe(ddl);
    await sql`INSERT INTO schema_migrations (name) VALUES (${file})`;
    console.log(`✓ migrasi diterapkan: ${file}`);
  }
  console.log("Migrasi selesai.");
}

if (import.meta.main) {
  await migrate();
  await sql.end();
}
