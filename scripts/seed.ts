import { readFile, readdir } from "node:fs/promises";

import { Pool } from "pg";

function assertSeedTarget(connectionString: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo seed is disabled in production");
  }

  const hostname = new URL(connectionString).hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(hostname) && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Remote demo seed requires ALLOW_DEMO_SEED=true");
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required");
  assertSeedTarget(connectionString);

  const files = (await readdir("db/seeds"))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (files.length === 0) throw new Error("No database seeds found");

  const pool = new Pool({ connectionString });
  try {
    for (const name of files) {
      await pool.query(await readFile(`db/seeds/${name}`, "utf8"));
      console.log(`seeded ${name}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
