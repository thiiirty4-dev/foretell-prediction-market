"use client";

import { useEffect, useState } from "react";
import { fetchMarkets } from "@/lib/api/client";
import { marketFromApi } from "@/lib/market/api-adapter";
import type { ApiIndexerStatus } from "@/lib/api/types";
import {
  MARKET_CATEGORIES,
  type MarketCategory,
  type MarketPreview,
} from "@/lib/market/types";
import { DataFreshness } from "./data-freshness";
import { MarketCard } from "./market-card";
import styles from "./markets-catalog.module.css";

const SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "volume", label: "Volume" },
  { value: "newest", label: "Newest" },
  { value: "ending-soon", label: "Ending Soon" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

function CatalogSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className={styles.skeleton} key={index}>
          <span />
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export function MarketsCatalog() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<MarketCategory>("All");
  const [sort, setSort] = useState<SortValue>("trending");
  const [markets, setMarkets] = useState<MarketPreview[]>([]);
  const [trendingMarkets, setTrendingMarkets] = useState<MarketPreview[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [indexer, setIndexer] = useState<ApiIndexerStatus | null>(null);

  useEffect(() => {
    const initialSearch = new URLSearchParams(window.location.search).get("search")?.trim() ?? "";
    const timer = window.setTimeout(() => {
      if (initialSearch) {
        setSearch(initialSearch);
        setDebouncedSearch(initialSearch);
        setLoading(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchMarkets({ sort: "trending", limit: 3, signal: controller.signal })
      .then((page) => {
        setTrendingMarkets(
          page.items.map((market) => ({ ...marketFromApi(market), trending: true })),
        );
        setTrendingError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setTrendingError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setTrendingLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = search.trim();
      if (normalized === debouncedSearch) return;
      setLoading(true);
      setError(null);
      setDebouncedSearch(normalized);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [debouncedSearch, search]);

  useEffect(() => {
    const controller = new AbortController();
    fetchMarkets({
      search: debouncedSearch || undefined,
      category: category === "All" ? undefined : category,
      sort,
      limit: 12,
      signal: controller.signal,
    })
      .then((page) => {
        setMarkets(page.items.map((market) => marketFromApi(market)));
        setNextCursor(page.nextCursor);
        setIndexer(page.indexer);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setMarkets([]);
        setNextCursor(null);
        setError(reason instanceof Error ? reason.message : "Markets could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt, category, debouncedSearch, sort]);

  function selectCategory(nextCategory: MarketCategory) {
    if (category === nextCategory) return;
    setLoading(true);
    setError(null);
    setCategory(nextCategory);
  }

  function selectSort(nextSort: SortValue) {
    if (sort === nextSort) return;
    setLoading(true);
    setError(null);
    setSort(nextSort);
  }

  function resetFilters() {
    setLoading(true);
    setError(null);
    setSearch("");
    setDebouncedSearch("");
    setCategory("All");
    setSort("trending");
    setAttempt((value) => value + 1);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchMarkets({
        search: debouncedSearch || undefined,
        category: category === "All" ? undefined : category,
        sort,
        cursor: nextCursor,
        limit: 12,
      });
      setMarkets((current) => [
        ...current,
        ...page.items.map((market) => marketFromApi(market)),
      ]);
      setNextCursor(page.nextCursor);
      setIndexer(page.indexer);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "More markets could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.heading}>
        <div className={styles.headingCopy}>
          <span className={styles.eyebrow}>Prediction markets · Polygon Amoy</span>
          <h1>Markets</h1>
          <p>用公开概率追踪正在发生的世界。所有 fUSD 与订单均为测试环境数据，不具有真实价值。</p>
        </div>
        <div className={styles.marketTotal}>
          <span>Markets loaded</span>
          <strong>{loading ? "—" : markets.length + (nextCursor ? "+" : "")}</strong>
          <small>Confirmed database view</small>
        </div>
      </header>

      <section id="trending" className={styles.trending} aria-labelledby="trending-heading">
        <div className={styles.sectionTitle}>
          <div>
            <span className={styles.sectionIndex}>01</span>
            <h2 id="trending-heading">Trending now</h2>
          </div>
          <p>按当前目录热度排序的测试市场。</p>
        </div>
        {trendingLoading ? <CatalogSkeleton count={3} /> : null}
        {!trendingLoading && trendingMarkets.length > 0 ? (
          <div className={styles.trendingGrid}>
            {trendingMarkets.map((market, index) => (
              <MarketCard key={market.id} market={market} featured={index === 0} revealIndex={index} />
            ))}
          </div>
        ) : null}
        {!trendingLoading && trendingError ? (
          <div className={styles.compactError} role="status">热门市场暂时不可用，完整目录仍可继续浏览。</div>
        ) : null}
      </section>

      <section id="filters" className={styles.catalog} aria-labelledby="all-markets-heading">
        <div className={styles.sectionTitle}>
          <div>
            <span className={styles.sectionIndex}>02</span>
            <h2 id="all-markets-heading">All markets</h2>
          </div>
          <p>{loading ? "Refreshing directory…" : String(markets.length) + " results"}</p>
        </div>

        <div className={styles.controls} aria-label="Market filters">
          <label className={styles.search}>
            <span className={styles.searchIcon} aria-hidden="true" />
            <span className="sr-only">Search markets</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search questions, topics, or keywords"
            />
            {search ? (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search">×</button>
            ) : null}
          </label>

          <div className={styles.categories} aria-label="Market categories">
            {MARKET_CATEGORIES.map((option) => (
              <button
                className={category === option ? styles.activeCategory : styles.category}
                key={option}
                type="button"
                aria-pressed={category === option}
                onClick={() => selectCategory(option)}
              >
                {option}
              </button>
            ))}
          </div>

          <div className={styles.sortGroup} role="group" aria-label="Sort markets">
            <span>Sort by</span>
            <div>
              {SORT_OPTIONS.map((option) => (
                <button
                  className={sort === option.value ? styles.activeSort : styles.sortButton}
                  key={option.value}
                  type="button"
                  aria-pressed={sort === option.value}
                  onClick={() => selectSort(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.resultBar}>
          <span>{category === "All" ? "All categories" : category}</span>
          <span>Polygon Amoy · Test assets only</span>
        </div>

        <DataFreshness indexer={indexer} />

        {loading ? <CatalogSkeleton /> : null}

        {!loading && error && markets.length === 0 ? (
          <section className={styles.state} role="alert">
            <span className={styles.stateCode}>DATA UNAVAILABLE</span>
            <h2>The market catalog could not be loaded.</h2>
            <p>{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError(null);
                setAttempt((value) => value + 1);
              }}
            >
              Retry request
            </button>
          </section>
        ) : null}

        {!loading && !error && markets.length === 0 ? (
          <section className={styles.state}>
            <span className={styles.stateCode}>0 RESULTS</span>
            <h2>No markets match this view.</h2>
            <p>Try a broader term, another category, or reset the active sorting.</p>
            <button type="button" onClick={resetFilters}>Clear filters</button>
          </section>
        ) : null}

        {!loading && markets.length > 0 ? (
          <>
            <section className={styles.grid} aria-label="Prediction markets">
              {markets.map((market, index) => (
                <MarketCard key={market.id} market={market} revealIndex={index} />
              ))}
            </section>
            {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}
            {nextCursor ? (
              <div className={styles.more}>
                <button type="button" disabled={loadingMore} onClick={loadMore}>
                  {loadingMore ? "Loading…" : "Load more markets"}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
