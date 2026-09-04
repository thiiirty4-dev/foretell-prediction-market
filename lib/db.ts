import "server-only";
import { Client, Pool, type PoolClient, type QueryResultRow } from "pg";
import { hyperdriveDatabaseUrl, runtimeDatabaseUrl } from "@/lib/runtime-database-url";

let appPool: Pool | undefined;
export function db(): Pool { return appPool ??= new Pool({ connectionString: runtimeDatabaseUrl(), max: 10 }); }
export async function query<T extends QueryResultRow>(text: string, values: readonly unknown[] = []): Promise<T[]> {
  const connectionString = hyperdriveDatabaseUrl();
  if (connectionString) {
    const client = new Client({ connectionString });
    await client.connect();
    return (await client.query<T>(text, [...values])).rows;
  }
  return (await db().query<T>(text, [...values])).rows;
}

type TransactionClient = Pick<PoolClient, "query">;

async function runTransaction<T>(client: TransactionClient, fn: (client: TransactionClient) => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
  const connectionString = hyperdriveDatabaseUrl();
  if (connectionString) {
    const client = new Client({ connectionString });
    await client.connect();
    return runTransaction(client, fn);
  }

  const client = await db().connect();
  try { return await runTransaction(client, fn); }
  finally { client.release(); }
}

export async function transactionAsUser<T>(userId: string, fn: (client: TransactionClient) => Promise<T>): Promise<T> {
  return transaction(async (client) => {
    await client.query("select set_config('app.user_id',$1,true)", [userId]);
    return fn(client);
  });
}

export async function queryAsUser<T extends QueryResultRow>(userId: string, text: string, values: readonly unknown[] = []): Promise<T[]> {
  return transactionAsUser(userId, async (client) => (await client.query<T>(text, [...values])).rows);
}
