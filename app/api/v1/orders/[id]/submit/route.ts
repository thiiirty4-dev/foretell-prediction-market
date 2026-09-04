import { isAddress, isHex } from "viem";
import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { transactionAsUser } from "@/lib/db";
import { assertTransition,type OrderState } from "@/lib/domain";
import { apiError, ApiException, ok, requestId } from "@/lib/http";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const p=await authenticate(request),id=z.string().uuid().parse((await params).id),body=z.object({transactionHash:z.string().refine(v=>isHex(v)&&v.length===66),from:z.string().refine(isAddress),to:z.string().refine(isAddress),data:z.string().refine(isHex),value:z.string().regex(/^\d+$/)}).parse(await request.json());
    const result=await transactionAsUser(p.id,async c=>{
      const r=await c.query(`select * from orders where id=$1 and user_id=$2 for update`,[id,p.id]);
      if(!r.rowCount)throw new ApiException(404,"ORDER_NOT_FOUND","订单不存在");
      const o=r.rows[0];
      let state=o.state as OrderState;
      if(state!=="AWAITING_SIGNATURE"&&state!=="PREPARED")throw new ApiException(409,"ILLEGAL_ORDER_TRANSITION","订单当前不可提交");
      if(body.from.toLowerCase()!==o.wallet_address||body.to.toLowerCase()!==o.tx_to||body.data.toLowerCase()!==o.tx_data.toLowerCase()||body.value!==o.tx_value)throw new ApiException(409,"TRANSACTION_MISMATCH","交易内容与准备计划不一致");
      if(state==="PREPARED"){
        assertTransition(state,"AWAITING_SIGNATURE");
        const moved=await c.query(`update orders set state='AWAITING_SIGNATURE',updated_at=now() where id=$1 and state='PREPARED'`,[id]);
        if(moved.rowCount!==1)throw new ApiException(409,"ILLEGAL_ORDER_TRANSITION","订单状态已变化");
        await c.query(`insert into order_state_history(order_id,from_state,to_state,reason) values($1,'PREPARED','AWAITING_SIGNATURE','wallet_signature_requested')`,[id]);
        state="AWAITING_SIGNATURE";
      }
      assertTransition(state,"SUBMITTED");
      const moved=await c.query(`update orders set state='SUBMITTED',transaction_hash=$2,updated_at=now() where id=$1 and state=$3`,[id,body.transactionHash.toLowerCase(),state]);
      if(moved.rowCount!==1)throw new ApiException(409,"ILLEGAL_ORDER_TRANSITION","订单状态已变化");
      await c.query(`insert into order_state_history(order_id,from_state,to_state,reason) values($1,$2,'SUBMITTED','wallet_broadcast')`,[id,state]);
      return{id,state:"SUBMITTED",transactionHash:body.transactionHash.toLowerCase()};
    });
    return ok(result,{requestId:requestId(request)});
  }catch(error){return apiError(request,error);}
}
