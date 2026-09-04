"use client";

import { useState } from "react";
import { MARKET_CATEGORIES, type MarketCategory, type MarketPreview } from "@/lib/market/types";
import { MarketCard } from "./market-card";
import styles from "./market.module.css";

interface MarketDiscoveryProps { markets: readonly MarketPreview[]; }

export function MarketDiscovery({ markets }: MarketDiscoveryProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MarketCategory>("All");
  const trendingMarkets = markets.filter((market) => market.trending);
  const newMarkets = markets.filter((market) => market.newMarket);
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visibleMarkets = markets.filter((market) => {
    const matchesCategory = category === "All" || market.category === category;
    const searchableText = `${market.title} ${market.category}`.toLocaleLowerCase("zh-CN");
    return matchesCategory && (normalizedQuery.length === 0 || searchableText.includes(normalizedQuery));
  });

  return (
    <div className={styles.discovery}>
      <section id="trending" className={styles.collection} aria-labelledby="trending-title">
        <SectionHeading index="01 / Trending" title="市场正在关注什么" id="trending-title" description="基于演示成交量与概率变化的热门市场，当前数据均为 mock。" />
        <div className={styles.trendingGrid}>
          {trendingMarkets.map((market, index) => <MarketCard key={market.id} market={market} featured={index === 0} revealIndex={index} />)}
        </div>
      </section>

      <section id="markets" className={styles.collection} aria-labelledby="markets-title">
        <SectionHeading index="02 / Markets" title="探索全部市场" id="markets-title" description="按主题筛选，或直接搜索你关注的事件。" />
        <div className={styles.controls}>
          <label className={styles.searchLabel}>
            <span className={styles.visuallyHidden}>搜索市场</span>
            <span className={styles.searchIcon} aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets, topics, categories..." />
            <kbd>⌘ K</kbd>
          </label>
          <div id="categories" className={styles.categories} aria-label="市场分类">
            {MARKET_CATEGORIES.map((item) => (
              <button key={item} type="button" className={category === item ? styles.activeCategory : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>
            ))}
          </div>
        </div>
        {visibleMarkets.length > 0 ? (
          <div className={styles.marketGrid} aria-live="polite">
            {visibleMarkets.map((market, index) => <MarketCard key={market.id} market={market} revealIndex={index} />)}
          </div>
        ) : (
          <div className={styles.emptyState} role="status"><strong>没有匹配的市场</strong><span>尝试更换关键词或选择 All。</span></div>
        )}
      </section>

      <section id="new" className={styles.collection} aria-labelledby="new-title">
        <SectionHeading index="03 / New" title="最新加入" id="new-title" description="本周新增的测试市场，尚未连接任何真实交易。" />
        <div className={styles.newGrid}>
          {newMarkets.map((market, index) => <MarketCard key={market.id} market={market} revealIndex={index} />)}
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ index, title, id, description }: { index: string; title: string; id: string; description: string }) {
  return (
    <div className={styles.sectionHeading}>
      <div><span className={styles.sectionIndex}>{index}</span><h2 id={id}>{title}</h2></div>
      <p>{description}</p>
    </div>
  );
}
