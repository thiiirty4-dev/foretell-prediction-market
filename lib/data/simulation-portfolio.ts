import "server-only";

import type { QueryResultRow } from "pg";
import { queryAsUser } from "@/lib/db";

interface SimulationPortfolioRow extends QueryResultRow {
  market_id: string;
  market_slug: string;
  market_question: string;
  market_status: string;
  yes_quantity: string;
  no_quantity: string;
  cost_basis: string;
  potential_payout: string;
  last_order_id: string;
  updated_at: Date;
  total_cost_basis: string;
  total_potential_payout: string;
  position_count: string;
}

export interface SimulationPortfolioPosition {
  marketId: string;
  marketSlug: string;
  marketQuestion: string;
  marketStatus: string;
  yesQuantity: string;
  noQuantity: string;
  costBasis: string;
  potentialPayout: string;
  lastOrderId: string;
  updatedAt: string;
}

export interface SimulationPortfolioRecord {
  totalCostBasis: string;
  totalPotentialPayout: string;
  positionCount: number;
  positions: SimulationPortfolioPosition[];
}

export async function readSimulationPortfolio(
  userId: string,
  walletAddress: string,
): Promise<SimulationPortfolioRecord> {
  const rows = await queryAsUser<SimulationPortfolioRow>(
    userId,
      `select
         position.market_id,
         market.slug as market_slug,
         market.question as market_question,
         market.status::text as market_status,
         position.yes_quantity::text,
         position.no_quantity::text,
         position.cost_basis::text,
         (position.yes_quantity + position.no_quantity)::text as potential_payout,
         position.last_order_id,
         position.updated_at,
         sum(position.cost_basis) over ()::text as total_cost_basis,
         sum(position.yes_quantity + position.no_quantity) over ()::text as total_potential_payout,
         count(*) over ()::text as position_count
       from simulation_positions position
       join markets market on market.id = position.market_id
       where position.user_id = $1
         and position.wallet_address = $2
       order by position.updated_at desc, position.market_id`,
    [userId, walletAddress.toLowerCase()],
  );

  const first = rows[0];
  return {
    totalCostBasis: first?.total_cost_basis ?? "0",
    totalPotentialPayout: first?.total_potential_payout ?? "0",
    positionCount: first ? Number.parseInt(first.position_count, 10) : 0,
    positions: rows.map((row) => ({
      marketId: row.market_id,
      marketSlug: row.market_slug,
      marketQuestion: row.market_question,
      marketStatus: row.market_status,
      yesQuantity: row.yes_quantity,
      noQuantity: row.no_quantity,
      costBasis: row.cost_basis,
      potentialPayout: row.potential_payout,
      lastOrderId: row.last_order_id,
      updatedAt: row.updated_at.toISOString(),
    })),
  };
}
