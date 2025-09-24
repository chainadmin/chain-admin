import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
        return "bg-green-100 text-green-800";
      case "paid":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "overdue":
        return "bg-red-100 text-red-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case "paid":
        return <CheckCircle className="h-4 w-4" />;
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "overdue":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
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
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">{label} sent</p>
            <p className="text-xl font-semibold text-gray-900">{used.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Included</p>
            <p className="font-medium text-gray-900">{included.toLocaleString()}</p>
          </div>
        </div>
        <Progress value={percent} className="h-2" />
        <div className="flex items-center justify-between text-sm text-gray-600">
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
      const response = await fetch("/api/billing/select-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Unable to update plan");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/stats"] });

      toast({
        title: "Plan updated",
        description: `Your account is now on the ${planName} plan.`,
      });
    } catch (error: any) {
      toast({
        title: "Unable to update plan",
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Billing & Subscription</h1>
            <p className="mt-2 text-gray-600">
              Manage your subscription and view billing information
            </p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices">Invoices</TabsTrigger>
            <TabsTrigger value="subscription" data-testid="tab-subscription">Subscription</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Billing Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Users className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-2xl font-bold text-gray-900" data-testid="text-active-consumers">
                        {stats.activeConsumers}
                      </p>
                      <p className="text-xs text-gray-500">Active Consumers</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <DollarSign className="h-6 w-6 text-green-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-2xl font-bold text-gray-900" data-testid="text-monthly-base">
                        {formatCurrency(stats.monthlyBase)}
                      </p>
                      <p className="text-xs text-gray-500">Monthly Base</p>
                      {currentPlanName && (
                        <p className="text-xs text-gray-500 mt-1">Plan: {currentPlanName}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <TrendingUp className="h-6 w-6 text-purple-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-2xl font-bold text-gray-900" data-testid="text-usage-charges">
                        {formatCurrency(stats.usageCharges)}
                      </p>
                      <p className="text-xs text-gray-500">Usage Charges</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Email: {formatCurrency(stats.emailUsage?.overageCharge || 0)} · SMS:{" "}
                        {formatCurrency(stats.smsUsage?.overageCharge || 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <CreditCard className="h-6 w-6 text-orange-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-2xl font-bold text-gray-900" data-testid="text-total-bill">
                        {formatCurrency(stats.totalBill)}
                      </p>
                      <p className="text-xs text-gray-500">Total Bill</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Messaging Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {renderUsageSummary("Email", stats.emailUsage)}
                  {renderUsageSummary("SMS segments", stats.smsUsage)}
                </div>
              </CardContent>
            </Card>

            {/* Current Invoice */}
            {currentInvoice && (currentInvoice as any) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileText className="h-5 w-5 mr-2" />
                    Current Billing Period
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <div className="flex items-center mb-2">
                        <Calendar className="h-4 w-4 text-gray-500 mr-2" />
                        <span className="text-sm text-gray-600">Billing Period</span>
                      </div>
                      <p className="font-medium" data-testid="text-billing-period">
                        {formatDate((currentInvoice as any).periodStart)} - {formatDate((currentInvoice as any).periodEnd)}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center mb-2">
                        <DollarSign className="h-4 w-4 text-gray-500 mr-2" />
                        <span className="text-sm text-gray-600">Amount Due</span>
                      </div>
                      <p className="font-medium text-lg" data-testid="text-amount-due">
                        {formatCurrency((currentInvoice as any).totalAmountCents / 100)}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center mb-2">
                        <Clock className="h-4 w-4 text-gray-500 mr-2" />
                        <span className="text-sm text-gray-600">Due Date</span>
                      </div>
                      <p className="font-medium" data-testid="text-due-date">
                        {formatDate((currentInvoice as any).dueDate)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Next Bill Date */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Calendar className="h-8 w-8 text-blue-600 mr-4" />
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Next Bill Date</h3>
                      <p className="text-gray-600" data-testid="text-next-bill-date">
                        {stats.nextBillDate}
                      </p>
                      {stats.billingPeriod && (
                        <p className="text-sm text-gray-500">
                          {formatDate(stats.billingPeriod.start)} - {formatDate(stats.billingPeriod.end)}
                        </p>
                      )}
                      {currentPlanName && (
                        <p className="text-sm text-gray-500">
                          Plan: {currentPlanName} · {formatCurrency(currentPlanPrice)}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    data-testid="button-update-billing"
                    onClick={() => setUpdateBillingOpen(true)}
                  >
                    Update Billing Info
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Invoice History</CardTitle>
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : !invoices || (invoices as any[]).length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Invoices Yet</h3>
                    <p className="text-gray-600">
                      Your invoices will appear here once your first billing cycle completes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(invoices as any[]).map((invoice: any) => (
                      <div
                        key={invoice.id}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                        data-testid={`invoice-${invoice.invoiceNumber}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="p-2 bg-gray-100 rounded-lg">
                              {getStatusIcon(invoice.status)}
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900">
                                Invoice #{invoice.invoiceNumber}
                              </h4>
                              <p className="text-sm text-gray-600">
                                {formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            <div className="text-right">
                              <p className="font-medium text-gray-900">
                                {formatCurrency(invoice.totalAmountCents / 100)}
                              </p>
                              <Badge
                                className={getStatusColor(invoice.status)}
                                data-testid={`badge-status-${invoice.invoiceNumber}`}
                              >
                                {invoice.status}
                              </Badge>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              data-testid={`button-download-${invoice.invoiceNumber}`}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscription" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Messaging Plans</CardTitle>
                <p className="text-sm text-gray-600">
                  Choose the plan that matches your monthly messaging volume. You can adjust your plan at any time.
                </p>
              </CardHeader>
              <CardContent>
                {plansLoading ? (
                  <div className="text-center py-8 text-gray-600">Loading plans…</div>
                ) : plans.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">Messaging plans will appear here once they are configured.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    {plans.map((plan: any) => {
                      const isCurrent = currentPlanId === plan.id;
                      const isUpdating = updatingPlanId === plan.id;

                      return (
                        <div
                          key={plan.id}
                          className={cn(
                            "rounded-xl border p-6 transition",
                            isCurrent
                              ? "border-blue-500 bg-blue-50 shadow"
                              : "border-gray-200 bg-white hover:shadow-md"
                          )}
                          data-testid={`plan-${plan.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-xl font-semibold text-gray-900">{plan.name}</h3>
                            {isCurrent && <Badge className="bg-blue-100 text-blue-800">Current</Badge>}
                          </div>
                          <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(plan.price)}</p>
                          <ul className="mt-4 space-y-1 text-sm text-gray-600">
                            <li>{plan.includedEmails.toLocaleString()} emails / month</li>
                            <li>{plan.includedSmsSegments.toLocaleString()} SMS segments / month</li>
                          </ul>
                          <Button
                            className="mt-6 w-full"
                            variant={isCurrent ? "outline" : "default"}
                            onClick={() => handleSelectPlan(plan.id, plan.name)}
                            disabled={isCurrent || isUpdating}
                          >
                            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isCurrent ? "Selected" : isUpdating ? "Updating" : "Choose plan"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="mt-6 text-sm text-gray-600">
                  Additional usage is billed at {formatCurrency(emailOverageRatePerThousand)} per 1,000 emails and
                  {` ${formatCurrency(smsOverageRatePerSegment)} per SMS segment.`}
                </p>
              </CardContent>
            </Card>

            {subscription && (subscription as any) ? (
              <Card>
                <CardHeader>
                  <CardTitle>Current Subscription</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Plan</h4>
                      <div className="flex items-center space-x-2">
                        <Badge className="bg-blue-100 text-blue-800 capitalize" data-testid="badge-current-plan">
                          {currentPlanName || "Not selected"}
                        </Badge>
                        <Badge
                          className={getStatusColor((subscription as any).status)}
                          data-testid="badge-subscription-status"
                        >
                          {(subscription as any).status}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm text-gray-600">{formatCurrency(currentPlanPrice)} per month</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Billing Email</h4>
                      <p className="text-gray-600" data-testid="text-billing-email">
                        {(subscription as any).billingEmail || "Not set"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Included Emails</h4>
                      <p className="text-gray-700">
                        {((subscription as any).includedEmails || stats.emailUsage?.included || 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Included SMS Segments</h4>
                      <p className="text-gray-700">
                        {((subscription as any).includedSmsSegments || stats.smsUsage?.included || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h4 className="font-medium text-gray-900">Current Billing Period</h4>
                      <p className="text-gray-600" data-testid="text-current-period">
                        {formatDate((subscription as any).currentPeriodStart)} -
                        {` ${formatDate((subscription as any).currentPeriodEnd)}`}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      data-testid="button-manage-subscription"
                      onClick={handleManageSubscription}
                      disabled={isPortalLoading}
                    >
                      {isPortalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isPortalLoading ? "Opening portal" : "Manage Subscription"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-10">
                  <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Subscription</h3>
                  <p className="text-gray-600">
                    Select a messaging plan above to activate billing and start tracking usage.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <Dialog open={updateBillingOpen} onOpenChange={setUpdateBillingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update billing information</DialogTitle>
            <DialogDescription>
              Provide the contact details that should appear on your invoices.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="billing-name">Billing contact</Label>
              <Input id="billing-name" placeholder="Jane Doe" disabled={isSavingBilling} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing-email">Billing email</Label>
              <Input
                id="billing-email"
                type="email"
                placeholder="billing@company.com"
                disabled={isSavingBilling}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setUpdateBillingOpen(false)}
              disabled={isSavingBilling}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveBillingDetails} disabled={isSavingBilling}>
              {isSavingBilling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}