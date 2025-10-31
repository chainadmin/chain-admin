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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CreditCard, DollarSign, TrendingUp, Clock, CheckCircle, RefreshCw, Calendar, User, Building2, Lock, Trash2, ThumbsUp, ThumbsDown } from "lucide-react";
import { PaymentSchedulingCalendar } from "@/components/payment-scheduling-calendar";

export default function Payments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("all");
  const [showPayNowModal, setShowPayNowModal] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  const [selectedConsumerForArrangement, setSelectedConsumerForArrangement] = useState<any | null>(null);


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

  // Fetch all payment schedules (pending payments)
  const { data: paymentSchedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ["/api/payment-schedules"],
  });

  // Fetch all payment methods (saved cards)
  const { data: paymentMethodsData, isLoading: methodsLoading } = useQuery({
    queryKey: ["/api/payment-methods"],
  });

  // Fetch selected consumer's payment arrangements
  const { data: consumerArrangements, isLoading: arrangementsLoading } = useQuery({
    queryKey: ["/api/payment-schedules/consumer", selectedConsumerForArrangement?.id],
    queryFn: async () => {
      if (!selectedConsumerForArrangement?.id) return [];
      const response = await apiRequest("GET", `/api/payment-schedules/consumer/${selectedConsumerForArrangement.id}`, null);
      const data = await response.json();
      return data;
    },
    enabled: !!selectedConsumerForArrangement?.id,
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

  // Delete payment mutation
  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      await apiRequest("DELETE", `/api/payments/${paymentId}`);
    },
    onSuccess: () => {
      toast({
        title: "Payment Deleted",
        description: "Payment has been removed from the system.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/stats"] });
      setPaymentToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Unable to delete payment. Please try again.",
        variant: "destructive",
      });
      setPaymentToDelete(null);
    },
  });

  // Approve payment schedule mutation
  const approveScheduleMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      await apiRequest("POST", `/api/payment-schedules/${scheduleId}/approve`, {});
    },
    onSuccess: () => {
      toast({
        title: "Arrangement Approved",
        description: "Payment arrangement has been approved and synced to SMAX.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-schedules"] });
    },
    onError: (error: any) => {
      toast({
        title: "Approval Failed",
        description: error.message || "Unable to approve arrangement. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Reject payment schedule mutation
  const rejectScheduleMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      await apiRequest("POST", `/api/payment-schedules/${scheduleId}/reject`, {});
    },
    onSuccess: () => {
      toast({
        title: "Arrangement Rejected",
        description: "Payment arrangement has been rejected and cancelled.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-schedules"] });
    },
    onError: (error: any) => {
      toast({
        title: "Rejection Failed",
        description: error.message || "Unable to reject arrangement. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete/cancel payment schedule mutation
  const deleteScheduleMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      await apiRequest("DELETE", `/api/payment-schedules/${scheduleId}`);
    },
    onSuccess: () => {
      toast({
        title: "Arrangement Deleted",
        description: "Payment arrangement has been cancelled.",
      });
      // Invalidate all payment schedule queries to ensure UI updates everywhere
      queryClient.invalidateQueries({ queryKey: ["/api/payment-schedules"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        query.queryKey[0] === "/api/payment-schedules/consumer" 
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Unable to delete arrangement. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Resync SMAX arrangements for a consumer
  const resyncSmaxMutation = useMutation({
    mutationFn: async (consumerId: string) => {
      const response = await apiRequest("POST", `/api/payment-schedules/resync-smax/${consumerId}`, {});
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "SMAX Resync Complete",
        description: `Synced ${data.syncedCount} of ${data.totalAccounts} accounts.`,
      });
      // Invalidate all payment schedule queries to ensure UI updates everywhere
      queryClient.invalidateQueries({ queryKey: ["/api/payment-schedules"] });
      queryClient.invalidateQueries({ predicate: (query) => 
        query.queryKey[0] === "/api/payment-schedules/consumer" 
      });
    },
    onError: (error: any) => {
      toast({
        title: "Resync Failed",
        description: error.message || "Unable to resync SMAX arrangements. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Manual payment processor trigger mutation
  const processScheduledPaymentsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/payments/process-scheduled', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to process scheduled payments');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Payment Processing Complete",
        description: `Processed: ${data.processed || 0} payments. Failed: ${data.failed || 0} payments.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-schedules"] });
    },
    onError: (error: any) => {
      toast({
        title: "Processing Failed",
        description: error.message || "Unable to process scheduled payments. Please try again.",
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
        return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
      case "pending":
        return "border-amber-300/40 bg-amber-500/10 text-amber-100";
      case "processing":
        return "border-sky-400/40 bg-sky-500/10 text-sky-100";
      case "failed":
        return "border-rose-400/40 bg-rose-500/10 text-rose-100";
      case "refunded":
        return "border-indigo-400/40 bg-indigo-500/10 text-indigo-100";
      default:
        return "border-slate-400/30 bg-slate-500/10 text-slate-100";
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
    "rounded-3xl border border-white/15 bg-[#0b1733]/80 text-blue-50 shadow-xl shadow-blue-900/20 backdrop-blur";
  const frostedCardClass =
    "rounded-3xl border border-white/15 bg-white/10 p-6 text-blue-50 shadow-xl shadow-blue-900/30 backdrop-blur";

  if (paymentsLoading || statsLoading) {
    return (
      <AdminLayout>
        <div className="flex h-[calc(100vh-12rem)] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        </div>
      </AdminLayout>
    );
  }

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
                  <h1 className="text-3xl font-semibold text-white sm:text-4xl">Payment operations & scheduling</h1>
                  <p className="text-sm text-blue-100/70 sm:text-base">
                    Monitor USAePay performance, identify stalled transactions, track payment schedules, and process secure consumer payments.
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

        <Tabs defaultValue="transactions" className="w-full">
          <div className="flex items-center justify-between mb-6">
            <TabsList className="bg-white/10 border border-white/15">
              <TabsTrigger value="transactions" data-testid="tab-transactions">
                <CreditCard className="w-4 h-4 mr-2" />
                Transactions
              </TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending">
                <Clock className="w-4 h-4 mr-2" />
                Pending Payments
                {paymentSchedules && (paymentSchedules as any[]).length > 0 ? (
                  <Badge className="ml-2 bg-amber-500 text-white">
                    {(paymentSchedules as any[]).length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="calendar" data-testid="tab-calendar">
                <Calendar className="w-4 h-4 mr-2" />
                Payment Schedule
              </TabsTrigger>
            </TabsList>
            
            <Button
              onClick={() => processScheduledPaymentsMutation.mutate()}
              disabled={processScheduledPaymentsMutation.isPending}
              className="ml-4 bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-process-scheduled"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", processScheduledPaymentsMutation.isPending && "animate-spin")} />
              {processScheduledPaymentsMutation.isPending ? "Processing..." : "Process Scheduled Payments"}
            </Button>
          </div>

          <TabsContent value="transactions" className="mt-0">
            <section className="grid gap-8 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-8">
            <Card className={glassPanelClass}>
              <CardHeader className="border-b border-white/20 pb-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-lg font-semibold text-blue-50">
                    Payment transactions ({filteredPayments.length})
                  </CardTitle>
                  <div className="text-sm text-blue-100/70">
                    Showing {filteredPayments.length} of {(payments as any[])?.length || 0} records
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {filteredPayments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 py-16 text-center text-blue-100/70">
                    <CreditCard className="mx-auto mb-4 h-12 w-12 text-blue-200/80" />
                    <h3 className="text-lg font-semibold text-blue-50">No payments yet</h3>
                    <p className="mt-2 text-sm text-blue-100/70">
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
                        className="rounded-2xl border border-white/15 bg-white/5 p-5 text-blue-50 shadow-sm shadow-blue-900/10 transition hover:-translate-y-0.5 hover:border-white/25 hover:shadow-lg"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-blue-100">
                                {getPaymentMethodIcon(payment.paymentMethod)}
                              </span>
                              <div>
                                <p className="text-xl font-semibold text-white">{formatCurrency(payment.amountCents)}</p>
                                <p className="text-sm text-blue-100/80">{payment.accountCreditor || "General Payment"}</p>
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
                            <div className="grid gap-4 text-sm text-blue-100/80 sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Consumer</span>
                                <p className="mt-1 font-semibold text-blue-50">
                                  {payment.consumerName || payment.consumerEmail}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Payment method</span>
                                <p className="mt-1 font-semibold capitalize text-blue-50">
                                  {payment.paymentMethod?.replace("_", " ")}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Date</span>
                                <p className="mt-1 font-semibold text-blue-50">{formatDate(payment.createdAt)}</p>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Processed</span>
                                <p className="mt-1 font-semibold text-blue-50">
                                  {payment.processedAt ? formatDate(payment.processedAt) : "Awaiting"}
                                </p>
                              </div>
                            </div>
                            {payment.transactionId && (
                              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-blue-100/80">
                                <span className="font-semibold text-blue-50">Transaction ID:</span> {payment.transactionId}
                              </div>
                            )}
                            {payment.notes && (
                              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-blue-100/80">
                                <span className="font-semibold text-blue-50">Notes:</span> {payment.notes}
                              </div>
                            )}
                            {payment.processorResponse && (
                              <div className="flex items-center gap-2 text-xs text-blue-100/70">
                                <RefreshCw className="h-4 w-4" />
                                <span>{payment.processorResponse.slice(0, 80)}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-start gap-4 text-sm text-blue-100/80">
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center">
                                <User className="mr-2 h-4 w-4" />
                                {payment.createdBy || "Agent"}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPaymentToDelete(payment.id)}
                                className="h-8 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 text-rose-100 transition hover:bg-rose-500/20"
                                data-testid={`button-delete-payment-${payment.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
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
                <CardTitle className="text-lg font-semibold text-blue-50">Filter payments</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <Label htmlFor="status-filter" className="text-sm font-semibold text-blue-100/80">
                    Status
                  </Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger
                      className="w-full rounded-xl border border-white/20 bg-white/10 text-blue-50 backdrop-blur placeholder:text-blue-100/60"
                      data-testid="select-payment-status"
                    >
                      <SelectValue placeholder="All statuses" className="text-blue-50" />
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
                <CardTitle className="text-lg font-semibold text-blue-50">Process payment</CardTitle>
                <p className="text-sm text-blue-100/70">
                  Securely collect credit card payments in real time using the USAePay gateway.
                </p>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                    <Lock className="h-8 w-8 text-blue-100" />
                  </div>
                  <p className="text-sm text-blue-100/70">
                    Launch a secure payment flow for the selected consumer.
                  </p>
                  <Dialog open={showPayNowModal} onOpenChange={setShowPayNowModal}>
                    <DialogTrigger asChild>
                      <Button
                        size="lg"
                        className="mt-4 rounded-xl border border-white/20 bg-white/10 px-6 py-2 text-sm font-semibold text-blue-50 shadow-lg shadow-blue-900/30 transition hover:bg-white/20"
                        data-testid="button-pay-now"
                      >
                        <CreditCard className="mr-2 h-5 w-5" />
                        Pay now
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md rounded-3xl border border-white/20 bg-[#0b1733]/95 text-blue-50">
                      <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-blue-50">Secure Payment Processing</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handlePayNowSubmit} className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-blue-100/80">Consumer Email *</Label>
                          <Select
                            value={payNowForm.consumerEmail}
                            onValueChange={(value) => handlePayNowFormChange("consumerEmail", value)}
                          >
                            <SelectTrigger
                              data-testid="select-paynow-consumer"
                              className="rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60"
                            >
                              <SelectValue placeholder="Select consumer" className="text-blue-50" />
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
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-blue-100/80">Payment Amount *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={payNowForm.amount}
                            onChange={(e) => handlePayNowFormChange("amount", e.target.value)}
                            placeholder="0.00"
                            data-testid="input-paynow-amount"
                            required
                            className="rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60"
                          />
                        </div>
                        <div className="border-t border-white/10 pt-4">
                          <h4 className="mb-3 text-sm font-semibold text-blue-50">Card information</h4>
                          <div className="space-y-4">
                            <div>
                              <Label className="text-sm font-semibold text-blue-100/80">Card Number *</Label>
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
                                className="rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label className="text-sm font-semibold text-blue-100/80">Expiry Date *</Label>
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
                                  className="rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-semibold text-blue-100/80">CVV *</Label>
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
                                  className="rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60"
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-sm font-semibold text-blue-100/80">Cardholder Name *</Label>
                              <Input
                                value={payNowForm.cardName}
                                onChange={(e) => handlePayNowFormChange("cardName", e.target.value)}
                                placeholder="John Doe"
                                data-testid="input-card-name"
                                required
                                className="rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60"
                              />
                            </div>
                            <div>
                              <Label className="text-sm font-semibold text-blue-100/80">ZIP Code *</Label>
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
                                className="rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowPayNowModal(false)}
                            className="rounded-xl border border-white/20 bg-transparent px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-white/10"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={processPaymentMutation.isPending}
                            className="rounded-xl border border-sky-400/40 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-blue-50 shadow-lg shadow-blue-900/20 transition hover:bg-sky-500/30"
                          >
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
          </TabsContent>

          <TabsContent value="pending" className="mt-0">
            <div className="space-y-6">
              {/* Pending Payment Schedules */}
              <Card className={glassPanelClass}>
                <CardHeader className="border-b border-white/20 pb-4">
                  <CardTitle className="text-lg font-semibold text-blue-50">
                    Scheduled Payments ({(paymentSchedules as any[])?.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {schedulesLoading ? (
                    <div className="text-center text-blue-100/70 py-8">Loading scheduled payments...</div>
                  ) : !paymentSchedules || (paymentSchedules as any[]).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 py-16 text-center text-blue-100/70">
                      <Clock className="mx-auto mb-4 h-12 w-12 text-blue-200/80" />
                      <h3 className="text-lg font-semibold text-blue-50">No scheduled payments</h3>
                      <p className="mt-2 text-sm text-blue-100/70">
                        When consumers set up payment arrangements, they will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(paymentSchedules as any[]).map((schedule: any) => (
                        <div
                          key={schedule.id}
                          className="rounded-2xl border border-white/15 bg-white/5 p-5 text-blue-50 shadow-sm shadow-blue-900/10 transition hover:-translate-y-0.5 hover:border-white/25 hover:shadow-lg"
                          data-testid={`schedule-${schedule.id}`}
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-4 flex-1">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-blue-100">
                                  <CreditCard className="h-5 w-5" />
                                </span>
                                <div>
                                  <p className="text-xl font-semibold text-white">{formatCurrency(schedule.amountCents)}</p>
                                  <p className="text-sm text-blue-100/80">{schedule.account?.creditor || "N/A"}</p>
                                </div>
                                <Badge
                                  className={cn(
                                    "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide",
                                    schedule.status === 'active' 
                                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" 
                                      : schedule.status === 'pending_approval'
                                      ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                                      : "border-slate-400/30 bg-slate-500/10 text-slate-100"
                                  )}
                                >
                                  {schedule.status === 'pending_approval' ? 'Pending Approval' : schedule.status}
                                </Badge>
                              </div>
                              <div className="grid gap-4 text-sm text-blue-100/80 sm:grid-cols-2 lg:grid-cols-4">
                                <div>
                                  <span className="text-xs uppercase tracking-wide text-blue-200/80">Consumer</span>
                                  <p className="mt-1 font-semibold text-blue-50">
                                    {schedule.consumer?.firstName} {schedule.consumer?.lastName}
                                  </p>
                                  <p className="text-xs text-blue-100/60">{schedule.consumer?.email}</p>
                                </div>
                                <div>
                                  <span className="text-xs uppercase tracking-wide text-blue-200/80">Account Number</span>
                                  <p className="mt-1 font-semibold text-blue-50">
                                    {schedule.account?.accountNumber || "N/A"}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-xs uppercase tracking-wide text-blue-200/80">Next Payment</span>
                                  <p className="mt-1 font-semibold text-blue-50">
                                    {schedule.nextPaymentDate ? formatDate(schedule.nextPaymentDate) : "N/A"}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-xs uppercase tracking-wide text-blue-200/80">Frequency</span>
                                  <p className="mt-1 font-semibold capitalize text-blue-50">
                                    {schedule.frequency?.replace("_", " ") || "N/A"}
                                  </p>
                                </div>
                              </div>
                              {schedule.paymentMethod && (
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                  <div className="flex items-center gap-3">
                                    <Lock className="h-4 w-4 text-blue-200/80" />
                                    <div className="text-sm">
                                      <span className="text-xs uppercase tracking-wide text-blue-200/80">Payment Method</span>
                                      <p className="mt-1 font-semibold text-blue-50">
                                        {schedule.paymentMethod.cardBrand || "Card"} •••• {schedule.paymentMethod.lastFour}
                                      </p>
                                      <p className="text-xs text-blue-100/60">
                                        Expires {schedule.paymentMethod.expiryMonth}/{schedule.paymentMethod.expiryYear}
                                      </p>
                                      {schedule.paymentMethod.cardholderName && (
                                        <p className="text-xs text-blue-100/60">
                                          {schedule.paymentMethod.cardholderName}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {(schedule.source || schedule.processor) && (
                                <div className="flex gap-2">
                                  {schedule.source && (
                                    <Badge variant="outline" className="text-xs">
                                      Source: {schedule.source.toUpperCase()}
                                    </Badge>
                                  )}
                                  {schedule.processor && (
                                    <Badge variant="outline" className="text-xs">
                                      Processor: {schedule.processor.toUpperCase()}
                                    </Badge>
                                  )}
                                </div>
                              )}

                              {schedule.status === 'active' && (
                                <div className="flex gap-3 pt-3 border-t border-white/10">
                                  <Button
                                    onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                                    disabled={deleteScheduleMutation.isPending}
                                    variant="destructive"
                                    size="sm"
                                    className="flex items-center gap-2"
                                    data-testid={`button-delete-schedule-${schedule.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Cancel Arrangement
                                  </Button>
                                  {schedule.source === 'smax' && schedule.consumer && (
                                    <Button
                                      onClick={() => resyncSmaxMutation.mutate(schedule.consumer.id)}
                                      disabled={resyncSmaxMutation.isPending}
                                      variant="outline"
                                      size="sm"
                                      className="flex items-center gap-2"
                                      data-testid={`button-resync-smax-${schedule.id}`}
                                    >
                                      <RefreshCw className="w-4 h-4" />
                                      Resync from SMAX
                                    </Button>
                                  )}
                                </div>
                              )}

                              {schedule.status === 'pending_approval' && (
                                <div className="flex gap-3 pt-3 border-t border-amber-400/20">
                                  <Button
                                    onClick={() => approveScheduleMutation.mutate(schedule.id)}
                                    disabled={approveScheduleMutation.isPending || rejectScheduleMutation.isPending}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    data-testid={`button-approve-schedule-${schedule.id}`}
                                  >
                                    <ThumbsUp className="w-4 h-4 mr-2" />
                                    Approve & Sync to SMAX
                                  </Button>
                                  <Button
                                    onClick={() => rejectScheduleMutation.mutate(schedule.id)}
                                    disabled={approveScheduleMutation.isPending || rejectScheduleMutation.isPending}
                                    variant="destructive"
                                    className="flex-1"
                                    data-testid={`button-reject-schedule-${schedule.id}`}
                                  >
                                    <ThumbsDown className="w-4 h-4 mr-2" />
                                    Reject
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* All Saved Payment Methods */}
              <Card className={glassPanelClass}>
                <CardHeader className="border-b border-white/20 pb-4">
                  <CardTitle className="text-lg font-semibold text-blue-50">
                    Saved Payment Methods ({(paymentMethodsData as any[])?.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {methodsLoading ? (
                    <div className="text-center text-blue-100/70 py-8">Loading payment methods...</div>
                  ) : !paymentMethodsData || (paymentMethodsData as any[]).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 py-16 text-center text-blue-100/70">
                      <CreditCard className="mx-auto mb-4 h-12 w-12 text-blue-200/80" />
                      <h3 className="text-lg font-semibold text-blue-50">No saved payment methods</h3>
                      <p className="mt-2 text-sm text-blue-100/70">
                        When consumers save payment methods, they will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {(paymentMethodsData as any[]).map((method: any) => (
                        <div
                          key={method.id}
                          className="rounded-2xl border border-white/15 bg-white/5 p-5 text-blue-50 shadow-sm shadow-blue-900/10 transition hover:-translate-y-0.5 hover:border-white/25 hover:shadow-lg"
                          data-testid={`payment-method-${method.id}`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-blue-100">
                                <CreditCard className="h-5 w-5" />
                              </span>
                              <div className="flex-1">
                                <p className="font-semibold text-white">
                                  {method.cardBrand || "Card"} •••• {method.lastFour}
                                </p>
                                <p className="text-xs text-blue-100/60">
                                  Exp: {method.expiryMonth}/{method.expiryYear}
                                </p>
                              </div>
                              {method.isDefault && (
                                <Badge className="bg-emerald-500/20 text-emerald-100 border-emerald-400/40">
                                  Default
                                </Badge>
                              )}
                            </div>
                            <div className="border-t border-white/10 pt-3 space-y-2">
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Consumer</span>
                                <p className="mt-1 text-sm font-semibold text-blue-50">
                                  {method.consumer?.firstName} {method.consumer?.lastName}
                                </p>
                                <p className="text-xs text-blue-100/60">{method.consumer?.email}</p>
                              </div>
                              {method.cardholderName && (
                                <div>
                                  <span className="text-xs uppercase tracking-wide text-blue-200/80">Cardholder Name</span>
                                  <p className="mt-1 text-sm font-semibold text-blue-50">{method.cardholderName}</p>
                                </div>
                              )}
                              <div className="flex items-center gap-2 text-xs text-blue-100/60">
                                <Lock className="h-3 w-3" />
                                <span>Token: {method.token?.slice(0, 20)}...</span>
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
          </TabsContent>


          <TabsContent value="calendar" className="mt-0">
            <PaymentSchedulingCalendar />
          </TabsContent>
        </Tabs>

        {/* Delete Payment Confirmation Dialog */}
        <AlertDialog open={!!paymentToDelete} onOpenChange={() => setPaymentToDelete(null)}>
          <AlertDialogContent className="rounded-3xl border border-white/20 bg-[#0b1733]/95 text-blue-50">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-semibold text-blue-50">Delete Payment</AlertDialogTitle>
              <AlertDialogDescription className="text-blue-100/70">
                Are you sure you want to delete this payment? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className="rounded-xl border border-white/20 bg-transparent px-4 py-2 text-blue-100 transition hover:bg-white/10"
                data-testid="button-cancel-delete"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => paymentToDelete && deletePaymentMutation.mutate(paymentToDelete)}
                disabled={deletePaymentMutation.isPending}
                className="rounded-xl border border-rose-400/40 bg-rose-500/20 px-4 py-2 text-rose-100 transition hover:bg-rose-500/30"
                data-testid="button-confirm-delete"
              >
                {deletePaymentMutation.isPending ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Payment
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </AdminLayout>
  );
}
