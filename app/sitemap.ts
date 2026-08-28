import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap { const base = "https://foretell-markets.foretell-labs.workers.dev"; return [{ url: base, changeFrequency: "daily", priority: 1 }, { url: base + "/terms", changeFrequency: "monthly", priority: .3 }, { url: base + "/privacy", changeFrequency: "monthly", priority: .3 }]; }
