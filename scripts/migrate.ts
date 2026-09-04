import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is required");

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(
      "create table if not exists schema_migrations(name text primary key,checksum text not null,applied_at timestamptz not null default now())",
    );

    const files = (await readdir("db/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    for (const name of files) {
      const sql = await readFile(`db/migrations/${name}`, "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      const prior = await pool.query<{ checksum: string }>(
        "select checksum from schema_migrations where name=$1",
        [name],
      );

      if (prior.rowCount) {
        if (prior.rows[0].checksum !== hash) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }

      await pool.query(sql);
      await pool.query("insert into schema_migrations(name,checksum) values($1,$2)", [name, hash]);
      console.log(`applied ${name}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
