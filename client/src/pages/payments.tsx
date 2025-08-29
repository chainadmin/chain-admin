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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreditCard, DollarSign, TrendingUp, Clock, CheckCircle, XCircle, RefreshCw, Calendar, User, Building2, Lock } from "lucide-react";

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
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
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

  if (paymentsLoading || statsLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Payment Processing</h1>
            <p className="mt-2 text-gray-600">
              Monitor and manage all payment transactions via USAePay
            </p>
          </div>
        </div>

        {/* Payment Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(stats.totalAmountCents)}
                  </p>
                  <p className="text-xs text-gray-500">Total Processed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{stats.totalProcessed}</p>
                  <p className="text-xs text-gray-500">Total Transactions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{stats.successfulPayments}</p>
                  <p className="text-xs text-gray-500">Successful</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{stats.pendingPayments}</p>
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filter Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex space-x-4">
              <div>
                <Label htmlFor="status-filter">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-48" data-testid="select-payment-status">
                    <SelectValue />
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
            </div>
          </CardContent>
        </Card>

        {/* Payments List */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Transactions ({filteredPayments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredPayments.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Payments</h3>
                <p className="text-gray-600">
                  {filterStatus === "all" 
                    ? "No payment transactions have been processed yet." 
                    : `No ${filterStatus} payments found.`
                  }
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Payments will appear here once processed through USAePay.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredPayments.map((payment: any) => (
                  <div key={payment.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          {getPaymentMethodIcon(payment.paymentMethod)}
                          <h3 className="font-semibold text-gray-900">
                            {formatCurrency(payment.amountCents)}
                          </h3>
                          <Badge className={getStatusColor(payment.status)}>
                            {payment.status?.replace("_", " ") || "Unknown"}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                          <div>
                            <p className="text-sm text-gray-500">Consumer</p>
                            <p className="font-medium">
                              {payment.consumerName || payment.consumerEmail}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Payment Method</p>
                            <p className="font-medium capitalize">
                              {payment.paymentMethod?.replace("_", " ")}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Account</p>
                            <p className="font-medium">
                              {payment.accountCreditor || "General Payment"}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Date</p>
                            <p className="font-medium">
                              {formatDate(payment.createdAt)}
                            </p>
                          </div>
                        </div>

                        {payment.transactionId && (
                          <div className="mb-3">
                            <p className="text-sm text-gray-500">Transaction ID</p>
                            <p className="text-sm font-mono text-gray-700">{payment.transactionId}</p>
                          </div>
                        )}

                        {payment.notes && (
                          <div className="mb-3">
                            <p className="text-sm text-gray-500">Notes</p>
                            <p className="text-gray-700">{payment.notes}</p>
                          </div>
                        )}

                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          {payment.processedAt && (
                            <div className="flex items-center">
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Processed: {formatDate(payment.processedAt)}
                            </div>
                          )}
                          {payment.processorResponse && (
                            <div className="flex items-center">
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Processor: {payment.processorResponse.slice(0, 50)}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="ml-6 flex flex-col space-y-2">
                        {payment.status === "failed" && (
                          <Button variant="outline" size="sm" data-testid={`button-retry-${payment.id}`}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Retry
                          </Button>
                        )}
                        
                        {payment.status === "completed" && (
                          <Button variant="outline" size="sm" data-testid={`button-refund-${payment.id}`}>
                            <XCircle className="h-4 w-4 mr-2" />
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

        {/* Pay Now Section */}
        <Card>
          <CardHeader>
            <CardTitle>Process Payment</CardTitle>
            <p className="text-sm text-gray-600">
              Process real-time credit card payments for consumers
            </p>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <CreditCard className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Accept Credit Card Payments
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Process secure credit card payments in real-time for any consumer account.
              </p>
              <Dialog open={showPayNowModal} onOpenChange={setShowPayNowModal}>
                <DialogTrigger asChild>
                  <Button size="lg" className="mr-4" data-testid="button-pay-now">
                    <CreditCard className="h-5 w-5 mr-2" />
                    Pay Now
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center">
                      <Lock className="h-5 w-5 mr-2 text-green-600" />
                      Secure Payment Processing
                    </DialogTitle>
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
                    
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Card Information</h4>
                      
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
                          maxLength="19"
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
                            maxLength="5"
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
                            maxLength="4"
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
                          maxLength="5"
                          data-testid="input-zip-code"
                          required
                        />
                      </div>
                    </div>
                    
                    <div className="flex justify-end space-x-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setShowPayNowModal(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={processPaymentMutation.isPending}>
                        {processPaymentMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Processing...
                          </>
                        ) : (
                          <>
                            <Lock className="h-4 w-4 mr-2" />
                            Process Payment
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
              <p className="text-sm text-gray-500 text-center">
                All payments are processed through USAePay integration
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}