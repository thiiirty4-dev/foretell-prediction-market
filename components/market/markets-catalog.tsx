"use client";

import { useState } from "react";
import { MARKET_CATEGORIES, type MarketCategory, type MarketPreview } from "@/lib/market/types";
import { MarketCard } from "./market-card";
import styles from "./market.module.css";

const SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "volume", label: "Volume" },
  { value: "newest", label: "Newest" },
  { value: "ending-soon", label: "Ending Soon" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];

interface MarketsCatalogProps {
  markets: readonly MarketPreview[];
}

function volumeAsInteger(volume: string): bigint {
  const integer = volume.match(/\d/g)?.join("") ?? "0";
  return BigInt(integer);
}

function compareVolume(left: MarketPreview, right: MarketPreview): number {
  const leftVolume = volumeAsInteger(left.volume);
  const rightVolume = volumeAsInteger(right.volume);
  if (leftVolume === rightVolume) return left.id.localeCompare(right.id);
  return leftVolume > rightVolume ? -1 : 1;
}

function compareMarkets(left: MarketPreview, right: MarketPreview, sort: SortOption): number {
  if (sort === "volume") return compareVolume(left, right);
  if (sort === "newest") return right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id);
  if (sort === "ending-soon") return left.closesAt.localeCompare(right.closesAt) || left.id.localeCompare(right.id);
  if (left.trending !== right.trending) return left.trending ? -1 : 1;
  return compareVolume(left, right);
}

export function MarketsCatalog({ markets }: MarketsCatalogProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MarketCategory>("All");
  const [sort, setSort] = useState<SortOption>("trending");
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visibleMarkets = markets
    .filter((market) => {
      const matchesCategory = category === "All" || market.category === category;
      const searchText = `${market.title} ${market.category} ${market.status}`.toLocaleLowerCase("zh-CN");
      return matchesCategory && (normalizedQuery.length === 0 || searchText.includes(normalizedQuery));
    })
    .sort((left, right) => compareMarkets(left, right, sort));

  function resetFilters() {
    setQuery("");
    setCategory("All");
  }

  return (
    <div className={styles.catalog}>
      <div id="filters" className={styles.catalogControls}>
        <label className={styles.searchLabel}>
          <span className={styles.visuallyHidden}>搜索预测市场</span>
          <span className={styles.searchIcon} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by market or category..."
            autoComplete="off"
          />
          <kbd>MARKETS</kbd>
        </label>

        <fieldset className={styles.filterSet}>
          <legend className={styles.visuallyHidden}>按分类筛选市场</legend>
          <div className={styles.categories}>
            {MARKET_CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                className={category === item ? styles.activeCategory : ""}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>

        <div className={styles.resultBar}>
          <p className={styles.marketCount} aria-live="polite">
            Market count
            <strong>{visibleMarkets.length} / {markets.length}</strong>
          </p>
          <label className={styles.sortControl}>
            Sort markets
            <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}>
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {visibleMarkets.length > 0 ? (
        <div className={styles.marketGrid} aria-live="polite">
          {visibleMarkets.map((market, index) => <MarketCard key={market.id} market={market} revealIndex={index} />)}
        </div>
      ) : (
        <div className={styles.emptyState} role="status">
          <strong>没有找到匹配的市场</strong>
          <span>更换关键词，或清除当前分类筛选。</span>
          <button className={styles.clearButton} type="button" onClick={resetFilters}>Clear filters</button>
        </div>
      )}
    </div>
  );
}
