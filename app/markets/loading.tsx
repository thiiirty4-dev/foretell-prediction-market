import styles from "./markets-page.module.css";

export default function MarketsLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="正在加载市场列表">
      <section className={styles.loadingHero}>
        <span className={styles.loadingLine} />
        <span className={styles.loadingTitle} />
        <span className={styles.loadingCopy} />
      </section>
      <section className={styles.loadingCatalog}>
        <span className={styles.loadingControls} />
        <div className={styles.loadingGrid}>
          {Array.from({ length: 6 }, (_, index) => <span key={index} className={styles.loadingCard} />)}
        </div>
      </section>
    </main>
  );
}
