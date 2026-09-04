import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Prediction Market | Polygon Amoy",
  description: "一个使用测试资产的 Polygon Amoy 预测市场实验平台。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <Suspense fallback={null}>
          <Providers>
            <SiteHeader />
            {children}
            <footer>Prediction Market · Polygon Amoy testnet · fUSD 测试资产不具有任何真实价值</footer>
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
