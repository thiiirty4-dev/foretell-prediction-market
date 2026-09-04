import "server-only";

import { readSimulationPortfolio } from "@/lib/data/simulation-portfolio";

const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";
const MOCK_WALLET_ADDRESS = "0x1111111111111111111111111111111111111111";

export async function getMockPortfolio() {
  const portfolio = await readSimulationPortfolio(MOCK_USER_ID, MOCK_WALLET_ADDRESS);

  return {
    mode: "SIMULATION" as const,
    source: "POSTGRES_SIMULATION_PROJECTION" as const,
    walletAddress: MOCK_WALLET_ADDRESS,
    testnetOnly: true,
    hasMonetaryValue: false,
    ...portfolio,
  };
}
