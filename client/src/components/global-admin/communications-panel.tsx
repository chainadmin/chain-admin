import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const sections = ['Overview','Companies','Voice','Primary Numbers','Local Presence','Local Presence Requests','DID Inventory','Coverage','SMS','Provider Costs','Setup / Verification'];

export function CommunicationsPanel() {
  const communications = useQuery<any>({ queryKey: ['/api/admin/communications'] });
  const { data, isLoading, isError, error, refetch } = communications;
  const action = useMutation({ mutationFn: ({ id, step, body }: any) => apiRequest('POST', `/api/admin/communications/requests/${id}/${step}`, body), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/admin/communications'] }) });
  if (isLoading) return <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-blue-100">Loading communications…</div>;
  if (isError) {
    const unauthorized = error instanceof ApiError && (error.status === 401 || error.status === 403);
    return <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-blue-50"><h3 className="font-semibold text-white">{unauthorized ? 'Platform administrator authorization required' : 'Unable to load communications'}</h3><p className="mt-2 text-sm text-blue-100/70">{unauthorized ? 'Sign in with an active Global Admin session to view provider communications data.' : 'The communications service could not be reached. No empty inventory has been inferred.'}</p><Button className="mt-4" variant="outline" onClick={() => void refetch()}>Retry</Button></div>;
  }
  const requests = data?.requests || [], numbers = data?.numbers || [], companies = data?.companies || [];
  const buckets = data?.buckets || [], settings = data?.settings || [], voicemailStatus = data?.voicemailStatus || [];
  const packages = data?.packages || [];
  const providerInventory = data?.providerInventory;
  const reconciliation = data?.reconciliation;
  const databaseInventory = data?.databaseInventory;
  const providerSubaccounts = asList(providerInventory?.subaccounts);
  const providerNumbers = asList(providerInventory?.numbers ?? providerInventory?.phoneNumbers ?? providerInventory?.incomingPhoneNumbers);
  const providerUnavailable = providerInventory && (providerInventory.available === false || providerInventory.providerAvailable === false || providerInventory.status === 'unavailable' || providerInventory.status === 'UNAVAILABLE');
  const providerPartial = providerInventory?.status === 'partial';
  const databaseTenants = asList(databaseInventory?.tenants).filter((tenant: any) => tenant.legacyAccountSid || tenant.legacyPhoneNumber);
  const tenantNames = new Map(databaseTenants.map((tenant: any) => [tenant.tenantId, tenant.tenantName]));
  const databaseSms = asList(databaseInventory?.smsConfigurations).map((record: any) => ({ ...record, tenantName: tenantNames.get(record.tenantId) }));
  const databaseVoice = asList(databaseInventory?.voipPhoneNumbers).map((record: any) => ({ ...record, tenantName: tenantNames.get(record.tenantId) }));
  const localDids = numbers.filter((n: any) => n.numberType === 'LOCAL_PRESENCE');
  return <section id="admin-communications" className="mb-8 scroll-mt-4 space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-sky-300">Chain Software Group Global Admin</p><h2 className="mt-1 text-2xl font-bold text-white">Communications / Twilio</h2></div>
    <div className="flex gap-2 overflow-x-auto">{sections.map(s => <span key={s} className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-blue-100/70">{s}</span>)}</div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Twilio subaccounts',providerInventory?.status === 'available' || providerInventory?.status === 'partial' ? providerSubaccounts.length : companies.filter((c:any)=>c.twilioAccountSid).length],['Primary Voice DIDs',numbers.filter((n:any)=>n.isPrimary).length],['Local Presence DIDs',localDids.length],['Routing buckets',buckets.length],['Unread voicemail',voicemailStatus.reduce((sum:number,row:any)=>sum+(row.unread||0),0)],['Greetings enabled',settings.filter((row:any)=>row.inboundGreetingEnabled).length],['Awaiting approval',requests.filter((r:any)=>['COVERAGE_CALCULATED','AVAILABILITY_REVIEW','COST_REVIEW'].includes(r.status)).length],['Provider cost estimate',`$${(requests.reduce((s:number,r:any)=>s+(r.estimatedProviderCostCents||0),0)/100).toFixed(2)}`]
    ].map(([label,value])=><div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-blue-100/60">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value}</p></div>)}</div>
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="mb-4 font-semibold text-white">Company Voice routing status</h3><table className="w-full min-w-[900px] text-sm"><thead className="text-left text-blue-100/50"><tr>{['Company','Numbers','Buckets','Greeting','Hold music','Park music','Voicemail','Recording status'].map(x=><th className="pb-3 pr-4" key={x}>{x}</th>)}</tr></thead><tbody>{companies.filter((company:any)=>numbers.some((number:any)=>number.tenantId===company.id)).map((company:any)=>{const companySettings=settings.find((row:any)=>row.tenantId===company.id);const voicemail=voicemailStatus.find((row:any)=>row.tenantId===company.id);return <tr className="border-t border-white/10 text-blue-50" key={company.id}><td className="py-3 pr-4">{company.name}</td><td>{numbers.filter((number:any)=>number.tenantId===company.id).length}</td><td>{buckets.filter((bucket:any)=>bucket.tenantId===company.id).length}</td><td>{companySettings?.inboundGreetingEnabled?companySettings.inboundGreetingType:'Disabled'}</td><td>{companySettings?.holdMusicKey||'art-gallery-museum'}</td><td>{companySettings?.parkMusicKey||'art-gallery-museum'}</td><td>{voicemail?`${voicemail.unread} unread / ${voicemail.total} total`:'0'}</td><td>{voicemail?.recording?`${voicemail.recording} recording`:'Ready'}</td></tr>})}</tbody></table></div>
     <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="mb-4 font-semibold text-white">Local Presence Requests</h3><table className="w-full min-w-[900px] text-sm"><thead className="text-left text-blue-100/50"><tr>{['Company','Product','Package','Required / Missing','Provider cost','Customer price','Margin','Status','Actions'].map(x=><th className="pb-3 pr-4" key={x}>{x}</th>)}</tr></thead><tbody>{requests.map((r:any)=>{const company=companies.find((c:any)=>c.id===r.tenantId); const missingCount=(r.coverageRequired||[]).reduce((s:number,x:any)=>s+(x.need||0),0); return <tr className="border-t border-white/10 text-blue-50" key={r.id}><td className="py-3 pr-4">{company?.name||r.tenantId}</td><td>{r.product}</td><td>{packages.find((p:any)=>p.id===r.requestedPackageId)?.name}</td><td>{r.estimatedDidCount??'—'} / {missingCount}</td><td>${((r.estimatedProviderCostCents||0)/100).toFixed(2)}</td><td>${((r.customerPriceCents||0)/100).toFixed(2)}</td><td>${(((r.customerPriceCents||0)-(r.estimatedProviderCostCents||0))/100).toFixed(2)}</td><td><Badge>{r.status.replaceAll('_',' ')}</Badge></td><td><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>action.mutate({id:r.id,step:'calculate'})}>Calculate</Button><Button size="sm" variant="outline" disabled={!r.coverageRequired} onClick={()=>action.mutate({id:r.id,step:'availability'})}>Availability</Button><Button size="sm" className="bg-emerald-600" onClick={()=>window.confirm(`Approve ${r.estimatedDidCount||0} DIDs? Provider: $${((r.estimatedProviderCostCents||0)/100).toFixed(2)}, customer: $${((r.customerPriceCents||0)/100).toFixed(2)}`)&&action.mutate({id:r.id,step:'approve',body:{confirm:true}})}>Approve</Button><Button size="sm" disabled={r.status!=='APPROVED'} onClick={()=>action.mutate({id:r.id,step:'provision'})}>Provision</Button></div></td></tr>})}</tbody></table>{!requests.length&&<p className="py-8 text-center text-sm text-blue-100/60">No local presence requests.</p>}</div>
     {(providerInventory || reconciliation || databaseInventory) && <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5"><div><h3 className="font-semibold text-white">Live provider inventory reconciliation</h3><p className="mt-1 text-sm text-blue-100/60">Twilio inventory compared with company mappings stored by Chain.</p></div>{providerUnavailable ? <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200"><p className="font-semibold">Provider inventory unavailable</p><p className="mt-1">{providerError(providerInventory)}</p></div> : providerInventory && <><div className="grid gap-3 sm:grid-cols-2"><InventoryList title={`Provider subaccounts (${providerSubaccounts.length})`} items={providerSubaccounts}/><InventoryList title={`Provider numbers (${providerNumbers.length})`} items={providerNumbers}/></div>{providerPartial&&<p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">{providerError(providerInventory)}</p>}</>}{databaseInventory&&<div><h4 className="mb-3 text-sm font-semibold text-white">Stored company mappings</h4><div className="grid gap-3 md:grid-cols-3"><InventoryList title={`Tenant mappings (${databaseTenants.length})`} items={databaseTenants}/><InventoryList title={`SMS mappings (${databaseSms.length})`} items={databaseSms}/><InventoryList title={`Voice number mappings (${databaseVoice.length})`} items={databaseVoice}/></div></div>}{reconciliation && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(['subaccounts','numbers'] as const).flatMap(kind=>(['mapped','unmapped','ambiguous'] as const).map(status=><InventoryList key={`${kind}-${status}`} title={`${titleCase(status)} ${kind} (${reconciliationList(reconciliation,kind,status).length})`} items={reconciliationList(reconciliation,kind,status)} tone={status}/>))}</div>}</div>}
    <div className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="font-semibold text-white">SMS subaccount ownership audit</h3>{data?.ownershipAudit?.ambiguous?.length?<p className="mt-2 text-amber-300">Manual review required: duplicate subaccount references detected. No mappings were changed.</p>:<p className="mt-2 text-emerald-300">No duplicate subaccount references detected in the database.</p>}</div><div className="rounded-2xl border border-white/10 bg-white/5 p-5"><h3 className="font-semibold text-white">Voice verification</h3><p className="mt-2 text-blue-100/60">Results remain NOT TESTED / NOT VERIFIED until staff records live Twilio tests; the dashboard never infers a pass.</p></div></div>
  </section>;
}

function asList(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function reconciliationList(data: any, kind: 'subaccounts' | 'numbers', status: 'mapped' | 'unmapped' | 'ambiguous'): any[] {
  const singular = kind === 'subaccounts' ? 'Subaccounts' : 'Numbers';
  const kindData = data?.[kind] ?? (kind === 'numbers' ? data?.phoneNumbers : undefined);
  const grouped = asList(
    kindData?.[status] ??
    data?.[status]?.[kind] ??
    data?.[`${status}${singular}`]
  );
  if (grouped.length) return grouped;
  return asList(kindData).filter(item => String(item?.reconciliation || item?.reconciliationStatus || '').toLowerCase() === status);
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function providerError(inventory: any) {
  if (typeof inventory?.error === 'string') return inventory.error;
  if (typeof inventory?.message === 'string') return inventory.message;
  return 'Twilio could not be reached. Database mappings are shown without treating the provider inventory as empty.';
}

function inventoryLabel(item: any) {
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  const provider = item?.provider || item?.twilio || item;
  const mapped = item?.company || item?.tenant || item?.mapping || item?.matches?.[0];
  const primary = provider?.phoneNumber || provider?.friendlyName || provider?.accountSid || provider?.legacyAccountSid || provider?.sid || item?.phoneNumber || item?.accountSid || item?.legacyAccountSid || item?.sid || item?.id || item?.tenantName || 'No provider resource stored';
  const company = mapped?.name || item?.companyName || item?.tenantName;
  const reason = item?.reason || item?.issue || item?.reconciliation;
  return [primary, company && `Company: ${company}`, reason && `Reason: ${reason}`].filter(Boolean).join(' · ');
}

function InventoryList({title,items,tone}:{title:string;items:any[];tone?:'mapped'|'unmapped'|'ambiguous'}) {
  const color = tone === 'mapped' ? 'text-emerald-300' : tone === 'unmapped' ? 'text-amber-300' : tone === 'ambiguous' ? 'text-red-300' : 'text-white';
  return <div className="rounded-xl border border-white/10 bg-slate-950/20 p-4"><h4 className={`text-sm font-semibold ${color}`}>{title}</h4>{items.length ? <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto text-xs text-blue-100/70">{items.map((item,index)=><li className="break-all border-t border-white/5 pt-2 first:border-0 first:pt-0" key={item?.sid||item?.accountSid||item?.phoneNumber||item?.id||index}>{inventoryLabel(item)}</li>)}</ul> : <p className="mt-2 text-xs text-blue-100/50">None</p>}</div>;
}
