import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Megaphone, Pause, PhoneCall, Play, Users } from 'lucide-react';
import AdminLayout from '@/components/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type Contact = { name: string; phoneNumber: string };
type Campaign = { id: string; name: string; message: string; status: string; totalContacts: number; createdAt: string };
type PhoneNumber = { id: string; phoneNumber: string; friendlyName?: string; isActive: boolean };

export function parseDialerCsv(source: string): Contact[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"' && quoted && source[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && source[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const phoneIndex = headers.findIndex(value => ['phone', 'phonenumber', 'mobile', 'telephone'].includes(value));
  const nameIndex = headers.findIndex(value => ['name', 'fullname', 'contactname'].includes(value));
  const firstIndex = headers.indexOf('firstname'); const lastIndex = headers.indexOf('lastname');
  if (phoneIndex < 0) throw new Error('CSV needs a phone or phone_number column.');
  return rows.slice(1).map(values => ({
    phoneNumber: values[phoneIndex] || '',
    name: nameIndex >= 0 ? values[nameIndex] || '' : [values[firstIndex], values[lastIndex]].filter(Boolean).join(' '),
  })).filter(contact => contact.phoneNumber);
}

export default function AutoDialer() {
  const { toast } = useToast(); const queryClient = useQueryClient();
  const [name, setName] = useState(''); const [message, setMessage] = useState(''); const [transferKey, setTransferKey] = useState('1');
  const [callerIdNumberId, setCallerIdNumberId] = useState(''); const [contacts, setContacts] = useState<Contact[]>([]); const [fileName, setFileName] = useState('');
  const { data: campaigns = [] } = useQuery<Campaign[]>({ queryKey: ['/api/voip/auto-dialer/campaigns'], refetchInterval: 5000 });
  const { data: numbers = [] } = useQuery<PhoneNumber[]>({ queryKey: ['/api/voip/phone-numbers'] });
  const activeNumbers = useMemo(() => numbers.filter(number => number.isActive), [numbers]);
  const create = useMutation({
    mutationFn: () => apiRequest('POST', '/api/voip/auto-dialer/campaigns', { name, message, transferKey, callerIdNumberId, contacts }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/voip/auto-dialer/campaigns'] }); setName(''); setMessage(''); setContacts([]); setFileName(''); toast({ title: 'Campaign saved', description: 'Review it below, then start calling when your softphone is ready.' }); },
    onError: (error: any) => toast({ title: 'Could not save campaign', description: error.message, variant: 'destructive' }),
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'pause' }) => apiRequest('POST', `/api/voip/auto-dialer/campaigns/${id}/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/voip/auto-dialer/campaigns'] }),
    onError: (error: any) => toast({ title: 'Campaign update failed', description: error.message, variant: 'destructive' }),
  });
  const loadFile = async (file?: File) => {
    if (!file) return;
    try { const parsed = parseDialerCsv(await file.text()); if (!parsed.length) throw new Error('The CSV has no contacts.'); setContacts(parsed); setFileName(file.name); }
    catch (error: any) { setContacts([]); toast({ title: 'Could not read CSV', description: error.message, variant: 'destructive' }); }
  };
  return <AdminLayout><main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
    <div><div className="flex items-center gap-3"><div className="rounded-xl bg-blue-600 p-3 text-white"><Megaphone className="h-6 w-6" /></div><div><h1 className="text-3xl font-bold">Auto Dialer</h1><p className="text-muted-foreground">Upload a call list, play your message, and transfer interested callers to your softphone.</p></div></div></div>
    <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <Card><CardHeader><CardTitle>Create a voice campaign</CardTitle><CardDescription>Calls use your company Twilio account. Keep your browser softphone open to receive transfers.</CardDescription></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="campaign-name">Campaign name</Label><Input id="campaign-name" value={name} onChange={e => setName(e.target.value)} placeholder="September outreach" /></div><div><Label>Caller ID</Label><Select value={callerIdNumberId} onValueChange={setCallerIdNumberId}><SelectTrigger><SelectValue placeholder="Choose a company number" /></SelectTrigger><SelectContent>{activeNumbers.map(number => <SelectItem key={number.id} value={number.id}>{number.friendlyName || number.phoneNumber} · {number.phoneNumber}</SelectItem>)}</SelectContent></Select></div></div>
        <div><div className="flex justify-between"><Label htmlFor="voice-message">Automated message</Label><span className="text-xs text-muted-foreground">{message.length}/3000</span></div><Textarea id="voice-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={3000} rows={6} placeholder="Hello, this is Acme Services calling with an important update..." /><p className="mt-1 text-xs text-muted-foreground">Twilio reads this text aloud before offering the transfer.</p></div>
        <div className="max-w-xs"><Label>Transfer key</Label><Select value={transferKey} onValueChange={setTransferKey}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 10 }, (_, i) => String(i)).map(key => <SelectItem key={key} value={key}>Press {key} for an agent</SelectItem>)}</SelectContent></Select></div>
        <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed p-8 text-center hover:border-blue-400 hover:bg-blue-50/40"><FileUp className="mb-3 h-8 w-8 text-blue-600" /><span className="font-semibold">{fileName || 'Upload contact CSV'}</span><span className="mt-1 text-sm text-muted-foreground">Include phone or phone_number; name is optional</span><Input className="sr-only" type="file" accept=".csv,text/csv" onChange={e => loadFile(e.target.files?.[0])} /></label>
        {contacts.length > 0 && <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-800"><Users className="h-5 w-5" /><strong>{contacts.length.toLocaleString()} contacts ready</strong><span className="truncate text-sm">· {contacts.slice(0, 3).map(c => c.name || c.phoneNumber).join(', ')}</span></div>}
        <Button className="w-full" size="lg" disabled={!name || !message || !callerIdNumberId || !contacts.length || create.isPending} onClick={() => create.mutate()}><PhoneCall className="mr-2 h-5 w-5" />{create.isPending ? 'Saving…' : 'Save campaign'}</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Before you start</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><p><strong>1. Get consent.</strong> Only call people who have agreed to receive automated calls, and honor opt-outs and calling-hour rules.</p><p><strong>2. Open your softphone.</strong> When a person presses {transferKey}, their call rings the agent who created the campaign.</p><p><strong>3. Start small.</strong> Test with your own number and a short list before calling a full file.</p><div className="rounded-lg border bg-muted/30 p-4"><strong>CSV example</strong><pre className="mt-2 overflow-x-auto text-xs">name,phone_number{`\n`}Jane Doe,+14155550100</pre></div></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Campaigns</CardTitle><CardDescription>Pause prevents additional calls from being queued; calls already placed may finish.</CardDescription></CardHeader><CardContent><div className="space-y-3">{!campaigns.length && <p className="py-8 text-center text-muted-foreground">No voice campaigns yet.</p>}{campaigns.map(campaign => <div key={campaign.id} className="flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><strong>{campaign.name}</strong><Badge variant={campaign.status === 'RUNNING' ? 'default' : 'secondary'}>{campaign.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{campaign.totalContacts.toLocaleString()} contacts · {campaign.message.slice(0, 100)}{campaign.message.length > 100 ? '…' : ''}</p></div>{campaign.status === 'RUNNING' ? <Button variant="outline" onClick={() => changeStatus.mutate({ id: campaign.id, action: 'pause' })}><Pause className="mr-2 h-4 w-4" />Pause</Button> : campaign.status !== 'COMPLETED' && <Button onClick={() => changeStatus.mutate({ id: campaign.id, action: 'start' })}><Play className="mr-2 h-4 w-4" />{campaign.status === 'PAUSED' ? 'Resume' : 'Start calls'}</Button>}</div>)}</div></CardContent></Card>
  </main></AdminLayout>;
}
