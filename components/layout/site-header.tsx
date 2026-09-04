"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./site-header.module.css";

const navigation = [
  { label: "Markets", href: "/markets" },
  { label: "Trending", href: "/markets#trending" },
  { label: "Categories", href: "/markets#filters" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/" aria-label="Prediction Market 首页">
          <span className={styles.mark} aria-hidden="true">
            <i />
            <i />
          </span>
          <span className={styles.brandName}>Prediction Market</span>
        </Link>

        <nav className={styles.navigation} aria-label="主要导航">
          {navigation.map((item) => {
            const active = item.label === "Markets" && pathname.startsWith("/markets");
            return (
              <Link
                className={active ? styles.activeLink : undefined}
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <form className={styles.search} action="/markets" role="search">
          <span className={styles.searchIcon} aria-hidden="true" />
          <label className="sr-only" htmlFor="global-market-search">搜索市场</label>
          <input id="global-market-search" name="search" type="search" placeholder="Search markets" />
          <kbd>/</kbd>
        </form>

        <div className={styles.actions}>
          <span className={styles.network}><i aria-hidden="true" />Amoy</span>
          <Link
            className={pathname === "/portfolio" ? styles.activeAccount : styles.accountLink}
            href="/portfolio"
          >
            Portfolio
          </Link>
          <button className={styles.walletButton} type="button" disabled title="钱包连接将在后续阶段启用">
            Connect Wallet
          </button>
        </div>
      </div>
    </header>
  );
}
