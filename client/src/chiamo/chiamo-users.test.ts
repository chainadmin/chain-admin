import assert from "node:assert/strict";
import test from "node:test";
import { chiamoActivationPayload } from "./chiamo-users";

test("active-user UI payload omits activation-only price confirmation",()=>{
  assert.deepEqual(chiamoActivationPayload({id:"member",isActive:true}),{id:"member",isActive:false});
  assert.equal("confirmSeatPriceImpact" in chiamoActivationPayload({id:"member",isActive:true}),false);
});

test("inactive-user UI payload explicitly confirms projected seat pricing",()=>{
  assert.deepEqual(chiamoActivationPayload({id:"member",isActive:false}),{
    id:"member",
    isActive:true,
    confirmSeatPriceImpact:true,
  });
});