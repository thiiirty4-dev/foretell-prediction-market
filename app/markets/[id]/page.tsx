import { MarketDetailLoader } from "@/components/market/market-detail-loader";

interface MarketDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  const { id } = await params;
  return <MarketDetailLoader identifier={id} />;
}