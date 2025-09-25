import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CreditCard, DollarSign, TrendingUp, Clock, CheckCircle, RefreshCw, Calendar, User, Building2, Lock } from "lucide-react";

export default function Payments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("all");
  const [showPayNowModal, setShowPayNowModal] = useState(false);


  const [payNowForm, setPayNowForm] = useState({
    consumerEmail: "",
    amount: "",
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    cardName: "",
    zipCode: "",
  });

  // Fetch payment transactions
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["/api/payments"],
  });

  // Fetch payment stats
  const { data: paymentStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/payments/stats"],
  });

  // Fetch consumers for payments
  const { data: consumers } = useQuery({
    queryKey: ["/api/consumers"],
  });

  const handlePayNowFormChange = (field: string, value: string) => {
    setPayNowForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Process real-time payment mutation
  const processPaymentMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      // This would integrate with actual payment processor (Stripe, etc.)
      await apiRequest("POST", "/api/payments/process", paymentData);
    },
    onSuccess: () => {
      toast({
        title: "Payment Successful",
        description: "Payment has been processed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/stats"] });
      setShowPayNowModal(false);
      setPayNowForm({
        consumerEmail: "",
        amount: "",
        cardNumber: "",
        expiryDate: "",
        cvv: "",
        cardName: "",
        zipCode: "",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Payment Failed",
        description: error.message || "Unable to process payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePayNowSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!payNowForm.consumerEmail || !payNowForm.amount) {
      toast({
        title: "Missing Information",
        description: "Please fill in consumer and payment amount.",
        variant: "destructive",
      });
      return;
    }

    if (!payNowForm.cardNumber || !payNowForm.expiryDate || !payNowForm.cvv || !payNowForm.cardName) {
      toast({
        title: "Missing Card Information",
        description: "Please complete all card details.",
        variant: "destructive",
      });
      return;
    }

    const amountCents = Math.round(parseFloat(payNowForm.amount) * 100);
    if (amountCents <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid payment amount greater than $0.",
        variant: "destructive",
      });
      return;
    }

    processPaymentMutation.mutate({
      ...payNowForm,
      amountCents,
    });
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "border-emerald-200/70 bg-emerald-100/80 text-emerald-700";
      case "pending":
        return "border-amber-200/70 bg-amber-100/80 text-amber-700";
      case "processing":
        return "border-sky-200/70 bg-sky-100/80 text-sky-700";
      case "failed":
        return "border-rose-200/70 bg-rose-100/80 text-rose-700";
      case "refunded":
        return "border-indigo-200/70 bg-indigo-100/80 text-indigo-700";
      default:
        return "border-slate-200/70 bg-slate-100/80 text-slate-700";
    }
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method?.toLowerCase()) {
      case "credit_card":
        return <CreditCard className="h-4 w-4" />;
      case "debit_card":
        return <CreditCard className="h-4 w-4" />;
      case "ach":
        return <Building2 className="h-4 w-4" />;
      case "check":
        return <DollarSign className="h-4 w-4" />;
      case "cash":
        return <DollarSign className="h-4 w-4" />;
      default:
        return <DollarSign className="h-4 w-4" />;
    }
  };

  const filteredPayments = (payments as any[])?.filter((payment: any) => {
    if (filterStatus === "all") return true;
    return payment.status === filterStatus;
  }) || [];

  const stats = (paymentStats as any) || {
    totalProcessed: 0,
    totalAmountCents: 0,
    successfulPayments: 0,
    failedPayments: 0,
    pendingPayments: 0,
  };

  const glassPanelClass =
    "rounded-3xl border border-white/15 bg-white/95 text-slate-900 shadow-xl shadow-blue-900/10 backdrop-blur";
  const frostedCardClass =
    "rounded-3xl border border-white/15 bg-white/10 p-6 shadow-xl shadow-blue-900/20 backdrop-blur";

  if (paymentsLoading || statsLoading) {
    return (
    <AdminLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 text-blue-50 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/20 via-blue-600/20 to-indigo-900/20 p-8 shadow-2xl shadow-blue-900/40 backdrop-blur">
          <div className="pointer-events-none absolute -right-10 top-10 h-64 w-64 rounded-full bg-emerald-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-8 h-56 w-56 rounded-full bg-blue-500/30 blur-3xl" />
          <div className="relative z-10 space-y-8">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100/80">
                  <CreditCard className="h-3.5 w-3.5" />
                  Payments control center
                </span>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold text-white sm:text-4xl">Realtime payment operations</h1>
                  <p className="text-sm text-blue-100/70 sm:text-base">
                    Monitor USAePay performance, identify stalled transactions, and process secure consumer payments without leaving the workspace.
                  </p>
                </div>
              </div>
              <div className={cn(frostedCardClass, "w-full max-w-sm space-y-3")}>
                <p className="text-xs uppercase tracking-widest text-blue-100/70">Status snapshot</p>
                <div className="grid gap-3 text-blue-50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-100/70">Successful</span>
                    <span className="text-lg font-semibold text-white">{stats.successfulPayments}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-100/70">Pending</span>
                    <span className="text-lg font-semibold text-white">{stats.pendingPayments}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-100/70">Failed</span>
                    <span className="text-lg font-semibold text-white">{stats.failedPayments}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-5 shadow-lg shadow-blue-900/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-100/70">Total processed</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(stats.totalAmountCents)}</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-emerald-200" />
                </div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-5 shadow-lg shadow-blue-900/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-100/70">Transactions</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{stats.totalProcessed}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-sky-200" />
                </div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-5 shadow-lg shadow-blue-900/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-100/70">Successful</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{stats.successfulPayments}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-emerald-200" />
                </div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-5 shadow-lg shadow-blue-900/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-100/70">Pending</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{stats.pendingPayments}</p>
                  </div>
                  <Clock className="h-8 w-8 text-amber-200" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <Card className={glassPanelClass}>
              <CardHeader className="border-b border-white/20 pb-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-lg font-semibold text-slate-800">
                    Payment transactions ({filteredPayments.length})
                  </CardTitle>
                  <div className="text-sm text-slate-500">
                    Showing {filteredPayments.length} of {(payments as any[])?.length || 0} records
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {filteredPayments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200/70 bg-white/60 py-16 text-center text-slate-500">
                    <CreditCard className="mx-auto mb-4 h-12 w-12 text-slate-400" />
                    <h3 className="text-lg font-semibold text-slate-700">No payments yet</h3>
                    <p className="mt-2 text-sm">
                      {filterStatus === "all"
                        ? "Once payments are processed through USAePay they will appear here."
                        : `No ${filterStatus} payments matched your filter.`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredPayments.map((payment: any) => (
                      <div
                        key={payment.id}
                        className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm shadow-slate-900/5 transition hover:-translate-y-0.5 hover:shadow-lg"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/5 text-slate-700">
                                {getPaymentMethodIcon(payment.paymentMethod)}
                              </span>
                              <div>
                                <p className="text-xl font-semibold text-slate-800">{formatCurrency(payment.amountCents)}</p>
                                <p className="text-sm text-slate-500">{payment.accountCreditor || "General Payment"}</p>
                              </div>
                              <Badge
                                className={cn(
                                  "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide",
                                  getStatusColor(payment.status)
                                )}
                              >
                                {payment.status?.replace("_", " ") || "Unknown"}
                              </Badge>
                            </div>
                            <div className="grid gap-4 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <span className="text-xs uppercase tracking-wide text-slate-500">Consumer</span>
                                <p className="mt-1 font-semibold text-slate-800">
                                  {payment.consumerName || payment.consumerEmail}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-slate-500">Payment method</span>
                                <p className="mt-1 font-semibold capitalize text-slate-800">
                                  {payment.paymentMethod?.replace("_", " ")}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-slate-500">Date</span>
                                <p className="mt-1 font-semibold text-slate-800">{formatDate(payment.createdAt)}</p>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-slate-500">Processed</span>
                                <p className="mt-1 font-semibold text-slate-800">
                                  {payment.processedAt ? formatDate(payment.processedAt) : "Awaiting"}
                                </p>
                              </div>
                            </div>
                            {payment.transactionId && (
                              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3 text-xs text-slate-600">
                                <span className="font-semibold text-slate-700">Transaction ID:</span> {payment.transactionId}
                              </div>
                            )}
                            {payment.notes && (
                              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3 text-sm text-slate-600">
                                <span className="font-semibold text-slate-700">Notes:</span> {payment.notes}
                              </div>
                            )}
                            {payment.processorResponse && (
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <RefreshCw className="h-4 w-4" />
                                <span>{payment.processorResponse.slice(0, 80)}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-start gap-4 text-sm text-slate-500">
                            <div className="flex items-center">
                              <User className="mr-2 h-4 w-4" />
                              {payment.createdBy || "Agent"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-4">
            <Card className={glassPanelClass}>
              <CardHeader className="border-b border-white/20 pb-4">
                <CardTitle className="text-lg font-semibold text-slate-800">Filter payments</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <Label htmlFor="status-filter" className="text-sm font-semibold text-slate-700">
                    Status
                  </Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full rounded-xl border border-slate-200/70 bg-white/80" data-testid="select-payment-status">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className={glassPanelClass}>
              <CardHeader className="border-b border-white/20 pb-4">
                <CardTitle className="text-lg font-semibold text-slate-800">Process payment</CardTitle>
                <p className="text-sm text-slate-500">
                  Securely collect credit card payments in real time using the USAePay gateway.
                </p>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-900/5">
                    <Lock className="h-8 w-8 text-slate-700" />
                  </div>
                  <p className="text-sm text-slate-500">
                    Launch a secure payment flow for the selected consumer.
                  </p>
                  <Dialog open={showPayNowModal} onOpenChange={setShowPayNowModal}>
                    <DialogTrigger asChild>
                      <Button size="lg" className="mt-4 rounded-xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/30" data-testid="button-pay-now">
                        <CreditCard className="mr-2 h-5 w-5" />
                        Pay now
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-lg font-semibold">Secure Payment Processing</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handlePayNowSubmit} className="space-y-4">
                        <div>
                          <Label>Consumer Email *</Label>
                          <Select
                            value={payNowForm.consumerEmail}
                            onValueChange={(value) => handlePayNowFormChange("consumerEmail", value)}
                          >
                            <SelectTrigger data-testid="select-paynow-consumer">
                              <SelectValue placeholder="Select consumer" />
                            </SelectTrigger>
                            <SelectContent>
                              {(consumers as any[])?.map((consumer: any) => (
                                <SelectItem key={consumer.id} value={consumer.email}>
                                  {consumer.firstName} {consumer.lastName} ({consumer.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Payment Amount *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={payNowForm.amount}
                            onChange={(e) => handlePayNowFormChange("amount", e.target.value)}
                            placeholder="0.00"
                            data-testid="input-paynow-amount"
                            required
                          />
                        </div>
                        <div className="border-t border-slate-200/70 pt-4">
                          <h4 className="mb-3 text-sm font-semibold text-slate-700">Card information</h4>
                          <div className="space-y-4">
                            <div>
                              <Label>Card Number *</Label>
                              <Input
                                value={payNowForm.cardNumber}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
                                  if (value.replace(/\s/g, '').length <= 16) {
                                    handlePayNowFormChange("cardNumber", value);
                                  }
                                }}
                                placeholder="1234 5678 9012 3456"
                                maxLength={19}
                                data-testid="input-card-number"
                                required
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Expiry Date *</Label>
                                <Input
                                  value={payNowForm.expiryDate}
                                  onChange={(e) => {
                                    const value = e.target.value.replace(/\D/g, '').replace(/(\d{2})(\d{2})/, '$1/$2');
                                    if (value.length <= 5) {
                                      handlePayNowFormChange("expiryDate", value);
                                    }
                                  }}
                                  placeholder="MM/YY"
                                  maxLength={5}
                                  data-testid="input-expiry-date"
                                  required
                                />
                              </div>
                              <div>
                                <Label>CVV *</Label>
                                <Input
                                  type="password"
                                  value={payNowForm.cvv}
                                  onChange={(e) => {
                                    const value = e.target.value.replace(/\D/g, '');
                                    if (value.length <= 4) {
                                      handlePayNowFormChange("cvv", value);
                                    }
                                  }}
                                  placeholder="123"
                                  maxLength={4}
                                  data-testid="input-cvv"
                                  required
                                />
                              </div>
                            </div>
                            <div>
                              <Label>Cardholder Name *</Label>
                              <Input
                                value={payNowForm.cardName}
                                onChange={(e) => handlePayNowFormChange("cardName", e.target.value)}
                                placeholder="John Doe"
                                data-testid="input-card-name"
                                required
                              />
                            </div>
                            <div>
                              <Label>ZIP Code *</Label>
                              <Input
                                value={payNowForm.zipCode}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/\D/g, '');
                                  if (value.length <= 5) {
                                    handlePayNowFormChange("zipCode", value);
                                  }
                                }}
                                placeholder="12345"
                                maxLength={5}
                                data-testid="input-zip-code"
                                required
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                          <Button type="button" variant="outline" onClick={() => setShowPayNowModal(false)}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={processPaymentMutation.isPending}>
                            {processPaymentMutation.isPending ? (
                              <>
                                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <Lock className="mr-2 h-4 w-4" />
                                Process payment
                              </>
                            )}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
