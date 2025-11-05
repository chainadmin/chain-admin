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
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertCircle, LogOut, User, Building2, CreditCard, DollarSign, TrendingUp, Mail, Phone, Edit, FileText, MessageSquare, Calendar, Upload, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
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
  const [firstPaymentDate, setFirstPaymentDate] = useState<Date | undefined>(undefined);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [customPaymentAmount, setCustomPaymentAmount] = useState<string>("");
  
  // New simplified payment flow state
  const [paymentMethod, setPaymentMethod] = useState<'term' | 'custom' | 'smax'>('term');
  const [selectedTerm, setSelectedTerm] = useState<3 | 6 | 12 | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [paymentFrequency, setPaymentFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('biweekly');
  const [calculatedPayment, setCalculatedPayment] = useState<number | null>(null);
  const [monthlyBaseAmount, setMonthlyBaseAmount] = useState<number | null>(null); // Always stores the monthly amount
  
  // Document upload state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadAccountId, setUploadAccountId] = useState<string>('');
  
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
      return apiCall("POST", "/api/consumer/callback-request", data, token);
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

  // Fetch settings to get minimum monthly payment
  const { data: settings } = useQuery({
    queryKey: ['/api/consumer/tenant-settings'],
    queryFn: async () => {
      const token = getStoredConsumerToken();
      const response = await apiCall("GET", "/api/consumer/tenant-settings", null, token);
      if (!response.ok) throw new Error("Failed to fetch settings");
      return response.json();
    },
    enabled: !!session?.tenantSlug,
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

  // Mutation to update payment method for a schedule
  const updateSchedulePaymentMethodMutation = useMutation({
    mutationFn: async ({ scheduleId, paymentMethodId }: { scheduleId: string; paymentMethodId: string }) => {
      const token = getStoredConsumerToken();
      const response = await apiCall("PATCH", `/api/consumer/payment-schedules/${scheduleId}/payment-method`, { paymentMethodId }, token);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update payment method");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Payment Method Updated",
        description: data.syncedToSmax 
          ? "Your payment method has been updated and synced with our system."
          : "Your payment method has been updated successfully.",
      });
      queryClient.invalidateQueries({ 
        queryKey: [`/api/consumer/payment-schedules/${session?.email}?tenantSlug=${session?.tenantSlug}`] 
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update payment method. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Document upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiCall('POST', '/api/consumer/documents/upload', formData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload document');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document uploaded",
        description: "Your document has been uploaded successfully",
      });
      queryClient.invalidateQueries({ 
        queryKey: [`/api/consumer/documents/${session?.email}?tenantSlug=${session?.tenantSlug}`] 
      });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setUploadTitle('');
      setUploadDescription('');
      setUploadAccountId('');
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleUpload = () => {
    if (!selectedFile || !uploadTitle) {
      toast({
        title: "Missing information",
        description: "Please select a file and provide a title",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('title', uploadTitle);
    if (uploadDescription) formData.append('description', uploadDescription);
    if (uploadAccountId) formData.append('accountId', uploadAccountId);
    formData.append('isPublic', 'false');

    uploadMutation.mutate(formData);
  };

  const handleLogout = () => {
    clearConsumerAuth();
    toast({
      title: "Signed Out",
      description: "You have been signed out successfully.",
    });
    // Redirect to root of subdomain (agency landing page)
    setLocation("/");
  };

  // Calculation helper functions for simplified payment flow
  const calculatePaymentAmount = (balanceCents: number, term: number, minimumCents: number = 0) => {
    const monthlyAmount = Math.ceil(balanceCents / term);
    return monthlyAmount < minimumCents ? minimumCents : monthlyAmount;
  };

  const convertToFrequency = (monthlyAmountCents: number, frequency: 'weekly' | 'biweekly' | 'monthly') => {
    // Use annualized math to avoid overcharging customers
    // Weekly: monthly * 12 months / 52 weeks per year
    // Biweekly: monthly * 12 months / 26 biweekly periods per year
    if (frequency === 'weekly') return Math.ceil(monthlyAmountCents * 12 / 52);
    if (frequency === 'biweekly') return Math.ceil(monthlyAmountCents * 12 / 26);
    return monthlyAmountCents;
  };

  const generatePaymentSchedule = (amountCents: number, frequency: 'weekly' | 'biweekly' | 'monthly', startDate?: Date) => {
    const start = startDate || new Date();
    const schedule = [];
    const daysIncrement = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 30;
    
    for (let i = 0; i < 4; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + (i * daysIncrement));
      schedule.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        amount: amountCents,
      });
    }
    
    return schedule;
  };

  const handlePayment = (account: any) => {
    setSelectedAccount(account);
    setSelectedArrangement(null);
    setSaveCard(false);
    setSetupRecurring(false);
    setFirstPaymentDate(undefined);
    setCustomPaymentAmount("");
    // Reset simplified flow state
    setPaymentMethod('term');
    setSelectedTerm(null);
    setCustomAmount('');
    setPaymentFrequency('biweekly');
    setCalculatedPayment(null);
    setShowPaymentDialog(true);
  };

  // Get arrangements applicable to the selected account
  const applicableArrangements = selectedAccount && arrangements
    ? (arrangements as any).templateOptions?.filter((arr: any) => 
        selectedAccount.balanceCents >= arr.minBalance && 
        selectedAccount.balanceCents <= arr.maxBalance
      ) || []
    : [];
  
  // Get existing SMAX arrangements for this consumer
  const existingSMAXArrangements = arrangements?.existingArrangements || [];
  const hasExistingSMAXArrangement = arrangements?.hasExistingSMAXArrangement || false;
  
  // Check if selected account has existing SMAX arrangement
  const selectedAccountSMAXArrangement = selectedAccount && existingSMAXArrangements
    ? existingSMAXArrangements.find((arr: any) => arr.accountId === selectedAccount.id)
    : null;

  // Calculate payment amount based on selected arrangement or simplified flow
  const paymentAmountCents = selectedAccount
    ? selectedArrangement
      ? (selectedArrangement.planType === 'one_time_payment' && customPaymentAmount
          ? Math.round(parseFloat(customPaymentAmount) * 100) // Convert dollars to cents
          : calculateArrangementPayment(selectedArrangement, selectedAccount.balanceCents || 0))
      : calculatedPayment !== null
        ? calculatedPayment
        : selectedAccount.balanceCents || 0
    : 0;

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedAccount) return;

    // Validate simplified flow
    if (!selectedArrangement && calculatedPayment === null) {
      toast({
        title: "Select Payment Plan",
        description: "Please select a payment term or enter a custom amount",
        variant: "destructive",
      });
      return;
    }

    // Determine if using simplified flow and if recurring
    const isSMAXPayment = paymentMethod === 'smax';
    const isSimplifiedFlow = !selectedArrangement && calculatedPayment !== null && !isSMAXPayment;
    const willSetupRecurring = isSimplifiedFlow || (setupRecurring && selectedArrangement && 
      (selectedArrangement.planType === 'fixed_monthly' || selectedArrangement.planType === 'range'));

    // Validate first payment date for recurring payments (skip for SMAX one-time payments)
    if (willSetupRecurring && !firstPaymentDate && !isSMAXPayment) {
      toast({
        title: "Payment Date Required",
        description: "Please select a first payment date for your payment plan",
        variant: "destructive",
      });
      return;
    }

    // Validate one-time payment amount
    if (selectedArrangement?.planType === 'one_time_payment') {
      const amount = parseFloat(customPaymentAmount);
      const minAmount = (selectedArrangement.oneTimePaymentMin || 0) / 100;
      const maxAmount = (selectedAccount.balanceCents || 0) / 100;
      
      if (!customPaymentAmount || isNaN(amount)) {
        toast({
          title: "Invalid Amount",
          description: "Please enter a valid payment amount",
          variant: "destructive",
        });
        return;
      }
      
      if (amount < minAmount) {
        toast({
          title: "Amount Too Low",
          description: `Minimum payment is $${minAmount.toFixed(2)}`,
          variant: "destructive",
        });
        return;
      }
      
      if (amount > maxAmount) {
        toast({
          title: "Amount Too High",
          description: `Maximum payment is $${maxAmount.toFixed(2)} (your balance)`,
          variant: "destructive",
        });
        return;
      }
    }

    setPaymentProcessing(true);

    try {
      const token = getStoredConsumerToken();
      // For one-time payments, use today's date automatically
      const paymentDate = selectedArrangement?.planType === 'one_time_payment' 
        ? new Date().toISOString().split('T')[0]
        : firstPaymentDate ? firstPaymentDate.toISOString().split('T')[0] : null;
      
      // Determine if using simplified flow (exclude SMAX one-time payments)
      const isSMAXPayment = paymentMethod === 'smax';
      const isSimplifiedFlow = !selectedArrangement && calculatedPayment !== null && !isSMAXPayment;
      const shouldSetupRecurring = isSimplifiedFlow || (setupRecurring && selectedArrangement && 
        (selectedArrangement.planType === 'fixed_monthly' || selectedArrangement.planType === 'range'));
      
      const response = await apiCall("POST", `/api/consumer/payments/process`, {
        accountId: selectedAccount.id,
        arrangementId: selectedArrangement?.id || null,
        cardNumber: paymentForm.cardNumber,
        expiryMonth: paymentForm.expiryMonth,
        expiryYear: paymentForm.expiryYear,
        cvv: paymentForm.cvv,
        cardName: paymentForm.cardName,
        zipCode: paymentForm.zipCode,
        saveCard: saveCard || isSimplifiedFlow,
        setupRecurring: shouldSetupRecurring,
        firstPaymentDate: paymentDate,
        customPaymentAmountCents: selectedArrangement?.planType === 'one_time_payment' && customPaymentAmount
          ? Math.round(parseFloat(customPaymentAmount) * 100)
          : (isSimplifiedFlow || isSMAXPayment)
            ? calculatedPayment
            : null,
        // Simplified flow specific data
        simplifiedFlow: isSimplifiedFlow ? {
          paymentMethod,
          selectedTerm,
          paymentFrequency,
          calculatedPaymentCents: calculatedPayment,
        } : null,
      }, token);

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Payment failed");
      }

      // Determine if this was an immediate payment or just a schedule setup
      const isRecurringSetup = shouldSetupRecurring;
      
      const displayDate = firstPaymentDate ? firstPaymentDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      const formattedDate = new Date(displayDate).toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
      
      const frequencyText = paymentFrequency === 'weekly' ? 'weekly' : paymentFrequency === 'biweekly' ? 'bi-weekly' : 'monthly';
      const successMessage = isRecurringSetup
        ? isSimplifiedFlow
          ? `Your payment plan has been set up successfully. Your first ${frequencyText} payment of ${formatCurrency(paymentAmountCents)} will be processed on ${formattedDate}.`
          : `Your payment plan has been set up successfully. Your first payment of ${formatCurrency(paymentAmountCents)} will be processed on ${formattedDate}.`
        : `Your payment of ${formatCurrency(paymentAmountCents)} has been processed.`;

      toast({
        title: isRecurringSetup ? "Payment Plan Activated" : "Payment Successful",
        description: successMessage,
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
      const errorMessage = err.message || "Unable to process payment. Please try again or contact your agency.";
      
      // Show toast notification
      toast({
        title: "Payment Failed",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Also show alert dialog for more visibility
      alert(`Payment Declined\n\n${errorMessage}\n\nPlease check your card details and try again, or contact your agency for assistance.`);
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
                className="w-full bg-emerald-500 hover:bg-emerald-400"
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
        <div className="mx-auto max-w-7xl px-4 py-4 sm:py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
            <div className="flex items-center gap-3">
              <img src={agencyLogo} alt={agencyName} className="h-8 sm:h-10 w-auto object-contain" />
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
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button
                onClick={() => setShowContactDialog(true)}
                variant="outline"
                size="sm"
                className="text-white border-white/20 hover:bg-white/10"
                data-testid="button-contact-us"
              >
                <Phone className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Contact Us</span>
              </Button>
              <Button
                onClick={handleLogout}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
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
                        
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
                          <div>
                            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                              <span className="text-2xl sm:text-3xl font-bold text-white">
                                {formatCurrency(account.balanceCents || 0)}
                              </span>
                              <span className="text-xs sm:text-sm text-blue-100/50">Current Balance</span>
                            </div>
                            {account.dueDate && (
                              <p className="text-sm text-blue-100/70 mt-2">
                                Due: {new Date(account.dueDate).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          
                          <Button 
                            onClick={() => handlePayment(account)}
                            size="sm"
                            className="bg-emerald-500 hover:bg-emerald-400 text-white w-full sm:w-auto"
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
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center text-white">
                    <FileText className="h-5 w-5 mr-2 text-blue-400" />
                    Documents & Communications
                  </CardTitle>
                  {accountData?.accounts?.length > 0 && (
                    <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                      <Button
                        onClick={() => setUploadDialogOpen(true)}
                        variant="outline"
                        size="sm"
                        className="text-white border-white/20 hover:bg-white/10"
                        data-testid="button-upload-document"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Document
                      </Button>
                      <DialogContent className="bg-slate-900 text-white border-white/10">
                        <DialogHeader>
                          <DialogTitle className="text-white">Upload Document</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                          <div>
                            <Label htmlFor="file-upload" className="text-white">Select File *</Label>
                            <Input
                              id="file-upload"
                              type="file"
                              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                              className="bg-white/5 border-white/10 text-white"
                              data-testid="input-document-file"
                            />
                            {selectedFile && (
                              <p className="text-sm text-blue-100/70 mt-1">{selectedFile.name}</p>
                            )}
                          </div>
                          <div>
                            <Label htmlFor="upload-title" className="text-white">Document Title *</Label>
                            <Input
                              id="upload-title"
                              value={uploadTitle}
                              onChange={(e) => setUploadTitle(e.target.value)}
                              placeholder="e.g., Proof of Payment"
                              className="bg-white/5 border-white/10 text-white placeholder:text-white/50"
                              data-testid="input-document-title"
                            />
                          </div>
                          <div>
                            <Label htmlFor="upload-description" className="text-white">Description (Optional)</Label>
                            <Textarea
                              id="upload-description"
                              value={uploadDescription}
                              onChange={(e) => setUploadDescription(e.target.value)}
                              placeholder="Add any relevant notes about this document"
                              className="bg-white/5 border-white/10 text-white placeholder:text-white/50"
                              data-testid="input-document-description"
                            />
                          </div>
                          <div>
                            <Label htmlFor="upload-account" className="text-white">Associated Account (Optional)</Label>
                            <Select value={uploadAccountId} onValueChange={setUploadAccountId}>
                              <SelectTrigger 
                                id="upload-account" 
                                className="bg-white/5 border-white/10 text-white"
                                data-testid="select-document-account"
                              >
                                <SelectValue placeholder="Select an account" />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-900 border-white/10">
                                <SelectItem value="" className="text-white">None</SelectItem>
                                {accountData?.accounts?.map((account: any) => (
                                  <SelectItem key={account.id} value={account.id} className="text-white">
                                    {account.creditor} - {account.accountNumber ? `••••${account.accountNumber.slice(-4)}` : 'No account number'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex justify-end space-x-2 pt-4">
                            <Button
                              variant="outline"
                              onClick={() => setUploadDialogOpen(false)}
                              disabled={uploadMutation.isPending}
                              className="border-white/20 text-white hover:bg-white/10"
                              data-testid="button-cancel-upload"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={handleUpload}
                              disabled={uploadMutation.isPending || !selectedFile || !uploadTitle}
                              className="bg-emerald-500 hover:bg-emerald-400 text-white"
                              data-testid="button-confirm-upload"
                            >
                              {uploadMutation.isPending ? "Uploading..." : "Upload"}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {(!documents || !(documents as any)?.length) ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-blue-400/30" />
                    <p className="text-blue-100/70">No documents available</p>
                    <p className="text-sm text-blue-100/50 mt-2">
                      {accountData?.accounts?.length > 0 
                        ? "Upload documents or view communications from your agency here"
                        : "Documents and communications from your agency will appear here"
                      }
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(documents as any[]).map((doc: any) => (
                      <div
                        key={doc.id}
                        className={`flex items-center justify-between rounded-xl border p-4 transition-colors ${
                          doc.isPendingSignature 
                            ? 'border-amber-400/30 bg-amber-500/10 hover:bg-amber-500/20' 
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <FileText className={`h-5 w-5 ${doc.isPendingSignature ? 'text-amber-400' : 'text-blue-400'}`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-white font-medium">{doc.title || doc.name || doc.fileName}</p>
                              {doc.isPendingSignature && (
                                <Badge className="border-amber-400/30 bg-amber-500/20 text-amber-200 border text-xs">
                                  Signature Required
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-blue-100/70">
                              {doc.description || (doc.isPendingSignature ? 'Please review and sign this document' : new Date(doc.uploadedAt || doc.createdAt).toLocaleDateString())}
                            </p>
                          </div>
                        </div>
                        {doc.isPendingSignature ? (
                          <Button
                            size="sm"
                            className="bg-amber-500 hover:bg-amber-400 text-white font-semibold"
                            onClick={() => window.location.href = `/sign/${doc.id}?tenant=${session?.tenantSlug}`}
                            data-testid={`button-sign-${doc.id}`}
                          >
                            Sign Now
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-white border-white/20 hover:bg-white/10"
                            onClick={() => window.open(doc.fileUrl, '_blank')}
                            data-testid={`button-view-${doc.id}`}
                          >
                            View
                          </Button>
                        )}
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
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-medium text-white">Payment Method</label>
                              {schedule.remainingPayments && (
                                <span className="text-sm text-blue-100/70">
                                  {schedule.remainingPayments} payment{schedule.remainingPayments !== 1 ? 's' : ''} remaining
                                </span>
                              )}
                            </div>
                            <Select
                              value={schedule.paymentMethodId}
                              onValueChange={(paymentMethodId) => {
                                updateSchedulePaymentMethodMutation.mutate({
                                  scheduleId: schedule.id,
                                  paymentMethodId,
                                });
                              }}
                            >
                              <SelectTrigger className="w-full bg-white/5 border-white/20 text-blue-100">
                                <SelectValue>
                                  <div className="flex items-center gap-2">
                                    <CreditCard className="h-4 w-4 text-blue-400" />
                                    <span>
                                      {schedule.cardBrand || 'Card'} ending in {schedule.cardLast4 || '****'}
                                    </span>
                                  </div>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {accountData?.paymentMethods?.map((method: any) => (
                                  <SelectItem key={method.id} value={method.id}>
                                    <div className="flex items-center gap-2">
                                      <CreditCard className="h-4 w-4" />
                                      <span>
                                        {method.cardBrand || 'Card'} ending in {method.lastFour}
                                        {method.isDefault && <span className="ml-2 text-xs text-emerald-400">(Default)</span>}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Show all upcoming payment dates from backend */}
                        {schedule.upcomingPayments && schedule.upcomingPayments.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-white/10">
                            <h5 className="text-sm font-semibold text-white mb-3">
                              Full Payment Schedule ({schedule.upcomingPayments.length} payment{schedule.upcomingPayments.length !== 1 ? 's' : ''})
                            </h5>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {schedule.upcomingPayments.map((payment: any, index: number) => (
                                <div 
                                  key={index} 
                                  className="flex items-center justify-between rounded-lg bg-white/5 p-2 px-3 hover:bg-white/10 transition-colors"
                                  data-testid={`payment-date-${index}`}
                                >
                                  <span className="text-sm text-blue-100/80">
                                    Payment {payment.paymentNumber}
                                  </span>
                                  <span className="text-sm text-white font-medium">
                                    {new Date(payment.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Cancel button */}
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
                            onClick={async () => {
                              if (!window.confirm('Are you sure you want to cancel this payment arrangement? This action cannot be undone.')) {
                                return;
                              }
                              
                              try {
                                const token = localStorage.getItem('consumerToken');
                                const response = await apiCall(
                                  "POST",
                                  `/api/consumer/payment-schedule/${schedule.id}/cancel`,
                                  {},
                                  token
                                );
                                
                                if (!response.ok) {
                                  const errorData = await response.json();
                                  throw new Error(errorData.message || 'Failed to cancel payment arrangement');
                                }
                                
                                toast({
                                  title: "Arrangement Cancelled",
                                  description: "Your payment arrangement has been cancelled successfully.",
                                });
                                
                                // Refresh the schedules list
                                queryClient.invalidateQueries({ 
                                  queryKey: [`/api/consumer/payment-schedules/${session?.email}?tenantSlug=${session?.tenantSlug}`] 
                                });
                              } catch (error: any) {
                                console.error('Error cancelling arrangement:', error);
                                toast({
                                  title: "Error",
                                  description: error.message || "Failed to cancel payment arrangement. Please try again.",
                                  variant: "destructive",
                                });
                              }
                            }}
                            data-testid={`button-cancel-schedule-${schedule.id}`}
                          >
                            Cancel Arrangement
                          </Button>
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
              className="bg-emerald-500 hover:bg-emerald-400"
              data-testid="button-save-profile"
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-950 border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Make a Payment</DialogTitle>
            <DialogDescription className="text-blue-100/70">
              {applicableArrangements.length > 0 
                ? "Choose a payment plan or pay the full balance now"
                : "Securely pay your account balance using a credit or debit card"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePaymentSubmit}>
            <div className="space-y-4 py-4">
              {selectedAccount && (
                <>
                  <div className="rounded-lg bg-white/5 p-3 border border-white/10 backdrop-blur">
                    <p className="text-xs text-blue-100/70">Account: {selectedAccount.creditor}</p>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm font-medium text-white">Total Balance:</span>
                      <span className="text-xl font-bold text-blue-400">
                        {formatCurrency(selectedAccount.balanceCents || 0)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="rounded-lg bg-emerald-500/10 p-4 border-2 border-emerald-400/30 backdrop-blur">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-white">
                        {selectedArrangement || calculatedPayment !== null ? 'Payment Amount:' : 'Amount to Pay:'}
                      </span>
                      <span className="text-2xl font-bold text-emerald-400">
                        {formatCurrency(paymentAmountCents)}
                      </span>
                    </div>
                    {selectedArrangement && (
                      <p className="text-xs text-emerald-200/70 mt-1">
                        {selectedArrangement.planType === 'settlement' && 'Settlement payment - full balance will be cleared'}
                        {selectedArrangement.planType === 'fixed_monthly' && (setupRecurring ? 'Monthly installment amount (first payment on scheduled date)' : 'First installment payment')}
                        {selectedArrangement.planType === 'range' && (setupRecurring ? 'Minimum monthly payment (first payment on scheduled date)' : 'Minimum monthly payment')}
                        {selectedArrangement.planType === 'pay_in_full' && (selectedArrangement.payoffPercentageBasisPoints ? 'Discounted payoff amount' : 'One-time payment')}
                        {selectedArrangement.planType === 'one_time_payment' && (customPaymentAmount ? 'Custom one-time payment' : 'Enter payment amount below')}
                      </p>
                    )}
                    {!selectedArrangement && calculatedPayment !== null && (
                      <p className="text-xs text-emerald-200/70 mt-1">
                        {paymentMethod === 'term' && selectedTerm
                          ? `${paymentFrequency.charAt(0).toUpperCase() + paymentFrequency.slice(1)} payment for ${selectedTerm}-month plan`
                          : `${paymentFrequency.charAt(0).toUpperCase() + paymentFrequency.slice(1)} payment amount`}
                      </p>
                    )}
                  </div>
                  
                  {/* SMAX Arrangement Warning */}
                  {selectedAccountSMAXArrangement && (
                    <div className="rounded-lg bg-amber-500/10 border-2 border-amber-400/30 p-4 backdrop-blur">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-amber-200">Existing Payment Arrangement</h4>
                          <p className="text-sm text-amber-100/70 mt-1">
                            This account already has a payment arrangement on file in our collection system.
                          </p>
                          {selectedAccountSMAXArrangement.monthlyPayment && (
                            <p className="text-sm text-amber-100/70 mt-1">
                              <strong className="text-amber-200">Current Monthly Payment:</strong> {formatCurrency(selectedAccountSMAXArrangement.monthlyPayment)}
                              {selectedAccountSMAXArrangement.nextPaymentDate && (
                                <> | <strong className="text-amber-200">Next Due:</strong> {new Date(selectedAccountSMAXArrangement.nextPaymentDate).toLocaleDateString()}</>
                              )}
                            </p>
                          )}
                          <div className="mt-3 space-y-2">
                            <p className="text-sm font-medium text-amber-200">Your options:</p>
                            <ul className="text-sm text-amber-100/70 list-disc list-inside space-y-1">
                              <li>Make a one-time payment below (does not change your existing arrangement)</li>
                              <li>Contact us to request a change to your payment arrangement</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Payment Options - Always show, but simplified when existing arrangement */}
              {selectedAccountSMAXArrangement ? (
                <div className="space-y-4">
                  {/* Quick Payment Button for Existing Arrangement */}
                  <div className="rounded-lg bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-2 border-blue-400/30 p-4 backdrop-blur">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign className="h-5 w-5 text-blue-400" />
                      <Label className="text-base font-semibold text-blue-200">Pay My Arrangement</Label>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        // Backend now returns monthlyPayment already normalized to cents
                        const arrangementPaymentAmount = Math.round(selectedAccountSMAXArrangement.monthlyPayment);
                        
                        console.log('🔍 SMAX Arrangement Payment (normalized from backend):', {
                          amountCents: arrangementPaymentAmount,
                          displayAmount: formatCurrency(arrangementPaymentAmount)
                        });
                        
                        setCalculatedPayment(arrangementPaymentAmount);
                        setMonthlyBaseAmount(arrangementPaymentAmount);
                        setPaymentMethod('smax');
                        setSelectedArrangement(null);
                      }}
                      className={`w-full p-4 rounded-lg border-2 transition-all text-left backdrop-blur ${
                        paymentMethod === 'smax'
                          ? 'border-blue-400 bg-blue-500/20'
                          : 'border-white/20 bg-white/5 hover:border-blue-400/50 hover:bg-white/10'
                      }`}
                      data-testid="button-pay-arrangement"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm text-blue-100/70 mb-1">Payment Amount</div>
                          <div className="text-2xl font-bold text-blue-300">
                            {formatCurrency(Math.round(selectedAccountSMAXArrangement.monthlyPayment))}
                          </div>
                          {selectedAccountSMAXArrangement.nextPaymentDate && (
                            <div className="text-xs text-blue-100/50 mt-1">
                              Due: {new Date(selectedAccountSMAXArrangement.nextPaymentDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <Badge className="bg-blue-500 text-white border-blue-400/30">Pay Now</Badge>
                        </div>
                      </div>
                    </button>
                    <p className="text-xs text-blue-100/50 mt-2">
                      Click to make a payment on your payment arrangement. To modify your arrangement terms, please contact us.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Settlement Offers Section */}
                  {applicableArrangements.some((arr: any) => arr.planType === 'settlement') && (
                    <div className="rounded-lg bg-gradient-to-r from-emerald-500/10 to-green-500/10 border-2 border-emerald-400/30 p-4 backdrop-blur">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="h-5 w-5 text-emerald-400" />
                        <Label className="text-base font-semibold text-emerald-200">Special Settlement Offers</Label>
                      </div>
                      <div className="space-y-2">
                        {applicableArrangements
                          .filter((arr: any) => arr.planType === 'settlement')
                          .map((arrangement: any) => {
                            const summary = getArrangementSummary(arrangement);
                            return (
                              <div
                                key={arrangement.id}
                                onClick={() => setSelectedArrangement(arrangement)}
                                className={`cursor-pointer rounded-lg border-2 p-3 transition-all ${
                                  selectedArrangement?.id === arrangement.id
                                    ? 'border-emerald-400 bg-emerald-500/20 backdrop-blur'
                                    : 'border-emerald-400/30 bg-white/5 hover:bg-white/10 hover:border-emerald-400/50'
                                }`}
                                data-testid={`option-settlement-${arrangement.id}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <p className="font-medium text-emerald-200">{summary.headline}</p>
                                    {summary.detail && (
                                      <p className="text-sm text-emerald-100/70 mt-1">{summary.detail}</p>
                                    )}
                                  </div>
                                  <Badge className="bg-emerald-500 text-white border-emerald-400/30">Save Money</Badge>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Simplified Payment Plan Section */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold text-white">Set Up Payment Plan</Label>
                    
                    {/* Quick Term Buttons */}
                    <div>
                      <Label className="text-sm text-blue-100/70 mb-2 block">Choose Payment Term</Label>
                      <div className="grid grid-cols-3 gap-3">
                        {([3, 6, 12] as const).map((term) => {
                          const minimumMonthly = settings?.minimumMonthlyPayment ?? 5000;
                          const monthlyPayment = calculatePaymentAmount(selectedAccount?.balanceCents || 0, term, minimumMonthly);
                          const biweeklyPayment = convertToFrequency(monthlyPayment, 'biweekly');
                          
                          return (
                            <button
                              key={term}
                              type="button"
                              onClick={() => {
                                setPaymentMethod('term');
                                setSelectedTerm(term);
                                setMonthlyBaseAmount(monthlyPayment);
                                setCalculatedPayment(biweeklyPayment);
                                setSelectedArrangement(null);
                              }}
                              className={`p-4 rounded-lg border-2 transition-all text-left backdrop-blur ${
                                paymentMethod === 'term' && selectedTerm === term
                                  ? 'border-blue-400 bg-blue-500/20'
                                  : 'border-white/20 bg-white/5 hover:border-blue-400/50 hover:bg-white/10'
                              }`}
                              data-testid={`button-term-${term}`}
                            >
                              <div className="text-xs text-blue-100/70 mb-1">{term} Months</div>
                              <div className="text-lg font-bold text-blue-300">
                                {formatCurrency(biweeklyPayment)}
                              </div>
                              <div className="text-xs text-blue-100/50 mt-1">bi-weekly</div>
                              {monthlyPayment >= minimumMonthly && monthlyPayment > (selectedAccount?.balanceCents || 0) / term && (
                                <div className="text-xs text-amber-300 mt-1">Min. applied</div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* OR Divider */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 border-t border-white/20"></div>
                      <span className="text-sm text-blue-100/50 font-medium">OR</span>
                      <div className="flex-1 border-t border-white/20"></div>
                    </div>

                    {/* Custom Amount Input */}
                    <div>
                      <Label htmlFor="customAmountInput" className="text-sm text-blue-100/70 mb-2 block">
                        Enter Custom Payment Amount
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-100/50 text-lg">$</span>
                        <Input
                          type="number"
                          id="customAmountInput"
                          value={customAmount}
                          onChange={(e) => {
                            const value = e.target.value;
                            setCustomAmount(value);
                            setPaymentMethod('custom');
                            setSelectedTerm(null);
                            setSelectedArrangement(null);
                            
                            if (value) {
                              const amountCents = Math.round(parseFloat(value) * 100);
                              const minimumMonthly = settings?.minimumMonthlyPayment ?? 5000;
                              const monthlyAmount = amountCents < minimumMonthly ? minimumMonthly : amountCents;
                              
                              // Store monthly base and convert to selected frequency
                              setMonthlyBaseAmount(monthlyAmount);
                              const finalAmount = convertToFrequency(monthlyAmount, paymentFrequency);
                              setCalculatedPayment(finalAmount);
                              
                              if (amountCents < minimumMonthly) {
                                toast({
                                  title: "Minimum Applied",
                                  description: `Amount adjusted to minimum monthly: ${formatCurrency(minimumMonthly)}`,
                                });
                              }
                            } else {
                              setMonthlyBaseAmount(null);
                              setCalculatedPayment(null);
                            }
                          }}
                          min={((settings?.minimumMonthlyPayment ?? 5000) / 100)}
                          max={(selectedAccount?.balanceCents || 0) / 100}
                          step="0.01"
                          placeholder="0.00"
                          className="pl-8 text-lg bg-white/5 border-white/20 text-white placeholder:text-blue-100/30"
                          data-testid="input-custom-amount"
                        />
                      </div>
                      <p className="text-xs text-blue-100/50 mt-1">
                        Min: ${((settings?.minimumMonthlyPayment ?? 5000) / 100).toFixed(2)} | Max: ${((selectedAccount?.balanceCents || 0) / 100).toFixed(2)}
                      </p>
                    </div>

                    {/* Payment Frequency Selector */}
                    {(calculatedPayment !== null || customAmount) && (
                      <div>
                        <Label className="text-sm text-blue-100/70 mb-2 block">Payment Frequency</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['weekly', 'biweekly', 'monthly'] as const).map((freq) => {
                            // Always use monthlyBaseAmount for conversion to ensure accuracy
                            const baseMonthlyAmount = monthlyBaseAmount || 0;
                            const amount = convertToFrequency(baseMonthlyAmount, freq);

                            return (
                              <button
                                key={freq}
                                type="button"
                                onClick={() => {
                                  setPaymentFrequency(freq);
                                  // Use stored monthlyBaseAmount for conversion
                                  if (monthlyBaseAmount) {
                                    setCalculatedPayment(convertToFrequency(monthlyBaseAmount, freq));
                                  }
                                }}
                                className={`p-3 rounded-lg border-2 transition-all backdrop-blur ${
                                  paymentFrequency === freq
                                    ? 'border-blue-400 bg-blue-500/20'
                                    : 'border-white/20 bg-white/5 hover:border-blue-400/50 hover:bg-white/10'
                                }`}
                                data-testid={`button-frequency-${freq}`}
                              >
                                <div className="text-sm font-medium capitalize text-white">{freq}</div>
                                <div className="text-xs text-blue-100/70 mt-1">
                                  {formatCurrency(amount)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Payment Schedule Preview */}
                    {calculatedPayment !== null && (
                      <div className="rounded-lg bg-white/5 border border-white/10 p-4 backdrop-blur">
                        <div className="flex items-center gap-2 mb-3">
                          <Calendar className="h-4 w-4 text-blue-400" />
                          <Label className="text-sm font-semibold text-blue-200">Payment Schedule Preview</Label>
                        </div>
                        <div className="space-y-2">
                          {generatePaymentSchedule(calculatedPayment, paymentFrequency).map((payment, index) => (
                            <div key={index} className="flex items-center justify-between text-sm">
                              <span className="text-blue-100/70">{payment.date}</span>
                              <span className="font-medium text-blue-300">{formatCurrency(payment.amount)}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-blue-100/50 mt-3 border-t border-white/10 pt-2">
                          Showing next 4 scheduled payments
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-white/10 pt-4 space-y-4">
                <Label className="text-base font-semibold text-white">Payment Information</Label>

                <div>
                  <Label htmlFor="cardName" className="text-white">Cardholder Name</Label>
                  <Input
                    id="cardName"
                    value={paymentForm.cardName}
                    onChange={(e) => setPaymentForm({ ...paymentForm, cardName: e.target.value })}
                    required
                    placeholder="John Doe"
                    className="bg-white/5 border-white/20 text-white placeholder:text-blue-100/30"
                    data-testid="input-card-name"
                  />
                </div>

                <div>
                  <Label htmlFor="cardNumber" className="text-white">Card Number</Label>
                  <Input
                    id="cardNumber"
                    value={paymentForm.cardNumber}
                    onChange={(e) => setPaymentForm({ ...paymentForm, cardNumber: e.target.value.replace(/\D/g, '') })}
                    required
                    maxLength={16}
                    placeholder="1234 5678 9012 3456"
                    className="bg-white/5 border-white/20 text-white placeholder:text-blue-100/30"
                    data-testid="input-card-number"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="expiryMonth" className="text-white">Exp Month</Label>
                    <Input
                      id="expiryMonth"
                      value={paymentForm.expiryMonth}
                      onChange={(e) => setPaymentForm({ ...paymentForm, expiryMonth: e.target.value.replace(/\D/g, '') })}
                      required
                      maxLength={2}
                      placeholder="MM"
                      className="bg-white/5 border-white/20 text-white placeholder:text-blue-100/30"
                      data-testid="input-expiry-month"
                    />
                  </div>
                  <div>
                    <Label htmlFor="expiryYear" className="text-white">Exp Year</Label>
                    <Input
                      id="expiryYear"
                      value={paymentForm.expiryYear}
                      onChange={(e) => setPaymentForm({ ...paymentForm, expiryYear: e.target.value.replace(/\D/g, '') })}
                      required
                      maxLength={4}
                      placeholder="YYYY"
                      className="bg-white/5 border-white/20 text-white placeholder:text-blue-100/30"
                      data-testid="input-expiry-year"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cvv" className="text-white">CVV</Label>
                    <Input
                      id="cvv"
                      value={paymentForm.cvv}
                      onChange={(e) => setPaymentForm({ ...paymentForm, cvv: e.target.value.replace(/\D/g, '') })}
                      required
                      maxLength={4}
                      placeholder="123"
                      className="bg-white/5 border-white/20 text-white placeholder:text-blue-100/30"
                      data-testid="input-cvv"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="zipCode" className="text-white">Billing ZIP Code</Label>
                  <Input
                    id="zipCode"
                    value={paymentForm.zipCode}
                    onChange={(e) => setPaymentForm({ ...paymentForm, zipCode: e.target.value })}
                    placeholder="12345"
                    className="bg-white/5 border-white/20 text-white placeholder:text-blue-100/30"
                    data-testid="input-payment-zip"
                  />
                </div>

                {selectedArrangement && selectedArrangement.planType === 'one_time_payment' && (
                  <div>
                    <Label htmlFor="customAmount" className="text-white">Payment Amount *</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-100/50">$</span>
                      <Input
                        type="number"
                        id="customAmount"
                        value={customPaymentAmount}
                        onChange={(e) => setCustomPaymentAmount(e.target.value)}
                        min={(selectedArrangement.oneTimePaymentMin || 0) / 100}
                        max={(selectedAccount?.balanceCents || 0) / 100}
                        step="0.01"
                        placeholder="0.00"
                        className="pl-8 bg-white/5 border-white/20 text-white placeholder:text-blue-100/30"
                        required
                        data-testid="input-custom-payment-amount"
                      />
                    </div>
                    <p className="text-xs text-blue-100/50 mt-1">
                      Min: ${((selectedArrangement.oneTimePaymentMin || 0) / 100).toFixed(2)} | Max: ${((selectedAccount?.balanceCents || 0) / 100).toFixed(2)} (Full Balance)
                    </p>
                  </div>
                )}

                {selectedArrangement && (selectedArrangement.planType === 'fixed_monthly' || selectedArrangement.planType === 'range') && !selectedAccountSMAXArrangement && (
                  <div className="flex items-center space-x-2 p-3 bg-blue-500/10 rounded-lg border border-blue-400/30 backdrop-blur">
                    <input
                      type="checkbox"
                      id="setupRecurring"
                      checked={setupRecurring}
                      onChange={(e) => setSetupRecurring(e.target.checked)}
                      className="h-4 w-4 text-blue-400 rounded bg-white/5 border-white/20"
                      data-testid="checkbox-setup-recurring"
                    />
                    <label htmlFor="setupRecurring" className="text-sm font-medium text-blue-100 cursor-pointer">
                      Set up automatic recurring payments with this card
                    </label>
                  </div>
                )}
                
                {selectedArrangement && (selectedArrangement.planType === 'fixed_monthly' || selectedArrangement.planType === 'range') && selectedAccountSMAXArrangement && (
                  <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-400/30 backdrop-blur">
                    <p className="text-sm text-amber-100/70">
                      <strong className="text-amber-200">Note:</strong> Recurring payments cannot be set up because this account already has an existing arrangement. Please contact us to modify your payment arrangement.
                    </p>
                  </div>
                )}

                {!setupRecurring && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="saveCard"
                      checked={saveCard}
                      onChange={(e) => setSaveCard(e.target.checked)}
                      className="h-4 w-4 text-blue-400 rounded bg-white/5 border-white/20"
                      data-testid="checkbox-save-card"
                    />
                    <label htmlFor="saveCard" className="text-sm text-blue-100 cursor-pointer">
                      Save this card for future payments
                    </label>
                  </div>
                )}

                {(calculatedPayment !== null || setupRecurring || (selectedArrangement && selectedArrangement.planType !== 'one_time_payment')) && (
                  <div>
                    <Label className="text-white">
                      {setupRecurring || (selectedArrangement && (selectedArrangement.planType === 'fixed_monthly' || selectedArrangement.planType === 'range'))
                        ? 'First Payment Date'
                        : 'Payment Date (Optional)'}
                    </Label>
                    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal border-white/20 bg-white/5 text-white hover:bg-white/10"
                          data-testid="button-select-payment-date"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {firstPaymentDate ? format(firstPaymentDate, "PPP") : <span className="text-blue-100/50">Select date or leave blank for immediate payment</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-slate-900 border-white/20">
                        <CalendarComponent
                          mode="single"
                          selected={firstPaymentDate}
                          onSelect={(date) => {
                            setFirstPaymentDate(date);
                            setDatePickerOpen(false);
                          }}
                          disabled={(date) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const maxDate = new Date();
                            maxDate.setMonth(maxDate.getMonth() + 1);
                            return date < today || date > maxDate;
                          }}
                          initialFocus
                          className="bg-slate-900 text-white"
                        />
                        {firstPaymentDate && (
                          <div className="p-3 border-t border-white/10">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setFirstPaymentDate(undefined);
                                setDatePickerOpen(false);
                              }}
                              className="w-full text-blue-100 hover:bg-white/10"
                            >
                              Clear Date
                            </Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-blue-100/70 mt-1">
                      {setupRecurring 
                        ? 'Choose when your first automatic payment should be charged'
                        : 'Leave blank to charge immediately, or select a future date (within next 30 days)'}
                    </p>
                  </div>
                )}

                <div className="bg-white/5 border border-white/10 rounded-lg p-3 backdrop-blur">
                  <div className="flex items-center gap-2 text-xs text-blue-100/70">
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
                className="border-white/20 bg-white/5 text-white hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-emerald-500 hover:bg-emerald-400 text-white"
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
