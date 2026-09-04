import type { CSSProperties } from "react";
import type { MarketPreview, MarketStatus } from "@/lib/market/types";
import styles from "./market.module.css";

const statusLabels: Record<MarketStatus, string> = { OPEN: "Open", CLOSING_SOON: "Closing soon", NEW: "New" };
const statusClasses: Record<MarketStatus, string> = { OPEN: styles.statusOpen, CLOSING_SOON: styles.statusClosing, NEW: styles.statusNew };

interface MarketCardProps { market: MarketPreview; featured?: boolean; revealIndex?: number; }

export function MarketCard({ market, featured = false, revealIndex = 0 }: MarketCardProps) {
  const animationStyle = { "--card-delay": `${Math.min(revealIndex, 8) * 55}ms` } as CSSProperties;

  return (
    <article className={`${styles.card} ${featured ? styles.featuredCard : ""}`} style={animationStyle}>
      <div className={styles.cardTopline}>
        <span className={styles.category}>{market.category}</span>
        <span className={`${styles.status} ${statusClasses[market.status]}`}>{statusLabels[market.status]}</span>
      </div>
      <h3>{market.title}</h3>
      <div className={styles.outcomes}>
        <div className={styles.yesOutcome}><span>YES</span><strong>{market.yesProbability}%</strong></div>
        <div className={styles.noOutcome}><span>NO</span><strong>{market.noProbability}%</strong></div>
      </div>
      <div className={styles.probabilityBar} role="img" aria-label={`YES ${market.yesProbability}%，NO ${market.noProbability}%`}>
        <span style={{ width: `${market.yesProbability}%` }} />
      </div>
      <dl className={styles.marketFacts}>
        <div><dt>Trading Volume</dt><dd>{market.volume}</dd></div>
        <div><dt>Closes</dt><dd>{market.closesAt}</dd></div>
      </dl>
      <div className={styles.cardFooter}><span>Mock market</span><span aria-hidden="true">Probability view ↗</span></div>
    </article>
  );
}
