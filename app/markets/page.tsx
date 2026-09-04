import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { MarketsCatalog } from "@/components/market/markets-catalog";
import { mockMarkets } from "@/lib/market/mock-markets";
import styles from "./markets-page.module.css";

export const metadata: Metadata = {
  title: "Markets | Prediction Market",
  description: "浏览、搜索和筛选公开测试预测市场。",
};

export default function MarketsPage() {
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <section className={styles.hero} aria-labelledby="markets-page-title">
          <div className={styles.heroLabel}><span aria-hidden="true">02</span> Market directory</div>
          <div className={styles.heroGrid}>
            <div>
              <h1 id="markets-page-title">Browse<br /><em>the possible.</em></h1>
              <p>浏览不同主题的预测市场，用搜索、分类与排序快速找到值得关注的概率信号。</p>
            </div>
            <aside className={styles.directoryNote} aria-label="当前市场目录说明">
              <span>Market universe</span>
              <strong>{String(mockMarkets.length).padStart(2, "0")}</strong>
              <p>公开演示市场。所有交易、余额和概率仅用于产品模拟，不具有真实价值。</p>
            </aside>
          </div>
        </section>

        <section className={styles.catalogSection} aria-label="市场列表">
          <MarketsCatalog markets={mockMarkets} />
        </section>
      </main>
    </>
  );
}
