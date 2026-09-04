"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiClientError, fetchMarket, fetchMarketHistory } from "@/lib/api/client";
import { marketFromApi } from "@/lib/market/api-adapter";
import type { ApiIndexerStatus } from "@/lib/api/types";
import type { MarketPreview } from "@/lib/market/types";
import { MarketDetail } from "./market-detail";
import styles from "./market-detail-loader.module.css";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; market: MarketPreview; dataOrigin: "CHAIN" | "DEMO"; confirmedBlock: string | null; indexer: ApiIndexerStatus }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

export function MarketDetailLoader({ identifier }: { identifier: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchMarket(identifier, controller.signal),
      fetchMarketHistory(identifier, controller.signal),
    ])
      .then(([market, history]) => {
        setState({
          kind: "ready",
          market: marketFromApi(market, history.items),
          dataOrigin: market.dataOrigin,
          confirmedBlock: market.confirmedBlock,
          indexer: market.indexer,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiClientError && error.status === 404) {
          setState({ kind: "not-found" });
          return;
        }
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "This market could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [attempt, identifier]);

  if (state.kind === "ready") {
    return (
      <MarketDetail
        market={state.market}
        dataOrigin={state.dataOrigin}
        confirmedBlock={state.confirmedBlock}
        indexer={state.indexer}
      />
    );
  }

  if (state.kind === "loading") {
    return (
      <main className={styles.loading} aria-busy="true" aria-label="Loading market detail">
        <div className={styles.loadingTop}>
          <span />
          <span />
        </div>
        <div className={styles.loadingLayout}>
          <div>
            <span className={styles.loadingTitle} />
            <span className={styles.loadingCopy} />
            <span className={styles.loadingChart} />
          </div>
          <span className={styles.loadingPanel} />
        </div>
      </main>
    );
  }

  if (state.kind === "not-found") {
    return (
      <main className={styles.state}>
        <span className={styles.eyebrow}>404 · MARKET NOT FOUND</span>
        <h1>This forecast is not in the catalog.</h1>
        <p>It may have been removed from discovery or the URL may be incorrect.</p>
        <Link className={styles.link} href="/markets">Return to markets</Link>
      </main>
    );
  }

  return (
    <main className={styles.state} role="alert">
      <span className={styles.eyebrow}>MARKET UNAVAILABLE</span>
      <h1>We could not load this forecast.</h1>
      <p>{state.message}</p>
      <button
        className={styles.button}
        type="button"
        onClick={() => {
          setState({ kind: "loading" });
          setAttempt((value) => value + 1);
        }}
      >
        Retry request
      </button>
    </main>
  );
}
