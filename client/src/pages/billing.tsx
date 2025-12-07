import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
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
  Bot,
  Smartphone,
  Building2,
  Lock,
} from "lucide-react";
import { SiVisa, SiMastercard, SiAmericanexpress, SiDiscover } from "react-icons/si";

export default function Billing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [updateBillingOpen, setUpdateBillingOpen] = useState(false);
  const [isSavingBilling, setIsSavingBilling] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);
  const [activatingService, setActivatingService] = useState<string | null>(null);
  const [showAddonConfirmDialog, setShowAddonConfirmDialog] = useState(false);
  const [showAutoResponseConfirmDialog, setShowAutoResponseConfirmDialog] = useState(false);
  const [showMobileAppBrandingConfirmDialog, setShowMobileAppBrandingConfirmDialog] = useState(false);
  
  // Payment form state
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'ach'>('card');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    // Card fields
    cardholderName: '',
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    // Address fields
    billingAddress: '',
    billingCity: '',
    billingState: '',
    billingZip: '',
    // ACH fields
    accountHolderName: '',
    routingNumber: '',
    accountNumber: '',
    confirmAccountNumber: '',
  });

  // Check for tab query parameter and set active tab on mount
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'overview';
  });

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

  // Fetch tenant settings to check enabled services
  const { data: settingsData } = useQuery({
    queryKey: ["/api/settings"],
  });
  const enabledAddons = (settingsData as any)?.enabledAddons || [];
  const isTrialAccount = (settingsData as any)?.isTrialAccount ?? true;

  // Fetch service activation requests for this tenant
  const { data: serviceRequestsData } = useQuery({
    queryKey: ["/api/service-activation-requests"],
  });
  const serviceRequests = (serviceRequestsData as any)?.requests || [];

  // Mutation to activate à la carte services (creates pending request)
  const activateServiceMutation = useMutation({
    mutationFn: async (serviceType: string) => {
      return await apiRequest("POST", "/api/billing/activate-service", { serviceType });
    },
    onSuccess: (data: any) => {
      if (data.isPending) {
        toast({
          title: "Request submitted!",
          description: "Your service activation request has been submitted for approval.",
        });
      } else if (data.alreadyEnabled) {
        toast({
          title: "Service already activated",
          description: "This service is already activated for your account.",
        });
      } else {
        toast({
          title: "Service activated!",
          description: "Service activated successfully. You can now use this feature.",
        });
      }
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-activation-requests"] });
      setActivatingService(null);
    },
    onError: (error: any) => {
      toast({
        title: "Request failed",
        description: error.message || "Failed to submit service activation request. Please try again.",
        variant: "destructive",
      });
      setActivatingService(null);
    },
  });

  const handleActivateService = (serviceName: string) => {
    // Map service names to backend identifiers
    const serviceTypeMap: Record<string, string> = {
      "Portal + Processing": "portal_processing",
      "Email Service": "email_service",
      "SMS Service": "sms_service",
    };

    const serviceType = serviceTypeMap[serviceName];
    if (!serviceType) {
      toast({
        title: "Error",
        description: "Invalid service type",
        variant: "destructive",
      });
      return;
    }

    setActivatingService(serviceName);
    activateServiceMutation.mutate(serviceType);
  };

  // Mutation to update enabledAddons
  const updateAddonsMutation = useMutation({
    mutationFn: async (updatedAddons: string[]) => {
      return await apiRequest("PATCH", "/api/settings", { enabledAddons: updatedAddons });
    },
    onSuccess: () => {
      toast({
        title: "Add-on updated",
        description: "Your add-on settings have been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update add-on settings. Please try again.",
        variant: "destructive",
      });
    },
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
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-lg font-semibold text-white">
                    {currentPlanName || (enabledAddons.length > 0 ? `À la carte (${enabledAddons.length} service${enabledAddons.length !== 1 ? 's' : ''} active)` : "Not selected")}
                  </p>
                  {isTrialAccount && (
                    <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-200 text-xs">
                      Trial
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-blue-100/70">
                  {currentPlanName ? `${formatCurrency(currentPlanPrice)} per month` : 
                   enabledAddons.length > 0 ? `${formatCurrency(enabledAddons.length * 125)} per month (${enabledAddons.length} × $125)` : 
                   'No active services'}
                </p>
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="flex w-full flex-wrap items-center gap-2 p-1 sm:w-auto">
            <TabsTrigger value="overview" data-testid="tab-overview" className="px-4 py-2">
              Overview
            </TabsTrigger>
            <TabsTrigger value="services" data-testid="tab-services" className="px-4 py-2">
              Services & Add-ons
            </TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices" className="px-4 py-2">
              Invoices
            </TabsTrigger>
            <TabsTrigger value="subscription" data-testid="tab-subscription" className="px-4 py-2">
              Subscription
            </TabsTrigger>
            <TabsTrigger value="pay-invoice" data-testid="tab-pay-invoice" className="px-4 py-2">
              <CreditCard className="h-4 w-4 mr-1.5" />
              Pay Invoice
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

          <TabsContent value="services" className="space-y-6">
            <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
              <CardHeader className="border-b border-white/10 pb-4">
                <CardTitle className="text-lg font-semibold text-white">À la carte services</CardTitle>
                <p className="text-sm text-blue-100/70">
                  Purchase individual services or bundle them with a subscription for savings.
                </p>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    {
                      name: "Portal + Processing",
                      description: "Consumer portal & payment processing",
                      price: 125,
                      icon: <Users className="h-6 w-6" />,
                      features: ["Custom branding", "Account access", "Payment processing", "Payment plans", "Secure tokenization"],
                      helpText: "Need a merchant? Contact Us"
                    },
                    {
                      name: "Email Service",
                      description: "Professional email communications",
                      price: 125,
                      icon: <FileText className="h-6 w-6" />,
                      features: ["Templates", "Campaigns", "Tracking"],
                      helpText: "Need help with setup? Contact Us"
                    },
                    {
                      name: "SMS Service",
                      description: "Text message communications",
                      price: 125,
                      icon: <AlertCircle className="h-6 w-6" />,
                      features: ["Multi-number sending", "Campaigns", "Analytics"],
                      helpText: "Need help with setup? Contact Us"
                    }
                  ].map((service, idx) => {
                    const serviceTypeMap: Record<string, string> = {
                      "Portal + Processing": "portal_processing",
                      "Email Service": "email_service",
                      "SMS Service": "sms_service",
                    };
                    const serviceType = serviceTypeMap[service.name];
                    
                    // Check service status
                    const isActive = enabledAddons.includes(serviceType);
                    const pendingRequest = serviceRequests.find((req: any) => 
                      req.serviceType === serviceType && req.status === 'pending'
                    );
                    const rejectedRequest = serviceRequests.find((req: any) => 
                      req.serviceType === serviceType && req.status === 'rejected'
                    );
                    
                    return (
                    <div
                      key={idx}
                      className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-blue-900/20"
                      data-testid={`service-card-${idx}`}
                    >
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="rounded-2xl bg-sky-500/20 p-3 text-sky-200 w-fit">
                            {service.icon}
                          </div>
                          {isActive && (
                            <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-200">
                              Active
                            </Badge>
                          )}
                          {!isActive && pendingRequest && (
                            <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-200">
                              Pending Approval
                            </Badge>
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">{service.name}</h3>
                          <p className="text-sm text-blue-100/70 mt-1">{service.description}</p>
                        </div>
                        <div>
                          <p className="text-3xl font-semibold text-white">${service.price}</p>
                          <p className="text-xs text-blue-100/60 mt-1">per month</p>
                        </div>
                        <ul className="space-y-1.5 text-xs text-blue-100/70">
                          {service.features.map((feature, featureIdx) => (
                            <li key={featureIdx} className="flex items-start gap-2">
                              <span className="text-emerald-400 mt-0.5">✓</span>
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-3">
                        {isActive ? (
                          <div className="text-center p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                            <CheckCircle className="h-5 w-5 mx-auto mb-1 text-emerald-200" />
                            <p className="text-sm font-semibold text-emerald-200">Service Active</p>
                            <p className="text-xs text-emerald-100/70 mt-1">
                              This service is enabled for your account
                            </p>
                          </div>
                        ) : pendingRequest ? (
                          <div className="text-center p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10">
                            <Clock className="h-5 w-5 mx-auto mb-1 text-yellow-200" />
                            <p className="text-sm font-semibold text-yellow-200">Request Pending</p>
                            <p className="text-xs text-yellow-100/70 mt-1">
                              Awaiting administrator approval
                            </p>
                          </div>
                        ) : rejectedRequest ? (
                          <div className="space-y-2">
                            <div className="text-center p-3 rounded-xl border border-red-500/20 bg-red-500/10">
                              <AlertCircle className="h-5 w-5 mx-auto mb-1 text-red-200" />
                              <p className="text-sm font-semibold text-red-200">Request Rejected</p>
                              {rejectedRequest.rejectionReason && (
                                <p className="text-xs text-red-100/70 mt-1">
                                  {rejectedRequest.rejectionReason}
                                </p>
                              )}
                            </div>
                            <Button
                              onClick={() => handleActivateService(service.name)}
                              disabled={activatingService === service.name}
                              className="w-full rounded-xl border border-white/20 bg-white/10 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                              data-testid={`button-retry-service-${idx}`}
                            >
                              {activatingService === service.name ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Requesting...
                                </>
                              ) : (
                                'Request again'
                              )}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            onClick={() => handleActivateService(service.name)}
                            disabled={activatingService === service.name}
                            className="w-full rounded-xl border border-white/20 bg-white/10 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            data-testid={`button-purchase-service-${idx}`}
                          >
                            {activatingService === service.name ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Requesting...
                              </>
                            ) : (
                              'Request activation'
                            )}
                          </Button>
                        )}
                        <p className="text-center text-xs text-blue-100/60">
                          {service.helpText.split('Contact Us')[0]}
                          <button
                            onClick={() => window.location.href = 'mailto:support@chainplatform.com?subject=Service Inquiry'}
                            className="text-sky-300 underline hover:text-sky-200 transition"
                            data-testid={`button-contact-us-${idx}`}
                          >
                            Contact Us
                          </button>
                        </p>
                      </div>
                    </div>
                  );
                  })}
                </div>


                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
                  <p className="text-xs text-amber-200">
                    <strong>Note:</strong> Services purchased à la carte do not include messaging volume (emails and SMS). 
                    Volume limits and overage charges apply separately based on your subscription plan.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
              <CardHeader className="border-b border-white/10 pb-4">
                <CardTitle className="text-lg font-semibold text-white">Optional Add-ons</CardTitle>
                <p className="text-sm text-blue-100/70">
                  Enable premium features for your organization. Add-ons are billed monthly and auto-renew.
                </p>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div className="rounded-xl border-2 border-emerald-400/40 bg-gradient-to-r from-emerald-500/10 to-sky-500/10 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-200">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-white">Bundle & Save</h3>
                        <p className="text-xs text-blue-100/70">Get all services plus messaging volume for one discounted price</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-blue-100/60 line-through">$375/mo</p>
                        <p className="text-lg font-semibold text-emerald-300">From $350/mo</p>
                      </div>
                      <Button
                        onClick={() => setActiveTab('subscription')}
                        className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                        data-testid="button-subscribe-bundle"
                      >
                        View Plans
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex items-start justify-between rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-sky-400" />
                      <h3 className="text-base font-semibold text-white">Document Signing</h3>
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-200 border border-amber-400/30">
                        +$40/mo
                      </span>
                    </div>
                    <p className="text-sm text-blue-100/70">
                      Send documents for electronic signature with full ESIGN Act compliance. Perfect for contracts, agreements, and legal documents.
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-blue-100/60">
                      <span className="rounded-full bg-white/10 px-2 py-1">Legally Binding</span>
                      <span className="rounded-full bg-white/10 px-2 py-1">Full Audit Trail</span>
                      <span className="rounded-full bg-white/10 px-2 py-1">Custom Templates</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={enabledAddons.includes('document_signing') || false}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setShowAddonConfirmDialog(true);
                        } else {
                          const updated = enabledAddons.filter((a: string) => a !== 'document_signing');
                          updateAddonsMutation.mutate(updated);
                        }
                      }}
                      data-testid="switch-document-signing"
                    />
                  </div>
                </div>

                <div className="flex items-start justify-between rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-purple-400" />
                      <h3 className="text-base font-semibold text-white">AI Auto-Response</h3>
                      <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-semibold text-purple-200 border border-purple-400/30">
                        $50/mo
                      </span>
                    </div>
                    <p className="text-sm text-blue-100/70">
                      Automatically respond to consumer emails and SMS using AI powered by your OpenAI API key. Responses adapt to your business type and include account context.
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-blue-100/60">
                      <span className="rounded-full bg-white/10 px-2 py-1">Context-Aware</span>
                      <span className="rounded-full bg-white/10 px-2 py-1">Business-Type Adapted</span>
                      <span className="rounded-full bg-white/10 px-2 py-1">Test Mode</span>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-blue-100/70">
                      <p><strong className="text-white">Launch:</strong> 1,000 responses/month included</p>
                      <p><strong className="text-white">Growth:</strong> 5,000 responses/month included</p>
                      <p><strong className="text-white">Pro:</strong> 15,000 responses/month included</p>
                      <p><strong className="text-white">Scale:</strong> 30,000 responses/month included</p>
                      <p className="text-blue-100/50">Overage: $0.08 per additional response</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={enabledAddons.includes('ai_auto_response') || false}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setShowAutoResponseConfirmDialog(true);
                        } else {
                          const updated = enabledAddons.filter((a: string) => a !== 'ai_auto_response');
                          updateAddonsMutation.mutate(updated);
                        }
                      }}
                      data-testid="switch-ai-auto-response"
                    />
                  </div>
                </div>

                <div className="flex items-start justify-between rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-blue-400" />
                      <h3 className="text-base font-semibold text-white">Mobile App Branding</h3>
                      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-200 border border-blue-400/30">
                        $150 setup + $50/mo
                      </span>
                    </div>
                    <p className="text-sm text-blue-100/70">
                      Brand the Android mobile app with your logo and company name in the Google Play Store. Includes setup and ongoing maintenance.
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-blue-100/60">
                      <span className="rounded-full bg-white/10 px-2 py-1">Custom Logo</span>
                      <span className="rounded-full bg-white/10 px-2 py-1">Play Store Listing</span>
                      <span className="rounded-full bg-white/10 px-2 py-1">Monthly Updates</span>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-blue-100/70">
                      <p><strong className="text-white">One-time setup:</strong> $150</p>
                      <p><strong className="text-white">Monthly maintenance:</strong> $50/month</p>
                      <p className="text-emerald-300"><strong>Included FREE</strong> with Enterprise (Scale) plan</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={enabledAddons.includes('mobile_app_branding') || false}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setShowMobileAppBrandingConfirmDialog(true);
                        } else {
                          const updated = enabledAddons.filter((a: string) => a !== 'mobile_app_branding');
                          updateAddonsMutation.mutate(updated);
                        }
                      }}
                      data-testid="switch-mobile-app-branding"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-400/30 bg-blue-500/10 p-4">
                  <p className="text-xs text-blue-200">
                    <strong>Note:</strong> Add-ons are billed monthly and will auto-renew until you disable them. Changes are reflected on your next invoice.
                  </p>
                </div>
              </CardContent>
            </Card>

            <AlertDialog open={showAddonConfirmDialog} onOpenChange={setShowAddonConfirmDialog}>
              <AlertDialogContent className="border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-xl">
                    <DollarSign className="h-5 w-5 text-amber-400" />
                    Enable Document Signing Add-on
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3 text-blue-100/80">
                    <p>
                      By enabling the Document Signing add-on, your subscription will increase by <strong className="text-amber-300">$40.00 per month</strong>.
                    </p>
                    <p>
                      This premium feature includes:
                    </p>
                    <ul className="ml-4 space-y-1 list-disc text-sm">
                      <li>Unlimited document templates</li>
                      <li>Electronic signature requests with full ESIGN Act compliance</li>
                      <li>Complete audit trail for legal protection</li>
                      <li>Integration with communication sequences</li>
                    </ul>
                    <p className="text-xs text-blue-200/70">
                      The add-on fee will be reflected on your next invoice and will auto-renew monthly until you disable it.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel 
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                    data-testid="button-cancel-addon"
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      const updated = [...enabledAddons, 'document_signing'];
                      updateAddonsMutation.mutate(updated);
                      setShowAddonConfirmDialog(false);
                    }}
                    className="bg-gradient-to-r from-sky-500 to-indigo-500 text-white hover:from-sky-400 hover:to-indigo-400"
                    data-testid="button-confirm-addon"
                  >
                    Enable for $40/month
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showAutoResponseConfirmDialog} onOpenChange={setShowAutoResponseConfirmDialog}>
              <AlertDialogContent className="border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-xl">
                    <Bot className="h-5 w-5 text-purple-400" />
                    Enable AI Auto-Response Add-on
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3 text-blue-100/80">
                    <p>
                      By enabling the AI Auto-Response add-on for <strong className="text-amber-300">$50/month</strong>, you'll get plan-based response quotas included in your subscription.
                    </p>
                    <p className="font-semibold text-white">
                      Response Quotas by Plan:
                    </p>
                    <ul className="ml-4 space-y-1 list-disc text-sm">
                      <li>Launch Plan: 1,000 responses/month</li>
                      <li>Growth Plan: 5,000 responses/month</li>
                      <li>Pro Plan: 15,000 responses/month</li>
                      <li>Scale Plan: 30,000 responses/month</li>
                    </ul>
                    <p className="text-sm">
                      Additional responses beyond your quota are billed at <strong className="text-amber-300">$0.08 each</strong>.
                    </p>
                    <p className="text-xs text-blue-200/70">
                      You'll need to provide your own OpenAI API key in Settings. The add-on will auto-renew monthly until you disable it.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel 
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                    data-testid="button-cancel-auto-response-addon"
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      const updated = [...enabledAddons, 'ai_auto_response'];
                      updateAddonsMutation.mutate(updated);
                      setShowAutoResponseConfirmDialog(false);
                    }}
                    className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-400 hover:to-indigo-400"
                    data-testid="button-confirm-auto-response-addon"
                  >
                    Enable for $50/month
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showMobileAppBrandingConfirmDialog} onOpenChange={setShowMobileAppBrandingConfirmDialog}>
              <AlertDialogContent className="border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-xl">
                    <Smartphone className="h-5 w-5 text-blue-400" />
                    Enable Mobile App Branding Add-on
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3 text-blue-100/80">
                    <p>
                      By enabling the Mobile App Branding add-on, you'll pay a one-time setup fee and recurring monthly maintenance.
                    </p>
                    <p className="font-semibold text-white">
                      Pricing:
                    </p>
                    <ul className="ml-4 space-y-1 list-disc text-sm">
                      <li><strong className="text-amber-300">$150</strong> one-time setup fee (charged immediately)</li>
                      <li><strong className="text-amber-300">$50/month</strong> ongoing maintenance (auto-renews monthly)</li>
                    </ul>
                    <p className="text-sm">
                      This includes custom branding for the Android mobile app in the Google Play Store with your logo and company name.
                    </p>
                    <p className="text-xs text-emerald-300">
                      <strong>Note:</strong> Mobile App Branding is included FREE with Enterprise (Scale) subscriptions.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel 
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                    data-testid="button-cancel-mobile-app-branding-addon"
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      const updated = [...enabledAddons, 'mobile_app_branding'];
                      updateAddonsMutation.mutate(updated);
                      setShowMobileAppBrandingConfirmDialog(false);
                    }}
                    className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-400 hover:to-cyan-400"
                    data-testid="button-confirm-mobile-app-branding-addon"
                  >
                    Enable ($150 + $50/mo)
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
                                  {plan.id === 'scale' && (
                                    <li className="flex items-center gap-2">
                                      <span className="text-emerald-400">✓</span>
                                      <span className="flex items-center gap-1">
                                        Mobile App Branding
                                        <span className="text-xs text-emerald-300">(FREE)</span>
                                      </span>
                                    </li>
                                  )}
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
                          {currentPlanName || (enabledAddons.length > 0 ? `À la carte (${enabledAddons.length} service${enabledAddons.length !== 1 ? 's' : ''})` : "Not selected")}
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

          {/* Pay Invoice Tab */}
          <TabsContent value="pay-invoice" className="space-y-6">
            <Card className="rounded-3xl border-white/10 bg-gradient-to-br from-[#0f172a]/90 via-[#1e293b]/80 to-[#334155]/70 text-blue-50 shadow-xl shadow-blue-900/30">
              <CardHeader className="border-b border-white/10 pb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl font-bold text-white flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 to-sky-500/20">
                        <CreditCard className="h-6 w-6 text-emerald-300" />
                      </div>
                      Pay Your Invoice
                    </CardTitle>
                    <p className="text-sm text-blue-100/70 mt-2">Make a secure payment to Chain Software Group</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <SiVisa className="h-10 w-14 text-[#1A1F71]" />
                    <SiMastercard className="h-10 w-10 text-[#EB001B]" />
                    <SiAmericanexpress className="h-10 w-10 text-[#006FCF]" />
                    <SiDiscover className="h-10 w-10 text-[#FF6600]" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-8">
                {/* Payment Method Toggle */}
                <div className="flex gap-2 mb-8">
                  <Button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={cn(
                      "flex-1 py-4 rounded-xl text-sm font-semibold transition-all",
                      paymentMethod === 'card'
                        ? "bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-lg shadow-sky-900/30"
                        : "bg-white/10 text-blue-100 border border-white/20 hover:bg-white/15"
                    )}
                    data-testid="button-payment-card"
                  >
                    <CreditCard className="h-5 w-5 mr-2" />
                    Credit / Debit Card
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setPaymentMethod('ach')}
                    className={cn(
                      "flex-1 py-4 rounded-xl text-sm font-semibold transition-all",
                      paymentMethod === 'ach'
                        ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/30"
                        : "bg-white/10 text-blue-100 border border-white/20 hover:bg-white/15"
                    )}
                    data-testid="button-payment-ach"
                  >
                    <Building2 className="h-5 w-5 mr-2" />
                    Bank Account (ACH)
                  </Button>
                </div>

                {/* Card Payment Form */}
                {paymentMethod === 'card' && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="cardholder-name" className="text-sm font-medium text-blue-100/80">
                        Cardholder Name
                      </Label>
                      <Input
                        id="cardholder-name"
                        placeholder="John Smith"
                        value={paymentForm.cardholderName}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, cardholderName: e.target.value }))}
                        className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl"
                        data-testid="input-cardholder-name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="card-number" className="text-sm font-medium text-blue-100/80">
                        Card Number
                      </Label>
                      <div className="relative">
                        <Input
                          id="card-number"
                          placeholder="1234 5678 9012 3456"
                          value={paymentForm.cardNumber}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 16);
                            const formatted = value.replace(/(\d{4})(?=\d)/g, '$1 ');
                            setPaymentForm(prev => ({ ...prev, cardNumber: formatted }));
                          }}
                          className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl pr-12"
                          data-testid="input-card-number"
                        />
                        <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-100/40" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="expiry-month" className="text-sm font-medium text-blue-100/80">
                          Expiry Month
                        </Label>
                        <Input
                          id="expiry-month"
                          placeholder="MM"
                          maxLength={2}
                          value={paymentForm.expiryMonth}
                          onChange={(e) => setPaymentForm(prev => ({ ...prev, expiryMonth: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                          className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl text-center"
                          data-testid="input-expiry-month"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="expiry-year" className="text-sm font-medium text-blue-100/80">
                          Expiry Year
                        </Label>
                        <Input
                          id="expiry-year"
                          placeholder="YY"
                          maxLength={2}
                          value={paymentForm.expiryYear}
                          onChange={(e) => setPaymentForm(prev => ({ ...prev, expiryYear: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                          className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl text-center"
                          data-testid="input-expiry-year"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cvv" className="text-sm font-medium text-blue-100/80">
                          CVV
                        </Label>
                        <Input
                          id="cvv"
                          placeholder="123"
                          maxLength={4}
                          type="password"
                          value={paymentForm.cvv}
                          onChange={(e) => setPaymentForm(prev => ({ ...prev, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                          className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl text-center"
                          data-testid="input-cvv"
                        />
                      </div>
                    </div>

                    {/* Billing Address */}
                    <div className="pt-4 border-t border-white/10">
                      <h4 className="text-sm font-semibold text-white mb-4">Billing Address</h4>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="billing-address" className="text-sm font-medium text-blue-100/80">
                            Street Address
                          </Label>
                          <Input
                            id="billing-address"
                            placeholder="123 Main Street"
                            value={paymentForm.billingAddress}
                            onChange={(e) => setPaymentForm(prev => ({ ...prev, billingAddress: e.target.value }))}
                            className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl"
                            data-testid="input-billing-address"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="billing-city" className="text-sm font-medium text-blue-100/80">
                              City
                            </Label>
                            <Input
                              id="billing-city"
                              placeholder="Buffalo"
                              value={paymentForm.billingCity}
                              onChange={(e) => setPaymentForm(prev => ({ ...prev, billingCity: e.target.value }))}
                              className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl"
                              data-testid="input-billing-city"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="billing-state" className="text-sm font-medium text-blue-100/80">
                              State
                            </Label>
                            <Input
                              id="billing-state"
                              placeholder="NY"
                              maxLength={2}
                              value={paymentForm.billingState}
                              onChange={(e) => setPaymentForm(prev => ({ ...prev, billingState: e.target.value.toUpperCase().slice(0, 2) }))}
                              className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl text-center"
                              data-testid="input-billing-state"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="billing-zip" className="text-sm font-medium text-blue-100/80">
                              ZIP Code
                            </Label>
                            <Input
                              id="billing-zip"
                              placeholder="14201"
                              maxLength={10}
                              value={paymentForm.billingZip}
                              onChange={(e) => setPaymentForm(prev => ({ ...prev, billingZip: e.target.value }))}
                              className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl text-center"
                              data-testid="input-billing-zip"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ACH Payment Form */}
                {paymentMethod === 'ach' && (
                  <div className="space-y-6">
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 mb-6">
                      <p className="text-sm text-emerald-200">
                        <Building2 className="h-4 w-4 inline mr-2" />
                        ACH payments are processed directly from your bank account. No credit card fees apply.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="account-holder-name" className="text-sm font-medium text-blue-100/80">
                        Account Holder Name
                      </Label>
                      <Input
                        id="account-holder-name"
                        placeholder="John Smith or Company Name"
                        value={paymentForm.accountHolderName}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, accountHolderName: e.target.value }))}
                        className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl"
                        data-testid="input-account-holder-name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="routing-number" className="text-sm font-medium text-blue-100/80">
                        Routing Number (ABA)
                      </Label>
                      <Input
                        id="routing-number"
                        placeholder="021000021"
                        maxLength={9}
                        value={paymentForm.routingNumber}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, routingNumber: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                        className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl"
                        data-testid="input-routing-number"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="account-number" className="text-sm font-medium text-blue-100/80">
                        Account Number
                      </Label>
                      <Input
                        id="account-number"
                        placeholder="Enter your account number"
                        value={paymentForm.accountNumber}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, accountNumber: e.target.value.replace(/\D/g, '') }))}
                        className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl"
                        data-testid="input-account-number"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm-account-number" className="text-sm font-medium text-blue-100/80">
                        Confirm Account Number
                      </Label>
                      <Input
                        id="confirm-account-number"
                        placeholder="Re-enter your account number"
                        value={paymentForm.confirmAccountNumber}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, confirmAccountNumber: e.target.value.replace(/\D/g, '') }))}
                        className="border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50 h-12 rounded-xl"
                        data-testid="input-confirm-account-number"
                      />
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <div className="mt-8 pt-6 border-t border-white/10">
                  <Button
                    onClick={async () => {
                      // Validate form based on payment method
                      if (paymentMethod === 'card') {
                        if (!paymentForm.cardholderName || !paymentForm.cardNumber || 
                            !paymentForm.expiryMonth || !paymentForm.expiryYear || !paymentForm.cvv) {
                          toast({
                            title: "Missing information",
                            description: "Please fill in all card details.",
                            variant: "destructive",
                          });
                          return;
                        }
                      } else if (paymentMethod === 'ach') {
                        if (!paymentForm.accountHolderName || !paymentForm.routingNumber || 
                            !paymentForm.accountNumber || !paymentForm.confirmAccountNumber) {
                          toast({
                            title: "Missing information",
                            description: "Please fill in all bank account details.",
                            variant: "destructive",
                          });
                          return;
                        }
                        if (paymentForm.accountNumber !== paymentForm.confirmAccountNumber) {
                          toast({
                            title: "Account numbers don't match",
                            description: "Please verify your account number.",
                            variant: "destructive",
                          });
                          return;
                        }
                      }

                      setIsProcessingPayment(true);
                      try {
                        const paymentData = {
                          paymentMethod,
                          amount: stats.totalBill || 0,
                          // Card fields
                          cardholderName: paymentForm.cardholderName,
                          cardNumber: paymentForm.cardNumber,
                          expiryMonth: paymentForm.expiryMonth,
                          expiryYear: paymentForm.expiryYear,
                          cvv: paymentForm.cvv,
                          billingAddress: paymentForm.billingAddress,
                          billingCity: paymentForm.billingCity,
                          billingState: paymentForm.billingState,
                          billingZip: paymentForm.billingZip,
                          // ACH fields
                          accountHolderName: paymentForm.accountHolderName,
                          routingNumber: paymentForm.routingNumber,
                          accountNumber: paymentForm.accountNumber,
                        };

                        const result = await apiRequest("POST", "/api/billing/platform-payment", paymentData) as any;
                        
                        if (result.success) {
                          toast({
                            title: "Payment successful!",
                            description: `Transaction ID: ${result.transactionId}`,
                          });
                          // Reset form
                          setPaymentForm({
                            cardholderName: '',
                            cardNumber: '',
                            expiryMonth: '',
                            expiryYear: '',
                            cvv: '',
                            billingAddress: '',
                            billingCity: '',
                            billingState: '',
                            billingZip: '',
                            accountHolderName: '',
                            routingNumber: '',
                            accountNumber: '',
                            confirmAccountNumber: '',
                          });
                          // Refresh billing data
                          queryClient.invalidateQueries({ queryKey: ["/api/billing/stats"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
                        } else {
                          toast({
                            title: "Payment failed",
                            description: result.message || "Please try again.",
                            variant: "destructive",
                          });
                        }
                      } catch (error: any) {
                        toast({
                          title: "Payment error",
                          description: error.message || "Please try again or contact support.",
                          variant: "destructive",
                        });
                      } finally {
                        setIsProcessingPayment(false);
                      }
                    }}
                    disabled={isProcessingPayment}
                    className="w-full py-6 rounded-xl bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white text-lg font-bold shadow-xl shadow-emerald-900/30 hover:from-emerald-500 hover:via-green-500 hover:to-teal-500 transition-all disabled:opacity-50"
                    data-testid="button-submit-payment"
                  >
                    {isProcessingPayment ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Lock className="h-5 w-5 mr-2" />
                        Pay Now {stats.totalBill > 0 && `- ${formatCurrency(stats.totalBill)}`}
                      </>
                    )}
                  </Button>
                  <div className="flex items-center justify-center gap-2 mt-4 text-xs text-blue-100/60">
                    <Lock className="h-3 w-3" />
                    <span>Secured by Authorize.net - PCI DSS Compliant</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
      <Dialog open={updateBillingOpen} onOpenChange={setUpdateBillingOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] border-white/20 text-white">
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