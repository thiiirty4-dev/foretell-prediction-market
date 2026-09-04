import type { MarketPreview } from "./types";

export const mockMarkets = [
  { id: "fed-cuts-2026", title: "美联储会在 2026 年 12 月前累计降息至少 50 个基点吗？", category: "Politics", status: "OPEN", yesProbability: 68, noProbability: 32, volume: "12,840,000 fUSD", closesAt: "2026-12-17 03:00 CST", createdAt: "2026-07-18T08:00:00Z", trending: true, newMarket: false },
  { id: "eth-6000-2026", title: "ETH 会在 2026 年结束前触及 6,000 美元吗？", category: "Crypto", status: "CLOSING_SOON", yesProbability: 41, noProbability: 59, volume: "9,620,500 fUSD", closesAt: "2026-12-31 23:59 CST", createdAt: "2026-08-02T03:30:00Z", trending: true, newMarket: false },
  { id: "ai-benchmark-2027", title: "下一代通用 AI 推理基准会在 2027 年前突破 90% 吗？", category: "Technology", status: "OPEN", yesProbability: 57, noProbability: 43, volume: "7,415,200 fUSD", closesAt: "2027-01-31 20:00 CST", createdAt: "2026-07-29T12:15:00Z", trending: true, newMarket: false },
  { id: "artemis-lunar-flyby", title: "Artemis II 会在 2027 年 6 月前完成载人绕月飞行吗？", category: "Technology", status: "OPEN", yesProbability: 74, noProbability: 26, volume: "4,280,900 fUSD", closesAt: "2027-06-30 18:00 CST", createdAt: "2026-08-11T06:20:00Z", trending: false, newMarket: false },
  { id: "womens-world-cup-europe", title: "2027 年女足世界杯冠军会来自欧洲足联吗？", category: "Sports", status: "NEW", yesProbability: 61, noProbability: 39, volume: "1,105,400 fUSD", closesAt: "2027-07-25 22:00 CST", createdAt: "2026-09-01T10:05:00Z", trending: false, newMarket: true },
  { id: "renewable-capacity-2027", title: "2027 年全球新增可再生能源装机量会超过 900GW 吗？", category: "Politics", status: "NEW", yesProbability: 52, noProbability: 48, volume: "860,700 fUSD", closesAt: "2027-12-31 12:00 CST", createdAt: "2026-09-02T04:45:00Z", trending: false, newMarket: true },
  { id: "international-film-oscar-2027", title: "2027 年奥斯卡最佳影片得主会是一部非英语电影吗？", category: "Culture", status: "NEW", yesProbability: 36, noProbability: 64, volume: "540,300 fUSD", closesAt: "2027-03-15 12:00 CST", createdAt: "2026-09-03T09:30:00Z", trending: false, newMarket: true },
] as const satisfies readonly MarketPreview[];
