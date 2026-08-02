import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_ADMIN_URL?.trim();
if (!connectionString) {
  throw new Error("INTERNAL_BETA_CONFIG_INVALID: DATABASE_ADMIN_URL");
}

const migrationsDirectory = path.resolve(process.cwd(), "db", "migrations");
async function main() {
  const pool = new Pool({ connectionString, application_name: "passbuddy-migrate" });

  try {
    await pool.query(`
      create table if not exists public.schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const filenames = (await readdir(migrationsDirectory))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();

    for (const filename of filenames) {
      const applied = await pool.query(
        "select 1 from public.schema_migrations where filename = $1",
        [filename]
      );
      if (applied.rowCount) continue;

      const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into public.schema_migrations(filename) values ($1)", [
          filename
        ]);
        await client.query("commit");
        console.log(`applied ${filename}`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

void main();
