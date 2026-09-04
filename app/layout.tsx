import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://foretell-markets.foretell-labs.workers.dev"),
  title: "Prediction Market | Foretell",
  description: "浏览、搜索并体验无真实价值的测试预测市场。",
  openGraph: {
    title: "Prediction Market | Foretell",
    description: "一个公开、可持续保存数据的预测市场模拟平台。",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Foretell prediction markets" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Prediction Market | Foretell",
    description: "一个公开、可持续保存数据的预测市场模拟平台。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
