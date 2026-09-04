"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import { createMockOrder } from "@/lib/api/client";
import type { ApiMockOrder } from "@/lib/api/types";
import type { MarketPreview } from "@/lib/market/types";
import styles from "./trading-panel.module.css";

const TOKEN_SCALE = 1_000_000n;
const MAX_INPUT = 100_000n * TOKEN_SCALE;
const QUICK_AMOUNTS = ["25", "100", "500"] as const;

type Side = "YES" | "NO";

interface Quote {
  input: bigint;
  priceBps: number;
  estimatedShares: bigint;
  potentialPayout: bigint;
  potentialProfit: bigint;
  returnBps: bigint;
}

function parseAmount(value: string): bigint | null {
  const normalized = value.trim();
  const match = /^(?:0|[1-9]\d*)(?:\.(\d{0,6}))?$/.exec(normalized);
  if (!match) return null;
  const whole = BigInt(normalized.split(".")[0]);
  const fraction = (match[1] ?? "").padEnd(6, "0");
  return whole * TOKEN_SCALE + BigInt(fraction || "0");
}

function formatUnits(value: bigint): string {
  const whole = value / TOKEN_SCALE;
  const fraction = (value % TOKEN_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return String(whole) + (fraction ? "." + fraction : "");
}

function formatPrice(priceBps: number): string {
  const centsHundredths = BigInt(priceBps);
  const cents = centsHundredths / 100n;
  const fraction = (centsHundredths % 100n).toString().padStart(2, "0");
  return String(cents) + "." + fraction + "¢";
}

function formatPercent(bps: bigint): string {
  return String(bps / 100n) + "." + String(bps % 100n).padStart(2, "0") + "%";
}

export function TradingPanel({ market }: { market: MarketPreview }) {
  const [side, setSide] = useState<Side>("YES");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<ApiMockOrder | null>(null);
  const requestRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const priceBps = Math.max(
    1,
    Math.min(9_999, Math.round((side === "YES" ? market.yesProbability : market.noProbability) * 100)),
  );
  const parsedAmount = amount === "" ? null : parseAmount(amount);
  const validationError = useMemo(() => {
    if (amount === "") return null;
    if (parsedAmount === null) return "请输入正数，最多保留 6 位小数。";
    if (parsedAmount <= 0n) return "金额必须大于 0。";
    if (parsedAmount > MAX_INPUT) return "单笔模拟订单上限为 100,000 fUSD。";
    return null;
  }, [amount, parsedAmount]);

  const quote = useMemo<Quote | null>(() => {
    if (parsedAmount === null || parsedAmount <= 0n || parsedAmount > MAX_INPUT) return null;
    const estimatedShares = (parsedAmount * 10_000n) / BigInt(priceBps);
    const potentialProfit = estimatedShares > parsedAmount ? estimatedShares - parsedAmount : 0n;
    return {
      input: parsedAmount,
      priceBps,
      estimatedShares,
      potentialPayout: estimatedShares,
      potentialProfit,
      returnBps: (potentialProfit * 10_000n) / parsedAmount,
    };
  }, [parsedAmount, priceBps]);

  function updateSide(nextSide: Side) {
    setSide(nextSide);
    setFailure(null);
    setCreatedOrder(null);
    requestRef.current = null;
  }

  function updateAmount(nextAmount: string) {
    setAmount(nextAmount);
    setFailure(null);
    setCreatedOrder(null);
    requestRef.current = null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || validationError || submitting) return;

    const fingerprint = market.id + ":" + side + ":" + String(quote.input);
    if (!requestRef.current || requestRef.current.fingerprint !== fingerprint) {
      requestRef.current = { fingerprint, key: crypto.randomUUID() };
    }

    setSubmitting(true);
    setFailure(null);
    setCreatedOrder(null);

    try {
      const order = await createMockOrder(
        {
          marketId: market.id,
          outcome: side,
          amount: String(quote.input),
        },
        requestRef.current.key,
      );
      setCreatedOrder(order);
      window.dispatchEvent(new Event("mock-order-created"));
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "模拟订单创建失败。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className={styles.panel} aria-label="Mock trading panel">
      <div className={styles.panelHeader}>
        <div>
          <span>SIMULATED ORDER</span>
          <h2>Trade outcome</h2>
        </div>
        <span className={styles.testBadge}>TESTNET</span>
      </div>

      <div className={styles.sideTabs} role="group" aria-label="Choose outcome">
        {(["YES", "NO"] as const).map((option) => {
          const activeClass = option === "YES" ? styles.activeYes : styles.activeNo;
          return (
            <button
              className={side === option ? activeClass : styles.side}
              key={option}
              type="button"
              aria-pressed={side === option}
              onClick={() => updateSide(option)}
            >
              <span>Buy {option}</span>
              <strong>{option === "YES" ? market.yesProbability : market.noProbability}¢</strong>
            </button>
          );
        })}
      </div>

      <form onSubmit={submit}>
        <label className={styles.amountLabel} htmlFor="mock-order-amount">
          <span>Amount</span>
          <small>fUSD test units</small>
        </label>
        <div className={styles.amountField}>
          <input
            id="mock-order-amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => updateAmount(event.target.value)}
            placeholder="0.00"
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? "mock-order-error" : undefined}
          />
          <span>fUSD</span>
        </div>

        <div className={styles.quickAmounts} aria-label="Quick amounts">
          {QUICK_AMOUNTS.map((quickAmount) => (
            <button key={quickAmount} type="button" onClick={() => updateAmount(quickAmount)}>
              {quickAmount}
            </button>
          ))}
          <button type="button" onClick={() => updateAmount("")}>Clear</button>
        </div>

        {validationError ? <p className={styles.error} id="mock-order-error">{validationError}</p> : null}

        <dl className={styles.quote}>
          <div><dt>Current price</dt><dd>{formatPrice(priceBps)}</dd></div>
          <div><dt>Estimated shares</dt><dd>{quote ? formatUnits(quote.estimatedShares) : "—"}</dd></div>
          <div><dt>Potential payout</dt><dd>{quote ? formatUnits(quote.potentialPayout) + " fUSD" : "—"}</dd></div>
          <div><dt>Potential profit</dt><dd>{quote ? "+" + formatUnits(quote.potentialProfit) + " fUSD" : "—"}</dd></div>
          <div><dt>Potential return</dt><dd>{quote ? formatPercent(quote.returnBps) : "—"}</dd></div>
        </dl>

        <button
          className={[styles.submit, side === "YES" ? styles.submitYes : styles.submitNo].join(" ")}
          type="submit"
          disabled={!quote || Boolean(validationError) || submitting}
        >
          {submitting ? "Creating mock order…" : "Buy " + side + " · Simulation"}
        </button>
      </form>

      {failure ? <div className={styles.failure} role="alert">{failure}</div> : null}

      <p className={styles.disclaimer}>
        This creates a PostgreSQL mock order only. No wallet signature, contract call, or asset transfer occurs.
      </p>

      {createdOrder ? (
        <div className={styles.toast} role="status" aria-live="polite">
          <span className={styles.toastMark} aria-hidden="true">OK</span>
          <div>
            <strong>Mock order created</strong>
            <span>Order {createdOrder.id.slice(0, 8)} · {createdOrder.state}</span>
          </div>
          <button type="button" onClick={() => setCreatedOrder(null)} aria-label="Close notification">×</button>
        </div>
      ) : null}
    </aside>
  );
}
