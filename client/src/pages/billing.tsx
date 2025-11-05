import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  CreditCard,
  DollarSign,
  Calendar,
  Users,
  TrendingUp,
  FileText,
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";

export default function Billing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [updateBillingOpen, setUpdateBillingOpen] = useState(false);
  const [isSavingBilling, setIsSavingBilling] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);

  // Fetch billing statistics
  const { data: billingStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/billing/stats"],
  });

  // Fetch subscription details
  const { data: subscription, isLoading: subscriptionLoading } = useQuery({
    queryKey: ["/api/billing/subscription"],
  });

  // Fetch invoices
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/billing/invoices"],
  });

  // Fetch current invoice
  const { data: currentInvoice } = useQuery({
    queryKey: ["/api/billing/current-invoice"],
  });

  const { data: planResponse, isLoading: plansLoading } = useQuery({
    queryKey: ["/api/billing/plans"],
  });

  const formatCurrency = (amount?: number | null) => {
    const numericAmount = Number(amount ?? 0);
    return `$${numericAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
      case "paid":
        return "border border-emerald-400/40 bg-emerald-500/20 text-emerald-100";
      case "pending":
      case "pending_approval":
        return "border border-amber-400/40 bg-amber-500/20 text-amber-100";
      case "rejected":
        return "border border-rose-400/40 bg-rose-500/20 text-rose-100";
      case "overdue":
        return "border border-rose-400/40 bg-rose-500/20 text-rose-100";
      case "cancelled":
        return "border border-slate-400/40 bg-slate-500/20 text-slate-200";
      default:
        return "border border-slate-400/30 bg-slate-500/10 text-slate-100";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case "paid":
        return <CheckCircle className="h-4 w-4 text-emerald-300" />;
      case "pending":
        return <Clock className="h-4 w-4 text-amber-300" />;
      case "overdue":
        return <AlertCircle className="h-4 w-4 text-rose-300" />;
      default:
        return <FileText className="h-4 w-4 text-blue-100/80" />;
    }
  };

  const renderUsageSummary = (
    label: string,
    usage: { used: number; included: number; overage: number; overageCharge: number }
  ) => {
    const used = usage.used || 0;
    const included = usage.included || 0;
    const percent = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : used > 0 ? 100 : 0;

    return (
      <div className="space-y-4 rounded-2xl border border-white/10 bg-[#111f3b]/60 p-5 shadow-inner shadow-blue-900/10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-blue-100/70">{label} sent</p>
            <p className="mt-2 text-2xl font-semibold text-white">{used.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-blue-100/70">Included</p>
            <p className="mt-2 text-lg font-semibold text-white">{included.toLocaleString()}</p>
          </div>
        </div>
        <Progress value={percent} className="h-2 bg-white/10" />
        <div className="flex items-center justify-between text-xs font-medium text-blue-100/70">
          <span>
            {usage.overage > 0
              ? `${usage.overage.toLocaleString()} over plan`
              : "Within included volume"}
          </span>
          <span>
            {usage.overageCharge > 0
              ? `${formatCurrency(usage.overageCharge)} overage`
              : "No overage fees"}
          </span>
        </div>
      </div>
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) {
      return "—";
    }

    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleSaveBillingDetails = async () => {
    setIsSavingBilling(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      toast({
        title: "Billing details updated",
        description: "Your billing contact information has been saved.",
      });
      setUpdateBillingOpen(false);
    } catch (error) {
      toast({
        title: "Unable to update billing",
        description: "Please try again in a few moments.",
        variant: "destructive",
      });
    } finally {
      setIsSavingBilling(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsPortalLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const portalUrl = "https://billing.example.com/portal";

      if (typeof window !== "undefined") {
        window.open(portalUrl, "_blank", "noopener,noreferrer");
      }

      toast({
        title: "Billing portal opened",
        description: "Manage your subscription in the newly opened tab.",
      });
    } catch (error) {
      toast({
        title: "Portal unavailable",
        description: "We couldn't open the billing portal. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsPortalLoading(false);
    }
  };

  const handleSelectPlan = async (planId: string, planName: string) => {
    setUpdatingPlanId(planId);

    try {
      const result = await apiRequest("POST", "/api/billing/select-plan", { planId }) as any;

      await queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/stats"] });

      toast({
        title: "Plan request submitted",
        description: result.message || `Your request for the ${planName} plan is pending admin approval.`,
      });
    } catch (error: any) {
      toast({
        title: "Unable to request plan",
        description: error?.message || "Please try again in a few moments.",
        variant: "destructive",
      });
    } finally {
      setUpdatingPlanId(null);
    }
  };

  if (statsLoading || subscriptionLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  const plans = (planResponse as any)?.plans ?? [];
  const emailOverageRatePerThousand = (planResponse as any)?.emailOverageRatePerThousand ?? 0;
  const smsOverageRatePerSegment = (planResponse as any)?.smsOverageRatePerSegment ?? 0;

  const stats = (billingStats as any) || {
    activeConsumers: 0,
    monthlyBase: 0,
    addonFees: 0,
    usageCharges: 0,
    totalBill: 0,
    nextBillDate: "N/A",
    planId: null,
    planName: null,
    emailUsage: { used: 0, included: 0, overage: 0, overageCharge: 0 },
    smsUsage: { used: 0, included: 0, overage: 0, overageCharge: 0 },
    billingPeriod: null,
  };

  const currentPlanId =
    (subscription as any)?.planId || stats.planId || (subscription as any)?.plan || null;
  const currentPlanName =
    (subscription as any)?.planName || stats.planName || (subscription as any)?.plan || null;
  const currentPlanPrice = Number(
    (subscription as any)?.planPrice ?? stats.monthlyBase ?? ((subscription as any)?.monthlyBaseCents ?? 0) / 100
  );

  return (
    <AdminLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 text-blue-50 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/10 p-8 shadow-2xl shadow-blue-900/30">
          <div className="pointer-events-none absolute -right-16 top-8 h-64 w-64 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-6 h-52 w-52 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100/80">
                Subscription health
              </span>
              <div className="space-y-4">
                <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                  Billing &amp; subscription hub
                </h1>
                <p className="text-sm text-blue-100/70 sm:text-base">
                  Monitor spend, track usage, and keep your account details current without leaving the admin workspace.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  data-testid="button-update-billing"
                  onClick={() => setUpdateBillingOpen(true)}
                  className="rounded-2xl border border-white/20 bg-white/15 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 backdrop-blur transition hover:bg-white/25"
                >
                  <i className="fas fa-id-card mr-2 text-base" />
                  Update billing info
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#101c3c]/60 p-5 shadow-lg shadow-blue-900/20">
                <p className="text-xs uppercase tracking-wide text-blue-100/70">Current plan</p>
                <p className="mt-2 text-lg font-semibold text-white">{currentPlanName || "Not selected"}</p>
                <p className="mt-1 text-sm text-blue-100/70">{formatCurrency(currentPlanPrice)} per month</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#101c3c]/60 p-5 shadow-lg shadow-blue-900/20">
                <p className="text-xs uppercase tracking-wide text-blue-100/70">Next bill</p>
                <p className="mt-2 text-lg font-semibold text-white">{stats.nextBillDate}</p>
                {stats.billingPeriod && (
                  <p className="mt-1 text-xs text-blue-100/70">
                    {formatDate(stats.billingPeriod.start)} – {formatDate(stats.billingPeriod.end)}
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#101c3c]/60 p-5 shadow-lg shadow-blue-900/20 sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-blue-100/70">Estimated total</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <p className="text-2xl font-semibold text-white" data-testid="text-total-bill">
                    {formatCurrency(stats.totalBill)}
                  </p>
                  <span className="text-xs font-medium text-blue-100/70">
                    Base {formatCurrency(stats.monthlyBase)}
                    {stats.addonFees > 0 && ` · Add-ons ${formatCurrency(stats.addonFees)}`}
                    {` · Usage ${formatCurrency(stats.usageCharges)}`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Tabs defaultValue="overview" className="space-y-8">
          <TabsList className="flex w-full flex-wrap items-center gap-2 p-1 sm:w-auto">
            <TabsTrigger value="overview" data-testid="tab-overview" className="px-4 py-2">
              Overview
            </TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices" className="px-4 py-2">
              Invoices
            </TabsTrigger>
            <TabsTrigger value="subscription" data-testid="tab-subscription" className="px-4 py-2">
              Subscription
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Billing Stats */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
              <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
                <CardContent className="flex items-center gap-4 p-6">
                  <span className="rounded-2xl bg-sky-500/20 p-3 text-sky-300">
                    <Users className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-100/70">Active consumers</p>
                    <p className="mt-2 text-2xl font-semibold text-white" data-testid="text-active-consumers">
                      {stats.activeConsumers}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
                <CardContent className="flex items-center gap-4 p-6">
                  <span className="rounded-2xl bg-emerald-500/20 p-3 text-emerald-300">
                    <DollarSign className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-100/70">Monthly base</p>
                    <p className="mt-2 text-2xl font-semibold text-white" data-testid="text-monthly-base">
                      {formatCurrency(stats.monthlyBase)}
                    </p>
                    {currentPlanName && (
                      <p className="mt-2 text-xs text-blue-100/70">Plan: {currentPlanName}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
                <CardContent className="flex items-center gap-4 p-6">
                  <span className="rounded-2xl bg-purple-500/20 p-3 text-purple-200">
                    <TrendingUp className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-100/70">Usage charges</p>
                    <p className="mt-2 text-2xl font-semibold text-white" data-testid="text-usage-charges">
                      {formatCurrency(stats.usageCharges)}
                    </p>
                    <p className="mt-2 text-xs text-blue-100/70">
                      Email {formatCurrency(stats.emailUsage?.overageCharge || 0)} · SMS {formatCurrency(stats.smsUsage?.overageCharge || 0)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
                <CardContent className="flex items-center gap-4 p-6">
                  <span className="rounded-2xl bg-amber-500/20 p-3 text-amber-200">
                    <CreditCard className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-100/70">Total bill</p>
                    <p className="mt-2 text-2xl font-semibold text-white" data-testid="text-total-bill">
                      {formatCurrency(stats.totalBill)}
                    </p>
                    {stats.addonFees > 0 && (
                      <p className="mt-2 text-xs text-blue-100/70">
                        Base {formatCurrency(stats.monthlyBase)} · Addons {formatCurrency(stats.addonFees)} · Usage {formatCurrency(stats.usageCharges)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-3xl border-white/10 bg-white/5 text-blue-50 shadow-lg shadow-blue-900/20">
              <CardHeader className="border-b border-white/10 pb-4">
                <CardTitle className="text-lg font-semibold text-white">Messaging usage</CardTitle>
                <p className="text-sm text-blue-100/70">Track allowance consumption across email and SMS.</p>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {renderUsageSummary("Email", stats.emailUsage)}
                  {renderUsageSummary("SMS segments", stats.smsUsage)}
                </div>
              </CardContent>
            </Card>

            {/* Add-ons & Features */}
            {stats.addonFees > 0 && stats.addons && (
              <Card className="rounded-3xl border-white/10 bg-white/5 text-blue-50 shadow-lg shadow-blue-900/20">
                <CardHeader className="border-b border-white/10 pb-4">
                  <CardTitle className="text-lg font-semibold text-white">Add-ons & Premium Features</CardTitle>
                  <p className="text-sm text-blue-100/70">Active premium add-ons and their monthly fees.</p>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {stats.addons.documentSigning && (
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-sky-500/20 p-2">
                            <FileText className="h-5 w-5 text-sky-300" />
                          </div>
                          <div>
                            <p className="font-semibold text-white">Document Signing</p>
                            <p className="text-xs text-blue-100/60">Electronic signatures with full ESIGN compliance</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-white" data-testid="text-addon-document-signing">
                            {formatCurrency(stats.addons.documentSigningFee)}
                          </p>
                          <p className="text-xs text-blue-100/60">per month</p>
                        </div>
                      </div>
                    )}
                    <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3">
                      <p className="text-xs text-amber-200">
                        <strong>Total add-on fees:</strong> {formatCurrency(stats.addonFees)}/month
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Current Invoice */}
            {currentInvoice && (currentInvoice as any) && (
              <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
                <CardHeader className="border-b border-white/10 pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold text-white">
                    <span className="rounded-xl bg-white/10 p-2 text-sky-200">
                      <FileText className="h-4 w-4" />
                    </span>
                    Current billing period
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-blue-100/70">Billing period</p>
                      <p className="mt-2 font-medium text-white" data-testid="text-billing-period">
                        {formatDate((currentInvoice as any).periodStart)} – {formatDate((currentInvoice as any).periodEnd)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-blue-100/70">Amount due</p>
                      <p className="mt-2 text-lg font-semibold text-white" data-testid="text-amount-due">
                        {formatCurrency((currentInvoice as any).totalAmountCents / 100)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-blue-100/70">Due date</p>
                      <p className="mt-2 font-medium text-white" data-testid="text-due-date">
                        {formatDate((currentInvoice as any).dueDate)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
                <CardContent className="flex items-start justify-between gap-4 p-6">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-100/70">Next bill date</p>
                    <p className="mt-2 text-xl font-semibold text-white" data-testid="text-next-bill-date">
                      {stats.nextBillDate}
                    </p>
                    {stats.billingPeriod && (
                      <p className="mt-2 text-sm text-blue-100/70">
                        {formatDate(stats.billingPeriod.start)} – {formatDate(stats.billingPeriod.end)}
                      </p>
                    )}
                    {currentPlanName && (
                      <p className="mt-3 text-sm text-blue-100/70">
                        Plan: {currentPlanName} · {formatCurrency(currentPlanPrice)}
                      </p>
                    )}
                  </div>
                  <span className="rounded-2xl bg-sky-500/20 p-3 text-sky-200">
                    <Calendar className="h-6 w-6" />
                  </span>
                </CardContent>
              </Card>
              <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
                <CardContent className="p-6">
                  <p className="text-xs uppercase tracking-wide text-blue-100/70">Overage rates</p>
                  <p className="mt-3 text-sm text-blue-100/70">
                    Email {formatCurrency(emailOverageRatePerThousand)} per 1k · SMS {formatCurrency(smsOverageRatePerSegment)} per segment
                  </p>
                  <p className="mt-4 text-xs text-blue-100/60">
                    Additional usage is billed automatically once included volume is exceeded.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-6">
            <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
              <CardHeader className="border-b border-white/10 pb-4">
                <CardTitle className="text-lg font-semibold text-white">Invoice history</CardTitle>
                <p className="text-sm text-blue-100/70">Download past statements and review payment statuses.</p>
              </CardHeader>
              <CardContent className="pt-6">
                {invoicesLoading ? (
                  <div className="flex items-center justify-center py-10 text-blue-100/70">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : !invoices || (invoices as any[]).length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/20 bg-white/5 py-12 text-center">
                    <FileText className="mb-4 h-12 w-12 text-blue-100/60" />
                    <h3 className="text-lg font-medium text-white">No invoices yet</h3>
                    <p className="mt-2 max-w-md text-sm text-blue-100/70">
                      Your first billing cycle will generate an invoice here. Once available, download options will appear automatically.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(invoices as any[]).map((invoice: any) => (
                      <div
                        key={invoice.id}
                        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between"
                        data-testid={`invoice-${invoice.invoiceNumber}`}
                      >
                        <div className="flex items-center gap-4">
                          <span className="rounded-2xl bg-white/10 p-3">
                            {getStatusIcon(invoice.status)}
                          </span>
                          <div>
                            <h4 className="text-sm font-semibold text-white">Invoice #{invoice.invoiceNumber}</h4>
                            <p className="text-xs text-blue-100/70">
                              {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-white">
                              {formatCurrency(invoice.totalAmountCents / 100)}
                            </p>
                            <Badge
                              className={cn("mt-2 inline-flex", getStatusColor(invoice.status))}
                              data-testid={`badge-status-${invoice.invoiceNumber}`}
                            >
                              {invoice.status}
                            </Badge>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`button-download-${invoice.invoiceNumber}`}
                            className="rounded-xl border border-white/20 bg-transparent px-4 py-2 text-xs font-semibold text-blue-100 transition hover:bg-white/10 hover:text-white"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscription" className="space-y-8">
            <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
              <CardHeader className="border-b border-white/10 pb-4">
                <CardTitle className="text-lg font-semibold text-white">Messaging plans</CardTitle>
                <p className="text-sm text-blue-100/70">
                  Choose the plan that aligns with your monthly messaging volume. Changes take effect immediately.
                </p>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {(subscription as any)?.status === 'pending_approval' && (
                  <div className="rounded-2xl border border-amber-400/40 bg-amber-500/20 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-300 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-amber-100">Plan Change Pending Approval</h4>
                        <p className="mt-1 text-sm text-amber-200/80">
                          Your subscription request for <strong>{currentPlanName}</strong> is currently pending admin approval. 
                          You cannot select a different plan until this request is processed.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {plansLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-40 rounded-2xl border border-white/10 bg-white/5 animate-pulse"
                      />
                    ))}
                  </div>
                ) : plans.length === 0 ? (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/20 bg-white/5 py-12 text-center text-blue-100/70">
                    <CreditCard className="mb-4 h-12 w-12 text-blue-100/60" />
                    <h3 className="text-lg font-medium text-white">No plans available</h3>
                    <p className="mt-2 max-w-md text-sm">
                      We’re preparing new subscription tiers. Check back soon or contact support for custom pricing.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {plans.map((plan: any) => {
                      const isCurrentPlan = currentPlanId === plan.id || currentPlanName === plan.name;
                      const isUpdating = updatingPlanId === plan.id;

                      return (
                        <div
                          key={plan.id}
                          className={cn(
                            "flex h-full flex-col justify-between gap-6 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-blue-900/20 transition hover:border-white/20 hover:bg-white/10",
                            isCurrentPlan && "border-sky-400/40 bg-sky-500/10",
                          )}
                          data-testid={`plan-${plan.id}`}
                        >
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                                <p className="text-sm text-blue-100/70">{plan.description}</p>
                              </div>
                              {isCurrentPlan && (
                                <Badge className="border border-white/20 bg-white/10 text-blue-100">Current</Badge>
                              )}
                            </div>
                            <div>
                              <p className="text-3xl font-semibold text-white">{formatCurrency(plan.price ?? plan.monthlyPrice)}</p>
                              <p className="text-xs text-blue-100/60 mt-1">per month</p>
                              {plan.setupFee > 0 && (
                                <p className="text-sm text-amber-200/80 mt-2">
                                  + {formatCurrency(plan.setupFee)} setup fee
                                </p>
                              )}
                            </div>
                            <div className="space-y-3">
                              <div>
                                <p className="text-xs uppercase tracking-wide text-blue-100/50 mb-2">Base Included</p>
                                <ul className="space-y-1.5 text-sm text-blue-100/70">
                                  <li className="flex items-center gap-2">
                                    <span className="text-emerald-400">✓</span>
                                    {plan.includedEmails.toLocaleString()} emails/month
                                  </li>
                                  <li className="flex items-center gap-2">
                                    <span className="text-emerald-400">✓</span>
                                    {plan.includedSmsSegments.toLocaleString()} SMS segments/month
                                  </li>
                                </ul>
                              </div>
                              {plan.features && plan.features.length > 0 && (
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-blue-100/50 mb-2">Features</p>
                                  <ul className="space-y-1.5 text-xs text-blue-100/70">
                                    {plan.features.map((feature: string, idx: number) => (
                                      <li key={idx} className="flex items-start gap-2">
                                        <span className="text-sky-400 mt-0.5">•</span>
                                        <span>{feature}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              <div>
                                <p className="text-xs uppercase tracking-wide text-blue-100/50 mb-2">Overage Rates</p>
                                <ul className="space-y-1.5 text-xs text-blue-100/60">
                                  <li>Email: {formatCurrency(plan.emailOverageRatePer1000)}/1,000</li>
                                  <li>SMS: {formatCurrency(plan.smsOverageRatePerSegment)}/segment</li>
                                </ul>
                              </div>
                            </div>
                          </div>
                          <Button
                            className="w-full rounded-xl border border-white/20 bg-white/10 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-70"
                            onClick={() => handleSelectPlan(plan.id, plan.name)}
                            disabled={isCurrentPlan || isUpdating || (subscription as any)?.status === 'pending_approval'}
                            data-testid={`button-select-plan-${plan.id}`}
                          >
                            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isCurrentPlan && (subscription as any)?.status === 'active' ? "Current plan" : 
                             isCurrentPlan && (subscription as any)?.status === 'pending_approval' ? "Pending approval" :
                             isUpdating ? "Requesting..." : "Request plan"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-sm text-blue-100/70">
                  Overage billing: {formatCurrency(emailOverageRatePerThousand)} per 1,000 emails · {formatCurrency(smsOverageRatePerSegment)} per SMS segment.
                </p>
              </CardContent>
            </Card>

            {subscription && (subscription as any) ? (
              <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
                <CardHeader className="border-b border-white/10 pb-4">
                  <CardTitle className="text-lg font-semibold text-white">Current subscription</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-blue-100/70">Plan</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge className="border border-white/20 bg-white/10 text-blue-100 capitalize" data-testid="badge-current-plan">
                          {currentPlanName || "Not selected"}
                        </Badge>
                        <Badge
                          className={cn("border border-white/20 bg-white/10 text-blue-100", getStatusColor((subscription as any).status))}
                          data-testid="badge-subscription-status"
                        >
                          {(subscription as any).status}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm text-blue-100/70">{formatCurrency(currentPlanPrice)} per month</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-blue-100/70">Billing email</p>
                      <p className="mt-2 text-sm text-blue-100/70" data-testid="text-billing-email">
                        {(subscription as any).billingEmail || "Not set"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-blue-100/70">Included emails</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {((subscription as any).includedEmails || stats.emailUsage?.included || 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-blue-100/70">Included SMS segments</p>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {((subscription as any).includedSmsSegments || stats.smsUsage?.included || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-blue-100/70">Current billing period</p>
                    <p className="mt-2 text-sm text-blue-100/70" data-testid="text-current-period">
                      {formatDate((subscription as any).currentPeriodStart)} – {formatDate((subscription as any).currentPeriodEnd)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="rounded-3xl border-white/10 bg-white/5 text-blue-50 shadow-lg shadow-blue-900/20">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <CreditCard className="h-12 w-12 text-blue-100/60" />
                  <h3 className="text-lg font-medium text-white">No active subscription</h3>
                  <p className="text-sm text-blue-100/70">
                    Select a messaging plan above to activate billing and start tracking usage.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>


        </Tabs>
      </div>
      <Dialog open={updateBillingOpen} onOpenChange={setUpdateBillingOpen}>
        <DialogContent className="max-w-2xl bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white">Update billing information</DialogTitle>
            <DialogDescription className="text-blue-100/70">
              Provide the contact details that should appear on your invoices.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="billing-name" className="text-sm font-medium text-blue-100/80">Billing contact</Label>
              <Input
                id="billing-name"
                placeholder="Jane Doe"
                disabled={isSavingBilling}
                className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing-email" className="text-sm font-medium text-blue-100/80">Billing email</Label>
              <Input
                id="billing-email"
                type="email"
                placeholder="billing@company.com"
                disabled={isSavingBilling}
                className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50"
              />
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setUpdateBillingOpen(false)}
              disabled={isSavingBilling}
              className="rounded-xl border border-white/20 bg-transparent px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveBillingDetails}
              disabled={isSavingBilling}
              className="rounded-xl border border-white/20 bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSavingBilling && <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-200" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}