"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchPortfolio } from "@/lib/api/client";
import type { ApiPortfolio } from "@/lib/api/types";
import styles from "./account-view.module.css";

function formatUnits(value: string): string {
  try {
    const amount = BigInt(value);
    const sign = amount < 0n ? "-" : "";
    const absolute = amount < 0n ? -amount : amount;
    const whole = absolute / 1_000_000n;
    const fraction = (absolute % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
    return `${sign}${whole}${fraction ? `.${fraction}` : ""} fUSD`;
  } catch {
    return "Unavailable";
  }
}

export function PortfolioView() {
  const [portfolio, setPortfolio] = useState<ApiPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    fetchPortfolio(signal)
      .then(setPortfolio)
      .catch((reason: unknown) => {
        if (signal?.aborted) return;
        setError(reason instanceof Error ? reason.message : "Portfolio could not be loaded.");
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    queueMicrotask(() => {
      if (!controller.signal.aborted) load(controller.signal);
    });
    window.addEventListener("mock-order-created", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      window.removeEventListener("mock-order-created", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  return (
    <main className={styles.shell}>
      <header className={styles.heading}>
        <div><span className={styles.eyebrow}>Mock wallet</span><h1>Portfolio</h1></div>
        <p className={styles.notice}>A PostgreSQL simulation projection. These entries are not on-chain positions and have no monetary value.</p>
      </header>

      {loading ? <div className={styles.state} aria-busy="true"><div className={styles.stateInner}>Loading portfolio from the API...</div></div> : null}
      {!loading && error ? <div className={styles.state} role="alert"><div className={styles.stateInner}><h2>Portfolio unavailable</h2><p>{error}</p><button className={styles.retry} type="button" onClick={() => load()}>Retry</button></div></div> : null}
      {!loading && !error && portfolio ? (
        <>
          <section className={styles.summary} aria-label="Simulation portfolio summary">
            <div className={styles.metric}><span>Simulated cost</span><strong>{formatUnits(portfolio.totalCostBasis)}</strong></div>
            <div className={styles.metric}><span>Potential payout</span><strong>{formatUnits(portfolio.totalPotentialPayout)}</strong></div>
            <div className={styles.metric}><span>Markets</span><strong>{portfolio.positionCount}</strong></div>
          </section>
          {portfolio.positions.length === 0 ? <div className={styles.state}><div className={styles.stateInner}><h2>No simulated positions</h2><p>A successful mock order will appear here after the API projection updates.</p><Link href="/markets">Browse markets</Link></div></div> : (
            <section className={styles.list} aria-label="Simulation positions">
              {portfolio.positions.map((position) => (
                <article className={styles.card} key={position.marketId}>
                  <div><h2><Link href={`/markets/${position.marketSlug}`}>{position.marketQuestion}</Link></h2><div className={styles.meta}>{position.marketStatus} · Updated {new Date(position.updatedAt).toLocaleString()}</div></div>
                  <div className={styles.cell}><span>YES shares</span><strong>{formatUnits(position.yesQuantity)}</strong></div>
                  <div className={styles.cell}><span>NO shares</span><strong>{formatUnits(position.noQuantity)}</strong></div>
                  <div className={styles.cell}><span>Simulated cost</span><strong>{formatUnits(position.costBasis)}</strong></div>
                </article>
              ))}
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
