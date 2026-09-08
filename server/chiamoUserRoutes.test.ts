import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import {
  ChiamoUserReauthLimiter,
  chiamoUserManagementAllowed,
  chiamoUserPriceImpact,
  registerChiamoUserRoutes,
} from "./chiamoUserRoutes";

type Registered = { [key:string]: Array<(req:any,res:any,next?:()=>void)=>unknown> };

class QueueDatabase {
  public writes: Array<{ kind:string; value:any }> = [];
  constructor(public responses:any[] = []) {}
  private query(kind:string) {
    const self=this;
    const response=self.responses.shift();
    const query:any = {
      from(){return query}, where(){return query}, orderBy(){return query}, limit(){return query}, for(){return query},
      values(value:any){self.writes.push({kind,value});return query},
      set(value:any){self.writes.push({kind,value});return query},
      returning(){return query},
      then(resolve:(value:any)=>void,reject:(error:any)=>void){try{resolve(response)}catch(error){reject(error)}},
    };
    return query;
  }
  select(){return this.query("select")}
  insert(){return this.query("insert")}
  update(){return this.query("update")}
  execute(){this.writes.push({kind:"execute",value:null});return this.query("execute")}
  transaction(fn:(tx:any)=>unknown){return fn(this)}
}

function harness(database:any, limiter = new ChiamoUserReauthLimiter()) {
  const registered:Registered={};
  const app:any={};
  for(const method of ["get","post","patch","put"]) app[method]=(path:string,...handlers:any[])=>{registered[`${method} ${path}`]=handlers};
  registerChiamoUserRoutes(app,{database,reauthLimiter:limiter,now:()=>new Date("2026-01-02T00:00:00.000Z"),authenticate:((_req:any,_res:any,next:any)=>next()) as any});
  return {
    request:async(method:string,path:string,user:any,body:any={})=>{
      const routePath=path.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}(?=\/|$)/i,"/:id");
      const handlers=registered[`${method.toLowerCase()} ${routePath}`];
      assert.ok(handlers,`route ${method} ${routePath} registered`);
      const req:any={user,body,params:{id:path.match(/[0-9a-f]{8}-[0-9a-f-]{27}/i)?.[0] || path.split("/").at(-1)},ip:"127.0.0.1",socket:{}};
      const res:any={statusCode:200,headers:{},setHeader(k:string,v:string){this.headers[k]=v},status(n:number){this.statusCode=n;return this},json(value:any){this.body=value;return this}};
      let index=0;
      const next=async()=>{const handler=handlers[index++];if(handler)await handler(req,res,next)};
      await next();
      return res;
    },
  };
}

const owner={tenantId:"11111111-1111-4111-8111-111111111111",id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",role:"owner",product:"chiamo",credentialVersion:4};
const member={...owner,id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",role:"agent"};
const targetId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const tenant={id:owner.tenantId,isActive:true,chiamoConnectEnabled:true,chainCoreEnabled:false,maxActiveUsers:3,businessType:"business"};
const ownerRow={id:owner.id,tenantId:owner.tenantId,role:"owner",isActive:true,username:"owner",email:"owner@example.com",passwordHash:"hidden",voipAccess:true,credentialVersion:4};
const target={id:targetId,tenantId:owner.tenantId,role:"agent",isActive:true,username:"agent",email:"agent@example.com",passwordHash:"never-return",voipAccess:false,credentialVersion:2};
const validCreate={username:"newagent",email:"new@example.com",password:"Member-password!2",passwordConfirmation:"Member-password!2",ownerPassword:"Owner-current-password!2"};

test("HTTP list denies non-owner Chiamo members before querying storage", async()=>{
  const database=new QueueDatabase();
  const res=await harness(database).request("GET","/api/chiamo/team-members",member);
  assert.equal(res.statusCode,403);
  assert.equal(database.responses.length,0);
});

test("HTTP inputs cannot promote a managed member to owner",async()=>{
  const database=new QueueDatabase();
  const create=await harness(database).request("POST","/api/chiamo/team-members",owner,{...validCreate,role:"owner"});
  const edit=await harness(database).request("PATCH",`/api/chiamo/team-members/${targetId}`,owner,{role:"owner"});
  assert.equal(create.statusCode,400);
  assert.equal(edit.statusCode,400);
  assert.equal(database.writes.length,0);
});

test("HTTP list is tenant-bound and returns only explicitly safe fields",async()=>{
  const database=new QueueDatabase([[tenant],[ownerRow,target],[]]);
  const res=await harness(database).request("GET","/api/chiamo/team-members",owner);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.members.length,2);
  assert.deepEqual(Object.keys(res.body.members[1]).sort(),["createdAt","email","firstName","id","isActive","lastLoginAt","lastName","mustChangePassword","role","temporaryPasswordExpiresAt","updatedAt","username","voipAccess"].sort());
  assert.equal("passwordHash" in res.body.members[1],false);
  assert.equal("credentialVersion" in res.body.members[1],false);
  assert.equal(res.headers["Cache-Control"],"no-store");
});

test("HTTP management rejects dual-product Chain tenants",async()=>{
  const database=new QueueDatabase([[{...tenant,chainCoreEnabled:true}],[ownerRow],[]]);
  const res=await harness(database).request("GET","/api/chiamo/team-members",owner);
  assert.equal(res.statusCode,404);
});

test("HTTP create stores the company-chosen password and returns no credential secrets",async()=>{
  const passwordHash=await bcrypt.hash("Owner-current-password!2",4);
  const inserted={...target,firstName:null,lastName:null,mustChangePassword:false,temporaryPasswordExpiresAt:null,createdAt:new Date(),updatedAt:new Date(),lastLoginAt:null};
  const database=new QueueDatabase([[tenant],[{...ownerRow,passwordHash}],[ownerRow],[{planId:"starter",billingStatus:"ACTIVE"}],[],[inserted]]);
  const res=await harness(database).request("POST","/api/chiamo/team-members",owner,{...validCreate,username:" New.Agent ",email:" NEW@Example.COM ",firstName:"",lastName:"",role:"agent",voipAccess:true});
  assert.equal(res.statusCode,201);
  assert.equal("credentials" in res.body,false);
  const values=database.writes.find(x=>x.kind==="insert")!.value;
  assert.equal(values.username,"new.agent");
  assert.equal(values.email,"new@example.com");
  assert.equal(values.firstName,null);
  assert.equal(values.mustChangePassword,false);
  assert.equal(values.credentialVersion,1);
  assert.equal(values.temporaryPasswordExpiresAt,null);
  assert.deepEqual(values.restrictedServices,["billing"]);
  assert.equal(await bcrypt.compare(validCreate.password,values.passwordHash),true);
  assert.equal("passwordHash" in res.body.member,false);
});

test("wrong owner password is rate limited and never writes credentials",async()=>{
  const responses:any[]=[];
  for(let i=0;i<5;i++)responses.push([tenant],[ownerRow]);
  const database=new QueueDatabase(responses);
  const api=harness(database,new ChiamoUserReauthLimiter(5,60_000));
  const body={...validCreate,ownerPassword:"wrong"};
  for(let i=0;i<5;i++)assert.equal((await api.request("POST","/api/chiamo/team-members",owner,body)).statusCode,401);
  const blocked=await api.request("POST","/api/chiamo/team-members",owner,body);
  assert.equal(blocked.statusCode,429);
  assert.equal(blocked.headers["Retry-After"],"60");
  assert.equal(database.writes.some(x=>x.kind==="insert"),false);
});

test("HTTP create accepts blank email as null and defaults VoIP on",async()=>{
  const passwordHash=await bcrypt.hash(validCreate.ownerPassword,4);
  const inserted={...target,email:null,voipAccess:true,mustChangePassword:false,temporaryPasswordExpiresAt:null};
  const database=new QueueDatabase([[tenant],[{...ownerRow,passwordHash}],[ownerRow],[{planId:"starter",billingStatus:"ACTIVE"}],[],[inserted]]);
  const res=await harness(database).request("POST","/api/chiamo/team-members",owner,{...validCreate,email:"   "});
  assert.equal(res.statusCode,201);
  const values=database.writes.find(x=>x.kind==="insert")!.value;
  assert.equal(values.email,null);
  assert.equal(values.voipAccess,true);
});

test("HTTP create enforces password confirmation and policy before storage",async()=>{
  const database=new QueueDatabase();
  const mismatch=await harness(database).request("POST","/api/chiamo/team-members",owner,{...validCreate,passwordConfirmation:"Different-password!2"});
  const weak=await harness(database).request("POST","/api/chiamo/team-members",owner,{...validCreate,password:"short",passwordConfirmation:"short"});
  assert.equal(mismatch.statusCode,400);
  assert.equal(weak.statusCode,400);
  assert.equal(database.writes.length,0);
});

test("HTTP patch conceals a cross-tenant target as not found",async()=>{
  const database=new QueueDatabase([[tenant],[ownerRow],[]]);
  const res=await harness(database).request("PATCH",`/api/chiamo/team-members/${targetId}`,owner,{email:"other@example.com"});
  assert.equal(res.statusCode,404);
  assert.equal(database.writes.length,0);
});

test("HTTP patch protects owner credentials from edit and deactivation",async()=>{
  const database=new QueueDatabase([[tenant],[ownerRow],[ownerRow]]);
  const res=await harness(database).request("PATCH",`/api/chiamo/team-members/${owner.id}`,owner,{isActive:false});
  assert.equal(res.statusCode,403);
  assert.equal(database.writes.length,0);
});

test("deactivation increments credential version to revoke existing sessions",async()=>{
  const updated={...target,isActive:false,credentialVersion:3,updatedAt:new Date()};
  const database=new QueueDatabase([[tenant],[ownerRow],[target],[ownerRow,target],[],[updated]]);
  const res=await harness(database).request("PATCH",`/api/chiamo/team-members/${targetId}`,owner,{isActive:false});
  assert.equal(res.statusCode,200);
  const changes=database.writes.find(x=>x.kind==="update")!.value;
  assert.equal(changes.isActive,false);
  assert.ok(changes.credentialVersion,"credentialVersion SQL increment is present");
  assert.equal("credentialVersion" in res.body.member,false);
});

test("password replacement reauthenticates owner, revokes reset tokens, and preserves inactive state",async()=>{
  const passwordHash=await bcrypt.hash(validCreate.ownerPassword,4);
  const inactive={...target,isActive:false};
  const updated={...inactive,passwordHash:"new-hidden",mustChangePassword:false,temporaryPasswordExpiresAt:null,credentialVersion:3};
  const database=new QueueDatabase([[tenant],[{...ownerRow,passwordHash}],[inactive],[updated],undefined]);
  const res=await harness(database).request("PUT",`/api/chiamo/team-members/${targetId}/password`,owner,{
    password:"Replacement-password!3",passwordConfirmation:"Replacement-password!3",ownerPassword:validCreate.ownerPassword,
  });
  assert.equal(res.statusCode,200);
  const changes=database.writes.find(x=>x.kind==="update")!.value;
  assert.equal(await bcrypt.compare("Replacement-password!3",changes.passwordHash),true);
  assert.equal(changes.mustChangePassword,false);
  assert.equal(changes.temporaryPasswordExpiresAt,null);
  assert.equal(changes.isActive,undefined);
  assert.equal(database.writes.some(x=>x.kind==="execute"),true);
  assert.equal("passwordHash" in res.body.member,false);
});

test("password replacement rejects owner and cross-tenant targets",async()=>{
  const passwordHash=await bcrypt.hash(validCreate.ownerPassword,4);
  const body={password:"Replacement-password!3",passwordConfirmation:"Replacement-password!3",ownerPassword:validCreate.ownerPassword};
  const ownerDb=new QueueDatabase([[tenant],[{...ownerRow,passwordHash}],[ownerRow]]);
  const protectedOwner=await harness(ownerDb).request("PUT",`/api/chiamo/team-members/${owner.id}/password`,owner,body);
  assert.equal(protectedOwner.statusCode,403);
  const crossTenantDb=new QueueDatabase([[tenant],[{...ownerRow,passwordHash}],[]]);
  const missing=await harness(crossTenantDb).request("PUT",`/api/chiamo/team-members/${targetId}/password`,owner,body);
  assert.equal(missing.statusCode,404);
});

test("mutation rejects a stale owner credential version under lock",async()=>{
  const staleOwner={...owner,credentialVersion:3};
  const database=new QueueDatabase([[tenant],[]]);
  const res=await harness(database).request("PATCH",`/api/chiamo/team-members/${targetId}`,staleOwner,{email:null});
  assert.equal(res.statusCode,403);
  assert.equal(database.writes.length,0);
});

test("activation over the locked active-seat cap is rejected without a write",async()=>{
  const inactive={...target,isActive:false};
  const active2={...target,id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"};
  const cappedTenant={...tenant,maxActiveUsers:2};
  const database=new QueueDatabase([[cappedTenant],[ownerRow],[inactive],[ownerRow,active2]]);
  const res=await harness(database).request("PATCH",`/api/chiamo/team-members/${targetId}`,owner,{isActive:true,confirmSeatPriceImpact:true});
  assert.equal(res.statusCode,409);
  assert.equal(res.body.code,"ACTIVE_USER_LIMIT_REACHED");
  assert.equal(database.writes.length,0);
});

test("billable-seat increases require HTTP confirmation before insertion",async()=>{
  const passwordHash=await bcrypt.hash("Owner-current-password!2",4);
  const subscription={planId:"starter",includedUsers:1,additionalUserPriceCents:2500,billingStatus:"ACTIVE"};
  const database=new QueueDatabase([[tenant],[{...ownerRow,passwordHash}],[ownerRow],[subscription]]);
  const res=await harness(database).request("POST","/api/chiamo/team-members",owner,validCreate);
  assert.equal(res.statusCode,409);
  assert.equal(res.body.code,"SEAT_PRICE_CONFIRMATION_REQUIRED");
  assert.equal(res.body.before.monthlyAdditionalUserChargeCents,0);
  assert.equal(res.body.after.monthlyAdditionalUserChargeCents,2500);
  assert.equal(database.writes.length,0);
});

test("adding or reactivating requires active billing, while deactivation remains safe",async()=>{
  const passwordHash=await bcrypt.hash("Owner-current-password!2",4);
  const inactiveSubscription={planId:"starter",billingStatus:"SUSPENDED"};
  const createDb=new QueueDatabase([[tenant],[{...ownerRow,passwordHash}],[ownerRow],[inactiveSubscription]]);
  const create=await harness(createDb).request("POST","/api/chiamo/team-members",owner,validCreate);
  assert.equal(create.statusCode,409);
  assert.equal(create.body.code,"ACTIVE_SUBSCRIPTION_REQUIRED");
  const inactiveTarget={...target,isActive:false};
  const activateDb=new QueueDatabase([[tenant],[ownerRow],[inactiveTarget],[ownerRow],[inactiveSubscription]]);
  const activate=await harness(activateDb).request("PATCH",`/api/chiamo/team-members/${targetId}`,owner,{isActive:true,confirmSeatPriceImpact:true});
  assert.equal(activate.statusCode,409);
  assert.equal(activate.body.code,"ACTIVE_SUBSCRIPTION_REQUIRED");
  assert.equal(activateDb.writes.length,0);
});

test("serialized concurrent creates cannot exceed the seat cap",async()=>{
  const passwordHash=await bcrypt.hash("Owner-current-password!2",4);
  let active=1; let lock=Promise.resolve(); let inserts=0;
  const database:any={
    transaction(fn:(tx:any)=>Promise<any>){
      const run=lock.then(async()=>{
        const members=active===1?[ownerRow]:[ownerRow,target];
        const inserted={...target,mustChangePassword:false,temporaryPasswordExpiresAt:null,createdAt:new Date(),updatedAt:new Date(),lastLoginAt:null};
        const tx=new QueueDatabase([[{...tenant,maxActiveUsers:2}],[{...ownerRow,passwordHash}],members,[{planId:"starter",billingStatus:"ACTIVE"}],[],[inserted]]);
        const originalInsert=tx.insert.bind(tx);
        tx.insert=()=>{inserts++;active++;return originalInsert()};
        return fn(tx);
      });
      lock=run.then(()=>undefined,()=>undefined);
      return run;
    },
  };
  const api=harness(database);
  const body={...validCreate,confirmSeatPriceImpact:true};
  const [one,two]=await Promise.all([api.request("POST","/api/chiamo/team-members",owner,body),api.request("POST","/api/chiamo/team-members",owner,{...body,username:"second",email:"second@example.com"})]);
  assert.deepEqual([one.statusCode,two.statusCode],[201,409]);
  assert.equal(two.body.code,"ACTIVE_USER_LIMIT_REACHED");
  assert.equal(inserts,1);
});

test("domain pricing and authorization retain existing Chiamo semantics",()=>{
  assert.equal(chiamoUserManagementAllowed(owner),true);
  assert.equal(chiamoUserManagementAllowed({...owner,product:"chain"}),false);
  assert.equal(chiamoUserPriceImpact({planId:"starter"},4).monthlyAdditionalUserChargeCents,2500);
});