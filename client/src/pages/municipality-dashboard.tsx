import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Mail, MessageSquare, CheckCircle, Eye, Megaphone } from 'lucide-react';

type Stats = { totalContacts: number; email: { sent: number; opened: number; bounced: number }; sms: { sent: number; delivered: number; failed: number } };

export default function MunicipalityDashboard() {
  const { data: stats } = useQuery<Stats>({ queryKey: ['/api/municipality/dashboard-stats'] });
  const { data: emailCampaigns = [] } = useQuery<any[]>({ queryKey: ['/api/email-campaigns'] });
  const { data: smsCampaigns = [] } = useQuery<any[]>({ queryKey: ['/api/sms-campaigns'] });
  const campaigns = [...emailCampaigns.map(c => ({ ...c, channel: 'Email' })), ...smsCampaigns.map(c => ({ ...c, channel: 'SMS' }))]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const sent = (stats?.email.sent || 0) + (stats?.sms.sent || 0);
  const delivered = Math.max(0, (stats?.email.sent || 0) - (stats?.email.bounced || 0)) + (stats?.sms.delivered || 0);
  const deliveryRate = sent ? Math.round((delivered / sent) * 100) : 0;
  const cards = [
    { label: 'Total Contacts', value: stats?.totalContacts || 0, icon: Users },
    { label: 'Emails Sent', value: stats?.email.sent || 0, icon: Mail },
    { label: 'SMS Sent', value: stats?.sms.sent || 0, icon: MessageSquare },
    { label: 'Delivery Rate', value: `${deliveryRate}%`, icon: CheckCircle },
    { label: 'Email Opens', value: stats?.email.opened || 0, icon: Eye },
  ];

  return <AdminLayout><main className="mx-auto max-w-7xl space-y-8 px-4 py-8 text-white">
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-sky-900/70 to-indigo-950/80 p-8">
      <p className="text-sm font-semibold uppercase tracking-widest text-sky-300">Municipality communications</p>
      <h1 className="mt-2 text-3xl font-bold">Community communications dashboard</h1>
      <p className="mt-2 max-w-2xl text-blue-100/70">Reach residents, manage notifications, and monitor campaign engagement.</p>
      <div className="mt-6 flex gap-3"><Link href="/communications?tab=campaigns"><Button><Megaphone className="mr-2 h-4 w-4" />Campaigns</Button></Link><Link href="/consumers"><Button variant="outline">Manage contacts</Button></Link></div>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{cards.map(({ label, value, icon: Icon }) => <Card key={label} className="border-white/10 bg-white/5 text-white"><CardContent className="pt-6"><Icon className="h-5 w-5 text-sky-300" /><p className="mt-4 text-sm text-blue-100/60">{label}</p><p className="mt-1 text-3xl font-semibold">{value.toLocaleString()}</p></CardContent></Card>)}</section>
    <Card className="border-white/10 bg-white/5 text-white"><CardHeader><CardTitle>Recent campaigns</CardTitle></CardHeader><CardContent className="space-y-3">{campaigns.slice(0, 8).map(c => <div key={`${c.channel}-${c.id}`} className="flex items-center justify-between rounded-xl border border-white/10 p-4"><div><p className="font-medium">{c.name}</p><p className="text-sm text-blue-100/60">{c.channel} · {c.totalSent || 0} sent</p></div><span className="rounded-full bg-sky-500/15 px-3 py-1 text-xs text-sky-200">{c.status || 'draft'}</span></div>)}{!campaigns.length && <p className="py-8 text-center text-blue-100/60">No campaigns yet.</p>}</CardContent></Card>
  </main></AdminLayout>;
}
