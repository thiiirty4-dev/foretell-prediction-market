import { SiteHeader } from "@/components/layout/site-header";
import { MarketDiscovery } from "@/components/market/market-discovery";
import { mockMarkets } from "@/lib/market/mock-markets";
import styles from "./page.module.css";

export default function Home() {
  const leadMarket = mockMarkets[0];

  return (
    <>
      <SiteHeader />
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
              <li>Cloudflare Workers</li>
              <li>Test assets only</li>
              <li>No real-money value</li>
            </ul>
          </div>

          <aside className={styles.signalPanel} aria-label="热门市场快照">
            <div className={styles.panelTopline}>
              <span>Live signal / 01</span>
              <span className={styles.pulse}>Updating</span>
            </div>
            <span className={styles.panelCategory}>{leadMarket.category}</span>
            <h2>{leadMarket.title}</h2>
            <div className={styles.panelProbability}>
              <div><span>YES</span><strong>{leadMarket.yesProbability}%</strong></div>
              <div><span>NO</span><strong>{leadMarket.noProbability}%</strong></div>
            </div>
            <div className={styles.panelMeter} role="img" aria-label={"YES " + leadMarket.yesProbability + "%，NO " + leadMarket.noProbability + "%"}>
              <span style={{ width: leadMarket.yesProbability + "%" }} />
            </div>
            <div className={styles.panelFooter}>
              <div><span>Trading Volume</span><strong>{leadMarket.volume}</strong></div>
              <div><span>Closes</span><strong>{leadMarket.closesAt}</strong></div>
            </div>
            <p className={styles.mockNote}>Preview data · Public simulation only</p>
          </aside>
        </section>

        <section className={styles.marketStage}>
          <MarketDiscovery markets={mockMarkets} />
        </section>
      </main>
    </>
  );
}
