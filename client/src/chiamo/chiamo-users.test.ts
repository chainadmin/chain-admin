import assert from "node:assert/strict";
import test from "node:test";
import { chiamoActivationPayload, chiamoCreatePayload, chiamoPasswordPayload, request } from "./chiamo-users";

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

test("create payload carries distinct chosen, confirmation, and owner passwords with nullable email",()=>{
  const payload=chiamoCreatePayload({username:"agent",email:"  ",firstName:"",lastName:"",role:"agent",voipAccess:true,password:"Member-password!2",passwordConfirmation:"Member-password!2",ownerPassword:"Owner-password!3",confirmSeatPriceImpact:true});
  assert.equal(payload.email,null);
  assert.equal(payload.voipAccess,true);
  assert.equal(payload.password,"Member-password!2");
  assert.equal(payload.passwordConfirmation,"Member-password!2");
  assert.equal(payload.ownerPassword,"Owner-password!3");
});

test("password replacement payload sends only the three password fields",()=>{
  assert.deepEqual(chiamoPasswordPayload({password:"Member-password!2",passwordConfirmation:"Member-password!2",ownerPassword:"Owner-password!3"}),{
    password:"Member-password!2",
    passwordConfirmation:"Member-password!2",
    ownerPassword:"Owner-password!3",
  });
});

test("user-management uses the configured origin for listing and password replacement",async()=>{
  const originalFetch=globalThis.fetch;
  const calls:{url:string;init?:RequestInit}[]=[];
  globalThis.fetch=async(url,init)=>{
    calls.push({url:String(url),init});
    return new Response(JSON.stringify(init?.method==="GET"
      ? {members:[],seats:{activeUsers:1,maxActiveUsers:10}}
      : {member:{id:"member",username:"agent",role:"agent"}}),{headers:{"content-type":"application/json"}});
  };
  try {
    const resolveUrl=(path:string)=>`https://configured-api.example.test${path}`;
    await request("/api/chiamo/team-members","GET",undefined,"fixture",resolveUrl);
    await request("/api/chiamo/team-members/member/password","PUT",{password:"Chosen-password!2"},"fixture",resolveUrl);
    assert.ok(calls.every(c=>c.url.startsWith("https://configured-api.example.test/api/chiamo/team-members")));
    assert.ok(calls.every(c=>c.init?.credentials==="include"));
    assert.ok(calls.every(c=>new Headers(c.init?.headers).get("authorization")==="Bearer fixture"));
  } finally {globalThis.fetch=originalFetch;}
});

test("user-management rejects HTML and malformed successful responses before rendering",async()=>{
  const originalFetch=globalThis.fetch;
  try {
    for(const response of [
      new Response("<html>frontend fallback</html>",{headers:{"content-type":"text/html"}}),
      new Response(JSON.stringify({message:"not a team response"}),{headers:{"content-type":"application/json"}}),
    ]) {
      globalThis.fetch=async()=>response;
      await assert.rejects(request("/api/chiamo/team-members","GET",undefined,"fixture"),/invalid response/);
    }
  } finally {globalThis.fetch=originalFetch;}
});