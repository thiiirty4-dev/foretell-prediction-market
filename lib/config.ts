import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  INDEXER_DATABASE_URL: z.string().url().optional(),
  AMOY_RPC_URL: z.string().url(),
  PRIVY_APP_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(1),
  PRIVY_APP_SECRET: z.string().min(1),
  AUTHORIZATION_SIGNER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  NEXT_PUBLIC_CHAIN_ID: z.coerce.number().refine((value) => value === 80002),
  NEXT_PUBLIC_FUSD_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  NEXT_PUBLIC_FACTORY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  NEXT_PUBLIC_CTF_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  CONTRACT_DEPLOYMENT_BLOCK: z.coerce.bigint().nonnegative(),
  INDEXER_CONFIRMATIONS: z.coerce.number().int().min(1).max(128).default(12)
});

const databaseSchema = schema.pick({ DATABASE_URL: true });

export type AppConfig = z.infer<typeof schema>;
export type DatabaseConfig = z.infer<typeof databaseSchema>;
let parsed: AppConfig | undefined;
let parsedDatabase: DatabaseConfig | undefined;

export function databaseConfig(): DatabaseConfig {
  parsedDatabase ??= databaseSchema.parse(process.env);
  return parsedDatabase;
}

export function config(): AppConfig {
  parsed ??= schema.parse({ ...process.env, PRIVY_APP_ID: process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID });
  return parsed;
}
