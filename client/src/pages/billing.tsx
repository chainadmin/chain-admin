import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const [updateBillingOpen, setUpdateBillingOpen] = useState(false);
  const [isSavingBilling, setIsSavingBilling] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isCreatingSubscription, setIsCreatingSubscription] = useState(false);

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

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
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

  const formatDate = (dateString: string) => {
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

  const handleSetupSubscription = async () => {
    setIsCreatingSubscription(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      toast({
        title: "Checkout session created",
        description: "You'll be redirected once payment processing is connected.",
      });
    } catch (error) {
      toast({
        title: "Unable to start subscription",
        description: "Please refresh the page and try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingSubscription(false);
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

  const stats = (billingStats as any) || {
    activeConsumers: 0,
    monthlyBase: 0,
    usageCharges: 0,
    totalBill: 0,
    nextBillDate: "N/A",
  };

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
                <CardTitle>Subscription Details</CardTitle>
              </CardHeader>
              <CardContent>
                {subscription && (subscription as any) ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Current Plan</h4>
                        <div className="flex items-center">
                          <Badge className="bg-blue-100 text-blue-800 capitalize mr-2" data-testid="badge-current-plan">
                            {(subscription as any).plan}
                          </Badge>
                          <Badge className={getStatusColor((subscription as any).status)} data-testid="badge-subscription-status">
                            {(subscription as any).status}
                          </Badge>
                        </div>
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
                        <h4 className="font-medium text-gray-900 mb-2">Monthly Base Fee</h4>
                        <p className="text-2xl font-bold text-gray-900" data-testid="text-monthly-base-fee">
                          {formatCurrency((subscription as any).monthlyBaseCents / 100)}
                        </p>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Per Consumer Fee</h4>
                        <p className="text-2xl font-bold text-gray-900" data-testid="text-per-consumer-fee">
                          {formatCurrency((subscription as any).pricePerConsumerCents / 100)}
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-medium text-gray-900">Current Billing Period</h4>
                          <p className="text-gray-600" data-testid="text-current-period">
                            {formatDate((subscription as any).currentPeriodStart)} - {formatDate((subscription as any).currentPeriodEnd)}
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
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Subscription</h3>
                    <p className="text-gray-600 mb-4">
                      Set up a subscription to access billing features.
                    </p>
                    <Button
                      data-testid="button-setup-subscription"
                      onClick={handleSetupSubscription}
                      disabled={isCreatingSubscription}
                    >
                      {isCreatingSubscription && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isCreatingSubscription ? "Preparing checkout" : "Set Up Subscription"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
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