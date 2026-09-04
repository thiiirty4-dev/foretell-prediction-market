import type { CSSProperties } from "react";
import Link from "next/link";
import type { MarketHistoryPoint, MarketPreview, MarketStatus } from "@/lib/market/types";
import styles from "./market.module.css";

const statusLabels: Record<MarketStatus, string> = {
  OPEN: "Open",
  CLOSING_SOON: "Closing soon",
  NEW: "New",
};

const statusClasses: Record<MarketStatus, string> = {
  OPEN: styles.statusOpen,
  CLOSING_SOON: styles.statusClosing,
  NEW: styles.statusNew,
};

interface MarketCardProps {
  market: MarketPreview;
  featured?: boolean;
  revealIndex?: number;
}

function MiniTrend({
  history,
  probability,
}: {
  history: readonly MarketHistoryPoint[] | undefined;
  probability: number;
}) {
  const source = history && history.length > 1
    ? history
    : [
        { label: "Previous", yesProbability: probability },
        { label: "Now", yesProbability: probability },
      ];
  const width = 180;
  const height = 54;
  const padding = 3;
  const denominator = Math.max(source.length - 1, 1);
  const points = source.map((point, index) => ({
    x: padding + (index / denominator) * (width - padding * 2),
    y: padding + ((100 - point.yesProbability) / 100) * (height - padding * 2),
  }));
  const path = points
    .map((point, index) => (index === 0 ? "M " : "L ") + point.x + " " + point.y)
    .join(" ");

  return (
    <svg
      className={styles.sparkline}
      viewBox={"0 0 " + width + " " + height}
      preserveAspectRatio="none"
      role="img"
      aria-label="市场概率微型趋势图"
    >
      <path d={path} className={styles.sparklineLine} />
    </svg>
  );
}

export function MarketCard({ market, featured = false, revealIndex = 0 }: MarketCardProps) {
  const animationStyle = {
    "--card-delay": String(Math.min(revealIndex, 8) * 45) + "ms",
  } as CSSProperties;
  const change = market.change24h;
  const changeClass = change === null || change === undefined || change === 0
    ? styles.changeFlat
    : change > 0
      ? styles.changeUp
      : styles.changeDown;
  const changeLabel = change === null || change === undefined
    ? "24h —"
    : "24h " + (change > 0 ? "+" : "") + change.toFixed(1) + " pts";

  return (
    <Link
      href={{ pathname: "/markets/[id]", query: { id: market.id } }}
      className={[styles.card, featured ? styles.featuredCard : ""].filter(Boolean).join(" ")}
      style={animationStyle}
      aria-label={"查看市场：" + market.title}
    >
      <div className={styles.cardTopline}>
        <span className={styles.category}>{market.category}</span>
        <span className={[styles.status, statusClasses[market.status]].join(" ")}>
          {statusLabels[market.status]}
        </span>
      </div>

      <h3>{market.title}</h3>

      <div className={styles.signalRow}>
        <div className={styles.primaryProbability}>
          <span>YES chance</span>
          <strong>{market.yesProbability}%</strong>
          <small className={changeClass}>{changeLabel}</small>
        </div>
        <MiniTrend history={market.history} probability={market.yesProbability} />
      </div>

      <div className={styles.outcomes} aria-label="Outcome prices">
        <div className={styles.yesOutcome}><span>YES</span><strong>{market.yesProbability}¢</strong></div>
        <div className={styles.noOutcome}><span>NO</span><strong>{market.noProbability}¢</strong></div>
      </div>

      <dl className={styles.marketFacts}>
        <div><dt>Volume</dt><dd>{market.volume}</dd></div>
        <div><dt>Liquidity</dt><dd>{market.liquidity ?? "Not indexed"}</dd></div>
      </dl>

      <div className={styles.cardFooter}>
        <span>Ends {market.closesAt}</span>
        <span className={styles.openMarket} aria-hidden="true">View market →</span>
      </div>
    </Link>
  );
}
