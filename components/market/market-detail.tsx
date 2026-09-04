import Link from "next/link";

import type { ApiIndexerStatus } from "@/lib/api/types";
import type { MarketPreview } from "@/lib/market/types";

import { DataFreshness } from "./data-freshness";
import { MarketWorkspace } from "./market-workspace";
import styles from "./market-detail.module.css";
import { TradingPanel } from "./trading-panel";

const statusLabels: Record<MarketPreview["status"], string> = {
  OPEN: "交易开放",
  CLOSING_SOON: "即将截止",
  NEW: "新市场",
};

interface MarketDetailProps {
  market: MarketPreview;
  dataOrigin: "CHAIN" | "DEMO";
  confirmedBlock: string | null;
  indexer: ApiIndexerStatus;
}

export function MarketDetail({ market, dataOrigin, confirmedBlock, indexer }: MarketDetailProps) {
  const description = market.description ?? "这是一个用于本地产品演示的二元预测市场。";
  const resolutionCriteria =
    market.resolutionCriteria ??
    "本演示市场尚未配置正式结算条件，不会触发任何真实资产结算。";
  const history =
    market.history ??
    ([{ label: "当前", yesProbability: market.yesProbability }] as const);
  const change = market.change24h;
  const changeLabel = change === null || change === undefined
    ? "24h 暂无数据"
    : "24h " + (change > 0 ? "+" : "") + change.toFixed(1) + " pts";

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.breadcrumb} aria-label="面包屑导航">
          <Link href="/markets">Markets</Link>
          <span aria-hidden="true">/</span>
          <span>{market.category}</span>
        </nav>

        <header className={styles.marketHeader}>
          <div className={styles.headerMeta}>
            <div className={styles.tags}>
              <span>{market.category}</span>
              <span className={styles.status}>{statusLabels[market.status]}</span>
            </div>
            <span className={styles.testnetBadge}>Polygon Amoy · Test market</span>
          </div>

          <div className={styles.titleGrid}>
            <div>
              <h1>{market.title}</h1>
              <p>{description}</p>
            </div>
            <div className={styles.headlineProbability}>
              <span>Current YES probability</span>
              <strong>{market.yesProbability}%</strong>
              <small className={change && change < 0 ? styles.negativeChange : styles.positiveChange}>
                {changeLabel}
              </small>
            </div>
          </div>

          <dl className={styles.stats}>
            <div><dt>Volume</dt><dd>{market.volume}</dd></div>
            <div><dt>Liquidity</dt><dd>{market.liquidity ?? "Not indexed"}</dd></div>
            <div><dt>Ending</dt><dd>{market.closesAt}</dd></div>
            <div><dt>Market status</dt><dd>{statusLabels[market.status]}</dd></div>
          </dl>
        </header>

        <DataFreshness indexer={indexer} dataOrigin={dataOrigin} marketBlock={confirmedBlock} />

        <div className={styles.layout}>
          <div className={styles.content}>
            <section className={styles.probabilitySection} aria-labelledby="probability-title">
              <div className={styles.sectionHeading}>
                <div>
                  <span className={styles.eyebrow}>MARKET CONSENSUS</span>
                  <h2 id="probability-title">Outcome probability</h2>
                </div>
                <p>{dataOrigin === "CHAIN" ? "Confirmed Indexer projection" : "Database demo snapshot"}</p>
              </div>

              <div className={styles.probabilityCards}>
                <div className={styles.yesProbability}>
                  <span>YES</span>
                  <strong>{market.yesProbability}¢</strong>
                  <small>{market.yesProbability}% chance</small>
                </div>
                <div className={styles.noProbability}>
                  <span>NO</span>
                  <strong>{market.noProbability}¢</strong>
                  <small>{market.noProbability}% chance</small>
                </div>
              </div>

              <div
                className={styles.probabilityBar}
                role="img"
                aria-label={"YES " + market.yesProbability + "%，NO " + market.noProbability + "%"}
              >
                <span style={{ width: String(market.yesProbability) + "%" }} />
              </div>
              <div className={styles.probabilityLegend}>
                <span>YES {market.yesProbability}%</span>
                <span>NO {market.noProbability}%</span>
              </div>
            </section>

            <section className={styles.resolutionPreview}>
              <div>
                <span className={styles.eyebrow}>RESOLUTION CONDITION</span>
                <h2>How this market resolves</h2>
              </div>
              <p>{resolutionCriteria}</p>
            </section>

            <MarketWorkspace
              market={market}
              history={history}
              dataOrigin={dataOrigin}
              resolutionCriteria={resolutionCriteria}
            />
          </div>

          <aside className={styles.sidebar} aria-label="模拟交易面板">
            <TradingPanel market={market} />
          </aside>
        </div>
      </div>
    </main>
  );
}
