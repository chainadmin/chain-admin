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
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Calendar,
  User,
  Building2,
  Lock,
  Sparkles,
  ShieldCheck,
  Wallet
} from "lucide-react";

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
        return "rounded-full border border-emerald-200 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700";
      case "pending":
        return "rounded-full border border-amber-200 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700";
      case "processing":
        return "rounded-full border border-sky-200 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700";
      case "failed":
        return "rounded-full border border-rose-200 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-700";
      default:
        return "rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600";
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

  const glassPanelClass = "rounded-3xl border border-white/15 bg-white/95 text-slate-900 shadow-xl shadow-blue-900/10 backdrop-blur";

  if (paymentsLoading || statsLoading) {
    return (
      <AdminLayout>
        <div className="flex h-96 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-b-transparent"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 text-blue-50 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-sky-600/20 via-indigo-600/15 to-blue-900/20 p-8 shadow-2xl shadow-blue-900/30 backdrop-blur">
          <div className="pointer-events-none absolute -right-12 top-12 h-64 w-64 rounded-full bg-sky-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-6 h-56 w-56 rounded-full bg-indigo-500/30 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100/80">
                <Sparkles className="h-3.5 w-3.5" />
                Payment operations hub
              </span>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold text-white sm:text-4xl">Modernize every transaction touchpoint</h1>
                <p className="text-sm text-blue-100/70 sm:text-base">
                  Monitor cash flow in real time, pivot between statuses instantly, and launch secure card payments without leaving your workspace.
                  Compliance-grade controls keep every dollar accounted for across teams and processors.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-blue-100/80">
                  <ShieldCheck className="mb-2 h-5 w-5 text-blue-100/90" />
                  <p className="font-semibold text-white">Dispute-ready audit trails</p>
                  <p className="mt-1 text-xs text-blue-100/70">Auto-log processor responses, channel origin, and timestamps for every attempted payment.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-blue-100/80">
                  <User className="mb-2 h-5 w-5 text-blue-100/90" />
                  <p className="font-semibold text-white">Consumer-first workflows</p>
                  <p className="mt-1 text-xs text-blue-100/70">Launch secure pay-by-phone or portal collections with one click while honoring consent.</p>
                </div>
              </div>
            </div>
            <div className="w-full max-w-md space-y-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-xl shadow-blue-900/30 backdrop-blur">
              <div className="flex items-center justify-between text-blue-100/80">
                <p className="text-xs uppercase tracking-widest">Live processing</p>
                <Wallet className="h-5 w-5" />
              </div>
              <div className="grid gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs uppercase text-blue-100/70">Total processed</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(stats.totalAmountCents)}</p>
                  <p className="text-xs text-blue-100/60">Across all channels</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs uppercase text-blue-100/70">Successful payments</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{stats.successfulPayments || 0}</p>
                  <p className="text-xs text-blue-100/60">{stats.totalProcessed || 0} total transactions</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Card className={glassPanelClass}>
            <CardContent className="flex items-center justify-between p-6">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-500">Total processed</p>
                <p className="text-2xl font-semibold text-slate-900">{formatCurrency(stats.totalAmountCents)}</p>
              </div>
              <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-600">
                <DollarSign className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
          <Card className={glassPanelClass}>
            <CardContent className="flex items-center justify-between p-6">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-500">Total transactions</p>
                <p className="text-2xl font-semibold text-slate-900">{stats.totalProcessed || 0}</p>
              </div>
              <div className="rounded-full bg-sky-500/10 p-3 text-sky-600">
                <TrendingUp className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
          <Card className={glassPanelClass}>
            <CardContent className="flex items-center justify-between p-6">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-500">Completed payments</p>
                <p className="text-2xl font-semibold text-slate-900">{stats.successfulPayments || 0}</p>
              </div>
              <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-600">
                <CheckCircle className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
          <Card className={glassPanelClass}>
            <CardContent className="flex items-center justify-between p-6">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-500">Pending queue</p>
                <p className="text-2xl font-semibold text-slate-900">{stats.pendingPayments || 0}</p>
              </div>
              <div className="rounded-full bg-amber-500/10 p-3 text-amber-600">
                <Clock className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className={glassPanelClass}>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-800">Filter payments</CardTitle>
            <p className="text-sm text-slate-500">Slice your ledger by current processor status.</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="status-filter" className="text-sm font-semibold text-slate-600">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-48 rounded-xl border border-slate-200 bg-white/80 text-slate-700 shadow-sm" data-testid="select-payment-status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={glassPanelClass}>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-800">Payment transactions ({filteredPayments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredPayments.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-400">
                  <CreditCard className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">No payments yet</h3>
                <p className="mt-2 text-sm text-slate-500">
                  {filterStatus === "all"
                    ? "Once transactions process through USAePay they will populate this timeline."
                    : `There are no ${filterStatus} payments right now.`}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredPayments.map((payment: any) => (
                  <div
                    key={payment.id}
                    className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm shadow-blue-900/10 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex-1 space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/5 text-slate-700">
                            {getPaymentMethodIcon(payment.paymentMethod)}
                          </div>
                          <h3 className="text-lg font-semibold text-slate-900">{formatCurrency(payment.amountCents)}</h3>
                          <Badge className={getStatusColor(payment.status)}>
                            {payment.status?.replace("_", " ") || "Unknown"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 gap-4 text-sm text-slate-600 md:grid-cols-4">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">Consumer</p>
                            <p className="font-semibold text-slate-800">{payment.consumerName || payment.consumerEmail}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">Method</p>
                            <p className="font-semibold text-slate-800">{payment.paymentMethod?.replace("_", " ")}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">Account</p>
                            <p className="font-semibold text-slate-800">{payment.accountCreditor || "General payment"}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">Date</p>
                            <p className="font-semibold text-slate-800">{formatDate(payment.createdAt)}</p>
                          </div>
                        </div>

                        {payment.transactionId && (
                          <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 text-sm text-slate-600">
                            <p className="font-mono text-xs text-slate-500">Transaction ID</p>
                            <p className="mt-1 font-mono text-slate-800">{payment.transactionId}</p>
                          </div>
                        )}

                        {payment.notes && (
                          <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 text-sm text-slate-600">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                            <p className="mt-1 text-slate-700">{payment.notes}</p>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                          {payment.processedAt && (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-emerald-500" />
                              <span>Processed {formatDate(payment.processedAt)}</span>
                            </div>
                          )}
                          {payment.processorResponse && (
                            <div className="flex items-center gap-2">
                              <RefreshCw className="h-4 w-4 text-slate-400" />
                              <span>Processor: {payment.processorResponse.slice(0, 60)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        {payment.status === "failed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white"
                            data-testid={`button-retry-${payment.id}`}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Retry
                          </Button>
                        )}

                        {payment.status === "completed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full border-rose-200 bg-rose-50/70 px-4 py-2 text-sm font-semibold text-rose-500 shadow-sm hover:bg-rose-100"
                            data-testid={`button-refund-${payment.id}`}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Refund
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`${glassPanelClass} relative overflow-hidden`}>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-800">Process a payment</CardTitle>
            <p className="text-sm text-slate-500">Launch a secure, PCI-aware payment without leaving the dashboard.</p>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-8 text-center text-slate-700">
              <div className="pointer-events-none absolute -right-24 top-0 h-56 w-56 rounded-full bg-sky-200/50 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 left-0 h-56 w-56 rounded-full bg-indigo-200/50 blur-3xl" />
              <div className="relative z-10 space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700">
                  <CreditCard className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900">Accept credit & debit cards instantly</h3>
                <p className="mx-auto max-w-md text-sm text-slate-600">
                  Tokenized transactions settle directly into your processor with the same audit log you review above.
                </p>
                <Dialog open={showPayNowModal} onOpenChange={setShowPayNowModal}>
                  <DialogTrigger asChild>
                    <Button
                      size="lg"
                      className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-400/40 hover:bg-slate-800"
                      data-testid="button-pay-now"
                    >
                      <CreditCard className="mr-2 h-5 w-5" />
                      Pay now
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg rounded-3xl border border-slate-200/70 bg-white/95 p-8 shadow-xl shadow-blue-900/10 backdrop-blur-xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                        <Lock className="h-5 w-5 text-emerald-500" />
                        Secure payment processing
                      </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handlePayNowSubmit} className="space-y-5">
                      <div className="space-y-2 text-left">
                        <Label className="text-sm font-semibold text-slate-600">Consumer email *</Label>
                        <Select value={payNowForm.consumerEmail} onValueChange={(value) => handlePayNowFormChange("consumerEmail", value)}>
                          <SelectTrigger className="rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm" data-testid="select-paynow-consumer">
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

                      <div className="space-y-2 text-left">
                        <Label className="text-sm font-semibold text-slate-600">Payment amount *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={payNowForm.amount}
                          onChange={(e) => handlePayNowFormChange("amount", e.target.value)}
                          placeholder="0.00"
                          data-testid="input-paynow-amount"
                          required
                          className="rounded-xl border border-slate-200"
                        />
                      </div>

                      <div className="space-y-4 rounded-2xl border border-slate-200/70 bg-white/70 p-4 text-left">
                        <h4 className="text-sm font-semibold text-slate-700">Card information</h4>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Card number *</Label>
                          <Input
                            value={payNowForm.cardNumber}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
                              if (value.replace(/\s/g, "").length <= 16) {
                                handlePayNowFormChange("cardNumber", value);
                              }
                            }}
                            placeholder="1234 5678 9012 3456"
                            maxLength={19}
                            data-testid="input-card-number"
                            required
                            className="rounded-xl border border-slate-200"
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expiry date *</Label>
                            <Input
                              value={payNowForm.expiryDate}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, "").replace(/(\d{2})(\d{2})/, "$1/$2");
                                if (value.length <= 5) {
                                  handlePayNowFormChange("expiryDate", value);
                                }
                              }}
                              placeholder="MM/YY"
                              maxLength={5}
                              data-testid="input-expiry-date"
                              required
                              className="rounded-xl border border-slate-200"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">CVV *</Label>
                            <Input
                              type="password"
                              value={payNowForm.cvv}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, "");
                                if (value.length <= 4) {
                                  handlePayNowFormChange("cvv", value);
                                }
                              }}
                              placeholder="123"
                              maxLength={4}
                              data-testid="input-cvv"
                              required
                              className="rounded-xl border border-slate-200"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cardholder name *</Label>
                          <Input
                            value={payNowForm.cardName}
                            onChange={(e) => handlePayNowFormChange("cardName", e.target.value)}
                            placeholder="John Doe"
                            data-testid="input-card-name"
                            required
                            className="rounded-xl border border-slate-200"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">ZIP code *</Label>
                          <Input
                            value={payNowForm.zipCode}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, "");
                              if (value.length <= 5) {
                                handlePayNowFormChange("zipCode", value);
                              }
                            }}
                            placeholder="12345"
                            maxLength={5}
                            data-testid="input-zip-code"
                            required
                            className="rounded-xl border border-slate-200"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-slate-200 bg-white/80 px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white"
                          onClick={() => setShowPayNowModal(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={processPaymentMutation.isPending}
                          className="rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-400/40 hover:bg-slate-800"
                        >
                          {processPaymentMutation.isPending ? (
                            <div className="flex items-center gap-2">
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-b-transparent" />
                              Processing...
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Lock className="h-4 w-4" />
                              Process payment
                            </div>
                          )}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
                <p className="text-xs text-slate-500">USAePay gateway with PCI-compliant vaulting.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}