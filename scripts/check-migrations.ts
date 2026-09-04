import { readFile, readdir } from "node:fs/promises";

async function sqlFiles(directory: string): Promise<string[]> {
  return (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

async function main(): Promise<void> {
  const migrations = await sqlFiles("db/migrations");
  const seeds = await sqlFiles("db/seeds");

  if (!migrations.length) throw new Error("No migrations");
  if (!seeds.length) throw new Error("No database seeds");

  for (const name of migrations) {
    const sql = await readFile(`db/migrations/${name}`, "utf8");
    if (/\bdrop\s+table\b/i.test(sql)) throw new Error(`${name}: DROP TABLE is forbidden`);
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) throw new Error(`${name}: invalid migration name`);
  }

  for (const name of seeds) {
    const sql = await readFile(`db/seeds/${name}`, "utf8");
    if (/\b(drop|truncate)\s+table\b/i.test(sql)) throw new Error(`${name}: destructive seed SQL is forbidden`);
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) throw new Error(`${name}: invalid seed name`);
  }

  console.log(`validated ${migrations.length} forward migrations and ${seeds.length} database seeds`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
