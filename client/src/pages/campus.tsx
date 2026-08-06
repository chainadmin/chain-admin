import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, CreditCard, GraduationCap, Landmark, Plug, ReceiptText, RotateCcw, Users } from "lucide-react";
import { CAMPUS_DEPARTMENTS, CAMPUS_INTEGRATIONS, CAMPUS_NOTIFICATION_TEMPLATES, DEFAULT_CAMPUS_CONFIG, type CampusConfig } from "@shared/campus";

const workspaceLinks = [
  { title: "Students", description: "Search student profiles and communication history.", href: "/consumers", icon: Users },
  { title: "Student Accounts", description: "Review balances and department-specific charges.", href: "/accounts", icon: GraduationCap },
  { title: "Payments & Plans", description: "Use existing payments, saved methods and recurring plans.", href: "/payments", icon: CreditCard },
  { title: "Documents", description: "Statements, uploads and signed student documents.", href: "/documents", icon: ReceiptText },
];

export default function Campus() {
  const { data: settings } = useQuery<any>({ queryKey: ["/api/settings"] });
  const config: CampusConfig = settings?.campusConfig || {};
  const departments = config.departments?.length ? config.departments : DEFAULT_CAMPUS_CONFIG.departments;
  const universityName = config.universityName || "Your University";
  const primaryColor = config.primaryColor || DEFAULT_CAMPUS_CONFIG.primaryColor;

  return (
    <AdminLayout>
      <main className="h-full overflow-y-auto bg-slate-950 px-4 py-6 text-slate-100 sm:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-blue-700/40 via-indigo-700/20 to-slate-900 p-7 shadow-2xl">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-30 blur-3xl" style={{ backgroundColor: primaryColor }} />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <Badge className="mb-4 border-blue-300/30 bg-blue-400/15 text-blue-100">Higher Education module</Badge>
              <div className="flex items-center gap-3"><GraduationCap className="h-9 w-9 text-sky-300" /><h1 className="text-3xl font-bold">Chain Campus</h1></div>
              <p className="mt-2 text-lg text-blue-100">{universityName}</p>
              <p className="mt-3 max-w-2xl text-sm text-slate-300">One university workspace for student accounts, departments, payment plans, cashiering, refunds and integrations—powered by the existing Chain platform.</p>
            </div>
            <Link href="/settings"><Button className="bg-white text-slate-950 hover:bg-blue-50">Configure university</Button></Link>
          </div>
        </section>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList className="h-auto flex-wrap justify-start bg-white/5 p-1">
            <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="departments">Departments</TabsTrigger>
            <TabsTrigger value="cashiering">Cashiering</TabsTrigger><TabsTrigger value="refunds">Refund Center</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger><TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {workspaceLinks.map(({ title, description, href, icon: Icon }) => <Link href={href} key={title}><Card className="h-full cursor-pointer border-white/10 bg-white/5 text-white transition hover:-translate-y-0.5 hover:bg-white/10"><CardHeader><Icon className="h-6 w-6 text-sky-300" /><CardTitle className="pt-2 text-lg">{title}</CardTitle><CardDescription className="text-slate-400">{description}</CardDescription></CardHeader></Card></Link>)}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {["Today’s Payments", "Outstanding Balances", "Active Payment Plans", "Refund Queue", "Declined Payments", "Department Revenue", "Past Due Students", "Recent Activity"].map((label) => <Card key={label} className="border-white/10 bg-slate-900 text-white"><CardContent className="p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-2xl font-semibold">—</p><p className="mt-1 text-xs text-slate-500">Uses existing reporting data</p></CardContent></Card>)}
            </div>
          </TabsContent>
          <TabsContent value="departments" className="mt-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{departments.map((name) => <Card key={name} className="border-white/10 bg-white/5 text-white"><CardHeader className="flex-row items-center gap-3"><Building2 className="h-6 w-6 text-sky-300" /><div><CardTitle className="text-base">{name}</CardTitle><CardDescription className="text-slate-400">Revenue · Payments · Balances · Reports</CardDescription></div></CardHeader></Card>)}</div></TabsContent>
          <TabsContent value="cashiering" className="mt-5"><FeaturePanel icon={Landmark} title="Campus Cashiering" description="Extends manual payments with cash, check, money order, card and other tenders." items={["Open Shift", "Record Payment", "Close Shift", "Daily Reconciliation", "Deposit Report", "Printable Receipt"]} /></TabsContent>
          <TabsContent value="refunds" className="mt-5"><FeaturePanel icon={RotateCcw} title="Refund Center" description="A controlled workflow reusing payment records and processor references." items={["Pending", "Approved", "Rejected", "Processed", "Completed"]} /></TabsContent>
          <TabsContent value="integrations" className="mt-5"><div className="grid gap-4 md:grid-cols-2">{CAMPUS_INTEGRATIONS.map((integration) => { const enabled = config.integrations?.[integration.id]?.enabled; return <Card key={integration.id} className="border-white/10 bg-white/5 text-white"><CardHeader className="flex-row items-center justify-between"><div className="flex items-center gap-3"><Plug className="h-5 w-5 text-sky-300" /><div><CardTitle className="text-base">{integration.name}</CardTitle><CardDescription className="text-slate-400">{integration.category}</CardDescription></div></div><Badge variant="outline" className={enabled ? "border-emerald-400/40 text-emerald-300" : "border-slate-600 text-slate-400"}>{enabled ? "Configured" : "Interface ready"}</Badge></CardHeader></Card>; })}</div><p className="mt-4 text-sm text-slate-400">Providers are configuration hooks only; no integration is hard-coded.</p></TabsContent>
          <TabsContent value="notifications" className="mt-5"><Card className="border-white/10 bg-white/5 text-white"><CardHeader><CardTitle>Campus notification templates</CardTitle><CardDescription className="text-slate-400">Delivered through Chain’s existing email and SMS notification engine.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{CAMPUS_NOTIFICATION_TEMPLATES.map((name) => <Badge key={name} className="bg-blue-400/15 text-blue-100">{name}</Badge>)}</CardContent></Card></TabsContent>
        </Tabs>
      </main>
    </AdminLayout>
  );
}

function FeaturePanel({ icon: Icon, title, description, items }: { icon: typeof Landmark; title: string; description: string; items: string[] }) {
  return <Card className="border-white/10 bg-white/5 text-white"><CardHeader><Icon className="h-7 w-7 text-sky-300" /><CardTitle className="pt-2">{title}</CardTitle><CardDescription className="text-slate-400">{description}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <div key={item} className="rounded-xl border border-white/10 bg-slate-950/50 p-4 text-sm">{item}<p className="mt-1 text-xs text-slate-500">Planned incremental workflow</p></div>)}</CardContent></Card>;
}
