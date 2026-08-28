"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Market = {
  id: string; slug: string; title: string; description: string; category: string;
  closesAt: number; yesPrice: number; volume: number; liquidity: number;
  traderCount: number; featured: boolean; status: "open" | "closed"; createdAt: number;
};

type Activity = {
  id: string; marketId: string; marketTitle: string; side: "YES" | "NO";
  amount: number; shares: number; price: number; traderAlias: string; createdAt: number;
};

type MarketPayload = { markets: Market[]; activity: Activity[] };

const categoryCode: Record<string, string> = {
  Crypto: "CR", "AI & Tech": "AI", Macro: "MA", Culture: "CU", Science: "SC",
};

export default function MarketDashboard() {
  const [data, setData] = useState<MarketPayload>({ markets: [], activity: [] });
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"hot" | "new">("hot");
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("100");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadMarkets = useCallback(async () => {
    const response = await fetch("/api/markets", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load markets");
    const payload = (await response.json()) as MarketPayload;
    setData(payload);
    setSelectedId((current) => current || payload.markets[0]?.id || "");
  }, []);

  useEffect(() => {
    loadMarkets().catch(() => setNotice("The market feed is temporarily unavailable.")).finally(() => setLoading(false));
  }, [loadMarkets]);

  const visibleMarkets = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = data.markets.filter((market) =>
      !query || market.title.toLowerCase().includes(query) || market.category.toLowerCase().includes(query)
    );
    return [...filtered].sort((a, b) => sort === "new" ? b.createdAt - a.createdAt : b.volume - a.volume);
  }, [data.markets, search, sort]);

  const selected = data.markets.find((market) => market.id === selectedId) ?? data.markets[0];
  const totalVolume = data.markets.reduce((sum, market) => sum + market.volume, 0);
  const totalTraders = data.markets.reduce((sum, market) => sum + market.traderCount, 0);
  const amountNumber = Number(amount) || 0;
  const selectedPrice = selected ? (side === "YES" ? selected.yesPrice : 100 - selected.yesPrice) : 50;
  const shares = selectedPrice > 0 ? amountNumber / (selectedPrice / 100) : 0;

  async function submitTrade() {
    if (!selected || amountNumber < 1 || amountNumber > 1000) {
      setNotice("Enter a simulated order between $1 and $1,000.");
      return;
    }
    setSubmitting(true);
    setNotice("");
    try {
      const response = await fetch("/api/trades", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId: selected.id, side, amount: amountNumber }),
      });
      const result = await response.json() as { error?: string; market?: Market; activity?: Activity };
      if (!response.ok || !result.market || !result.activity) throw new Error(result.error || "Trade failed");
      setData((current) => ({
        markets: current.markets.map((market) => market.id === result.market!.id ? result.market! : market),
        activity: [result.activity!, ...current.activity].slice(0, 12),
      }));
      setNotice("Order filled: " + result.activity.shares.toFixed(2) + " " + side + " shares at " + result.activity.price + "¢.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Trade failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function createMarket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/markets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"), description: form.get("description"),
          category: form.get("category"), closesAt: new Date(String(form.get("closesAt"))).getTime(),
        }),
      });
      const result = await response.json() as { error?: string; market?: Market };
      if (!response.ok || !result.market) throw new Error(result.error || "Market creation failed");
      setData((current) => ({ ...current, markets: [result.market!, ...current.markets] }));
      setSelectedId(result.market.id);
      setCreating(false);
      setNotice("Market created and saved to the public database.");
      formElement.reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Market creation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">F</span><span>FORETELL</span></a>
        <nav aria-label="Primary navigation">
          <a className="active" href="#markets">Markets</a><a href="#activity">Activity</a><a href="#portfolio">Portfolio</a>
        </nav>
        <div className="top-actions">
          <label className="search"><span>/</span><input aria-label="Search markets" placeholder="Search markets" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <button className="create-button" onClick={() => setCreating(true)}>+ Create market</button>
        </div>
      </header>

      <section className="ticker" aria-label="Platform statistics">
        <span><b>TOTAL VOLUME</b>{formatUsd(totalVolume)}</span><span><b>OPEN MARKETS</b>{data.markets.length}</span>
        <span><b>TRADERS</b>{totalTraders.toLocaleString()}</span><span className="live"><i />SIMULATION LIVE</span>
      </section>

      <div className="workspace">
        <aside className="rail">
          <p className="rail-label">EXPLORE</p>
          <button className={sort === "hot" ? "selected" : ""} onClick={() => setSort("hot")}><span>01</span>Trending</button>
          <button className={sort === "new" ? "selected" : ""} onClick={() => setSort("new")}><span>02</span>New markets</button>
          <a href="#activity"><span>03</span>Recent activity</a>
          <p className="rail-label">CATEGORIES</p>
          {["Crypto", "AI & Tech", "Macro", "Culture"].map((category, index) => (
            <button key={category} onClick={() => setSearch(category)}><span className={"dot " + ["orange","green","blue","sand"][index]} />{category}</button>
          ))}
          <div className="demo-note"><b>PORTFOLIO PROJECT</b><p>Public prediction-market simulation backed by a durable cloud database.</p></div>
        </aside>

        <section className="market-feed" id="markets">
          <div className="section-head">
            <div><p className="eyebrow">MARKETS IN MOTION</p><h1>Trade what happens next.</h1></div>
            <div className="filters"><button className={sort === "hot" ? "active" : ""} onClick={() => setSort("hot")}>Hot</button><button className={sort === "new" ? "active" : ""} onClick={() => setSort("new")}>Newest</button></div>
          </div>

          {selected ? (
            <article className="featured">
              <div className="featured-copy">
                <div className="market-meta"><span className="tag">{selected.featured ? "FEATURED" : selected.category.toUpperCase()}</span><span>Closes {formatDate(selected.closesAt)}</span></div>
                <h2>{selected.title}</h2><p>{selected.description}</p>
                <div className="stats"><span><b>{selected.yesPrice}%</b>chance</span><span><b>{formatUsd(selected.volume)}</b>volume</span><span><b>{selected.traderCount.toLocaleString()}</b>traders</span></div>
              </div>
              <div className="signal-chart" aria-label="Illustrative probability chart">
                <div className="chart-grid" /><svg viewBox="0 0 420 140" preserveAspectRatio="none" aria-hidden="true"><path d="M0 112 C40 106,54 86,90 91 S143 112,171 78 S219 54,252 66 S307 36,332 48 S375 20,420 25" /></svg>
                <div className="chart-price">{selected.yesPrice}¢<small>YES</small></div>
              </div>
            </article>
          ) : <div className="empty-state">{loading ? "Loading market database…" : "No markets match this search."}</div>}

          {notice ? <div className="notice" role="status">{notice}</div> : null}

          <div className="market-list">
            {visibleMarkets.map((market, index) => (
              <article className={"market-row " + (market.id === selected?.id ? "active-row" : "")} key={market.id} onClick={() => setSelectedId(market.id)}>
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <div className={"market-icon icon-" + (index % 4)}>{categoryCode[market.category] || "MK"}</div>
                <div className="market-title"><span>{market.category.toUpperCase()}</span><h3>{market.title}</h3><small>{formatUsd(market.volume)} volume</small></div>
                <div className="mini-meter"><i style={{ width: market.yesPrice + "%" }} /></div>
                <div className="probability"><b>{market.yesPrice}%</b><span className="up">YES</span></div>
                <div className="outcomes"><button onClick={(event) => { event.stopPropagation(); setSelectedId(market.id); setSide("YES"); }}>Yes {market.yesPrice}¢</button><button onClick={(event) => { event.stopPropagation(); setSelectedId(market.id); setSide("NO"); }}>No {100 - market.yesPrice}¢</button></div>
              </article>
            ))}
          </div>
        </section>

        <aside className="trade-panel">
          {selected ? <>
            <div className="trade-head"><span className="tag">{categoryCode[selected.category] || "MARKET"}</span><span className="status">OPEN</span></div>
            <h2>{selected.title}</h2>
            <div className="trade-tabs"><button className={side === "YES" ? "yes" : ""} onClick={() => setSide("YES")}>Buy Yes</button><button className={side === "NO" ? "no" : ""} onClick={() => setSide("NO")}>Buy No</button></div>
            <label className="amount-label" htmlFor="trade-amount">Amount <span>Demo limit $1,000</span></label>
            <div className="amount-input"><span>$</span><input id="trade-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /><small>USD</small></div>
            <div className="quick-amounts">{[10,50,100,500].map((value) => <button key={value} onClick={() => setAmount(String(value))}>{"$"}{value}</button>)}</div>
            <dl><div><dt>Current price</dt><dd>{selectedPrice}¢</dd></div><div><dt>Estimated shares</dt><dd>{shares.toFixed(2)}</dd></div><div><dt>Potential payout</dt><dd className="positive">{"$"}{shares.toFixed(2)}</dd></div></dl>
            <button className="trade-submit" disabled={submitting} onClick={submitTrade}>{submitting ? "Processing…" : "Buy " + side}</button>
            <p className="disclaimer">Simulation only. No real money or financial value.</p>
          </> : null}
          <div className="activity" id="activity"><div className="activity-title"><b>Live activity</b><span>DATABASE FEED</span></div>{data.activity.slice(0,5).map((trade) => <p key={trade.id}><i className={trade.side === "YES" ? "buy" : "sell"} /><span>{trade.traderAlias} bought {trade.side}</span><b>{formatUsd(trade.amount)}</b></p>)}</div>
        </aside>
      </div>

      {creating ? (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <form className="create-modal" onSubmit={createMarket} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">NEW PUBLIC MARKET</p><h2>Create a prediction.</h2></div><button type="button" onClick={() => setCreating(false)}>×</button></div>
            <label>Question<input name="title" required minLength={12} maxLength={160} placeholder="Will…" /></label>
            <label>Resolution criteria<textarea name="description" required minLength={20} maxLength={400} placeholder="Describe exactly how this market resolves YES." /></label>
            <div className="form-grid"><label>Category<select name="category" defaultValue="Crypto">{Object.keys(categoryCode).map((category) => <option key={category}>{category}</option>)}</select></label><label>Close date<input name="closesAt" type="date" required min={tomorrow()} /></label></div>
            <div className="resolution-note"><b>50 / 50 launch</b><span>New markets begin with an even probability and $10,000 simulated liquidity.</span></div>
            <button className="trade-submit" disabled={submitting}>{submitting ? "Creating…" : "Publish market"}</button>
            <p className="disclaimer">Public demo database. Do not enter private or confidential information.</p>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function formatUsd(cents: number) {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: dollars >= 10000 ? "compact" : "standard", maximumFractionDigits: dollars >= 10000 ? 2 : 0 }).format(dollars);
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(timestamp);
}

function tomorrow() {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

