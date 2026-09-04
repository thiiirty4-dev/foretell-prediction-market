import { describe, expect, it } from "vitest";

import { deriveIndexerSyncStatus } from "@/lib/indexer-status";

describe("deriveIndexerSyncStatus", () => {
  const now = Date.parse("2026-09-04T10:00:00.000Z");

  it("reports an unconfigured indexer when no checkpoint exists", () => {
    expect(deriveIndexerSyncStatus(null, now)).toMatchObject({
      state: "UNCONFIGURED",
      lastSyncedBlock: null,
      stale: true,
    });
  });

  it("preserves exact block numbers for a fresh checkpoint", () => {
    expect(deriveIndexerSyncStatus({
      currentBlock: "46686278",
      updatedAt: "2026-09-04T09:59:00.000Z",
      blockTimestamp: "2026-09-04T09:58:58.000Z",
    }, now)).toMatchObject({
      state: "HEALTHY",
      lastSyncedBlock: "46686278",
      stale: false,
    });
  });

  it("marks an old checkpoint stale without discarding its last known block", () => {
    expect(deriveIndexerSyncStatus({
      currentBlock: "46686000",
      updatedAt: "2026-09-04T09:45:00.000Z",
      blockTimestamp: null,
    }, now)).toMatchObject({
      state: "STALE",
      lastSyncedBlock: "46686000",
      stale: true,
    });
  });

  it("fails closed for malformed checkpoint data", () => {
    expect(deriveIndexerSyncStatus({
      currentBlock: "46.5",
      updatedAt: "not-a-date",
      blockTimestamp: null,
    }, now)).toMatchObject({ state: "UNAVAILABLE", stale: true });
  });
});
