import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import AdminLayout from "@/components/admin-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, CreditCard, GraduationCap, Landmark, Loader2, Plug, Plus, ReceiptText, RotateCcw, Users } from "lucide-react";
import { CAMPUS_INTEGRATIONS, CAMPUS_NOTIFICATION_TEMPLATES, DEFAULT_CAMPUS_CONFIG, type CampusConfig } from "@shared/campus";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const workspaceLinks = [
  { title: "Students", description: "Search student profiles and communication history.", href: "/consumers", icon: Users },
  { title: "Student Accounts", description: "Review balances and department-specific charges.", href: "/accounts", icon: GraduationCap },
  { title: "Payments & Plans", description: "Use existing payments, saved methods and recurring plans.", href: "/payments", icon: CreditCard },
  { title: "Documents", description: "Statements, uploads and signed student documents.", href: "/documents", icon: ReceiptText },
];

export default function Campus() {
  const { data: settings } = useQuery<any>({ queryKey: ["/api/settings"] });
  const config: CampusConfig = settings?.campusConfig || {};
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
          <TabsContent value="departments" className="mt-5"><DepartmentsPanel /></TabsContent>
          <TabsContent value="cashiering" className="mt-5"><FeaturePanel icon={Landmark} title="Campus Cashiering" description="Extends manual payments with cash, check, money order, card and other tenders." items={["Open Shift", "Record Payment", "Close Shift", "Daily Reconciliation", "Deposit Report", "Printable Receipt"]} /></TabsContent>
          <TabsContent value="refunds" className="mt-5"><FeaturePanel icon={RotateCcw} title="Refund Center" description="A controlled workflow reusing payment records and processor references." items={["Pending", "Approved", "Rejected", "Processed", "Completed"]} /></TabsContent>
          <TabsContent value="integrations" className="mt-5"><div className="grid gap-4 md:grid-cols-2">{CAMPUS_INTEGRATIONS.map((integration) => { const enabled = config.integrations?.[integration.id]?.enabled; return <Card key={integration.id} className="border-white/10 bg-white/5 text-white"><CardHeader className="flex-row items-center justify-between"><div className="flex items-center gap-3"><Plug className="h-5 w-5 text-sky-300" /><div><CardTitle className="text-base">{integration.name}</CardTitle><CardDescription className="text-slate-400">{integration.category}</CardDescription></div></div><Badge variant="outline" className={enabled ? "border-emerald-400/40 text-emerald-300" : "border-slate-600 text-slate-400"}>{enabled ? "Configured" : "Interface ready"}</Badge></CardHeader></Card>; })}</div><p className="mt-4 text-sm text-slate-400">Providers are configuration hooks only; no integration is hard-coded.</p></TabsContent>
          <TabsContent value="notifications" className="mt-5"><Card className="border-white/10 bg-white/5 text-white"><CardHeader><CardTitle>Campus notification templates</CardTitle><CardDescription className="text-slate-400">Delivered through Chain’s existing email and SMS notification engine.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{CAMPUS_NOTIFICATION_TEMPLATES.map((name) => <Badge key={name} className="bg-blue-400/15 text-blue-100">{name}</Badge>)}</CardContent></Card></TabsContent>
        </Tabs>
      </main>
    </AdminLayout>
  );
}

type Department = {
  id: string; name: string; code: string; description: string | null; color: string;
  isActive: boolean; accountCount: number; outstandingBalanceCents: number;
};

function DepartmentsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", description: "", color: "#2563eb" });
  const { data: departments = [], isLoading } = useQuery<Department[]>({ queryKey: ["/api/campus/departments"] });

  const createDepartment = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/campus/departments", form)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campus/departments"] });
      setForm({ name: "", code: "", description: "", color: "#2563eb" });
      setOpen(false);
      toast({ title: "Department created", description: "The department was added under this university." });
    },
    onError: (error: Error) => toast({ title: "Unable to create department", description: error.message, variant: "destructive" }),
  });
  const updateDepartment = useMutation({
    mutationFn: async ({ id, isActive }: Pick<Department, "id" | "isActive">) =>
      (await apiRequest("PATCH", `/api/campus/departments/${id}`, { isActive })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/campus/departments"] }),
    onError: (error: Error) => toast({ title: "Unable to update department", description: error.message, variant: "destructive" }),
  });

  return <div>
    <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div><h2 className="text-xl font-semibold">University departments</h2><p className="mt-1 text-sm text-slate-400">Departments share this university’s tenant, authentication, billing, branding, and data boundary.</p></div>
      <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="bg-blue-600 hover:bg-blue-500"><Plus className="mr-2 h-4 w-4" />Add department</Button></DialogTrigger>
        <DialogContent className="border-white/10 bg-slate-900 text-white"><DialogHeader><DialogTitle>Add university department</DialogTitle><DialogDescription className="text-slate-400">This creates a department inside the current university—not a separate organization.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="department-name">Name</Label><Input id="department-name" className="mt-1 border-white/15 bg-slate-950" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Student Accounts" /></div>
            <div><Label htmlFor="department-code">Code</Label><Input id="department-code" className="mt-1 border-white/15 bg-slate-950 uppercase" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="STUACCT" /></div>
            <div><Label htmlFor="department-description">Description</Label><Textarea id="department-description" className="mt-1 border-white/15 bg-slate-950" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
            <div><Label htmlFor="department-color">Dashboard color</Label><div className="mt-1 flex gap-2"><Input id="department-color" type="color" className="h-10 w-14 border-white/15 bg-slate-950 p-1" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /><Input className="border-white/15 bg-slate-950" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></div></div>
            <Button className="w-full bg-blue-600" disabled={!form.name.trim() || !form.code.trim() || createDepartment.isPending} onClick={() => createDepartment.mutate()}>{createDepartment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create department</Button>
          </div>
        </DialogContent></Dialog>
    </div>
    {isLoading ? <div className="flex justify-center p-12"><Loader2 className="h-7 w-7 animate-spin text-sky-300" /></div> : departments.length === 0 ?
      <Card className="border-dashed border-white/15 bg-white/5 text-center text-white"><CardContent className="p-10"><Building2 className="mx-auto h-9 w-9 text-slate-500" /><p className="mt-3 font-medium">No departments yet</p><p className="mt-1 text-sm text-slate-400">Add Student Accounts, Housing, Parking, or another university department.</p></CardContent></Card> :
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{departments.map((department) => <Card key={department.id} className={`border-white/10 bg-white/5 text-white ${!department.isActive ? "opacity-60" : ""}`}><CardHeader><div className="flex items-start justify-between"><div className="flex items-center gap-3"><span className="h-10 w-1 rounded-full" style={{ backgroundColor: department.color }} /><div><CardTitle className="text-base">{department.name}</CardTitle><CardDescription className="text-slate-400">{department.code}</CardDescription></div></div><Badge variant="outline" className={department.isActive ? "border-emerald-400/30 text-emerald-300" : "border-slate-500 text-slate-400"}>{department.isActive ? "Active" : "Inactive"}</Badge></div></CardHeader><CardContent><p className="min-h-10 text-sm text-slate-400">{department.description || "University department"}</p><div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-950/50 p-3"><div><p className="text-xs text-slate-500">Student accounts</p><p className="font-semibold">{department.accountCount}</p></div><div><p className="text-xs text-slate-500">Outstanding</p><p className="font-semibold">${(Number(department.outstandingBalanceCents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></div></div><Button variant="outline" size="sm" className="mt-4 w-full border-white/15 bg-transparent" disabled={updateDepartment.isPending} onClick={() => updateDepartment.mutate({ id: department.id, isActive: !department.isActive })}>{department.isActive ? "Deactivate" : "Reactivate"}</Button></CardContent></Card>)}</div>}
  </div>;
}

function FeaturePanel({ icon: Icon, title, description, items }: { icon: typeof Landmark; title: string; description: string; items: string[] }) {
  return <Card className="border-white/10 bg-white/5 text-white"><CardHeader><Icon className="h-7 w-7 text-sky-300" /><CardTitle className="pt-2">{title}</CardTitle><CardDescription className="text-slate-400">{description}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <div key={item} className="rounded-xl border border-white/10 bg-slate-950/50 p-4 text-sm">{item}<p className="mt-1 text-xs text-slate-500">Planned incremental workflow</p></div>)}</CardContent></Card>;
}
