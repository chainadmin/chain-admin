import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  clearConsumerAuth,
  getStoredConsumerSession,
  getStoredConsumerToken,
} from "@/lib/consumer-auth";
import { apiCall } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import { getArrangementSummary, calculateArrangementPayment } from "@/lib/arrangements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, LogOut, User, Building2, CreditCard, DollarSign, TrendingUp, Mail, Phone, Edit, FileText, MessageSquare, Calendar } from "lucide-react";
import chainLogo from "@/assets/chain-logo.png";

// Payment Methods Tab Component
function PaymentMethodsTab({ session }: { session: any }) {
  const { toast } = useToast();
  const token = getStoredConsumerToken();

  const { data: paymentMethods, isLoading, refetch } = useQuery({
    queryKey: ['consumer-payment-methods', session?.email],
    queryFn: async () => {
      const response = await apiCall("GET", "/api/consumer/payment-methods", null, token);
      if (!response.ok) {
        throw new Error("Failed to fetch payment methods");
      }
      return response.json();
    },
    enabled: !!session?.email && !!token,
  });

  const handleDelete = async (methodId: string) => {
    try {
      const response = await apiCall("DELETE", `/api/consumer/payment-methods/${methodId}`, null, token);
      if (!response.ok) {
        throw new Error("Failed to delete payment method");
      }

      toast({
        title: "Card Removed",
        description: "Your payment method has been deleted successfully.",
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete payment method",
        variant: "destructive",
      });
    }
  };

  const handleSetDefault = async (methodId: string) => {
    try {
      const response = await apiCall("PUT", `/api/consumer/payment-methods/${methodId}/default`, null, token);
      if (!response.ok) {
        throw new Error("Failed to set default payment method");
      }

      toast({
        title: "Default Card Updated",
        description: "Your default payment method has been updated.",
      });

      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to set default payment method",
        variant: "destructive",
      });
    }
  };

  const getCardBrandIcon = (brand: string) => {
    const brandLower = brand?.toLowerCase() || '';
    if (brandLower.includes('visa')) return '💳';
    if (brandLower.includes('master')) return '💳';
    if (brandLower.includes('amex')) return '💳';
    if (brandLower.includes('discover')) return '💳';
    return '💳';
  };

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader className="border-b border-white/10">
        <CardTitle className="flex items-center text-white">
          <CreditCard className="h-5 w-5 mr-2 text-blue-400" />
          Saved Payment Methods
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
            <p className="text-blue-100/70 mt-4">Loading payment methods...</p>
          </div>
        ) : !paymentMethods || (paymentMethods as any[]).length === 0 ? (
          <div className="text-center py-12">
            <CreditCard className="h-12 w-12 mx-auto mb-4 text-blue-400/30" />
            <p className="text-blue-100/70">No saved payment methods</p>
            <p className="text-sm text-blue-100/50 mt-2">
              Save a card during your next payment for faster checkout
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(paymentMethods as any[]).map((method: any) => (
              <div
                key={method.id}
                className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{getCardBrandIcon(method.cardBrand)}</span>
                      <div>
                        <p className="text-white font-medium">
                          {method.cardBrand} ending in {method.cardLast4}
                        </p>
                        <p className="text-sm text-blue-100/70">
                          Expires {method.expiryMonth}/{method.expiryYear}
                        </p>
                      </div>
                    </div>
                    {method.cardholderName && (
                      <p className="text-sm text-blue-100/60">
                        {method.cardholderName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {method.isDefault && (
                      <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200 border">
                        Default
                      </Badge>
                    )}
                    {!method.isDefault && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSetDefault(method.id)}
                        className="border-white/20 bg-white/5 text-blue-100 hover:bg-white/10"
                      >
                        Set Default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(method.id)}
                      className="bg-red-500/20 text-red-200 hover:bg-red-500/30 border-red-400/30"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ConsumerDashboardSimple() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [session, setSession] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [accountData, setAccountData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [selectedArrangement, setSelectedArrangement] = useState<any>(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  const [setupRecurring, setSetupRecurring] = useState(false);
  const [firstPaymentDate, setFirstPaymentDate] = useState<string>("");
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });
  const [paymentForm, setPaymentForm] = useState({
    cardNumber: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
    cardName: "",
    zipCode: "",
  });
  const [callbackForm, setCallbackForm] = useState({
    preferredTime: "anytime",
    phoneNumber: "",
    message: "",
  });

  // Callback request mutation
  const callbackMutation = useMutation({
    mutationFn: async (data: { preferredTime: string; phoneNumber: string; message: string }) => {
      const token = getStoredConsumerToken();
      return apiRequest("POST", "/api/consumer/callback-request", data, token);
    },
    onSuccess: () => {
      toast({
        title: "Request Submitted",
        description: "Your callback request has been sent to the agency. They will contact you soon.",
      });
      setShowContactDialog(false);
      setCallbackForm({ preferredTime: "anytime", phoneNumber: "", message: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Request Failed",
        description: error.message || "Failed to submit callback request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCallbackRequest = () => {
    callbackMutation.mutate(callbackForm);
  };

  // Check authentication on mount
  useEffect(() => {
    const token = getStoredConsumerToken();
    const storedSession = getStoredConsumerSession();
    
    if (!token || !storedSession) {
      toast({
        title: "Please Sign In",
        description: "You need to sign in to view your dashboard.",
        variant: "destructive",
      });
      setLocation("/consumer-login");
      return;
    }
    
    setSession(storedSession);
    setMounted(true);
  }, [setLocation, toast]);

  // Fetch account data when mounted and authenticated
  useEffect(() => {
    if (!mounted || !session?.email) {
      return;
    }

    const fetchAccounts = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const token = getStoredConsumerToken();
        const encodedEmail = encodeURIComponent(session.email);
        const url = `/api/consumer/accounts/${encodedEmail}`;
        
        const response = await apiCall("GET", url, null, token);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to load accounts: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        setAccountData(data);
        
        // Set edit form with current data
        const consumer = data.consumer;
        if (consumer) {
          setEditForm({
            firstName: consumer.firstName || "",
            lastName: consumer.lastName || "",
            phone: consumer.phone || "",
            address: consumer.address || "",
            city: consumer.city || "",
            state: consumer.state || "",
            zipCode: consumer.zipCode || "",
          });
        }
      } catch (err: any) {
        console.error('Error loading accounts:', err);
        setError(err.message || 'Failed to load account information');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, [mounted, session]);

  // Fetch agency branding
  const { data: agencyBranding } = useQuery({
    queryKey: [`/api/public/agency-branding?slug=${session?.tenantSlug}`],
    enabled: !!session?.tenantSlug,
    retry: 1,
  });

  // Fetch documents and communication history
  const { data: documents } = useQuery({
    queryKey: [`/api/consumer/documents/${session?.email}?tenantSlug=${session?.tenantSlug}`],
    queryFn: async () => {
      const token = getStoredConsumerToken();
      const response = await apiCall("GET", `/api/consumer/documents/${session?.email}?tenantSlug=${session?.tenantSlug}`, null, token);
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
    enabled: !!session?.email && !!session?.tenantSlug,
  });

  // Calculate total balance from account data
  const totalBalanceForArrangements = accountData?.accounts?.reduce((sum: number, account: any) => 
    sum + (account.balanceCents || 0), 0) || 0;

  // Fetch payment arrangements
  const { data: arrangements } = useQuery({
    queryKey: [`/api/consumer/arrangements/${session?.email}?tenantSlug=${session?.tenantSlug}&balance=${totalBalanceForArrangements}`],
    queryFn: async () => {
      const token = getStoredConsumerToken();
      const response = await apiCall("GET", `/api/consumer/arrangements/${session?.email}?tenantSlug=${session?.tenantSlug}&balance=${totalBalanceForArrangements}`, null, token);
      if (!response.ok) throw new Error("Failed to fetch arrangements");
      return response.json();
    },
    enabled: !!session?.email && !!session?.tenantSlug && !!accountData?.accounts,
  });

  // Fetch active payment schedules
  const { data: paymentSchedules } = useQuery({
    queryKey: [`/api/consumer/payment-schedules/${session?.email}?tenantSlug=${session?.tenantSlug}`],
    queryFn: async () => {
      const token = getStoredConsumerToken();
      const encodedEmail = encodeURIComponent(session?.email || '');
      const response = await apiCall("GET", `/api/consumer/payment-schedules/${encodedEmail}?tenantSlug=${session?.tenantSlug}`, null, token);
      if (!response.ok) throw new Error("Failed to fetch payment schedules");
      return response.json();
    },
    enabled: !!session?.email && !!session?.tenantSlug,
  });

  const handleLogout = () => {
    clearConsumerAuth();
    toast({
      title: "Signed Out",
      description: "You have been signed out successfully.",
    });
    // Redirect to root of subdomain (agency landing page)
    setLocation("/");
  };

  const handlePayment = (account: any) => {
    setSelectedAccount(account);
    setSelectedArrangement(null);
    setSaveCard(false);
    setSetupRecurring(false);
    setFirstPaymentDate("");
    setShowPaymentDialog(true);
  };

  // Get arrangements applicable to the selected account
  const applicableArrangements = selectedAccount && arrangements
    ? (arrangements as any[]).filter(arr => 
        selectedAccount.balanceCents >= arr.minBalance && 
        selectedAccount.balanceCents <= arr.maxBalance
      )
    : [];

  // Calculate payment amount based on selected arrangement
  const paymentAmountCents = selectedAccount
    ? selectedArrangement
      ? calculateArrangementPayment(selectedArrangement, selectedAccount.balanceCents || 0)
      : selectedAccount.balanceCents || 0
    : 0;

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedAccount) return;

    setPaymentProcessing(true);

    try {
      const token = getStoredConsumerToken();
      const response = await apiCall("POST", `/api/consumer/payments/process`, {
        accountId: selectedAccount.id,
        arrangementId: selectedArrangement?.id || null,
        cardNumber: paymentForm.cardNumber,
        expiryMonth: paymentForm.expiryMonth,
        expiryYear: paymentForm.expiryYear,
        cvv: paymentForm.cvv,
        cardName: paymentForm.cardName,
        zipCode: paymentForm.zipCode,
        saveCard: saveCard,
        setupRecurring: setupRecurring,
        firstPaymentDate: firstPaymentDate || null,
      }, token);

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Payment failed");
      }

      toast({
        title: "Payment Successful",
        description: `Your payment of ${formatCurrency(paymentAmountCents)} has been processed.`,
      });

      setShowPaymentDialog(false);
      setPaymentForm({
        cardNumber: "",
        expiryMonth: "",
        expiryYear: "",
        cvv: "",
        cardName: "",
        zipCode: "",
      });

      // Refresh account data
      window.location.reload();
    } catch (err: any) {
      toast({
        title: "Payment Failed",
        description: err.message || "Unable to process payment. Please try again or contact your agency.",
        variant: "destructive",
      });
    } finally {
      setPaymentProcessing(false);
    }
  };

  const handleEditProfile = async () => {
    try {
      const token = getStoredConsumerToken();
      const response = await apiCall("PATCH", `/api/consumer/profile`, editForm, token);
      
      if (!response.ok) {
        throw new Error("Failed to update profile");
      }
      
      toast({
        title: "Profile Updated",
        description: "Your information has been updated successfully.",
      });
      
      setShowEditDialog(false);
      
      // Refresh account data
      window.location.reload();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update profile",
        variant: "destructive",
      });
    }
  };

  // Don't render until we've checked auth
  if (!mounted || !session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-blue-100/70">Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-blue-100/70">Loading your account information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-white/10 bg-white/5 backdrop-blur">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-white mb-2">Unable to Load Dashboard</h1>
            <p className="text-blue-100/70 mb-4">
              We couldn't load your account information. Please try again or contact support.
            </p>
            <div className="space-y-2">
              <Button 
                onClick={() => window.location.reload()} 
                variant="outline" 
                className="w-full text-white border-white/20 hover:bg-white/10"
              >
                Retry
              </Button>
              <Button 
                onClick={handleLogout} 
                className="w-full bg-blue-500 hover:bg-blue-400"
              >
                Sign In Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const consumer = (accountData as any)?.consumer;
  const accounts = (accountData as any)?.accounts;
  const tenant = (accountData as any)?.tenant;
  const hasAccounts = accounts && accounts.length > 0;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  };

  const totalBalance = accounts?.reduce((sum: number, account: any) => 
    sum + (account.balanceCents || 0), 0) || 0;
    
  const getStatusStyle = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
      case "overdue":
        return "border-rose-400/30 bg-rose-500/10 text-rose-200";
      case "settled":
        return "border-slate-400/30 bg-slate-500/10 text-slate-200";
      default:
        return "border-amber-400/30 bg-amber-500/10 text-amber-200";
    }
  };

  // Use agency branding or fallback
  const agencyLogo = (agencyBranding as any)?.logoUrl || chainLogo;
  const agencyName = (agencyBranding as any)?.agencyName || tenant?.name || session.tenantSlug || "Consumer Portal";
  const contactEmail = (agencyBranding as any)?.contactEmail || tenant?.contactEmail;
  const contactPhone = (agencyBranding as any)?.contactPhone || tenant?.contactPhone;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Background gradients */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      {/* Header with Agency Branding */}
      <header className="relative border-b border-white/10 bg-slate-950/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={agencyLogo} alt={agencyName} className="h-10 w-auto object-contain" />
              <div>
                <p className="text-sm font-semibold text-white">
                  {agencyName}
                </p>
                <p className="text-xs text-blue-100/70 flex items-center">
                  <User className="h-3 w-3 mr-1" />
                  {consumer?.firstName} {consumer?.lastName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setShowContactDialog(true)}
                variant="outline"
                className="text-white border-white/20 hover:bg-white/10"
                data-testid="button-contact-us"
              >
                <Phone className="h-4 w-4 mr-2" />
                Contact Us
              </Button>
              <Button
                onClick={handleLogout}
                variant="ghost"
                className="text-white hover:bg-white/10"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/10 p-8 shadow-2xl shadow-blue-900/30">
          <div className="pointer-events-none absolute -right-10 top-10 h-56 w-56 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-6 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100/80">
                Account Overview
              </span>
              <Button
                onClick={() => setShowEditDialog(true)}
                variant="ghost"
                size="sm"
                className="text-blue-200 hover:bg-white/10"
                data-testid="button-edit-profile"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
              Welcome back, {consumer?.firstName || 'Valued Customer'}
            </h1>
            <p className="mt-2 text-sm text-blue-100/70 sm:text-base">
              Review your account balances, make payments, and manage your obligations in one secure place.
            </p>

            {/* Summary Stats */}
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-blue-100/70 uppercase tracking-wider">Total Accounts</p>
                    <p className="mt-1 text-2xl font-bold text-white">{hasAccounts ? accounts.length : 0}</p>
                  </div>
                  <CreditCard className="h-8 w-8 text-blue-400/50" />
                </div>
              </div>
              
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-blue-100/70 uppercase tracking-wider">Total Balance</p>
                    <p className="mt-1 text-2xl font-bold text-white">{formatCurrency(totalBalance)}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-emerald-400/50" />
                </div>
              </div>
              
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-blue-100/70 uppercase tracking-wider">Contact Email</p>
                    <p className="mt-1 text-sm font-semibold text-white truncate">{consumer?.email || session.email}</p>
                  </div>
                  <Mail className="h-8 w-8 text-indigo-400/50" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="accounts" className="w-full">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="accounts" className="data-[state=active]:bg-white/20">
              <CreditCard className="h-4 w-4 mr-2" />
              Accounts
            </TabsTrigger>
            <TabsTrigger value="documents" className="data-[state=active]:bg-white/20">
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="arrangements" className="data-[state=active]:bg-white/20">
              <Calendar className="h-4 w-4 mr-2" />
              Arrangements
            </TabsTrigger>
            <TabsTrigger value="payment-methods" className="data-[state=active]:bg-white/20">
              <CreditCard className="h-4 w-4 mr-2" />
              Saved Cards
            </TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="mt-6">
            <Card className="border-white/10 bg-white/5 backdrop-blur">
              <CardHeader className="border-b border-white/10">
                <CardTitle className="flex items-center text-white">
                  <CreditCard className="h-5 w-5 mr-2 text-blue-400" />
                  Your Accounts
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {!hasAccounts ? (
                  <div className="text-center py-12">
                    <CreditCard className="h-12 w-12 mx-auto mb-4 text-blue-400/30" />
                    <p className="text-blue-100/70">No accounts found</p>
                    <p className="text-sm text-blue-100/50 mt-2">
                      Contact your agency if you believe this is an error
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {accounts.map((account: any) => (
                      <div
                        key={account.id}
                        className="group rounded-xl border border-white/10 bg-white/5 p-6 hover:bg-white/10 transition-colors"
                        data-testid={`account-card-${account.id}`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-semibold text-white text-lg">
                              {account.creditor || "Unknown Creditor"}
                            </h3>
                            <p className="text-sm text-blue-100/70 mt-1">
                              Account: {account.accountNumber || "N/A"}
                            </p>
                          </div>
                          <Badge 
                            className={`${getStatusStyle(account.status)} border`}
                            variant="outline"
                          >
                            {account.status || 'Unknown'}
                          </Badge>
                        </div>
                        
                        <div className="flex justify-between items-end">
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-bold text-white">
                                {formatCurrency(account.balanceCents || 0)}
                              </span>
                              <span className="text-sm text-blue-100/50">Current Balance</span>
                            </div>
                            {account.dueDate && (
                              <p className="text-sm text-blue-100/70 mt-2">
                                Due: {new Date(account.dueDate).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          
                          <Button 
                            onClick={() => handlePayment(account)}
                            className="bg-emerald-500 hover:bg-emerald-400 text-white"
                            data-testid={`button-pay-${account.id}`}
                          >
                            <DollarSign className="h-4 w-4 mr-1" />
                            Pay Now
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            <Card className="border-white/10 bg-white/5 backdrop-blur">
              <CardHeader className="border-b border-white/10">
                <CardTitle className="flex items-center text-white">
                  <FileText className="h-5 w-5 mr-2 text-blue-400" />
                  Documents & Communications
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {(!documents || !(documents as any)?.length) ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-blue-400/30" />
                    <p className="text-blue-100/70">No documents available</p>
                    <p className="text-sm text-blue-100/50 mt-2">
                      Documents and communications from your agency will appear here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(documents as any[]).map((doc: any) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-blue-400" />
                          <div>
                            <p className="text-white font-medium">{doc.name || doc.fileName}</p>
                            <p className="text-sm text-blue-100/70">
                              {new Date(doc.uploadedAt || doc.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-white border-white/20 hover:bg-white/10"
                          onClick={() => window.open(doc.fileUrl, '_blank')}
                        >
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="arrangements" className="mt-6">
            <Card className="border-white/10 bg-white/5 backdrop-blur">
              <CardHeader className="border-b border-white/10">
                <CardTitle className="flex items-center text-white">
                  <Calendar className="h-5 w-5 mr-2 text-blue-400" />
                  Active Payment Arrangements
                </CardTitle>
                <p className="text-sm text-blue-100/70 mt-2">
                  View your scheduled payment arrangements and upcoming payment dates
                </p>
              </CardHeader>
              <CardContent className="p-6">
                {(!paymentSchedules || !(paymentSchedules as any)?.length) ? (
                  <div className="text-center py-12">
                    <Calendar className="h-12 w-12 mx-auto mb-4 text-blue-400/30" />
                    <p className="text-blue-100/70">No active payment arrangements</p>
                    <p className="text-sm text-blue-100/50 mt-2">
                      Set up a payment arrangement when making a payment on any account
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(paymentSchedules as any[]).map((schedule: any) => (
                      <div
                        key={schedule.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-6 hover:bg-white/10 transition-colors"
                        data-testid={`payment-schedule-${schedule.id}`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h4 className="text-white font-semibold text-lg">
                              {schedule.accountCreditor || "Payment Plan"}
                            </h4>
                            <p className="text-sm text-blue-100/70 mt-1">
                              Account: {schedule.accountNumber || "N/A"}
                            </p>
                          </div>
                          <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200 border">
                            Active
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <div className="rounded-lg bg-white/5 p-3">
                            <p className="text-xs text-blue-100/60">Next Payment</p>
                            <p className="text-white font-semibold mt-1">
                              {schedule.nextPaymentDate ? new Date(schedule.nextPaymentDate).toLocaleDateString('en-US', { 
                                month: 'long', 
                                day: 'numeric', 
                                year: 'numeric' 
                              }) : 'Not scheduled'}
                            </p>
                          </div>
                          
                          <div className="rounded-lg bg-white/5 p-3">
                            <p className="text-xs text-blue-100/60">Payment Amount</p>
                            <p className="text-white font-semibold mt-1">
                              {formatCurrency(schedule.amountCents || 0)}
                            </p>
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4 text-blue-400" />
                              <span className="text-sm text-blue-100/70">
                                {schedule.cardBrand || 'Card'} ending in {schedule.cardLast4 || '****'}
                              </span>
                            </div>
                            {schedule.remainingPayments && (
                              <span className="text-sm text-blue-100/70">
                                {schedule.remainingPayments} payment{schedule.remainingPayments !== 1 ? 's' : ''} remaining
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payment-methods" className="mt-6">
            <PaymentMethodsTab session={session} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Contact Us Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Contact {agencyName}</DialogTitle>
            <DialogDescription>
              Get in touch with us for questions about your account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Contact Information Section */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Direct Contact</h4>
              {contactPhone && (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
                  <Phone className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">Phone</p>
                    <a href={`tel:${contactPhone}`} className="text-sm text-blue-600 hover:underline">
                      {contactPhone}
                    </a>
                  </div>
                </div>
              )}
              {contactEmail && (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
                  <Mail className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <a href={`mailto:${contactEmail}`} className="text-sm text-blue-600 hover:underline">
                      {contactEmail}
                    </a>
                  </div>
                </div>
              )}
              {!contactPhone && !contactEmail && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Contact information not available. Please check your account statements or documents.
                </p>
              )}
            </div>

            {/* Request Callback Section */}
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center gap-2 mb-3">
                <Phone className="h-5 w-5 text-blue-500" />
                <h4 className="text-sm font-semibold">Request a Callback</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                We'll contact you at your preferred time
              </p>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="callback-time">Preferred Time</Label>
                  <Select 
                    value={callbackForm.preferredTime} 
                    onValueChange={(value) => setCallbackForm({ ...callbackForm, preferredTime: value })}
                  >
                    <SelectTrigger id="callback-time" data-testid="select-callback-time">
                      <SelectValue placeholder="Select a time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anytime">Anytime</SelectItem>
                      <SelectItem value="morning">Morning (8 AM - 12 PM)</SelectItem>
                      <SelectItem value="afternoon">Afternoon (12 PM - 5 PM)</SelectItem>
                      <SelectItem value="evening">Evening (5 PM - 8 PM)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="callback-phone">Phone Number (Optional)</Label>
                  <Input
                    id="callback-phone"
                    type="tel"
                    placeholder="Enter phone number"
                    value={callbackForm.phoneNumber}
                    onChange={(e) => setCallbackForm({ ...callbackForm, phoneNumber: e.target.value })}
                    data-testid="input-callback-phone"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use phone number on file
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="callback-message">Message (Optional)</Label>
                  <Textarea
                    id="callback-message"
                    placeholder="What would you like to discuss?"
                    value={callbackForm.message}
                    onChange={(e) => setCallbackForm({ ...callbackForm, message: e.target.value })}
                    rows={3}
                    data-testid="textarea-callback-message"
                  />
                </div>

                <Button 
                  onClick={handleCallbackRequest}
                  disabled={callbackMutation.isPending}
                  className="w-full"
                  data-testid="button-submit-callback"
                >
                  {callbackMutation.isPending ? "Submitting..." : "Request Callback"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Your Profile</DialogTitle>
            <DialogDescription>
              Update your contact information and address
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  data-testid="input-first-name"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                data-testid="input-phone"
              />
            </div>
            <div>
              <Label htmlFor="address">Street Address</Label>
              <Input
                id="address"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                data-testid="input-address"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  data-testid="input-city"
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={editForm.state}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  maxLength={2}
                  data-testid="input-state"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                value={editForm.zipCode}
                onChange={(e) => setEditForm({ ...editForm, zipCode: e.target.value })}
                data-testid="input-zip"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditProfile}
              className="bg-blue-500 hover:bg-blue-400"
              data-testid="button-save-profile"
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Make a Payment</DialogTitle>
            <DialogDescription>
              {applicableArrangements.length > 0 
                ? "Choose a payment plan or pay the full balance now"
                : "Securely pay your account balance using a credit or debit card"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePaymentSubmit}>
            <div className="space-y-4 py-4">
              {selectedAccount && (
                <>
                  <div className="rounded-lg bg-blue-50 p-3 border border-blue-200">
                    <p className="text-xs text-gray-600">Account: {selectedAccount.creditor}</p>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm font-medium text-gray-700">Total Balance:</span>
                      <span className="text-xl font-bold text-blue-600">
                        {formatCurrency(selectedAccount.balanceCents || 0)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="rounded-lg bg-green-50 p-4 border-2 border-green-500">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">
                        {selectedArrangement ? 'Payment Amount:' : 'Amount to Pay:'}
                      </span>
                      <span className="text-2xl font-bold text-green-600">
                        {formatCurrency(paymentAmountCents)}
                      </span>
                    </div>
                    {selectedArrangement && (
                      <p className="text-xs text-gray-600 mt-1">
                        {selectedArrangement.planType === 'settlement' && 'Settlement payment - full balance will be cleared'}
                        {selectedArrangement.planType === 'fixed_monthly' && 'First installment payment'}
                        {selectedArrangement.planType === 'range' && 'Minimum monthly payment'}
                        {selectedArrangement.planType === 'pay_in_full' && (selectedArrangement.payoffPercentageBasisPoints ? 'Discounted payoff amount' : 'One-time payment')}
                      </p>
                    )}
                  </div>
                </>
              )}

              {applicableArrangements.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Payment Options</Label>
                  <div className="space-y-2">
                    {/* Pay in Full Option */}
                    <div 
                      onClick={() => setSelectedArrangement(null)}
                      className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${
                        !selectedArrangement 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      data-testid="option-pay-full"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Pay Full Balance</p>
                          <p className="text-sm text-gray-600">One-time payment</p>
                        </div>
                        <span className="text-lg font-bold text-blue-600">
                          {formatCurrency(selectedAccount?.balanceCents || 0)}
                        </span>
                      </div>
                    </div>

                    {/* Arrangement Options */}
                    {applicableArrangements.map((arrangement: any) => {
                      const summary = getArrangementSummary(arrangement);
                      const isSettlement = arrangement.planType === 'settlement';
                      const isPayInFull = arrangement.planType === 'pay_in_full';
                      
                      return (
                        <div
                          key={arrangement.id}
                          onClick={() => setSelectedArrangement(arrangement)}
                          className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${
                            selectedArrangement?.id === arrangement.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          data-testid={`option-arrangement-${arrangement.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{summary.headline}</p>
                                {isSettlement && (
                                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Settlement</Badge>
                                )}
                              </div>
                              {summary.detail && (
                                <p className="text-sm text-gray-600 mt-1">{summary.detail}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-t pt-4 space-y-4">
                <Label className="text-base font-semibold">Payment Information</Label>

                <div>
                  <Label htmlFor="cardName">Cardholder Name</Label>
                  <Input
                    id="cardName"
                    value={paymentForm.cardName}
                    onChange={(e) => setPaymentForm({ ...paymentForm, cardName: e.target.value })}
                    required
                    placeholder="John Doe"
                    data-testid="input-card-name"
                  />
                </div>

                <div>
                  <Label htmlFor="cardNumber">Card Number</Label>
                  <Input
                    id="cardNumber"
                    value={paymentForm.cardNumber}
                    onChange={(e) => setPaymentForm({ ...paymentForm, cardNumber: e.target.value.replace(/\D/g, '') })}
                    required
                    maxLength={16}
                    placeholder="1234 5678 9012 3456"
                    data-testid="input-card-number"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="expiryMonth">Exp Month</Label>
                    <Input
                      id="expiryMonth"
                      value={paymentForm.expiryMonth}
                      onChange={(e) => setPaymentForm({ ...paymentForm, expiryMonth: e.target.value.replace(/\D/g, '') })}
                      required
                      maxLength={2}
                      placeholder="MM"
                      data-testid="input-expiry-month"
                    />
                  </div>
                  <div>
                    <Label htmlFor="expiryYear">Exp Year</Label>
                    <Input
                      id="expiryYear"
                      value={paymentForm.expiryYear}
                      onChange={(e) => setPaymentForm({ ...paymentForm, expiryYear: e.target.value.replace(/\D/g, '') })}
                      required
                      maxLength={4}
                      placeholder="YYYY"
                      data-testid="input-expiry-year"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cvv">CVV</Label>
                    <Input
                      id="cvv"
                      value={paymentForm.cvv}
                      onChange={(e) => setPaymentForm({ ...paymentForm, cvv: e.target.value.replace(/\D/g, '') })}
                      required
                      maxLength={4}
                      placeholder="123"
                      data-testid="input-cvv"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="zipCode">Billing ZIP Code</Label>
                  <Input
                    id="zipCode"
                    value={paymentForm.zipCode}
                    onChange={(e) => setPaymentForm({ ...paymentForm, zipCode: e.target.value })}
                    placeholder="12345"
                    data-testid="input-payment-zip"
                  />
                </div>

                {selectedArrangement && (
                  <div>
                    <Label htmlFor="firstPaymentDate">
                      {selectedArrangement.planType === 'settlement' || selectedArrangement.planType === 'pay_in_full' 
                        ? 'Payment Date' 
                        : 'First Payment Date'}
                    </Label>
                    <Input
                      type="date"
                      id="firstPaymentDate"
                      value={firstPaymentDate}
                      onChange={(e) => setFirstPaymentDate(e.target.value)}
                      required={!!selectedArrangement}
                      min={new Date().toISOString().split('T')[0]}
                      data-testid="input-first-payment-date"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedArrangement.planType === 'settlement' || selectedArrangement.planType === 'pay_in_full'
                        ? 'When should this payment be processed?'
                        : 'When should the first payment be processed?'}
                    </p>
                  </div>
                )}

                {selectedArrangement && (selectedArrangement.planType === 'fixed_monthly' || selectedArrangement.planType === 'range') && (
                  <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <input
                      type="checkbox"
                      id="setupRecurring"
                      checked={setupRecurring}
                      onChange={(e) => setSetupRecurring(e.target.checked)}
                      className="h-4 w-4 text-blue-600 rounded"
                      data-testid="checkbox-setup-recurring"
                    />
                    <label htmlFor="setupRecurring" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Set up automatic recurring payments with this card
                    </label>
                  </div>
                )}

                {!setupRecurring && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="saveCard"
                      checked={saveCard}
                      onChange={(e) => setSaveCard(e.target.checked)}
                      className="h-4 w-4 text-blue-600 rounded"
                      data-testid="checkbox-save-card"
                    />
                    <label htmlFor="saveCard" className="text-sm text-gray-700 cursor-pointer">
                      Save this card for future payments
                    </label>
                  </div>
                )}

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Your payment information is securely encrypted</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPaymentDialog(false)}
                disabled={paymentProcessing}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-500 hover:bg-blue-400"
                disabled={paymentProcessing}
                data-testid="button-submit-payment"
              >
                {paymentProcessing ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  `Pay ${formatCurrency(paymentAmountCents)}`
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
