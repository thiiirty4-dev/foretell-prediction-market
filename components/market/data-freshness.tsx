import type { ApiIndexerStatus } from "@/lib/api/types";

import styles from "./data-freshness.module.css";

interface DataFreshnessProps {
  indexer: ApiIndexerStatus | null;
  dataOrigin?: "CHAIN" | "DEMO";
  marketBlock?: string | null;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "尚无同步时间";
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "同步时间不可用";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(timestamp);
}

export function DataFreshness({ indexer, dataOrigin, marketBlock }: DataFreshnessProps) {
  if (!indexer) {
    return <div className={styles.pending} role="status">正在读取 Indexer 同步状态...</div>;
  }

  const source = dataOrigin === "CHAIN"
    ? "链上确认投影"
    : dataOrigin === "DEMO"
      ? "PostgreSQL 演示数据"
      : "PostgreSQL 市场目录";
  const block = marketBlock ?? indexer.lastSyncedBlock;
  const detail = indexer.state === "UNCONFIGURED"
    ? "尚未配置 Amoy 合约地址，当前可继续浏览演示数据。"
    : indexer.state === "UNAVAILABLE"
      ? "同步状态暂不可用，页面保留最后一份数据库快照。"
      : indexer.state === "STALE"
        ? `Indexer 暂时落后，最后同步于 ${formatTimestamp(indexer.lastSyncedAt)}。`
        : `数据更新于 ${formatTimestamp(indexer.lastSyncedAt)}。`;

  return (
    <section className={`${styles.status} ${indexer.stale ? styles.warning : styles.healthy}`} aria-label="链上数据同步状态">
      <div>
        <strong>{source}</strong>
        <span>{detail}</span>
      </div>
      <dl>
        <div><dt>Network</dt><dd>Polygon Amoy</dd></div>
        <div><dt>Last block</dt><dd>{block ?? "Not synced"}</dd></div>
      </dl>
    </section>
  );
}
