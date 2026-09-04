import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { VoipControlCenter } from "@/components/voip-control-center";
import { useAuth } from "@/hooks/useAuth";
import { isChiamoConnectPhoneShell } from "@/lib/app-detection";
import { canShowChainVoiceCommerce, getVoicePresentation } from "@/lib/chiamo-connect-presentation";
import { CHIAMO_SUPPORT_EMAIL } from "@shared/chiamo";
import {
  Phone,
  Users,
  Plus,
  Trash2,
  Star,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Settings,
  ExternalLink,
  DollarSign,
  Info,
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  Headphones,
  PhoneMissed,
  BarChart3,
} from "lucide-react";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface VoipPhoneNumber {
  id: string;
  tenantId: string;
  phoneNumber: string;
  areaCode: string;
  numberType: 'PRIMARY' | 'LOCAL_PRESENCE' | 'PORTED' | 'TOLL_FREE';
  friendlyName: string;
  twilioPhoneSid: string | null;
  isPrimary: boolean;
  isActive: boolean;
  capabilities: { voice: boolean; sms: boolean };
  createdAt: string;
  updatedAt: string | null;
}

interface AvailablePhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
}

type VoipBillingSummary = {
  voipEnabled: boolean;
  voipUserCount: number;
  localDidCount: number;
  tollFreeCount: number;
  entitlementStatus: "ACTIVE" | "SUSPENDED" | "CANCELLED";
} & ({
  billingOwner: "CHAIN";
  legacyChainBillingSuppressed: false;
  pricing: {
    userPriceCents: number;
    localDidPriceCents: number;
    tollFreePriceCents: number;
  };
  costs: {
    usersCostCents: number;
    localDidsCostCents: number;
    tollFreeCostCents: number;
    totalCostCents: number;
  };
} | {
  billingOwner: "CHIAMO";
  legacyChainBillingSuppressed: true;
  pricing: null;
  costs: null;
});

interface TeamMember {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  voipAccess: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface VoipCallLog {
  id: string;
  direction: 'inbound' | 'outbound';
  fromNumber: string;
  toNumber: string;
  status: string | null;
  duration: number | null;
  startedAt: string | null;
  createdAt: string;
}

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
};

const cardBaseClasses = "rounded-2xl border border-white/10 bg-white/5 text-blue-50 shadow-lg shadow-blue-900/20 backdrop-blur";
const inputClasses = "border-white/20 bg-white/10 text-white placeholder:text-blue-100/60 focus:border-sky-400/60 focus-visible:ring-sky-400/40";

export default function PhonesPage() {
  const { user, isJwtAuth } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showProvisionDialog, setShowProvisionDialog] = useState(false);
  const [provisionType, setProvisionType] = useState<'local' | 'toll_free'>('local');
  const [searchAreaCode, setSearchAreaCode] = useState("");
  const [availableNumbers, setAvailableNumbers] = useState<AvailablePhoneNumber[]>([]);
  const [searchingNumbers, setSearchingNumbers] = useState(false);
  const [unassignedNumbers, setUnassignedNumbers] = useState<{sid: string; phoneNumber: string; friendlyName: string; numberType: 'local' | 'toll_free'; areaCode: string}[]>([]);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);

  const { data: billingSummary, isLoading: loadingBilling, isError: billingError } = useQuery<VoipBillingSummary>({
    queryKey: ["/api/voip/billing-summary"],
  });
  const { data: authUser, isLoading: loadingAuthUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
    enabled: !isJwtAuth,
  });
  const isOwner = isJwtAuth ? (user as any)?.role === "owner" : authUser?.platformUser?.role === "owner";
  const voipAccess = isJwtAuth ? (user as any)?.voipAccess : authUser?.platformUser?.voipAccess;
  const connectShell = isChiamoConnectPhoneShell();
  const hasActiveVoiceEntitlement =
    billingSummary?.entitlementStatus === "ACTIVE" && billingSummary.voipEnabled;
  const voiceQueriesEnabled = !connectShell || hasActiveVoiceEntitlement;
  const showCallControl = !connectShell || hasActiveVoiceEntitlement;
  const showChainVoiceCommerce = canShowChainVoiceCommerce(billingSummary?.billingOwner);
  const presentation = getVoicePresentation({
    billingOwner: billingSummary?.billingOwner,
    entitlementStatus: billingSummary?.entitlementStatus,
    voipEnabled: billingSummary?.voipEnabled,
    isOwner,
    isLoading: loadingBilling || (!isJwtAuth && loadingAuthUser),
    hasError: billingError,
  });

  const { data: phoneNumbers = [], isLoading: loadingNumbers } = useQuery<VoipPhoneNumber[]>({
    queryKey: ["/api/voip/phone-numbers"],
    enabled: voiceQueriesEnabled,
  });
  const { data: localPresence } = useQuery<any>({
    queryKey: ["/api/voip/local-presence"],
    enabled: voiceQueriesEnabled && showChainVoiceCommerce,
  });
  const [selectedLocalPresencePackage, setSelectedLocalPresencePackage] = useState("");
  const requestLocalPresence = useMutation({
    mutationFn: () => apiRequest('POST', '/api/voip/local-presence/requests', { packageId: selectedLocalPresencePackage }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/voip/local-presence"] }); toast({ title: 'Request submitted', description: 'No numbers will be purchased until Global Admin reviews and approves coverage.' }); },
    onError: (error: any) => toast({ title: 'Request failed', description: error.message, variant: 'destructive' }),
  });

  const { data: teamMembers = [], isLoading: loadingTeamMembers } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const { data: callLogs = [], isLoading: loadingCallLogs } = useQuery<VoipCallLog[]>({
    queryKey: ["/api/voip/call-logs?limit=500"],
    enabled: voiceQueriesEnabled,
  });

  const callAnalytics = useMemo(() => {
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - 29);
    periodStart.setHours(0, 0, 0, 0);

    const callsInPeriod = callLogs.filter((call) => {
      const timestamp = call.startedAt || call.createdAt;
      return new Date(timestamp) >= periodStart;
    });
    const inbound = callsInPeriod.filter((call) => call.direction === 'inbound');
    const outbound = callsInPeriod.filter((call) => call.direction === 'outbound');
    const completed = callsInPeriod.filter((call) => call.status === 'completed');
    const missed = inbound.filter((call) => ['busy', 'no-answer', 'failed', 'canceled'].includes(call.status || ''));
    const totalDuration = completed.reduce((total, call) => total + (call.duration || 0), 0);

    const dailyMap = new Map<string, { label: string; inbound: number; outbound: number }>();
    for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - dayOffset);
      const key = format(date, 'yyyy-MM-dd');
      dailyMap.set(key, { label: format(date, 'EEE'), inbound: 0, outbound: 0 });
    }
    callsInPeriod.forEach((call) => {
      const key = format(new Date(call.startedAt || call.createdAt), 'yyyy-MM-dd');
      const day = dailyMap.get(key);
      if (day) day[call.direction] += 1;
    });

    return {
      total: callsInPeriod.length,
      inbound: inbound.length,
      outbound: outbound.length,
      missed: missed.length,
      answerRate: inbound.length ? Math.round(((inbound.length - missed.length) / inbound.length) * 100) : 0,
      averageDuration: completed.length ? Math.round(totalDuration / completed.length) : 0,
      totalDuration,
      daily: Array.from(dailyMap.values()),
      recent: callLogs.slice(0, 8),
    };
  }, [callLogs]);

  const enableVoipMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest('POST', '/api/voip/enable', { enabled });
    },
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/billing-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voip/phone-numbers"] });
      toast({
        title: connectShell ? "Calling updated" : "VoIP Updated",
        description: enabled ? (connectShell ? "Calling has been enabled. Add phone numbers from the Numbers tab." : "VoIP has been enabled. Add phone numbers from the Numbers tab.") : (connectShell ? "Calling has been disabled." : "VoIP has been disabled."),
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || (connectShell ? "Failed to update calling settings" : "Failed to update VoIP settings"),
        variant: "destructive",
      });
    },
  });

  const provisionNumberMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      return apiRequest('POST', '/api/voip/phone-numbers/provision', { 
        phoneNumber,
        numberType: provisionType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/phone-numbers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voip/billing-summary"] });
      setShowProvisionDialog(false);
      setAvailableNumbers([]);
      setSearchAreaCode("");
      toast({
        title: "Number Provisioned",
        description: "Phone number has been added to your account",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to provision phone number",
        variant: "destructive",
      });
    },
  });

  const assignNumberMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; twilioSid: string; numberType: 'local' | 'toll_free' }) => {
      return apiRequest('POST', '/api/voip/phone-numbers/assign', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/phone-numbers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voip/billing-summary"] });
      setShowProvisionDialog(false);
      setUnassignedNumbers([]);
      toast({
        title: "Number Assigned",
        description: "Phone number has been assigned to your company",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign phone number",
        variant: "destructive",
      });
    },
  });

  const deleteNumberMutation = useMutation({
    mutationFn: async (numberId: string) => {
      return apiRequest('DELETE', `/api/voip/phone-numbers/${numberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/phone-numbers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voip/billing-summary"] });
      toast({
        title: "Number Deleted",
        description: "Phone number has been removed from your account",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete phone number",
        variant: "destructive",
      });
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (numberId: string) => {
      return apiRequest('PUT', `/api/voip/phone-numbers/${numberId}/primary`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/phone-numbers"] });
      toast({
        title: "Primary Number Updated",
        description: "Primary caller ID has been updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set primary number",
        variant: "destructive",
      });
    },
  });

  const updateVoipAccessMutation = useMutation({
    mutationFn: async ({ memberId, voipAccess }: { memberId: string; voipAccess: boolean }) => {
      return apiRequest('PATCH', `/api/team-members/${memberId}`, { voipAccess });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voip/billing-summary"] });
      toast({
        title: "Access Updated",
        description: connectShell ? "Calling access has been updated" : "VoIP access has been updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || (connectShell ? "Failed to update calling access" : "Failed to update VoIP access"),
        variant: "destructive",
      });
    },
  });

  const fetchUnassignedNumbers = async () => {
    setLoadingUnassigned(true);
    try {
      const response = await apiRequest('GET', '/api/voip/unassigned-numbers');
      const data = await response.json();
      setUnassignedNumbers(data || []);
    } catch (error: any) {
      console.error("Failed to fetch unassigned numbers:", error);
      setUnassignedNumbers([]);
    } finally {
      setLoadingUnassigned(false);
    }
  };

  const searchAvailableNumbers = async () => {
    if (provisionType === 'local' && !searchAreaCode) {
      toast({
        title: "Area Code Required",
        description: "Please enter an area code to search for local numbers",
        variant: "destructive",
      });
      return;
    }

    setSearchingNumbers(true);
    try {
      const params = new URLSearchParams({
        type: provisionType,
        ...(provisionType === 'local' && { areaCode: searchAreaCode }),
      });
      const response = await apiRequest('GET', `/api/voip/phone-numbers/available?${params}`);
      const data = await response.json();
      setAvailableNumbers(data.numbers || []);
      if (data.numbers?.length === 0) {
        toast({
          title: "No Numbers Found",
          description: provisionType === 'local' 
            ? `No available numbers found for area code ${searchAreaCode}` 
            : "No toll-free numbers available at this time",
        });
      }
    } catch (error: any) {
      toast({
        title: "Search Failed",
        description: error.message || "Failed to search for available numbers",
        variant: "destructive",
      });
    } finally {
      setSearchingNumbers(false);
    }
  };

  const openSoftphone = () => {
    window.open('/softphone', '_blank', 'width=400,height=700,toolbar=no,menubar=no');
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {connectShell ? <div className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-r from-[#072f3d] via-[#084b57] to-[#10315a] p-6 shadow-2xl shadow-cyan-950/30">
          <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full border-[20px] border-cyan-200/10" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">Chain workspace / communications</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">{connectShell ? "Chiamo Connect" : "VoIP Phone System"}</h1>
            <p className="mt-1 max-w-xl text-cyan-50/75">{connectShell ? "Your company calling workspace, connected to the accounts and teams you already manage in Chain." : "Manage phone numbers, users, and VoIP settings"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`rounded-2xl border px-4 py-2 text-sm ${presentation.tone === "active" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : presentation.tone === "attention" ? "border-amber-200/30 bg-amber-200/10 text-amber-50" : "border-slate-200/20 bg-slate-200/10 text-slate-100"}`}>
              <span className="font-bold tracking-wide">{presentation.label}</span><span className="ml-2 hidden text-xs opacity-80 sm:inline">{presentation.detail}</span>
            </div>
            {presentation.action === "enable" ? <Button onClick={() => enableVoipMutation.mutate(true)} disabled={enableVoipMutation.isPending} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">Enable calling</Button> :
              presentation.action === "open-phone" && voipAccess !== false ? <Button onClick={openSoftphone} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"><ExternalLink className="mr-2 h-4 w-4" />Open phone</Button> :
              presentation.action === "contact-chiamo" ? <a href={`mailto:${CHIAMO_SUPPORT_EMAIL}`} className="inline-flex min-h-10 items-center rounded-md bg-cyan-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-[#084b57]">Contact Chiamo Connect</a> :
              <p className="max-w-xs text-sm text-cyan-50/80">{presentation.detail}</p>}
          </div>
          </div>
        </div> : <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">VoIP Phone System</h1>
            <p className="mt-1 text-blue-100/60">Manage phone numbers, users, and VoIP settings</p>
          </div>
          <Button onClick={openSoftphone} className="bg-sky-500 text-white hover:bg-sky-600">
            <ExternalLink className="mr-2 h-4 w-4" />Open Softphone
          </Button>
        </div>}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4 lg:w-[960px]">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" /> Settings
            </TabsTrigger>
            <TabsTrigger value="numbers" className="flex items-center gap-2">
              <Phone className="h-4 w-4" /> Numbers
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Users
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Billing
            </TabsTrigger>
            {showChainVoiceCommerce && (
              <TabsTrigger value="local-presence" className="flex items-center gap-2">
                <Phone className="h-4 w-4" /> Local Presence
              </TabsTrigger>
            )}
            {showCallControl && (
              <TabsTrigger value="call-control" className="flex items-center gap-2">
                <Settings className="h-4 w-4" /> Call Control
              </TabsTrigger>
            )}
          </TabsList>

          {/* Call Analytics Dashboard */}
          <TabsContent value="dashboard" className="mt-6 space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-white">Call activity</h2>
              <p className="mt-1 text-sm text-blue-100/60">A 30-day overview of inbound and outbound phone activity.</p>
            </div>

            {loadingCallLogs ? (
              <Card className={cardBaseClasses}>
                <CardContent className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-300" />
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card className={cardBaseClasses}>
                    <CardContent className="flex items-start justify-between p-5">
                      <div><p className="text-sm text-blue-100/60">Total calls</p><p className="mt-2 text-3xl font-bold text-white">{callAnalytics.total.toLocaleString()}</p><p className="mt-1 text-xs text-blue-100/50">Last 30 days</p></div>
                      <div className="rounded-xl bg-sky-500/15 p-3 text-sky-300"><Phone className="h-5 w-5" /></div>
                    </CardContent>
                  </Card>
                  <Card className={cardBaseClasses}>
                    <CardContent className="flex items-start justify-between p-5">
                      <div><p className="text-sm text-blue-100/60">Inbound</p><p className="mt-2 text-3xl font-bold text-white">{callAnalytics.inbound.toLocaleString()}</p><p className="mt-1 text-xs text-emerald-300/80">{callAnalytics.answerRate}% answer rate</p></div>
                      <div className="rounded-xl bg-emerald-500/15 p-3 text-emerald-300"><ArrowDownLeft className="h-5 w-5" /></div>
                    </CardContent>
                  </Card>
                  <Card className={cardBaseClasses}>
                    <CardContent className="flex items-start justify-between p-5">
                      <div><p className="text-sm text-blue-100/60">Outbound</p><p className="mt-2 text-3xl font-bold text-white">{callAnalytics.outbound.toLocaleString()}</p><p className="mt-1 text-xs text-blue-100/50">Calls placed</p></div>
                      <div className="rounded-xl bg-violet-500/15 p-3 text-violet-300"><ArrowUpRight className="h-5 w-5" /></div>
                    </CardContent>
                  </Card>
                  <Card className={cardBaseClasses}>
                    <CardContent className="flex items-start justify-between p-5">
                      <div><p className="text-sm text-blue-100/60">Missed inbound</p><p className="mt-2 text-3xl font-bold text-white">{callAnalytics.missed.toLocaleString()}</p><p className="mt-1 text-xs text-blue-100/50">Busy, failed, or unanswered</p></div>
                      <div className="rounded-xl bg-rose-500/15 p-3 text-rose-300"><PhoneMissed className="h-5 w-5" /></div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
                  <Card className={cardBaseClasses}>
                    <CardHeader><CardTitle className="text-white">Calls this week</CardTitle><CardDescription className="text-blue-100/60">Daily inbound and outbound volume</CardDescription></CardHeader>
                    <CardContent className="h-[300px] pl-0 sm:pl-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={callAnalytics.daily} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#bfdbfe', fontSize: 12 }} />
                          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#bfdbfe', fontSize: 12 }} />
                          <Tooltip contentStyle={{ background: '#111c33', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, color: '#fff' }} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
                          <Legend wrapperStyle={{ color: '#dbeafe', fontSize: 12 }} />
                          <Bar dataKey="inbound" name="Inbound" fill="#34d399" radius={[5, 5, 0, 0]} />
                          <Bar dataKey="outbound" name="Outbound" fill="#818cf8" radius={[5, 5, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className={cardBaseClasses}>
                    <CardHeader><CardTitle className="text-white">Conversation time</CardTitle><CardDescription className="text-blue-100/60">Completed calls in the last 30 days</CardDescription></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-2 text-sm text-blue-100/60"><Clock3 className="h-4 w-4 text-sky-300" />Total talk time</div><p className="mt-2 text-2xl font-bold text-white">{formatDuration(callAnalytics.totalDuration)}</p></div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-2 text-sm text-blue-100/60"><Headphones className="h-4 w-4 text-violet-300" />Average call</div><p className="mt-2 text-2xl font-bold text-white">{formatDuration(callAnalytics.averageDuration)}</p></div>
                    </CardContent>
                  </Card>
                </div>

                <Card className={cardBaseClasses}>
                  <CardHeader><CardTitle className="text-white">Recent calls</CardTitle><CardDescription className="text-blue-100/60">Latest phone activity across your team</CardDescription></CardHeader>
                  <CardContent>
                    {callAnalytics.recent.length === 0 ? (
                      <div className="py-10 text-center text-blue-100/60"><Phone className="mx-auto mb-3 h-10 w-10 opacity-40" /><p>No calls have been recorded yet.</p></div>
                    ) : (
                      <div className="overflow-x-auto"><Table>
                        <TableHeader><TableRow className="border-white/10"><TableHead className="text-blue-100/60">Direction</TableHead><TableHead className="text-blue-100/60">From</TableHead><TableHead className="text-blue-100/60">To</TableHead><TableHead className="text-blue-100/60">Status</TableHead><TableHead className="text-blue-100/60">Duration</TableHead><TableHead className="text-right text-blue-100/60">Date</TableHead></TableRow></TableHeader>
                        <TableBody>{callAnalytics.recent.map((call) => <TableRow key={call.id} className="border-white/10">
                          <TableCell><span className={`inline-flex items-center gap-1.5 font-medium ${call.direction === 'inbound' ? 'text-emerald-300' : 'text-violet-300'}`}>{call.direction === 'inbound' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}{call.direction === 'inbound' ? 'Inbound' : 'Outbound'}</span></TableCell>
                          <TableCell className="font-mono text-blue-50">{call.fromNumber}</TableCell><TableCell className="font-mono text-blue-50">{call.toNumber}</TableCell>
                          <TableCell><Badge className={call.status === 'completed' ? 'border-emerald-400/30 bg-emerald-500/20 text-emerald-300' : ['failed', 'busy', 'no-answer', 'canceled'].includes(call.status || '') ? 'border-rose-400/30 bg-rose-500/20 text-rose-300' : 'border-sky-400/30 bg-sky-500/20 text-sky-300'}>{(call.status || 'unknown').replace('-', ' ')}</Badge></TableCell>
                          <TableCell className="text-blue-100/80">{formatDuration(call.duration || 0)}</TableCell><TableCell className="whitespace-nowrap text-right text-blue-100/60">{format(new Date(call.startedAt || call.createdAt), 'MMM d, h:mm a')}</TableCell>
                        </TableRow>)}</TableBody>
                      </Table></div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {showCallControl && <TabsContent value="call-control" className="mt-6">
            <VoipControlCenter tone={connectShell ? "chiamo" : "chain"} />
          </TabsContent>}

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-6">
            <Card className={cardBaseClasses}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between text-white">
                  <span>{connectShell ? "Chiamo Connect service" : "VoIP Phone System"}</span>
                  {billingSummary?.billingOwner === "CHIAMO" ? (
                    <Badge className="border border-sky-400/30 bg-sky-500/20 text-sky-100">
                      Managed through Chiamo Connect
                    </Badge>
                  ) : billingSummary?.billingOwner === "CHAIN" && isOwner ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-normal text-blue-100/60">
                        {billingSummary?.voipEnabled ? "Enabled" : "Disabled"}
                      </span>
                      <Switch
                        checked={billingSummary?.voipEnabled || false}
                        onCheckedChange={(checked) => enableVoipMutation.mutate(checked)}
                        disabled={enableVoipMutation.isPending}
                      />
                    </div>
                  ) : billingSummary?.billingOwner === "CHAIN" ? (
                    <Badge className="border border-white/20 bg-white/10 text-blue-50">Owner access required</Badge>
                  ) : (
                    <Badge className="border border-amber-200/30 bg-amber-200/10 text-amber-50">
                      {billingError ? "Access unavailable" : "Checking access"}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-blue-100/70">
                  {billingSummary?.billingOwner === "CHIAMO"
                    ? "Phone access and billing are managed through your Chiamo Connect subscription. Chain does not add a separate calling charge."
                    : billingSummary?.billingOwner === "CHAIN" && billingSummary.voipEnabled
                    ? (connectShell ? "Calling is enabled. Add phone numbers from the Numbers tab to start making calls." : "VoIP is enabled. Add phone numbers from the Numbers tab to start making calls.")
                    : billingSummary?.billingOwner === "CHAIN" && isOwner
                    ? "Enable calling to configure numbers and give your team access."
                    : billingSummary?.billingOwner === "CHAIN"
                    ? "An account owner can activate calling and configure access for your team."
                    : presentation.detail}
                </CardDescription>
              </CardHeader>
              {enableVoipMutation.isPending && (
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-blue-100/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {billingSummary?.voipEnabled ? (connectShell ? "Disabling calling..." : "Disabling VoIP...") : (connectShell ? "Enabling calling..." : "Enabling VoIP...")}
                  </div>
                </CardContent>
              )}
            </Card>

            {billingSummary?.voipEnabled && (
              <Card className={`mt-6 ${cardBaseClasses}`}>
                <CardHeader>
                  <CardTitle className="text-white">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="text-3xl font-bold text-white">{billingSummary.voipUserCount}</div>
                      <div className="text-sm text-blue-100/60">Active Users</div>
                    </div>
                    <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="text-3xl font-bold text-white">{phoneNumbers.length}</div>
                      <div className="text-sm text-blue-100/60">Phone Numbers</div>
                    </div>
                    <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="text-3xl font-bold text-white">{billingSummary.localDidCount}</div>
                      <div className="text-sm text-blue-100/60">Local DIDs</div>
                    </div>
                    <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="text-3xl font-bold text-white">{billingSummary.tollFreeCount}</div>
                      <div className="text-sm text-blue-100/60">Toll-Free</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Phone Numbers Tab */}
          {showChainVoiceCommerce && <TabsContent value="local-presence" className="mt-6">
            <Card className={cardBaseClasses}>
              <CardHeader><CardTitle className="text-white">Local Presence</CardTitle><CardDescription className="text-blue-100/60">Use dedicated local business numbers based on the area you are calling.</CardDescription></CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap gap-3 text-sm"><Badge>{localPresence?.request?.status || 'NOT ENABLED'}</Badge>{localPresence?.request && <span className="text-blue-100/70">Current request is under internal review. Provider cost is never displayed here.</span>}</div>
                {!localPresence?.request || ['FAILED','CANCELLED'].includes(localPresence.request.status) ? <>
                  <div className="grid gap-3 md:grid-cols-3">{(localPresence?.packages || []).map((pkg: any) => <button key={pkg.id} type="button" onClick={() => setSelectedLocalPresencePackage(pkg.id)} className={`rounded-xl border p-4 text-left ${selectedLocalPresencePackage === pkg.id ? 'border-sky-400 bg-sky-500/15' : 'border-white/10 bg-white/5'}`}><p className="font-semibold text-white">{pkg.name}</p><p className="mt-1 text-sm text-blue-100/60">{pkg.description}</p><p className="mt-3 text-blue-200">${(pkg.customerMonthlyPriceCents / 100).toFixed(2)}/month</p></button>)}</div>
                  <Button disabled={!selectedLocalPresencePackage || requestLocalPresence.isPending} onClick={() => requestLocalPresence.mutate()} className="bg-sky-500 hover:bg-sky-600">{requestLocalPresence.isPending ? 'Submitting…' : 'Submit Request'}</Button>
                </> : <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="font-medium text-white">Current status: {localPresence.request.status.replaceAll('_', ' ')}</p><p className="mt-1 text-sm text-blue-100/60">Provisioning begins only after coverage, availability, cost, and Global Admin approval reviews.</p></div>}
              </CardContent>
            </Card>
          </TabsContent>}

          {/* Phone Numbers Tab */}
          <TabsContent value="numbers" className="mt-6">
            <Card className={cardBaseClasses}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white">Phone Numbers</CardTitle>
                    <CardDescription className="text-blue-100/60">
                    {connectShell ? "Manage your company calling numbers" : "Manage your VoIP phone numbers"}
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => setShowProvisionDialog(true)}
                    disabled={!billingSummary?.voipEnabled}
                    className="bg-sky-500 hover:bg-sky-600"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Number
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingNumbers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-100/60" />
                  </div>
                ) : phoneNumbers.length === 0 ? (
                  <div className="text-center py-8 text-blue-100/60">
                    <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No phone numbers configured</p>
                    <p className="text-sm">Click "Add Number" to search and select your phone numbers</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead className="text-blue-100/60">Phone Number</TableHead>
                        <TableHead className="text-blue-100/60">Type</TableHead>
                        <TableHead className="text-blue-100/60">Name</TableHead>
                        <TableHead className="text-blue-100/60">Status</TableHead>
                        <TableHead className="text-blue-100/60">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {phoneNumbers.map((number) => (
                        <TableRow key={number.id} className="border-white/10">
                          <TableCell className="text-white font-mono">
                            {number.phoneNumber}
                            {number.isPrimary && (
                              <Badge className="ml-2 bg-amber-500/20 text-amber-300 border-amber-400/30">
                                <Star className="h-3 w-3 mr-1" />
                                Primary
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={number.numberType === 'TOLL_FREE'
                              ? "bg-green-500/20 text-green-300 border-green-400/30"
                              : "bg-blue-500/20 text-blue-300 border-blue-400/30"
                            }>
                              {number.numberType === 'TOLL_FREE' ? 'Toll-Free' : 'Local'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-blue-100/80">{number.friendlyName || '-'}</TableCell>
                          <TableCell>
                            {number.isActive ? (
                              <Badge className="bg-green-500/20 text-green-300 border-green-400/30">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/20 text-red-300 border-red-400/30">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Inactive
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {!number.isPrimary && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setPrimaryMutation.mutate(number.id)}
                                  disabled={setPrimaryMutation.isPending}
                                  className="text-amber-300 hover:text-amber-200 hover:bg-amber-500/20"
                                  aria-label={`Set ${number.phoneNumber} as primary number`}
                                >
                                  <Star className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteNumberMutation.mutate(number.id)}
                                disabled={deleteNumberMutation.isPending || number.isPrimary}
                                className="text-red-300 hover:text-red-200 hover:bg-red-500/20"
                                  aria-label={`Remove ${number.phoneNumber}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-6">
            <Card className={cardBaseClasses}>
              <CardHeader>
                <CardTitle className="text-white">{connectShell ? "Chiamo Connect user access" : "VoIP User Access"}</CardTitle>
                <CardDescription className="text-blue-100/60">
                  {billingSummary?.billingOwner === "CHIAMO"
                    ? "Manage which team members can use the shared calling workspace. Subscription details are managed through Chiamo Connect."
                    : billingSummary?.billingOwner === "CHAIN" && connectShell
                    ? "Manage which team members can use the shared calling workspace. Each enabled user costs $80/month."
                    : billingSummary?.billingOwner === "CHAIN"
                    ? "Manage which team members can use the softphone. Each enabled user costs $80/month."
                    : presentation.detail}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingTeamMembers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-100/60" />
                  </div>
                ) : teamMembers.length === 0 ? (
                  <div className="text-center py-8 text-blue-100/60">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No team members found</p>
                    <p className="text-sm">{connectShell ? "Add team members in Settings to give them calling access" : "Add team members in Settings to give them VoIP access"}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead className="text-blue-100/60">Name</TableHead>
                        <TableHead className="text-blue-100/60">Username</TableHead>
                        <TableHead className="text-blue-100/60">Role</TableHead>
                        <TableHead className="text-blue-100/60">Status</TableHead>
                        <TableHead className="text-blue-100/60">{connectShell ? "Calling access" : "VoIP Access"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamMembers.map((member) => (
                        <TableRow key={member.id} className="border-white/10">
                          <TableCell className="text-white">
                            {member.firstName || member.lastName 
                              ? `${member.firstName || ''} ${member.lastName || ''}`.trim()
                              : member.email || member.username
                            }
                          </TableCell>
                          <TableCell className="text-blue-100/80">{member.username}</TableCell>
                          <TableCell>
                            <Badge className={
                              member.role === 'owner' 
                                ? "bg-purple-500/20 text-purple-300 border-purple-400/30"
                                : member.role === 'manager'
                                ? "bg-blue-500/20 text-blue-300 border-blue-400/30"
                                : "bg-gray-500/20 text-gray-300 border-gray-400/30"
                            }>
                              {member.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {member.isActive ? (
                              <Badge className="bg-green-500/20 text-green-300 border-green-400/30">Active</Badge>
                            ) : (
                              <Badge className="bg-red-500/20 text-red-300 border-red-400/30">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {member.role === 'owner' ? (
                              <Badge className="bg-green-500/20 text-green-300 border-green-400/30">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Always Enabled
                              </Badge>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={member.voipAccess}
                                  onCheckedChange={(checked) => 
                                    updateVoipAccessMutation.mutate({ memberId: member.id, voipAccess: checked })
                                  }
                                  disabled={updateVoipAccessMutation.isPending || !billingSummary?.voipEnabled}
                                />
                                {!billingSummary?.voipEnabled && (
                                  <span className="flex items-center gap-1 text-xs text-amber-300/70" title={connectShell ? "Enable calling in Settings to manage user access" : "Enable VoIP in Settings to manage user access"}>
                                    <Info className="h-3 w-3" />
                                    {connectShell ? "Calling disabled" : "VoIP disabled"}
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="mt-6">
            <Card className={cardBaseClasses}>
              <CardHeader>
                <CardTitle className="text-white">{connectShell ? "Chiamo Connect billing" : "VoIP Billing Summary"}</CardTitle>
                <CardDescription className="text-blue-100/60">
                  {connectShell ? "Monthly calling costs for your company workspace" : "Monthly costs for your VoIP phone system"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingBilling ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-100/60" />
                  </div>
                ) : billingSummary?.billingOwner === "CHIAMO" ? (
                  <div className="rounded-lg border border-sky-400/30 bg-sky-500/10 p-6 text-center text-sky-100">
                    <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-70" />
                    <p className="font-medium">Managed through Chiamo Connect</p>
                    <p className="mt-1 text-sm text-blue-100/70">
                      Your Chiamo Connect subscription owns phone billing. Chain does not add a separate calling charge.
                    </p>
                  </div>
                ) : billingSummary?.billingOwner !== "CHAIN" ? (
                  <div className="rounded-lg border border-amber-200/30 bg-amber-200/10 p-6 text-center text-amber-50">
                    <AlertCircle className="mx-auto mb-3 h-10 w-10 opacity-70" />
                    <p className="font-medium">Billing status unavailable</p>
                    <p className="mt-1 text-sm text-blue-100/70">{presentation.detail}</p>
                  </div>
                ) : !billingSummary.voipEnabled ? (
                  <div className="text-center py-8 text-blue-100/60">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{connectShell ? "Calling is not enabled" : "VoIP is not enabled"}</p>
                    <p className="text-sm">{connectShell ? "Enable calling in Settings to see billing information" : "Enable VoIP in Settings to see billing information"}</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="text-2xl font-bold text-white">{billingSummary.voipUserCount}</div>
                        <div className="text-sm text-blue-100/60">{connectShell ? "Calling users" : "VoIP Users"}</div>
                        <div className="text-xs text-blue-100/40 mt-1">
                          ${(billingSummary.costs.usersCostCents / 100).toFixed(2)}/mo
                        </div>
                      </div>
                      <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="text-2xl font-bold text-white">{billingSummary.localDidCount}</div>
                        <div className="text-sm text-blue-100/60">Local DIDs</div>
                        <div className="text-xs text-blue-100/40 mt-1">
                          ${(billingSummary.costs.localDidsCostCents / 100).toFixed(2)}/mo
                        </div>
                      </div>
                      <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="text-2xl font-bold text-white">{billingSummary.tollFreeCount}</div>
                        <div className="text-sm text-blue-100/60">Toll-Free</div>
                        <div className="text-xs text-blue-100/40 mt-1">
                          ${(billingSummary.costs.tollFreeCostCents / 100).toFixed(2)}/mo
                        </div>
                      </div>
                      <div className="text-center p-4 bg-sky-500/20 rounded-lg border border-sky-400/30">
                        <div className="text-2xl font-bold text-white">
                          ${(billingSummary.costs.totalCostCents / 100).toFixed(2)}
                        </div>
                        <div className="text-sm text-blue-100/60">Total/Month</div>
                      </div>
                    </div>

                    <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                      <h4 className="text-white font-medium mb-3">Pricing</h4>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-blue-100/60">Per User:</span>
                          <span className="text-white ml-2">${(billingSummary.pricing.userPriceCents / 100).toFixed(2)}/mo</span>
                        </div>
                        <div>
                          <span className="text-blue-100/60">Local DID:</span>
                          <span className="text-white ml-2">${(billingSummary.pricing.localDidPriceCents / 100).toFixed(2)}/mo</span>
                        </div>
                        <div>
                          <span className="text-blue-100/60">Toll-Free:</span>
                          <span className="text-white ml-2">${(billingSummary.pricing.tollFreePriceCents / 100).toFixed(2)}/mo</span>
                        </div>
                      </div>
                      <p className="text-xs text-blue-100/40 mt-3">
                        Local: $5/month, Toll-Free: $10/month
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Provision Number Dialog */}
      <Dialog open={showProvisionDialog} onOpenChange={(open) => {
        setShowProvisionDialog(open);
        if (open) {
          fetchUnassignedNumbers();
        }
      }}>
        <DialogContent className="bg-[#0f1629] border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Phone Number</DialogTitle>
            <DialogDescription className="text-blue-100/60">
              Select from available numbers or search for new ones
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Show unassigned numbers at the top */}
            {loadingUnassigned ? (
              <div className="flex items-center gap-2 text-sm text-blue-100/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking for available numbers...
              </div>
            ) : unassignedNumbers.length > 0 && (
              <div className="space-y-2">
                <Label className="text-green-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Available Numbers (Already Owned - No Additional Cost)
                </Label>
                <div className="max-h-[200px] overflow-y-auto space-y-2">
                  {unassignedNumbers.map((number) => (
                    <div 
                      key={number.phoneNumber}
                      className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border border-green-400/30"
                    >
                      <div>
                        <div className="font-mono text-white">{number.phoneNumber}</div>
                        <div className="text-xs text-blue-100/60">
                          {number.numberType === 'toll_free' ? 'Toll-Free' : `Local (${number.areaCode})`}
                          {number.friendlyName && ` · ${number.friendlyName}`}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => assignNumberMutation.mutate({ phoneNumber: number.phoneNumber, twilioSid: number.sid, numberType: number.numberType })}
                        disabled={assignNumberMutation.isPending}
                        className="bg-green-500 hover:bg-green-600"
                      >
                        {assignNumberMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-1" />
                            Use This
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Divider if there are unassigned numbers */}
            {unassignedNumbers.length > 0 && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#0f1629] px-2 text-blue-100/40">Or purchase a new number</span>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <Button
                variant={provisionType === 'local' ? 'default' : 'outline'}
                onClick={() => {
                  setProvisionType('local');
                  setAvailableNumbers([]);
                }}
                className={provisionType === 'local' 
                  ? "bg-sky-500 hover:bg-sky-600" 
                  : "border-white/20 text-white hover:bg-white/10"
                }
              >
                Local Number
              </Button>
              <Button
                variant={provisionType === 'toll_free' ? 'default' : 'outline'}
                onClick={() => {
                  setProvisionType('toll_free');
                  setAvailableNumbers([]);
                }}
                className={provisionType === 'toll_free' 
                  ? "bg-sky-500 hover:bg-sky-600" 
                  : "border-white/20 text-white hover:bg-white/10"
                }
              >
                Toll-Free Number
              </Button>
            </div>

            {provisionType === 'local' && (
              <div className="space-y-2">
                <Label className="text-blue-100/80">Area Code</Label>
                <div className="flex gap-2">
                  <Input
                    value={searchAreaCode}
                    onChange={(e) => setSearchAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="e.g. 212"
                    className={inputClasses}
                    maxLength={3}
                  />
                  <Button 
                    onClick={searchAvailableNumbers}
                    disabled={searchingNumbers || searchAreaCode.length < 3}
                    className="bg-sky-500 hover:bg-sky-600"
                  >
                    {searchingNumbers ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                  </Button>
                </div>
              </div>
            )}

            {provisionType === 'toll_free' && (
              <Button 
                onClick={searchAvailableNumbers}
                disabled={searchingNumbers}
                className="bg-sky-500 hover:bg-sky-600"
              >
                {searchingNumbers ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Search Available Toll-Free Numbers
              </Button>
            )}

            {availableNumbers.length > 0 && (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                <Label className="text-blue-100/80">Available Numbers (New Purchase)</Label>
                {availableNumbers.map((number) => (
                  <div 
                    key={number.phoneNumber}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                  >
                    <div>
                      <div className="font-mono text-white">{number.phoneNumber}</div>
                      <div className="text-xs text-blue-100/60">
                        {number.locality && `${number.locality}, `}{number.region}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => provisionNumberMutation.mutate(number.phoneNumber)}
                      disabled={provisionNumberMutation.isPending}
                      className="bg-green-500 hover:bg-green-600"
                    >
                      {provisionNumberMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowProvisionDialog(false);
                setAvailableNumbers([]);
                setSearchAreaCode("");
                setUnassignedNumbers([]);
              }}
              className="border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
