import "server-only";
import { env } from "cloudflare:workers";
import { databaseConfig } from "@/lib/config";

type HyperdriveBinding = {
  connectionString: string;
};

export function hyperdriveDatabaseUrl(): string | null {
  const hyperdrive = (env as unknown as { HYPERDRIVE?: HyperdriveBinding }).HYPERDRIVE;
  return hyperdrive?.connectionString ?? null;
}

export function runtimeDatabaseUrl(): string {
  return hyperdriveDatabaseUrl() ?? databaseConfig().DATABASE_URL;
}
