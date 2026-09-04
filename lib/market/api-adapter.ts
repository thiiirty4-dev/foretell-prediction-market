import type {
  ApiMarketDetail,
  ApiMarketSummary,
  ApiPriceHistoryPoint,
} from "@/lib/api/types";
import type {
  MarketHistoryPoint,
  MarketPreview,
  MarketStatus,
  SpecificMarketCategory,
} from "./types";

const TOKEN_DECIMALS = 6;
const KNOWN_CATEGORIES = new Set<SpecificMarketCategory>([
  "Politics",
  "Crypto",
  "Sports",
  "Technology",
  "Culture",
]);

function compactUnits(value: string | null): string {
  if (value === null) return "Not indexed";

  try {
    const amount = BigInt(value);
    const unit = 10n ** BigInt(TOKEN_DECIMALS);
    const absolute = amount < 0n ? -amount : amount;
    const sign = amount < 0n ? "-" : "";
    const tiers = [
      { threshold: 1_000_000_000n * unit, divisor: 1_000_000_000n * unit, suffix: "B" },
      { threshold: 1_000_000n * unit, divisor: 1_000_000n * unit, suffix: "M" },
      { threshold: 1_000n * unit, divisor: 1_000n * unit, suffix: "K" },
    ];

    const tier = tiers.find((candidate) => absolute >= candidate.threshold);
    if (tier) {
      const tenths = (absolute * 10n) / tier.divisor;
      return sign + String(tenths / 10n) + "." + String(tenths % 10n) + tier.suffix + " fUSD";
    }

    const whole = absolute / unit;
    const fractional = ((absolute % unit) * 100n) / unit;
    return sign + String(whole) + "." + fractional.toString().padStart(2, "0") + " fUSD";
  } catch {
    return "Unavailable";
  }
}

function displayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function displayStatus(market: ApiMarketSummary): MarketStatus {
  if (market.status !== "OPEN") return "CLOSING_SOON";

  const now = Date.now();
  const created = new Date(market.createdAt).getTime();
  const end = new Date(market.endTime).getTime();
  if (Number.isFinite(created) && now - created <= 7 * 24 * 60 * 60 * 1000) return "NEW";
  if (Number.isFinite(end) && end - now <= 3 * 24 * 60 * 60 * 1000) return "CLOSING_SOON";
  return "OPEN";
}

function category(value: string): SpecificMarketCategory {
  return KNOWN_CATEGORIES.has(value as SpecificMarketCategory)
    ? (value as SpecificMarketCategory)
    : "Culture";
}

function calculate24HourChange(items: readonly ApiPriceHistoryPoint[]): number | null {
  const ordered = [...items]
    .map((item) => ({ item, timestamp: new Date(item.time).getTime() }))
    .filter((entry) => Number.isFinite(entry.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp);
  const latest = ordered.at(-1);
  if (!latest) return null;

  const target = latest.timestamp - 24 * 60 * 60 * 1000;
  const baseline = ordered.filter((entry) => entry.timestamp <= target).at(-1);
  if (!baseline) return null;
  return (latest.item.yesPriceBps - baseline.item.yesPriceBps) / 100;
}

export function historyFromApi(items: ApiPriceHistoryPoint[]): MarketHistoryPoint[] {
  return items.map((point) => ({
    label: displayDate(point.time),
    yesProbability: point.yesPriceBps / 100,
  }));
}

export function marketFromApi(
  market: ApiMarketSummary | ApiMarketDetail,
  history: ApiPriceHistoryPoint[] = ("priceHistory" in market ? market.priceHistory : []),
): MarketPreview {
  const createdAt = new Date(market.createdAt).getTime();
  const isNew = Number.isFinite(createdAt) && Date.now() - createdAt <= 7 * 24 * 60 * 60 * 1000;
  const detail = "resolutionRules" in market ? market : null;
  const adaptedHistory = historyFromApi(history);

  return {
    id: market.slug,
    title: market.question,
    category: category(market.category),
    status: displayStatus(market),
    yesProbability: market.yesProbabilityBps / 100,
    noProbability: market.noProbabilityBps / 100,
    change24h: calculate24HourChange(history),
    volume: compactUnits(market.volume),
    closesAt: displayDate(market.endTime),
    createdAt: market.createdAt,
    trending: false,
    newMarket: isNew,
    description: market.description ?? "No market description has been published.",
    resolutionCriteria:
      detail?.resolutionRules ??
      detail?.resolutionSource ??
      "Resolution rules are not yet available for this demo market.",
    liquidity: compactUnits(market.liquidity),
    history: adaptedHistory,
  };
}
