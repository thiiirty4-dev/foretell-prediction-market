import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";
import styles from "@/components/market/market-detail.module.css";

export default function MarketNotFound() {
  return (
    <>
      <SiteHeader />
      <main className={styles.notFound}>
        <section className={styles.notFoundCard}>
          <span className={styles.notFoundCode}>404</span>
          <h1>没有找到这个市场</h1>
          <p>该市场不存在，或已从本地演示数据中移除。没有订单或资产受到影响。</p>
          <Link href="/markets">返回 Markets</Link>
        </section>
      </main>
    </>
  );
}
