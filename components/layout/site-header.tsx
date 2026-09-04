import Link from "next/link";
import styles from "./site-header.module.css";

const navigation = [
  { label: "Markets", href: { pathname: "/markets" } },
  { label: "Trending", href: { pathname: "/", hash: "trending" } },
  { label: "New", href: { pathname: "/", hash: "new" } },
  { label: "Categories", href: { pathname: "/markets", hash: "filters" } },
  { label: "Terminal", href: { pathname: "/terminal" } },
] as const;

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/" aria-label="Prediction Market 首页">
          <span className={styles.mark} aria-hidden="true"><i /><i /></span>
          <span>Prediction Market</span>
        </Link>
        <nav className={styles.navigation} aria-label="主要导航">
          {navigation.map((item) => <Link key={item.label} href={item.href}>{item.label}</Link>)}
        </nav>
        <div className={styles.actions}>
          <span className={styles.network}><i aria-hidden="true" />Public demo</span>
          <button className={styles.walletButton} type="button" disabled title="钱包连接将在后续阶段启用">
            Connect Wallet
          </button>
        </div>
      </div>
    </header>
  );
}
