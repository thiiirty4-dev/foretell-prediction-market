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

type Position = {
  marketId: string; marketTitle: string; yesShares: number; noShares: number; spent: number;
};

const categoryCode: Record<string, string> = {
  Crypto: "CR", "AI & Tech": "AI", Macro: "MA", Culture: "CU", Science: "SC",
};

export default function MarketDashboard() {
  const [data, setData] = useState<MarketPayload>({ markets: [], activity: [] });
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"hot" | "new" | "ending">("hot");
  const [category, setCategory] = useState("All");
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("100");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [dialog, setDialog] = useState<"activity" | "portfolio" | null>(null);
  const [idea, setIdea] = useState("");
  const [draft, setDraft] = useState({ title: "", description: "", category: "Crypto", closesAt: nextMonth() });
  const [portfolio, setPortfolio] = useState<Position[]>([]);

  const loadMarkets = useCallback(async () => {
    const response = await fetch("/api/markets", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load markets");
    const payload = (await response.json()) as MarketPayload;
    setData(payload);
    setSelectedId((current) => current || payload.markets[0]?.id || "");
  }, []);

  useEffect(() => {
    loadMarkets().catch(() => setNotice("The market feed is temporarily unavailable.")).finally(() => setLoading(false));
    try {
      const saved = window.localStorage.getItem("foretell-portfolio");
      if (saved) setPortfolio(JSON.parse(saved) as Position[]);
    } catch { /* Portfolio storage is optional. */ }
  }, [loadMarkets]);

  const visibleMarkets = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = data.markets.filter((market) => {
      const matchesSearch = !query || market.title.toLowerCase().includes(query) || market.description.toLowerCase().includes(query) || market.category.toLowerCase().includes(query);
      return matchesSearch && (category === "All" || market.category === category);
    });
    return [...filtered].sort((a, b) => sort === "new" ? b.createdAt - a.createdAt : sort === "ending" ? a.closesAt - b.closesAt : b.volume - a.volume);
  }, [category, data.markets, search, sort]);

  const selected = data.markets.find((market) => market.id === selectedId) ?? data.markets[0];
  const totalVolume = data.markets.reduce((sum, market) => sum + market.volume, 0);
  const totalTraders = data.markets.reduce((sum, market) => sum + market.traderCount, 0);
  const demoBalance = Math.max(0, 10_000 - portfolio.reduce((sum, position) => sum + position.spent, 0));
  const amountNumber = Number(amount) || 0;
  const selectedPrice = selected ? (side === "YES" ? selected.yesPrice : 100 - selected.yesPrice) : 50;
  const shares = selectedPrice > 0 ? amountNumber / (selectedPrice / 100) : 0;

  function openTrade(market: Market, outcome: "YES" | "NO") {
    setSelectedId(market.id);
    setSide(outcome);
    setTradeOpen(true);
  }

  function structureDraft() {
    const clean = idea.trim().replace(/[?.!]+$/, "");
    if (clean.length < 5) {
      setNotice("Describe an event or claim before generating a draft.");
      return;
    }
    const inferred = inferCategory(clean);
    setDraft({
      title: /^will\b/i.test(clean) ? clean + "?" : "Will " + clean.charAt(0).toLowerCase() + clean.slice(1) + "?",
      description: "Resolves YES if reliable public sources confirm that " + clean + " before the listed close date. Otherwise, this market resolves NO.",
      category: inferred,
      closesAt: nextMonth(),
    });
    setCreating(true);
  }

  function openBlankMarket() {
    setDraft({ title: "", description: "", category: "Crypto", closesAt: nextMonth() });
    setCreating(true);
  }

  async function submitTrade() {
    if (!selected || amountNumber < 1 || amountNumber > 1000) {
      setNotice("Enter a simulated order between $1 and $1,000.");
      return;
    }
    if (amountNumber > demoBalance) {
      setNotice("This order exceeds your remaining demo balance.");
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
      setPortfolio((current) => {
        const found = current.find((position) => position.marketId === result.activity!.marketId);
        const updated = found ? current.map((position) => position.marketId === result.activity!.marketId ? {
          ...position,
          yesShares: position.yesShares + (side === "YES" ? result.activity!.shares : 0),
          noShares: position.noShares + (side === "NO" ? result.activity!.shares : 0),
          spent: position.spent + amountNumber,
        } : position) : [...current, {
          marketId: result.activity!.marketId, marketTitle: result.activity!.marketTitle,
          yesShares: side === "YES" ? result.activity!.shares : 0,
          noShares: side === "NO" ? result.activity!.shares : 0,
          spent: amountNumber,
        }];
        try { window.localStorage.setItem("foretell-portfolio", JSON.stringify(updated)); } catch { /* Portfolio storage is optional. */ }
        return updated;
      });
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
      setCategory("All");
      setSearch("");
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
          <a className="active" href="#markets">Markets</a><button onClick={() => setDialog("activity")}>Activity</button><button onClick={() => setDialog("portfolio")}>Portfolio</button>
        </nav>
        <div className="top-actions">
          <label className="search"><span>/</span><input aria-label="Search markets" placeholder="Search markets" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <button className="balance-button" onClick={() => setDialog("portfolio")}><small>DEMO BALANCE</small>{formatDollars(demoBalance)}</button>
          <button className="create-button" onClick={openBlankMarket}>+ Create market</button>
        </div>
      </header>

      <section className="ticker" aria-label="Platform statistics">
        <span><b>TOTAL VOLUME</b>{formatUsd(totalVolume)}</span><span><b>OPEN MARKETS</b>{data.markets.length}</span>
        <span><b>TRADERS</b>{totalTraders.toLocaleString()}</span><span className="live"><i />SIMULATION LIVE</span>
      </section>

      <section className="idea-bar">
        <div><p className="eyebrow">MARKET STUDIO</p><h2>What should become a market?</h2></div>
        <div className="idea-input"><input aria-label="Market idea" placeholder="Enter an event, claim, or narrative…" value={idea} onChange={(event) => setIdea(event.target.value)} onKeyDown={(event) => event.key === "Enter" && structureDraft()} /><button onClick={structureDraft}>Structure draft ↗</button></div>
        <p>LOCAL DRAFTING HELPER · HUMAN REVIEW REQUIRED</p>
      </section>

      <div className="workspace">
        <aside className="rail">
          <p className="rail-label">EXPLORE</p>
          <button className={sort === "hot" ? "selected" : ""} onClick={() => setSort("hot")}><span>01</span>Trending</button>
          <button className={sort === "new" ? "selected" : ""} onClick={() => setSort("new")}><span>02</span>New markets</button>
          <button className={sort === "ending" ? "selected" : ""} onClick={() => setSort("ending")}><span>03</span>Ending soon</button>
          <button onClick={() => setDialog("activity")}><span>04</span>Recent activity</button>
          <p className="rail-label">CATEGORIES</p>
          {["Crypto", "AI & Tech", "Macro", "Culture"].map((category, index) => (
            <button className={category === category ? "" : ""} key={category} onClick={() => { setCategory(category); setSearch(""); }}><span className={"dot " + ["orange","green","blue","sand"][index]} />{category}</button>
          ))}
          <div className="demo-note"><b>PORTFOLIO PROJECT</b><p>Public prediction-market simulation backed by a durable cloud database.</p></div>
        </aside>

        <section className="market-feed" id="markets">
          <div className="section-head">
            <div><p className="eyebrow">MARKETS IN MOTION</p><h1>Trade what happens next.</h1></div>
            <div className="filters"><button className={sort === "hot" ? "active" : ""} onClick={() => setSort("hot")}>Hot</button><button className={sort === "new" ? "active" : ""} onClick={() => setSort("new")}>Newest</button><button className={sort === "ending" ? "active" : ""} onClick={() => setSort("ending")}>Ending</button></div>
          </div>

          <div className="category-strip">{["All", "Crypto", "AI & Tech", "Macro", "Culture", "Science"].map((item) => <button className={category === item ? "active" : ""} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>

          {selected ? (
            <article className="featured">
              <div className="featured-copy">
                <div className="market-meta"><span className="tag">{selected.featured ? "FEATURED" : selected.category.toUpperCase()}</span><span>Closes {formatDate(selected.closesAt)}</span></div>
                <h2>{selected.title}</h2><p>{selected.description}</p>
                <div className="featured-actions"><button onClick={() => openTrade(selected, "YES")}>Buy Yes <b>{selected.yesPrice}¢</b></button><button onClick={() => openTrade(selected, "NO")}>Buy No <b>{100 - selected.yesPrice}¢</b></button></div>
                <div className="stats"><span><b>{selected.yesPrice}%</b>chance</span><span><b>{formatUsd(selected.volume)}</b>volume</span><span><b>{selected.traderCount.toLocaleString()}</b>traders</span></div>
              </div>
              <div className="signal-chart" aria-label="Illustrative probability chart">
                <div className="chart-grid" /><svg viewBox="0 0 420 140" preserveAspectRatio="none" aria-hidden="true"><path d="M0 112 C40 106,54 86,90 91 S143 112,171 78 S219 54,252 66 S307 36,332 48 S375 20,420 25" /></svg>
                <div className="chart-price">{selected.yesPrice}¢<small>YES</small></div>
              </div>
            </article>
          ) : <div className="empty-state">{loading ? "Loading market database…" : "No markets match this search."}</div>}

          {notice ? <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div> : null}

          <div className="market-list">
            {visibleMarkets.map((market, index) => (
              <article className={"market-row " + (market.id === selected?.id ? "active-row" : "")} key={market.id} onClick={() => setSelectedId(market.id)}>
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <div className={"market-icon icon-" + (index % 4)}>{categoryCode[market.category] || "MK"}</div>
                <div className="market-title"><span>{market.category.toUpperCase()}</span><h3>{market.title}</h3><small>{formatUsd(market.volume)} volume</small></div>
                <div className="mini-meter"><i style={{ width: market.yesPrice + "%" }} /></div>
                <div className="probability"><b>{market.yesPrice}%</b><span className="up">YES</span></div>
                <div className="outcomes"><button onClick={(event) => { event.stopPropagation(); openTrade(market, "YES"); }}>Yes {market.yesPrice}¢</button><button onClick={(event) => { event.stopPropagation(); openTrade(market, "NO"); }}>No {100 - market.yesPrice}¢</button></div>
              </article>
            ))}
          </div>
        </section>

        {tradeOpen ? <button className="drawer-backdrop" aria-label="Close order panel" onClick={() => setTradeOpen(false)} /> : null}
        <aside className={"trade-panel " + (tradeOpen ? "open" : "")}>
          <button className="panel-close" onClick={() => setTradeOpen(false)}>×</button>
          {selected ? <>
            <div className="trade-head"><span className="tag">{categoryCode[selected.category] || "MARKET"}</span><span className="status">OPEN</span></div>
            <h2>{selected.title}</h2>
            <div className="trade-tabs"><button className={side === "YES" ? "yes" : ""} onClick={() => setSide("YES")}>Buy Yes</button><button className={side === "NO" ? "no" : ""} onClick={() => setSide("NO")}>Buy No</button></div>
            <label className="amount-label" htmlFor="trade-amount">Amount <span>{formatDollars(demoBalance)} available</span></label>
            <div className="amount-input"><span>$</span><input id="trade-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /><small>USD</small></div>
            <div className="quick-amounts">{[10,50,100,500].map((value) => <button key={value} onClick={() => setAmount(String(value))}>{"$"}{value}</button>)}</div>
            <dl><div><dt>Current price</dt><dd>{selectedPrice}¢</dd></div><div><dt>Estimated shares</dt><dd>{shares.toFixed(2)}</dd></div><div><dt>Potential payout</dt><dd className="positive">{"$"}{shares.toFixed(2)}</dd></div></dl>
            <button className="trade-submit" disabled={submitting || !amountNumber} onClick={submitTrade}>{submitting ? "Processing…" : "Buy " + side + " · " + formatDollars(amountNumber)}</button>
            <p className="disclaimer">Simulation only. No real money or financial value.</p>
          </> : null}
          <div className="activity" id="activity"><div className="activity-title"><b>Live activity</b><button onClick={() => setDialog("activity")}>VIEW ALL</button></div>{data.activity.slice(0,5).map((trade) => <p key={trade.id}><i className={trade.side === "YES" ? "buy" : "sell"} /><span>{trade.traderAlias} bought {trade.side}</span><b>{formatUsd(trade.amount)}</b></p>)}</div>
        </aside>
      </div>

      {creating ? (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <form className="create-modal" onSubmit={createMarket} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">NEW PUBLIC MARKET</p><h2>Create a prediction.</h2></div><button type="button" onClick={() => setCreating(false)}>×</button></div>
            <label>Question<input name="title" required minLength={12} maxLength={160} placeholder="Will…" defaultValue={draft.title} /></label>
            <label>Resolution criteria<textarea name="description" required minLength={20} maxLength={400} placeholder="Describe exactly how this market resolves YES." defaultValue={draft.description} /></label>
            <div className="form-grid"><label>Category<select name="category" defaultValue={draft.category}>{Object.keys(categoryCode).map((category) => <option key={category}>{category}</option>)}</select></label><label>Close date<input name="closesAt" type="date" required min={tomorrow()} defaultValue={draft.closesAt} /></label></div>
            <div className="resolution-note"><b>50 / 50 launch</b><span>New markets begin with an even probability and $10,000 simulated liquidity.</span></div>
            <button className="trade-submit" disabled={submitting}>{submitting ? "Creating…" : "Publish market"}</button>
            <p className="disclaimer">Public demo database. Do not enter private or confidential information.</p>
          </form>
        </div>
      ) : null}

      {dialog ? (
        <div className="modal-backdrop" onMouseDown={() => setDialog(null)}>
          <section className="info-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">{dialog === "activity" ? "DATABASE FEED" : "LOCAL DEMO ACCOUNT"}</p><h2>{dialog === "activity" ? "Recent market activity." : "Your simulated positions."}</h2></div><button onClick={() => setDialog(null)}>×</button></div>
            {dialog === "activity" ? <div className="activity-table">{data.activity.length ? data.activity.map((trade) => <div className="activity-detail" key={trade.id}><i className={trade.side === "YES" ? "buy" : "sell"} /><span><b>{trade.traderAlias} bought {trade.side}</b><small>{trade.marketTitle}</small></span><strong>{formatUsd(trade.amount)}</strong><time>{formatDate(trade.createdAt)}</time></div>) : <div className="modal-empty">No public orders yet.</div>}</div> : <Portfolio positions={portfolio} markets={data.markets} balance={demoBalance} />}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Portfolio({ positions, markets, balance }: { positions: Position[]; markets: Market[]; balance: number }) {
  const value = positions.reduce((sum, position) => {
    const market = markets.find((item) => item.id === position.marketId);
    return sum + position.yesShares * ((market?.yesPrice ?? 50) / 100) + position.noShares * ((100 - (market?.yesPrice ?? 50)) / 100);
  }, 0);
  return <><div className="portfolio-summary"><span><small>DEMO CASH</small><b>{formatDollars(balance)}</b></span><span><small>POSITION VALUE</small><b>{formatDollars(value)}</b></span><span><small>OPEN MARKETS</small><b>{positions.length}</b></span></div><div className="position-list">{positions.length ? positions.map((position) => <div className="position-row" key={position.marketId}><div><span>OPEN POSITION</span><h3>{position.marketTitle}</h3></div><div><b className="yes-text">{position.yesShares.toFixed(2)} YES</b><b className="no-text">{position.noShares.toFixed(2)} NO</b><small>{formatDollars(position.spent)} cost</small></div></div>) : <div className="modal-empty"><b>No positions yet.</b><span>Choose YES or NO on any market to place a simulated order.</span></div>}</div><p className="portfolio-note">Portfolio data is saved in this browser. Public trades are stored in the cloud database.</p></>;
}

function inferCategory(text: string) {
  const value = text.toLowerCase();
  if (/bitcoin|crypto|ethereum|token|blockchain/.test(value)) return "Crypto";
  if (/ai|agent|model|software|tech/.test(value)) return "AI & Tech";
  if (/fed|rate|inflation|gdp|economy/.test(value)) return "Macro";
  if (/film|music|game|culture|award/.test(value)) return "Culture";
  return "Science";
}

function formatDollars(dollars: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number.isFinite(dollars) ? dollars : 0);
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

function nextMonth() {
  return new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
}
