import "server-only";

import type { QueryResultRow } from "pg";

import { queryAsUser } from "@/lib/db";
import type { AssetBalanceRecord, PositionRecord, UserRecord, WalletRecord } from "@/lib/data/types";

interface UserRow extends QueryResultRow {
  id: string;
  privy_did: string;
  display_name: string | null;
  role: UserRecord["role"];
  created_at: Date;
  last_seen_at: Date;
}

interface WalletRow extends QueryResultRow {
  id: string;
  user_id: string;
  address: string;
  privy_verified: boolean;
  verified_at: Date | null;
  created_at: Date;
}

interface BalanceRow extends QueryResultRow {
  wallet_address: string;
  balance: string;
  as_of_block: string;
  confirmed_at: Date;
  updated_at: Date;
}

interface PositionRow extends QueryResultRow {
  market_id: string;
  market_question: string;
  wallet_address: string;
  yes_quantity: string;
  no_quantity: string;
  cost_basis: string;
  realized_pnl: string;
  as_of_block: string;
  updated_at: Date;
}

export async function getUser(userId: string): Promise<UserRecord | undefined> {
  const rows = await queryAsUser<UserRow>(userId,
    `select id,privy_did,display_name,role,created_at,last_seen_at from app_users where id=$1`,
    [userId],
  );
  const row = rows[0];
  return row ? {
    id: row.id,
    privyDid: row.privy_did,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  } : undefined;
}

export async function listVerifiedWallets(userId: string): Promise<WalletRecord[]> {
  const rows = await queryAsUser<WalletRow>(userId,
    `select id,user_id,address,privy_verified,verified_at,created_at
       from user_wallets
      where user_id=$1 and verified_at is not null
      order by created_at asc,id asc`,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    address: row.address,
    privyVerified: row.privy_verified,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
  }));
}

export async function listConfirmedBalances(userId: string): Promise<AssetBalanceRecord[]> {
  const rows = await queryAsUser<BalanceRow>(userId,
    `select b.wallet_address,b.balance::text,b.as_of_block::text,b.confirmed_at,b.updated_at
       from asset_balances b
       join user_wallets w on w.address=b.wallet_address
      where w.user_id=$1 and w.verified_at is not null
      order by b.wallet_address`,
    [userId],
  );
  return rows.map((row) => ({
    walletAddress: row.wallet_address,
    balance: BigInt(row.balance),
    asOfBlock: BigInt(row.as_of_block),
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
  }));
}

export async function listConfirmedPositions(userId: string): Promise<PositionRecord[]> {
  const rows = await queryAsUser<PositionRow>(userId,
    `select p.market_id,m.question market_question,p.wallet_address,p.yes_quantity::text,
            p.no_quantity::text,p.cost_basis::text,p.realized_pnl::text,
            p.as_of_block::text,p.updated_at
       from positions p
       join user_wallets w on w.address=p.wallet_address
       join markets m on m.id=p.market_id and m.canonical=true
      where w.user_id=$1 and w.verified_at is not null
      order by p.updated_at desc,p.market_id`,
    [userId],
  );
  return rows.map((row) => ({
    marketId: row.market_id,
    marketQuestion: row.market_question,
    walletAddress: row.wallet_address,
    yesQuantity: BigInt(row.yes_quantity),
    noQuantity: BigInt(row.no_quantity),
    costBasis: BigInt(row.cost_basis),
    realizedPnl: BigInt(row.realized_pnl),
    asOfBlock: BigInt(row.as_of_block),
    updatedAt: row.updated_at,
  }));
}
