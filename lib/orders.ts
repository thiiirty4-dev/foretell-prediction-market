import "server-only";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { transactionAsUser } from "@/lib/db";
import { canonicalHash } from "@/lib/domain";
import { ApiException } from "@/lib/http";
import { marketAbi } from "@/lib/market-abi";
import type { z } from "zod";
import type { orderInput } from "@/lib/schemas";

type Input = z.infer<typeof orderInput>;
export async function prepareOrder(userId: string, key: string, input: Input) {
  if (!key || key.length > 128) throw new ApiException(400,"IDEMPOTENCY_KEY_REQUIRED","需要有效 Idempotency-Key");
  const bodyHash = canonicalHash(input);
  return transactionAsUser(userId, async (client) => {
    const existing = await client.query(`select id, request_hash, state, tx_to, tx_data, tx_value, expires_at from orders where user_id=$1 and idempotency_key=$2`, [userId,key]);
    if (existing.rowCount) {
      if (existing.rows[0].request_hash !== bodyHash) throw new ApiException(409,"IDEMPOTENCY_CONFLICT","同一幂等键对应了不同请求");
      return existing.rows[0];
    }
    const wallet = await client.query(`select 1 from user_wallets where user_id=$1 and address=$2 and verified_at is not null`, [userId,input.wallet]);
    if (!wallet.rowCount) throw new ApiException(403,"WALLET_NOT_VERIFIED","钱包尚未完成所有权验证");
    const market = await client.query(`select id, contract_address, status, close_time from markets where id=$1 and canonical=true for share`, [input.marketId]);
    if (!market.rowCount || !market.rows[0].contract_address) throw new ApiException(404,"MARKET_NOT_FOUND","市场不存在或尚未上链");
    if (market.rows[0].status !== "OPEN" || new Date(market.rows[0].close_time) <= new Date()) throw new ApiException(409,"MARKET_CLOSED","市场不可交易");
    const deadline = BigInt(Math.floor(new Date(input.deadline).getTime()/1000));
    if (deadline <= BigInt(Math.floor(Date.now()/1000)) || deadline > BigInt(Math.floor(Date.now()/1000)+1800)) throw new ApiException(400,"INVALID_DEADLINE","交易期限必须在未来 30 分钟内");
    // Quote is read from the confirmed reserve snapshot. Conservative slippage is applied using integer math.
    const reserve = await client.query(`select yes_reserve::text, no_reserve::text from market_reserves where market_id=$1`, [input.marketId]);
    if (!reserve.rowCount) throw new ApiException(503,"QUOTE_UNAVAILABLE","确认后的储备数据暂不可用");
    const amount = BigInt(input.amount); const fee = amount * 100n / 10000n; const net = amount-fee;
    const ry=BigInt(reserve.rows[0].yes_reserve), rn=BigInt(reserve.rows[0].no_reserve), selected=input.side==="YES"?ry:rn, other=input.side==="YES"?rn:ry;
    const quote = input.action==="BUY" ? selected+net-((selected*other+other+net-1n)/(other+net)) : sellQuote(selected,other,amount);
    const bound = quote * BigInt(10000-input.slippageBps)/10000n;
    const data = encodeFunctionData({ abi: marketAbi, functionName: input.action==="BUY"?"buy":"sell", args: [input.side==="YES"?0:1, amount, bound, deadline] });
    const id=crypto.randomUUID(), expiresAt=new Date(Number(deadline)*1000);
    await client.query(`insert into orders(id,user_id,wallet_address,market_id,operation,side,amount,idempotency_key,request_hash,state,tx_to,tx_data,tx_value,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'PREPARED',$10,$11,'0',$12)`, [id,userId,input.wallet,input.marketId,input.action,input.side,input.amount,key,bodyHash,market.rows[0].contract_address,data,expiresAt]);
    await client.query(`insert into order_state_history(order_id,from_state,to_state,reason) values($1,null,'PREPARED','api_prepare')`,[id]);
    return { id, state:"PREPARED", tx_to:market.rows[0].contract_address as Address, tx_data:data as Hex, tx_value:"0", expires_at:expiresAt, quote:quote.toString(), minimum:bound.toString() };
  });
}
function sellQuote(selected: bigint, other: bigint, shares: bigint): bigint {
  const k=selected*other, sum=selected+shares+other, diff=(selected+shares)-other, root=sqrt(diff*diff+4n*k), gross=(sum-root)/2n;
  return gross-gross*100n/10000n;
}
function sqrt(value: bigint): bigint { if(value<2n)return value; let x=value, y=(x+1n)/2n; while(y<x){x=y;y=(x+value/x)/2n;} return x; }
