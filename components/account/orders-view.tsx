"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchOrders } from "@/lib/api/client";
import type { ApiMockOrder } from "@/lib/api/types";
import styles from "./account-view.module.css";

function formatUnits(value: string): string {
  try {
    const amount = BigInt(value);
    const whole = amount / 1_000_000n;
    const fraction = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
    return `${whole}${fraction ? `.${fraction}` : ""} fUSD`;
  } catch {
    return "Unavailable";
  }
}

export function OrdersView() {
  const [orders, setOrders] = useState<ApiMockOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    fetchOrders(signal)
      .then((result) => setOrders(result.items))
      .catch((reason: unknown) => {
        if (signal?.aborted) return;
        setError(reason instanceof Error ? reason.message : "Orders could not be loaded.");
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
        <div><span className={styles.eyebrow}>Database activity</span><h1>Orders</h1></div>
        <p className={styles.notice}>Mock orders only. No wallet signature, asset transfer, or Polygon transaction is performed.</p>
      </header>

      {loading ? <div className={styles.state} aria-busy="true"><div className={styles.stateInner}>Loading orders from the API...</div></div> : null}
      {!loading && error ? <div className={styles.state} role="alert"><div className={styles.stateInner}><h2>Orders unavailable</h2><p>{error}</p><button className={styles.retry} type="button" onClick={() => load()}>Retry</button></div></div> : null}
      {!loading && !error && orders.length === 0 ? <div className={styles.state}><div className={styles.stateInner}><h2>No mock orders yet</h2><p>Choose a market to create your first database-backed simulation.</p><Link href="/markets">Browse markets</Link></div></div> : null}
      {!loading && !error && orders.length > 0 ? (
        <section className={styles.list} aria-label="Mock orders">
          {orders.map((order) => (
            <article className={styles.card} key={order.id}>
              <div><h2><Link href={`/markets/${order.marketId}`}>{order.outcome} position</Link></h2><div className={styles.meta}>{new Date(order.createdAt).toLocaleString()} · {order.id.slice(0, 8)}</div></div>
              <div className={styles.cell}><span>Input</span><strong>{formatUnits(order.amount)}</strong></div>
              <div className={styles.cell}><span>Est. shares</span><strong>{formatUnits(order.estimatedShares)}</strong></div>
              <span className={styles.pill}>{order.state}</span>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
