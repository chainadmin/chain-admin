import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { ServiceUpsellBanner } from "@/components/service-upsell-banner";
import { ServiceGate } from "@/components/service-gate";
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
import { CreditCard, DollarSign, TrendingUp, Clock, CheckCircle, Calendar, User, Building2, Lock, Trash2, ThumbsUp, ThumbsDown, RefreshCw, History, Check, XCircle, Search, Settings, Edit, Mail, MessageSquare, AlertTriangle, Phone } from "lucide-react";
import { PaymentSchedulingCalendar } from "@/components/payment-scheduling-calendar";

export default function Payments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("all");
  const [showPayNowModal, setShowPayNowModal] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  const [selectedConsumerForArrangement, setSelectedConsumerForArrangement] = useState<any | null>(null);
  const [selectedConsumerForHistory, setSelectedConsumerForHistory] = useState<{ id: string; name: string } | null>(null);
  
  // Manage tab state
  const [manageSearchQuery, setManageSearchQuery] = useState("");
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [showCancelRequestDialog, setShowCancelRequestDialog] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [editForm, setEditForm] = useState({
    amountCents: 0,
    nextPaymentDate: "",
    frequency: "monthly",
    remainingPayments: 0,
  });

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

  // Fetch selected consumer's payment history
  const { data: consumerPaymentHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["/api/payments/consumer", selectedConsumerForHistory?.id],
    enabled: !!selectedConsumerForHistory?.id,
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

  // Update payment schedule mutation
  const updateScheduleMutation = useMutation({
    mutationFn: async ({ scheduleId, updates }: { scheduleId: string; updates: any }) => {
      const response = await apiRequest("PATCH", `/api/payment-schedules/${scheduleId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Arrangement Updated",
        description: "Payment arrangement has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-schedules"] });
      setEditingSchedule(null);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Unable to update arrangement. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Request cancellation mutation (sends email instead of deleting)
  const requestCancellationMutation = useMutation({
    mutationFn: async ({ scheduleId, reason }: { scheduleId: string; reason?: string }) => {
      await apiRequest("POST", `/api/payment-schedules/${scheduleId}/request-cancellation`, { reason });
    },
    onSuccess: () => {
      toast({
        title: "Cancellation Request Sent",
        description: "The agency has been notified of the cancellation request.",
      });
      setShowCancelRequestDialog(null);
      setCancelReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Request Failed",
        description: error.message || "Unable to send cancellation request. Please try again.",
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
        <ServiceUpsellBanner service="payment" />
        <ServiceGate service="payment">
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
                    <span className="text-sm text-blue-100/70">Failed/Declined</span>
                    <span className="text-lg font-semibold text-rose-300">{(stats.failedPayments || 0) + (stats.declinedPayments || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-5 shadow-lg shadow-blue-900/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-rose-200/70">Failed/Declined</p>
                    <p className="mt-2 text-2xl font-semibold text-rose-100">{(stats.failedPayments || 0) + (stats.declinedPayments || 0)}</p>
                  </div>
                  <XCircle className="h-8 w-8 text-rose-300" />
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
                {paymentSchedules && (paymentSchedules as any[]).filter((s: any) => 
                  ['active', 'pending_approval'].includes(s.status)
                ).length > 0 ? (
                  <Badge className="ml-2 bg-amber-500 text-white">
                    {(paymentSchedules as any[]).filter((s: any) => 
                      ['active', 'pending_approval'].includes(s.status)
                    ).length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="today" data-testid="tab-today">
                <Calendar className="w-4 h-4 mr-2" />
                Today's Payments
                {paymentSchedules && (() => {
                  const today = new Date().toISOString().split('T')[0];
                  const todayCount = (paymentSchedules as any[]).filter((s: any) => 
                    s.nextPaymentDate && new Date(s.nextPaymentDate).toISOString().split('T')[0] === today
                  ).length;
                  return todayCount > 0 ? (
                    <Badge className="ml-2 bg-sky-500 text-white">{todayCount}</Badge>
                  ) : null;
                })()}
              </TabsTrigger>
              <TabsTrigger value="calendar" data-testid="tab-calendar">
                <Calendar className="w-4 h-4 mr-2" />
                Payment Schedule
              </TabsTrigger>
              <TabsTrigger value="manage" data-testid="tab-manage">
                <Settings className="w-4 h-4 mr-2" />
                Manage Schedules
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
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedConsumerForHistory({
                                    id: payment.consumerId,
                                    name: payment.consumerName || payment.consumerEmail || 'Unknown'
                                  })}
                                  className="h-8 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 text-sky-100 transition hover:bg-sky-500/20"
                                  data-testid={`button-view-history-${payment.id}`}
                                >
                                  <History className="h-4 w-4" />
                                </Button>
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
                    <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto rounded-3xl border border-white/20 bg-[#0b1733]/95 text-blue-50">
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
              {/* Pending Payment Schedules - only show active and pending_approval */}
              <Card className={glassPanelClass}>
                <CardHeader className="border-b border-white/20 pb-4">
                  <CardTitle className="text-lg font-semibold text-blue-50">
                    Scheduled Payments ({(paymentSchedules as any[])?.filter((s: any) => 
                      ['active', 'pending_approval'].includes(s.status)
                    ).length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {schedulesLoading ? (
                    <div className="text-center text-blue-100/70 py-8">Loading scheduled payments...</div>
                  ) : !paymentSchedules || (paymentSchedules as any[]).filter((s: any) => 
                    ['active', 'pending_approval'].includes(s.status)
                  ).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 py-16 text-center text-blue-100/70">
                      <Clock className="mx-auto mb-4 h-12 w-12 text-blue-200/80" />
                      <h3 className="text-lg font-semibold text-blue-50">No scheduled payments</h3>
                      <p className="mt-2 text-sm text-blue-100/70">
                        When consumers set up payment arrangements, they will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(paymentSchedules as any[]).filter((s: any) => 
                        ['active', 'pending_approval'].includes(s.status)
                      ).map((schedule: any) => (
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
                              <div className="grid gap-4 text-sm text-blue-100/80 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
                                  <span className="text-xs uppercase tracking-wide text-blue-200/80">Due Date (Next Payment)</span>
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
                                <div>
                                  <span className="text-xs uppercase tracking-wide text-blue-200/80">Remaining Payments</span>
                                  <p className="mt-1 font-semibold text-blue-50">
                                    {schedule.remainingPayments != null 
                                      ? schedule.remainingPayments 
                                      : schedule.totalPayments != null && schedule.completedPayments != null
                                        ? Math.max(0, schedule.totalPayments - schedule.completedPayments)
                                        : schedule.totalPayments ?? "0"}
                                  </p>
                                </div>
                              </div>
                              
                              {/* Arrangement Date Range */}
                              {(schedule.startDate || schedule.endDate) && (
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                  <span className="text-xs uppercase tracking-wide text-blue-200/80">Arrangement Period</span>
                                  <div className="mt-1 flex items-center gap-2 text-sm">
                                    <span className="font-semibold text-blue-50">
                                      {schedule.startDate ? formatDate(schedule.startDate) : "N/A"}
                                    </span>
                                    <span className="text-blue-100/60">→</span>
                                    <span className="font-semibold text-blue-50">
                                      {schedule.endDate ? formatDate(schedule.endDate) : "N/A"}
                                    </span>
                                  </div>
                                </div>
                              )}
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

          <TabsContent value="today" className="mt-0">
            <Card className={glassPanelClass}>
              <CardHeader className="border-b border-white/20 pb-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-lg font-semibold text-blue-50">
                    Today's Scheduled Payments ({(() => {
                      const today = new Date().toISOString().split('T')[0];
                      return (paymentSchedules as any[])?.filter((s: any) => 
                        s.nextPaymentDate && new Date(s.nextPaymentDate).toISOString().split('T')[0] === today
                      ).length || 0;
                    })()})
                  </CardTitle>
                  <div className="text-sm text-blue-100/70">
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {schedulesLoading ? (
                  <div className="text-center text-blue-100/70 py-8">Loading today's payments...</div>
                ) : (() => {
                  const today = new Date().toISOString().split('T')[0];
                  const todaySchedules = (paymentSchedules as any[])?.filter((s: any) => 
                    s.nextPaymentDate && new Date(s.nextPaymentDate).toISOString().split('T')[0] === today
                  ) || [];
                  
                  if (todaySchedules.length === 0) {
                    return (
                      <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 py-16 text-center text-blue-100/70">
                        <Calendar className="mx-auto mb-4 h-12 w-12 text-blue-200/80" />
                        <h3 className="text-lg font-semibold text-blue-50">No payments scheduled for today</h3>
                        <p className="mt-2 text-sm text-blue-100/70">
                          Payments scheduled for today will appear here for processing and monitoring.
                        </p>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="space-y-4">
                      {todaySchedules.map((schedule: any) => (
                        <div
                          key={schedule.id}
                          className={cn(
                            "rounded-2xl border p-5 text-blue-50 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg",
                            schedule.status === 'failed' || schedule.status === 'declined'
                              ? "border-rose-400/40 bg-rose-500/10"
                              : schedule.status === 'completed'
                              ? "border-emerald-400/40 bg-emerald-500/10"
                              : "border-white/15 bg-white/5"
                          )}
                          data-testid={`today-schedule-${schedule.id}`}
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex-1 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Consumer</span>
                                <p className="mt-1 font-semibold text-blue-50">
                                  {schedule.consumer?.firstName} {schedule.consumer?.lastName}
                                </p>
                                <p className="text-xs text-blue-100/60">{schedule.consumer?.email}</p>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Account</span>
                                <p className="mt-1 font-semibold text-blue-50">
                                  {schedule.account?.accountNumber || 'N/A'}
                                </p>
                                <p className="text-xs text-blue-100/60">{schedule.account?.creditor || ''}</p>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Payment Amount</span>
                                <p className="mt-1 font-semibold text-blue-50">
                                  {formatCurrency(schedule.amountCents)}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Status</span>
                                <Badge
                                  className={cn(
                                    "mt-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                                    schedule.status === 'completed' 
                                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" 
                                      : schedule.status === 'failed' || schedule.status === 'declined'
                                      ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
                                      : schedule.status === 'active'
                                      ? "border-sky-400/40 bg-sky-500/10 text-sky-100"
                                      : "border-amber-400/40 bg-amber-500/10 text-amber-100"
                                  )}
                                >
                                  {schedule.status}
                                </Badge>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Remaining</span>
                                <p className="mt-1 font-semibold text-blue-50">
                                  {schedule.remainingPayments != null 
                                    ? schedule.remainingPayments 
                                    : schedule.totalPayments != null && schedule.completedPayments != null
                                      ? Math.max(0, schedule.totalPayments - schedule.completedPayments)
                                      : schedule.totalPayments ?? "0"} payments
                                </p>
                              </div>
                            </div>
                            
                            {/* Decline Reason and Contact Buttons */}
                            <div className="flex flex-col gap-2 mt-2 lg:mt-0">
                              {(schedule.status === 'failed' || schedule.status === 'declined') && (
                                <div className="flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                                  <AlertTriangle className="h-4 w-4" />
                                  <span>{schedule.failureReason || schedule.declineReason || 'Payment declined'}</span>
                                </div>
                              )}
                              
                              {(schedule.status === 'failed' || schedule.status === 'declined' || schedule.status === 'cancelled') && schedule.consumer && (
                                <div className="flex gap-2">
                                  {schedule.consumer?.phone && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="rounded-xl border border-sky-400/40 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20"
                                      onClick={() => {
                                        window.location.href = `/communications?tab=send-sms&phone=${encodeURIComponent(schedule.consumer?.phone || '')}`;
                                      }}
                                      data-testid={`button-sms-${schedule.id}`}
                                    >
                                      <MessageSquare className="w-4 h-4 mr-1" />
                                      SMS
                                    </Button>
                                  )}
                                  {schedule.consumer?.email && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="rounded-xl border border-indigo-400/40 bg-indigo-500/10 text-indigo-100 hover:bg-indigo-500/20"
                                      onClick={() => {
                                        window.location.href = `/communications?tab=send&email=${encodeURIComponent(schedule.consumer?.email || '')}`;
                                      }}
                                      data-testid={`button-email-${schedule.id}`}
                                    >
                                      <Mail className="w-4 h-4 mr-1" />
                                      Email
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calendar" className="mt-0">
            <PaymentSchedulingCalendar />
          </TabsContent>

          <TabsContent value="manage" className="mt-0">
            <Card className={glassPanelClass}>
              <CardHeader className="border-b border-white/20 pb-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-lg font-semibold text-blue-50">
                    Manage Payment Schedules
                  </CardTitle>
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-100/60" />
                    <Input
                      placeholder="Search by name, email, or account..."
                      value={manageSearchQuery}
                      onChange={(e) => setManageSearchQuery(e.target.value)}
                      className="pl-10 rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60"
                      data-testid="input-manage-search"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {schedulesLoading ? (
                  <div className="text-center text-blue-100/70 py-8">Loading schedules...</div>
                ) : !paymentSchedules || (paymentSchedules as any[]).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 py-16 text-center text-blue-100/70">
                    <Settings className="mx-auto mb-4 h-12 w-12 text-blue-200/80" />
                    <h3 className="text-lg font-semibold text-blue-50">No payment schedules</h3>
                    <p className="mt-2 text-sm text-blue-100/70">
                      When consumers set up payment arrangements, they will appear here for management.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(paymentSchedules as any[])
                      .filter((schedule: any) => {
                        if (!manageSearchQuery) return true;
                        const query = manageSearchQuery.toLowerCase();
                        const consumerName = `${schedule.consumer?.firstName || ''} ${schedule.consumer?.lastName || ''}`.toLowerCase();
                        const email = (schedule.consumer?.email || '').toLowerCase();
                        const accountNumber = (schedule.account?.accountNumber || '').toLowerCase();
                        return consumerName.includes(query) || email.includes(query) || accountNumber.includes(query);
                      })
                      .map((schedule: any) => (
                        <div
                          key={schedule.id}
                          className="rounded-2xl border border-white/15 bg-white/5 p-5 text-blue-50"
                          data-testid={`manage-schedule-${schedule.id}`}
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex-1 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Consumer</span>
                                <p className="mt-1 font-semibold text-blue-50">
                                  {schedule.consumer?.firstName} {schedule.consumer?.lastName}
                                </p>
                                <p className="text-xs text-blue-100/60">{schedule.consumer?.email}</p>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Account</span>
                                <p className="mt-1 font-semibold text-blue-50">
                                  {schedule.account?.accountNumber || 'N/A'}
                                </p>
                                <p className="text-xs text-blue-100/60">{schedule.account?.creditor || ''}</p>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Payment</span>
                                <p className="mt-1 font-semibold text-blue-50">
                                  {formatCurrency(schedule.amountCents)}
                                </p>
                                <p className="text-xs text-blue-100/60 capitalize">{schedule.frequency || 'Monthly'}</p>
                              </div>
                              <div>
                                <span className="text-xs uppercase tracking-wide text-blue-200/80">Next Payment</span>
                                <p className="mt-1 font-semibold text-blue-50">
                                  {schedule.nextPaymentDate ? formatDate(schedule.nextPaymentDate) : 'N/A'}
                                </p>
                                <Badge
                                  className={cn(
                                    "mt-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                                    schedule.status === 'active' 
                                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" 
                                      : schedule.status === 'pending_approval'
                                      ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                                      : "border-slate-400/30 bg-slate-500/10 text-slate-100"
                                  )}
                                >
                                  {schedule.status === 'pending_approval' ? 'Pending' : schedule.status}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 mt-4 lg:mt-0">
                              {/* Failure reason display */}
                              {(schedule.status === 'failed' || schedule.status === 'declined') && (schedule.failureReason || schedule.declineReason) && (
                                <div className="flex items-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  <span>{schedule.failureReason || schedule.declineReason}</span>
                                </div>
                              )}
                              
                              <div className="flex gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-xl border border-sky-400/40 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20"
                                  onClick={() => {
                                    setEditingSchedule(schedule);
                                    setEditForm({
                                      amountCents: schedule.amountCents,
                                      nextPaymentDate: schedule.nextPaymentDate ? new Date(schedule.nextPaymentDate).toISOString().split('T')[0] : '',
                                      frequency: schedule.frequency || 'monthly',
                                      remainingPayments: schedule.remainingPayments || 0,
                                    });
                                  }}
                                  data-testid={`button-edit-schedule-${schedule.id}`}
                                >
                                  <Edit className="w-4 h-4 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-xl border border-amber-400/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                                  onClick={() => setShowCancelRequestDialog(schedule.id)}
                                  data-testid={`button-cancel-request-${schedule.id}`}
                                >
                                  <Mail className="w-4 h-4 mr-1" />
                                  Request Cancel
                                </Button>
                                
                                {/* Contact buttons for failed/declined/cancelled */}
                                {(schedule.status === 'failed' || schedule.status === 'declined' || schedule.status === 'cancelled') && (
                                  <>
                                    {schedule.consumer?.phone && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                                        onClick={() => {
                                          window.location.href = `/communications?tab=send-sms&phone=${encodeURIComponent(schedule.consumer?.phone || '')}`;
                                        }}
                                        data-testid={`button-manage-sms-${schedule.id}`}
                                      >
                                        <MessageSquare className="w-4 h-4 mr-1" />
                                        SMS
                                      </Button>
                                    )}
                                    {schedule.consumer?.email && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="rounded-xl border border-purple-400/40 bg-purple-500/10 text-purple-100 hover:bg-purple-500/20"
                                        onClick={() => {
                                          window.location.href = `/communications?tab=send&email=${encodeURIComponent(schedule.consumer?.email || '')}`;
                                        }}
                                        data-testid={`button-manage-email-${schedule.id}`}
                                      >
                                        <Mail className="w-4 h-4 mr-1" />
                                        Email
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Edit Schedule Dialog */}
            <Dialog open={!!editingSchedule} onOpenChange={(open) => !open && setEditingSchedule(null)}>
              <DialogContent className="rounded-3xl border border-white/20 bg-[#0b1733]/95 text-blue-50 max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold text-blue-50">Edit Payment Schedule</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label className="text-sm font-semibold text-blue-100/80">Payment Amount ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={(editForm.amountCents / 100).toFixed(2)}
                      onChange={(e) => setEditForm({ ...editForm, amountCents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                      className="mt-1 rounded-xl border border-white/20 bg-white/10 text-blue-50"
                      data-testid="input-edit-amount"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-blue-100/80">Next Payment Date</Label>
                    <Input
                      type="date"
                      value={editForm.nextPaymentDate}
                      onChange={(e) => setEditForm({ ...editForm, nextPaymentDate: e.target.value })}
                      className="mt-1 rounded-xl border border-white/20 bg-white/10 text-blue-50"
                      data-testid="input-edit-date"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-blue-100/80">Frequency</Label>
                    <Select value={editForm.frequency} onValueChange={(value) => setEditForm({ ...editForm, frequency: value })}>
                      <SelectTrigger className="mt-1 rounded-xl border border-white/20 bg-white/10 text-blue-50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="bi_weekly">Bi-Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-blue-100/80">Remaining Payments</Label>
                    <Input
                      type="number"
                      value={editForm.remainingPayments}
                      onChange={(e) => setEditForm({ ...editForm, remainingPayments: parseInt(e.target.value || '0') })}
                      className="mt-1 rounded-xl border border-white/20 bg-white/10 text-blue-50"
                      data-testid="input-edit-remaining"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setEditingSchedule(null)}
                      className="rounded-xl border border-white/20 bg-transparent text-blue-100 hover:bg-white/10"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        if (editingSchedule) {
                          updateScheduleMutation.mutate({
                            scheduleId: editingSchedule.id,
                            updates: {
                              amountCents: editForm.amountCents,
                              nextPaymentDate: editForm.nextPaymentDate,
                              frequency: editForm.frequency,
                              remainingPayments: editForm.remainingPayments,
                            },
                          });
                        }
                      }}
                      disabled={updateScheduleMutation.isPending}
                      className="rounded-xl bg-sky-600 text-white hover:bg-sky-700"
                      data-testid="button-save-edit"
                    >
                      {updateScheduleMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Cancellation Request Dialog */}
            <AlertDialog open={!!showCancelRequestDialog} onOpenChange={(open) => !open && setShowCancelRequestDialog(null)}>
              <AlertDialogContent className="rounded-3xl border border-white/20 bg-[#0b1733]/95 text-blue-50">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-xl font-semibold text-blue-50">Request Arrangement Cancellation</AlertDialogTitle>
                  <AlertDialogDescription className="text-blue-100/70">
                    This will send an email to the agency with the consumer's information requesting cancellation. The arrangement will remain active until the agency processes the request.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <Label className="text-sm font-semibold text-blue-100/80">Reason for Cancellation (Optional)</Label>
                  <Textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Enter reason for cancellation..."
                    className="mt-2 rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/50"
                    data-testid="input-cancel-reason"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    className="rounded-xl border border-white/20 bg-transparent px-4 py-2 text-blue-100 hover:bg-white/10"
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      if (showCancelRequestDialog) {
                        requestCancellationMutation.mutate({
                          scheduleId: showCancelRequestDialog,
                          reason: cancelReason,
                        });
                      }
                    }}
                    disabled={requestCancellationMutation.isPending}
                    className="rounded-xl bg-amber-600 text-white hover:bg-amber-700"
                    data-testid="button-confirm-cancel-request"
                  >
                    {requestCancellationMutation.isPending ? 'Sending...' : 'Send Request'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

        {/* Consumer Payment History Dialog */}
        <Dialog open={!!selectedConsumerForHistory} onOpenChange={() => setSelectedConsumerForHistory(null)}>
          <DialogContent className="max-w-2xl rounded-3xl border border-white/20 bg-[#0b1733]/95 text-blue-50 max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-blue-50">
                <History className="h-5 w-5" />
                Payment History: {selectedConsumerForHistory?.name}
              </DialogTitle>
            </DialogHeader>
            
            {historyLoading ? (
              <div className="py-8 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <p className="mt-4 text-blue-100/70">Loading payment history...</p>
              </div>
            ) : !consumerPaymentHistory || (consumerPaymentHistory as any[]).length === 0 ? (
              <div className="py-8 text-center">
                <History className="mx-auto h-12 w-12 text-blue-100/30" />
                <p className="mt-4 text-blue-100/70">No payment history found for this consumer.</p>
              </div>
            ) : (
              <div className="space-y-3 py-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-blue-100/70">
                    {(consumerPaymentHistory as any[]).length} payment{(consumerPaymentHistory as any[]).length !== 1 ? 's' : ''} on record
                  </p>
                  <Badge variant="secondary" className="bg-white/10 text-blue-100">
                    Total: {formatCurrency((consumerPaymentHistory as any[]).reduce((sum: number, p: any) => 
                      p.status === 'completed' ? sum + (p.amountCents || 0) : sum, 0
                    ))}
                  </Badge>
                </div>
                {(consumerPaymentHistory as any[]).map((historyPayment: any) => {
                  const getHistoryStatusIcon = (status: string) => {
                    switch (status?.toLowerCase()) {
                      case 'completed':
                        return <Check className="h-5 w-5 text-emerald-400" />;
                      case 'pending':
                      case 'processing':
                        return <Clock className="h-5 w-5 text-amber-400" />;
                      case 'failed':
                      case 'refunded':
                        return <XCircle className="h-5 w-5 text-rose-400" />;
                      default:
                        return <CreditCard className="h-5 w-5 text-blue-100/50" />;
                    }
                  };

                  return (
                    <div 
                      key={historyPayment.id} 
                      className="rounded-xl border border-white/10 bg-white/5 p-4"
                      data-testid={`history-payment-item-${historyPayment.id}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {getHistoryStatusIcon(historyPayment.status)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-semibold text-white">
                                {formatCurrency(historyPayment.amountCents)}
                              </span>
                              <Badge
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                                  historyPayment.status === 'completed' 
                                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                                    : historyPayment.status === 'pending' || historyPayment.status === 'processing'
                                    ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                                    : "border-rose-400/40 bg-rose-500/10 text-rose-100"
                                )}
                              >
                                {historyPayment.status}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-blue-100/70">
                              {historyPayment.accountCreditor && (
                                <span className="font-medium">{historyPayment.accountCreditor}</span>
                              )}
                              {historyPayment.arrangementName && (
                                <span> • {historyPayment.arrangementName}</span>
                              )}
                            </p>
                            <p className="mt-1 text-xs text-blue-100/50 capitalize">
                              {historyPayment.paymentMethod?.replace('_', ' ') || 'Card'}
                              {historyPayment.transactionId && (
                                <span> • Ref: {historyPayment.transactionId.slice(-8)}</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-blue-100">
                            {formatDate(historyPayment.processedAt || historyPayment.createdAt)}
                          </p>
                        </div>
                      </div>
                      {historyPayment.notes && (
                        <p className="mt-2 rounded-lg bg-white/5 p-2 text-xs text-blue-100/60">
                          {historyPayment.notes}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end">
              <Button 
                onClick={() => setSelectedConsumerForHistory(null)}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-blue-100 transition hover:bg-white/20"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </ServiceGate>
      </div>
    </AdminLayout>
  );
}
