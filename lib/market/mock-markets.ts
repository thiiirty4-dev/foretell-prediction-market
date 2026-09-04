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

type MarketDetailFields = Required<
  Pick<
    MarketPreview,
    "description" | "resolutionCriteria" | "liquidity" | "history"
  >
>;

const mockMarketDetails: Readonly<Record<string, MarketDetailFields>> = {
  "fed-cuts-2026": {
    description:
      "市场衡量美联储在 2026 年内是否会累计下调联邦基金目标利率区间至少 50 个基点。页面概率与数据均为产品演示，不代表投资建议。",
    resolutionCriteria:
      "若美联储公开的 FOMC 决议显示，自 2026 年 1 月 1 日至 2026 年 12 月 17 日（美国东部时间）目标利率区间累计下调至少 50 个基点，则结算为 YES；否则结算为 NO。仅统计正式生效的决议。",
    liquidity: "2,460,000 fUSD",
    history: [
      { label: "7月18日", yesProbability: 51 },
      { label: "7月29日", yesProbability: 55 },
      { label: "8月9日", yesProbability: 53 },
      { label: "8月20日", yesProbability: 61 },
      { label: "8月31日", yesProbability: 64 },
      { label: "9月4日", yesProbability: 68 },
    ],
  },
  "eth-6000-2026": {
    description:
      "预测 ETH/USD 是否会在 2026 年结束前达到指定价格。本市场使用模拟测试资产，不连接真实交易或真实价格订单。",
    resolutionCriteria:
      "若指定公开价格源在 2026 年 12 月 31 日 23:59 UTC 前记录到 ETH/USD 即时价格达到或超过 6,000 美元，则结算为 YES；否则为 NO。异常报价与明显数据错误不计入。",
    liquidity: "1,980,000 fUSD",
    history: [
      { label: "7月18日", yesProbability: 48 },
      { label: "7月29日", yesProbability: 46 },
      { label: "8月9日", yesProbability: 44 },
      { label: "8月20日", yesProbability: 47 },
      { label: "8月31日", yesProbability: 43 },
      { label: "9月4日", yesProbability: 41 },
    ],
  },
  "ai-benchmark-2027": {
    description:
      "预测公开发布的通用人工智能系统是否会在约定推理基准上首次突破 90%。",
    resolutionCriteria:
      "若截至 2027 年 1 月 31 日 20:00 CST，基准维护方正式发布且可复核的合格系统成绩达到或超过 90%，则为 YES；否则为 NO。",
    liquidity: "1,240,000 fUSD",
    history: [
      { label: "7月18日", yesProbability: 45 },
      { label: "7月29日", yesProbability: 49 },
      { label: "8月9日", yesProbability: 54 },
      { label: "8月20日", yesProbability: 52 },
      { label: "8月31日", yesProbability: 55 },
      { label: "9月4日", yesProbability: 57 },
    ],
  },
  "artemis-lunar-flyby": {
    description:
      "预测 Artemis II 是否会在市场截止日前完成载人绕月飞行。任务延期本身不会触发提前结算。",
    resolutionCriteria:
      "若 NASA 正式确认载人 Artemis II 飞行器已完成绕月轨道或自由返回轨迹并安全结束任务，则结算为 YES；若截止时间前未完成，则为 NO。",
    liquidity: "3,120,000 fUSD",
    history: [
      { label: "7月18日", yesProbability: 59 },
      { label: "7月29日", yesProbability: 63 },
      { label: "8月9日", yesProbability: 65 },
      { label: "8月20日", yesProbability: 70 },
      { label: "8月31日", yesProbability: 72 },
      { label: "9月4日", yesProbability: 74 },
    ],
  },
  "womens-world-cup-europe": {
    description:
      "预测 2027 年女足世界杯冠军是否来自欧洲足联成员协会。球队归属以赛事官方参赛协会为准。",
    resolutionCriteria:
      "赛事决赛结束且 FIFA 正式确认冠军后，若冠军协会属于 UEFA，则结算为 YES；否则为 NO。赛事取消且无法在规则窗口内完成时进入取消流程。",
    liquidity: "860,000 fUSD",
    history: [
      { label: "7月18日", yesProbability: 58 },
      { label: "7月29日", yesProbability: 60 },
      { label: "8月9日", yesProbability: 57 },
      { label: "8月20日", yesProbability: 59 },
      { label: "8月31日", yesProbability: 63 },
      { label: "9月4日", yesProbability: 61 },
    ],
  },
  "renewable-capacity-2027": {
    description:
      "预测 2027 年全球新增可再生能源装机是否会突破 900GW。当前内容仅用于测试产品展示。",
    resolutionCriteria:
      "以指定国际能源统计机构发布的最终年度数据为准；若 2027 年全球新增可再生能源装机达到或超过 900GW，则为 YES，否则为 NO。修订数据仅在争议窗口结束前计入。",
    liquidity: "740,000 fUSD",
    history: [
      { label: "7月18日", yesProbability: 49 },
      { label: "7月29日", yesProbability: 50 },
      { label: "8月9日", yesProbability: 48 },
      { label: "8月20日", yesProbability: 51 },
      { label: "8月31日", yesProbability: 50 },
      { label: "9月4日", yesProbability: 52 },
    ],
  },
  "international-film-oscar-2027": {
    description:
      "预测 2027 年奥斯卡最佳影片获奖作品是否为主要非英语对白影片。分类依据市场规则中的公开片单定义。",
    resolutionCriteria:
      "美国电影艺术与科学学院正式公布最佳影片后，若获奖影片主要对白语言为非英语，则结算为 YES；否则为 NO。语言判定采用影片官方资料与学院材料。",
    liquidity: "690,000 fUSD",
    history: [
      { label: "7月18日", yesProbability: 31 },
      { label: "7月29日", yesProbability: 33 },
      { label: "8月9日", yesProbability: 30 },
      { label: "8月20日", yesProbability: 34 },
      { label: "8月31日", yesProbability: 35 },
      { label: "9月4日", yesProbability: 36 },
    ],
  },
};

export function findMockMarketById(id: string): MarketPreview | undefined {
  const market = mockMarkets.find((candidate) => candidate.id === id);
  const details = mockMarketDetails[id];

  return market && details ? { ...market, ...details } : undefined;
}
