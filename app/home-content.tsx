"use client";

import { useEffect, useState } from "react";
import { MarketDiscovery } from "@/components/market/market-discovery";
import { fetchMarkets } from "@/lib/api/client";
import { marketFromApi } from "@/lib/market/api-adapter";
import type { MarketPreview } from "@/lib/market/types";
import styles from "./page.module.css";

type HomeState =
  | { kind: "loading" }
  | { kind: "ready"; markets: MarketPreview[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export function HomeContent() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<HomeState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetchMarkets({ sort: "trending", limit: 8, signal: controller.signal })
      .then((page) => {
        if (page.items.length === 0) {
          setState({ kind: "empty" });
          return;
        }
        setState({
          kind: "ready",
          markets: page.items.map((market, index) => ({
            ...marketFromApi(market),
            trending: index < 3,
          })),
        });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message: reason instanceof Error ? reason.message : "Markets could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [attempt]);

  const leadMarket = state.kind === "ready" ? state.markets[0] : null;

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} aria-hidden="true" />
            Collective intelligence, priced in public
          </div>
          <h1 id="home-title" className={styles.title}>
            看见共识，<span>预测下一步。</span>
          </h1>
          <p className={styles.intro}>
            在一个透明、可验证的实验市场里表达判断。探索事件概率，观察观点如何随新信息持续变化。
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#markets">
              Explore markets <span aria-hidden="true">↗</span>
            </a>
            <a className={styles.secondaryAction} href="#trending">See what is moving</a>
          </div>
          <ul className={styles.trustList} aria-label="平台说明">
            <li>Polygon Amoy</li>
            <li>Test assets only</li>
            <li>No real-money value</li>
          </ul>
        </div>

        <aside className={styles.signalPanel} aria-label="热门市场快照" aria-busy={state.kind === "loading"}>
          <div className={styles.panelTopline}>
            <span>Live signal / 01</span>
            <span className={styles.pulse}>{state.kind === "ready" ? "API live" : "Loading"}</span>
          </div>
          {leadMarket ? (
            <>
              <span className={styles.panelCategory}>{leadMarket.category}</span>
              <h2>{leadMarket.title}</h2>
              <div className={styles.panelProbability}>
                <div><span>YES</span><strong>{leadMarket.yesProbability}%</strong></div>
                <div><span>NO</span><strong>{leadMarket.noProbability}%</strong></div>
              </div>
              <div
                className={styles.panelMeter}
                role="img"
                aria-label={`YES ${leadMarket.yesProbability}%，NO ${leadMarket.noProbability}%`}
              >
                <span style={{ width: `${leadMarket.yesProbability}%` }} />
              </div>
              <div className={styles.panelFooter}>
                <div><span>Trading Volume</span><strong>{leadMarket.volume}</strong></div>
                <div><span>Closes</span><strong>{leadMarket.closesAt}</strong></div>
              </div>
              <p className={styles.mockNote}>PostgreSQL via REST API · No wallet or chain transaction</p>
            </>
          ) : (
            <>
              <h2>{state.kind === "error" ? "Live signal unavailable" : "Loading market signals"}</h2>
              <p className={styles.mockNote}>
                {state.kind === "error" ? state.message : "Waiting for the database-backed market API."}
              </p>
              {state.kind === "error" ? (
                <button
                  className={styles.primaryAction}
                  type="button"
                  onClick={() => {
                    setState({ kind: "loading" });
                    setAttempt((value) => value + 1);
                  }}
                >
                  Retry
                </button>
              ) : null}
            </>
          )}
        </aside>
      </section>

      <section className={styles.marketStage}>
        {state.kind === "ready" ? <MarketDiscovery markets={state.markets} /> : null}
      </section>
    </main>
  );
}
