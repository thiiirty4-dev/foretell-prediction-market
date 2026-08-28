import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://foretell-markets.foretell-labs.workers.dev"),
  title: "Foretell | Prediction Markets",
  description: "A public prediction market simulation with persistent market data.",
  openGraph: {
    title: "Foretell | Prediction Markets",
    description: "Trade what happens next in a public, database-backed market simulation.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Foretell prediction markets" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Foretell | Prediction Markets",
    description: "Trade what happens next in a public, database-backed market simulation.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
