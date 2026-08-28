"use client";

import { FormEvent, useState } from "react";

type User = { id: string; email: string; displayName: string; isAdmin?: boolean; walletAddress?: string; bio?: string };
type Market = { id: string; title: string; category: string; yesPrice: number; closesAt: number; description: string };
type Panel = "detail" | "watchlist" | "rankings" | "alerts" | "profile" | "onchain" | "admin" | null;

export default function ProductHub({ user, market, onRequireAccount }: { user: User | null; market?: Market; onRequireAccount: () => void }) {
  const [panel, setPanel] = useState<Panel>(null); const [payload, setPayload] = useState<any>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [wallet, setWallet] = useState(user?.walletAddress ?? ""); const [chainId, setChainId] = useState("");

  async function open(next: Exclude<Panel, null>) {
    if (["watchlist", "alerts", "profile", "admin"].includes(next) && !user) { onRequireAccount(); return; }
    setPanel(next); setMessage(""); setPayload(null);
    const view = next === "detail" ? "market&marketId=" + encodeURIComponent(market?.id ?? "") : next === "rankings" ? "leaderboard" : next === "alerts" ? "notifications" : next === "watchlist" ? "favorites" : next === "admin" ? "admin" : "";
    if (!view) return;
    setBusy(true);
    try { const response = await fetch("/api/product?view=" + view, { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setPayload(result); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load"); }
    finally { setBusy(false); }
  }

  async function action(body: Record<string, unknown>, refresh?: Panel) {
    if (!user) { onRequireAccount(); return; }
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/product", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setMessage("Saved."); if (refresh) await open(refresh as Exclude<Panel, null>); else if (result.favorite !== undefined) setPayload((current: any) => ({ ...current, favorite: result.favorite })); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Action failed"); }
    finally { setBusy(false); }
  }

  async function comment(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await action({ action: "comment", marketId: market?.id, body: form.get("body") }, "detail"); event.currentTarget.reset(); }
  async function report(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await action({ action: "report", marketId: market?.id, reason: form.get("reason") }); event.currentTarget.reset(); }
  async function saveProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await action({ action: "profile", bio: form.get("bio") }); }

  async function connect() {
    if (!user) { onRequireAccount(); return; }
    const provider = (window as unknown as { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown> } }).ethereum;
    if (!provider) { setMessage("Install an EVM wallet such as MetaMask or Rabby first."); return; }
    try { const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[]; const network = await provider.request({ method: "eth_chainId" }) as string; setWallet(accounts[0]); setChainId(network); await action({ action: "wallet", address: accounts[0] }); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Wallet connection was cancelled"); }
  }

  async function switchTestnet() {
    const provider = (window as unknown as { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown> } }).ethereum;
    if (!provider) { setMessage("No browser wallet detected."); return; }
    try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x279f" }] }); setChainId("0x279f"); setMessage("Wallet switched to Monad Testnet."); }
    catch { setMessage("Add Monad Testnet in your wallet, then try again. Chain ID: 10143."); }
  }

  return <>
    <section className="product-toolbar" aria-label="Product tools">
      <button onClick={() => open("detail")}>Market details</button><button onClick={() => open("watchlist")}>Watchlist</button><button onClick={() => open("rankings")}>Leaderboard</button><button onClick={() => open("alerts")}>Notifications</button><button onClick={() => open("profile")}>Profile</button><button className="chain-tool" onClick={() => open("onchain")}><i /> Onchain lab</button>{user?.isAdmin ? <button onClick={() => open("admin")}>Admin</button> : null}
    </section>
    {panel ? <div className="modal-backdrop" onMouseDown={() => setPanel(null)}><section className="product-modal" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">FORETELL / {panel.toUpperCase()}</p><h2>{panelTitle(panel, market?.title)}</h2></div><button onClick={() => setPanel(null)}>×</button></div>{busy && !payload ? <div className="modal-empty">Loading…</div> : null}{message ? <p className="product-message">{message}</p> : null}
      {panel === "detail" && payload ? <MarketDetail market={market!} data={payload} user={user} busy={busy} onFavorite={() => action({ action: "favorite", marketId: market?.id })} onComment={comment} onReport={report} /> : null}
      {panel === "watchlist" && payload ? <SimpleMarkets items={payload.favorites} /> : null}
      {panel === "rankings" && payload ? <Leaderboard items={payload.leaderboard} /> : null}
      {panel === "alerts" && payload ? <Notifications items={payload.notifications} /> : null}
      {panel === "profile" ? <form className="profile-form" onSubmit={saveProfile}><div className="profile-card"><span>{user?.displayName.slice(0, 2).toUpperCase()}</span><div><b>{user?.displayName}</b><small>{user?.email}</small></div></div><label>Bio<textarea name="bio" maxLength={240} defaultValue={user?.bio} placeholder="What topics do you follow?" /></label><button className="trade-submit" disabled={busy}>Save profile</button></form> : null}
      {panel === "onchain" ? <div className="chain-lab"><div className="chain-status"><span><small>NETWORK</small><b>Monad Testnet</b></span><span><small>CHAIN ID</small><b>10143</b></span><span><small>CONTRACT</small><b>Pre-audit</b></span></div><p>The onchain module is isolated from play-money markets. Wallet connection is live; collateral trading remains disabled until the testnet contract is deployed and reviewed.</p><div className="wallet-card"><small>CONNECTED WALLET</small><b>{wallet ? wallet.slice(0, 8) + "…" + wallet.slice(-6) : "Not connected"}</b><span>{chainId ? chainId === "0x279f" ? "Monad Testnet" : "Wrong network: " + chainId : "Connect an EVM wallet to begin"}</span></div><div className="chain-actions"><button onClick={connect}>Connect wallet</button><button onClick={switchTestnet}>Switch to testnet</button></div><p className="chain-warning">No deposits, withdrawals, or real-money transactions are enabled.</p></div> : null}
      {panel === "admin" && payload ? <Admin data={payload} busy={busy} action={action} /> : null}
    </section></div> : null}
  </>;
}

function MarketDetail({ market, data, user, busy, onFavorite, onComment, onReport }: any) {
  const points = data.history?.length ? data.history : [{ yesPrice: market.yesPrice, createdAt: Date.now() }]; const polyline = points.map((point: any, index: number) => `${points.length === 1 ? 50 : index * 100 / (points.length - 1)},${100 - point.yesPrice}`).join(" ");
  return <div className="market-detail"><div className="detail-grid"><div><span className="tag">{market.category}</span><p>{market.description}</p><dl><div><dt>Close date</dt><dd>{new Date(market.closesAt).toLocaleDateString()}</dd></div><div><dt>Resolution source</dt><dd>{data.governance?.resolutionSource ?? "Publicly verifiable sources"}</dd></div><div><dt>Status</dt><dd>{data.governance?.outcome ? "Resolved " + data.governance.outcome : "Open"}</dd></div></dl></div><div className="history-chart"><div><span>Probability history</span><b>{market.yesPrice}% YES</b></div><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={polyline} /></svg><small>{points.length} recorded price points</small></div></div><button className={data.favorite ? "saved-button active" : "saved-button"} disabled={busy} onClick={onFavorite}>{data.favorite ? "★ Saved to watchlist" : "☆ Save to watchlist"}</button><div className="community"><h3>Discussion <span>{data.comments?.length ?? 0}</span></h3>{user ? <form onSubmit={onComment}><textarea name="body" required minLength={2} maxLength={500} placeholder="Share evidence or your reasoning…" /><button disabled={busy}>Post comment</button></form> : <p>Log in to join the discussion.</p>}<div className="comment-list">{data.comments?.map((item: any) => <article key={item.id}><span>{item.displayName.slice(0, 2).toUpperCase()}</span><div><b>{item.displayName}{item.role === "admin" ? <small> MOD</small> : null}</b><p>{item.body}</p><time>{new Date(item.createdAt).toLocaleString()}</time></div></article>)}</div>{user ? <details className="report-box"><summary>Report this market</summary><form onSubmit={onReport}><input name="reason" required minLength={5} maxLength={300} placeholder="Explain the issue" /><button>Submit report</button></form></details> : null}</div></div>;
}

function SimpleMarkets({ items }: any) { return <div className="simple-list">{items?.length ? items.map((item: any) => <article key={item.id}><div><small>{item.category}</small><b>{item.title}</b></div><strong>{item.yesPrice}%</strong></article>) : <div className="modal-empty">Your watchlist is empty.</div>}</div>; }
function Leaderboard({ items }: any) { return <div className="leaderboard">{items?.map((item: any, index: number) => <article key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.displayName}</b><small>{item.trades} trades</small></div><strong>{formatMoney(item.volumeCents / 100)} volume</strong></article>)}</div>; }
function Notifications({ items }: any) { return <div className="notification-list">{items?.length ? items.map((item: any) => <article className={item.isRead ? "" : "unread"} key={item.id}><i /><div><b>{item.title}</b><p>{item.body}</p><time>{new Date(item.createdAt).toLocaleString()}</time></div></article>) : <div className="modal-empty">No notifications yet.</div>}</div>; }
function Admin({ data, busy, action }: any) { return <div className="admin-panel"><div className="admin-metrics">{Object.entries(data.metrics ?? {}).map(([key, value]) => <span key={key}><small>{key.replace(/([A-Z])/g, " $1")}</small><b>{String(value)}</b></span>)}</div><h3>Open reports</h3><div className="admin-reports">{data.reports?.length ? data.reports.map((report: any) => <article key={report.id}><div><b>{report.title}</b><p>{report.reason}</p><small>Reported by {report.reporter}</small></div><button disabled={busy} onClick={() => action({ action: "dismiss-report", reportId: report.id }, "admin")}>Dismiss</button></article>) : <p>No open reports.</p>}</div><h3>Resolve markets</h3><div className="admin-markets">{data.markets?.filter((market: any) => market.status === "open").map((market: any) => <article key={market.id}><span>{market.title}</span><div><button disabled={busy} onClick={() => action({ action: "resolve", marketId: market.id, outcome: "YES" }, "admin")}>Resolve YES</button><button disabled={busy} onClick={() => action({ action: "resolve", marketId: market.id, outcome: "NO" }, "admin")}>Resolve NO</button></div></article>)}</div></div>; }
function panelTitle(panel: Panel, market?: string) { return panel === "detail" ? market ?? "Market details" : ({ watchlist: "Markets you are following.", rankings: "Community leaderboard.", alerts: "Your notifications.", profile: "Public profile.", onchain: "Onchain test environment.", admin: "Operations console." } as Record<string, string>)[panel ?? ""] ?? ""; }
function formatMoney(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value); }
