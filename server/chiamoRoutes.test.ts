import assert from "node:assert/strict";
import test from "node:test";
import { chiamoAsyncRoute, chiamoLeadInput } from "./chiamoRoutes";
import { chiamoReadinessForVoiceStatus, resolveChiamoBaseUrl, voiceProviderStatusForConversion } from "./chiamoOnboarding";
import { chiamoVoipOnlyBillingFields, chiamoVoipOnlyConversionFields } from "./chiamoVoipPolicy";
import { resolveChiamoPhoneState } from "./phoneProductEntitlementRules";

test("Chiamo origin fails closed", () => {
  assert.equal(resolveChiamoBaseUrl({CHIAMO_BASE_URL:"https://app.chiamoconnect.com"}),"https://app.chiamoconnect.com");
  assert.throws(()=>resolveChiamoBaseUrl({CHIAMO_BASE_URL:"https://chainsoftwaregroup.com"}));
});
test("Voice retry states are explicit", () => {
  assert.equal(voiceProviderStatusForConversion(true,"IN_PROGRESS"),"IN_PROGRESS");
  assert.equal(chiamoReadinessForVoiceStatus("IN_PROGRESS"),"IN_PROGRESS");
  assert.equal(chiamoReadinessForVoiceStatus("READY"),"READY");
});
test("VoIP policies reject SMS and lead texting", () => {
  assert.equal(chiamoVoipOnlyConversionFields.safeParse({smsEnabled:true}).success,false);
  assert.equal(chiamoVoipOnlyBillingFields.safeParse({smsAddonEnabled:true}).success,false);
  assert.equal(chiamoLeadInput.safeParse({firstName:"A",lastName:"B",businessName:"C",businessEmail:"a@b.com",businessPhone:"1234567",phoneUsersNeeded:1,planInterest:"starter",consent:true,textingInterest:true}).success,false);
});
test("async route failures reach Express next", async () => {
  let got:unknown; chiamoAsyncRoute(async()=>{throw new Error("x");})({} as any,{} as any,e=>got=e);
  await new Promise(resolve=>setImmediate(resolve)); assert.ok(got instanceof Error);
});
test("billing suspension preserves intent while explicit disable remains off", () => {
  assert.equal(resolveChiamoPhoneState({lifecycleStatus:"SUSPENDED",currentEntitlementEnabled:true,currentServiceVoiceEnabled:true,currentServiceAccountActive:true}).entitlementEnabled,true);
  assert.equal(resolveChiamoPhoneState({lifecycleStatus:"ACTIVE",currentEntitlementEnabled:false,currentServiceVoiceEnabled:true,currentServiceAccountActive:false}).allowed,false);
});