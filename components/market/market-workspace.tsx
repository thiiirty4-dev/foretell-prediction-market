"use client";

import { useState } from "react";
import type { MarketHistoryPoint, MarketPreview } from "@/lib/market/types";
import { MarketChart } from "./market-chart";
import styles from "./market-detail.module.css";

const TABS = [
  { id: "chart", label: "Chart" },
  { id: "orderbook", label: "Order Book" },
  { id: "trades", label: "Recent Trades" },
  { id: "information", label: "Market Info" },
  { id: "resolution", label: "Resolution" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface MarketWorkspaceProps {
  market: MarketPreview;
  history: readonly MarketHistoryPoint[];
  dataOrigin: "CHAIN" | "DEMO";
  resolutionCriteria: string;
}

export function MarketWorkspace({
  market,
  history,
  dataOrigin,
  resolutionCriteria,
}: MarketWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabId>("chart");

  return (
    <section className={styles.workspace} aria-label="Market data workspace">
      <div className={styles.tabList} role="tablist" aria-label="Market detail sections">
        {TABS.map((tab) => (
          <button
            id={"market-tab-" + tab.id}
            className={activeTab === tab.id ? styles.activeTab : styles.tab}
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={"market-panel-" + tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id={"market-panel-" + activeTab}
        className={styles.tabPanel}
        role="tabpanel"
        aria-labelledby={"market-tab-" + activeTab}
      >
        {activeTab === "chart" ? (
          <MarketChart history={history} dataOrigin={dataOrigin} embedded />
        ) : null}

        {activeTab === "orderbook" ? (
          <div className={styles.placeholder}>
            <span className={styles.placeholderCode}>ORDER BOOK</span>
            <h3>Order book data is not connected.</h3>
            <p>This MVP uses a simulated immediate quote. No bids, asks, or executable liquidity are being fabricated.</p>
            <div className={styles.bookHeader} aria-hidden="true">
              <span>YES bids</span><span>Price</span><span>NO bids</span>
            </div>
          </div>
        ) : null}

        {activeTab === "trades" ? (
          <div className={styles.placeholder}>
            <span className={styles.placeholderCode}>RECENT TRADES</span>
            <h3>No confirmed trades to show.</h3>
            <p>Confirmed chain trades will appear here only after the API exposes the trusted Indexer projection.</p>
          </div>
        ) : null}

        {activeTab === "information" ? (
          <dl className={styles.infoGrid}>
            <div><dt>Category</dt><dd>{market.category}</dd></div>
            <div><dt>Status</dt><dd>{market.status}</dd></div>
            <div><dt>Volume</dt><dd>{market.volume}</dd></div>
            <div><dt>Liquidity</dt><dd>{market.liquidity ?? "Not indexed"}</dd></div>
            <div><dt>Ending</dt><dd>{market.closesAt}</dd></div>
            <div><dt>Data source</dt><dd>{dataOrigin === "CHAIN" ? "Confirmed chain projection" : "Database demo"}</dd></div>
          </dl>
        ) : null}

        {activeTab === "resolution" ? (
          <div className={styles.resolutionPanel}>
            <span className={styles.placeholderCode}>RESOLUTION RULES</span>
            <h3>Objective settlement criteria</h3>
            <p>{resolutionCriteria}</p>
            <small>Any future settlement action must follow the on-chain proposal, dispute, and finalization flow.</small>
          </div>
        ) : null}
      </div>
    </section>
  );
}
