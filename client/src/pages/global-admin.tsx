import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Users, DollarSign, TrendingUp, Eye, Ban, CheckCircle, AlertTriangle, Plus, Mail, MessageSquare, Phone, Trash2, Search, Shield, CreditCard, Send, Settings, Repeat, FileText, MessagesSquare, Zap, LogOut, LogIn, QrCode, Download, Pencil } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import AdminAuth from "@/components/admin-auth";
import { TenantAgreementsPanel } from "@/components/global-admin/tenant-agreements-panel";
// Simple currency formatter
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export default function GlobalAdmin() {
  const { toast } = useToast();
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  
  // Form state for creating new agency
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newAgencyName, setNewAgencyName] = useState('');
  const [newAgencyEmail, setNewAgencyEmail] = useState('');
  
  // SMS configuration state
  const [smsConfigDialogOpen, setSmsConfigDialogOpen] = useState(false);
  const [selectedTenantForSms, setSelectedTenantForSms] = useState<any>(null);
  const [smsConfig, setSmsConfig] = useState({
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioPhoneNumber: '',
    twilioBusinessName: '',
    twilioCampaignId: ''
  });

  // Subscription approval state
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedSubscriptionRequest, setSelectedSubscriptionRequest] = useState<any>(null);
  const [setupFeeWaived, setSetupFeeWaived] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Service activation approval state
  const [serviceApproveDialogOpen, setServiceApproveDialogOpen] = useState(false);
  const [serviceRejectDialogOpen, setServiceRejectDialogOpen] = useState(false);
  const [selectedServiceRequest, setSelectedServiceRequest] = useState<any>(null);
  const [serviceRejectionReason, setServiceRejectionReason] = useState('');

  // Consumer management state
  const [consumerSearch, setConsumerSearch] = useState('');
  const [selectedTenantFilter, setSelectedTenantFilter] = useState('');
  const [deleteConsumerDialogOpen, setDeleteConsumerDialogOpen] = useState(false);
  const [selectedConsumerForDeletion, setSelectedConsumerForDeletion] = useState<any>(null);

  // Agency deletion state
  const [deleteAgencyDialogOpen, setDeleteAgencyDialogOpen] = useState(false);
  const [selectedAgencyForDeletion, setSelectedAgencyForDeletion] = useState<any>(null);

  // Contact info edit state
  const [editContactDialogOpen, setEditContactDialogOpen] = useState(false);
  const [selectedTenantForContactEdit, setSelectedTenantForContactEdit] = useState<any>(null);
  const [contactInfo, setContactInfo] = useState({ email: '', phoneNumber: '' });

  // Tenant name edit state
  const [editNameDialogOpen, setEditNameDialogOpen] = useState(false);
  const [selectedTenantForNameEdit, setSelectedTenantForNameEdit] = useState<any>(null);
  const [tenantNameInfo, setTenantNameInfo] = useState({ name: '', slug: '' });

  // Test email state
  const [testEmailDialogOpen, setTestEmailDialogOpen] = useState(false);
  const [selectedTenantForTestEmail, setSelectedTenantForTestEmail] = useState<any>(null);
  const [testEmailAddress, setTestEmailAddress] = useState('');

  // Payment method state
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
  const [selectedTenantForPayment, setSelectedTenantForPayment] = useState<any>(null);
  const [paymentInfo, setPaymentInfo] = useState({
    paymentMethodType: 'card',
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
    bankAccountNumber: '',
    bankRoutingNumber: ''
  });

  // Plan assignment state
  const [planAssignmentDialogOpen, setPlanAssignmentDialogOpen] = useState(false);
  const [selectedTenantForPlan, setSelectedTenantForPlan] = useState<any>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [waiveSetupFee, setWaiveSetupFee] = useState(false);
  
  // Service management state
  const [tenantIsTrialAccount, setTenantIsTrialAccount] = useState(false);
  const [tenantEnabledServices, setTenantEnabledServices] = useState<string[]>([]);

  // Business Services configuration state
  const [businessServicesDialogOpen, setBusinessServicesDialogOpen] = useState(false);
  const [selectedTenantForBusinessServices, setSelectedTenantForBusinessServices] = useState<any>(null);
  const [businessType, setBusinessType] = useState('call_center');
  const [enabledModules, setEnabledModules] = useState<string[]>([]);

  // Invoice management state
  const [markPaidDialogOpen, setMarkPaidDialogOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any>(null);
  const [paymentNotes, setPaymentNotes] = useState('');

  // Billing date editor state
  const [billingDateDialogOpen, setBillingDateDialogOpen] = useState(false);
  const [selectedTenantForBillingDate, setSelectedTenantForBillingDate] = useState<any>(null);
  const [billingPeriodStart, setBillingPeriodStart] = useState('');
  const [billingPeriodEnd, setBillingPeriodEnd] = useState('');

  // Tenant agreements state
  const [selectedTenantForAgreement, setSelectedTenantForAgreement] = useState('');
  const [selectedAgreementTemplate, setSelectedAgreementTemplate] = useState('');

  // Check for admin authentication on component mount
  useEffect(() => {
    const adminAuth = sessionStorage.getItem("admin_authenticated");
    if (adminAuth === "true") {
      setIsAdminAuthenticated(true);
    }
  }, []);

  // For the simple admin portal, if authenticated via sessionStorage, treat as platform admin
  // No need to check Replit auth or database roles
  const isPlatformAdmin = isAdminAuthenticated;

  // Fetch all tenants
  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ['/api/admin/tenants'],
    enabled: isPlatformAdmin
  });

  // Fetch platform stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/admin/stats'],
    enabled: isPlatformAdmin
  });

  // Fetch subscription requests
  const { data: subscriptionRequests, isLoading: subscriptionRequestsLoading } = useQuery({
    queryKey: ['/api/admin/subscription-requests'],
    enabled: isPlatformAdmin
  });

  // Fetch service activation requests
  const { data: serviceActivationRequestsData, isLoading: serviceActivationRequestsLoading } = useQuery({
    queryKey: ['/api/service-activation-requests'],
    enabled: isPlatformAdmin
  });
  const serviceActivationRequests = (serviceActivationRequestsData as any)?.requests || [];

  // Fetch all consumers
  const { data: allConsumers, isLoading: consumersLoading } = useQuery({
    queryKey: ['/api/admin/consumers', consumerSearch, selectedTenantFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (consumerSearch) params.append('search', consumerSearch);
      if (selectedTenantFilter) params.append('tenantId', selectedTenantFilter);
      const url = `/api/admin/consumers${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch consumers');
      return response.json();
    },
    enabled: isPlatformAdmin
  });

  // Fetch subscription plans
  const { data: subscriptionPlans, isLoading: plansLoading } = useQuery({
    queryKey: ['/api/admin/subscription-plans'],
    queryFn: async () => {
      const response = await fetch('/api/admin/subscription-plans', {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch subscription plans');
      return response.json();
    },
    enabled: isPlatformAdmin
  });

  // Mutation to update tenant status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ tenantId, isActive, suspensionReason }: { tenantId: string; isActive: boolean; suspensionReason?: string }) => {
      return apiRequest('PUT', `/api/admin/tenants/${tenantId}/status`, { isActive, suspensionReason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      toast({
        title: "Success",
        description: "Tenant status updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update tenant status",
        variant: "destructive",
      });
    }
  });

  // Mutation to upgrade tenant to paid
  const upgradeMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      return apiRequest('PUT', `/api/admin/tenants/${tenantId}/upgrade`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      toast({
        title: "Success",
        description: "Tenant upgraded to paid account",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to upgrade tenant",
        variant: "destructive",
      });
    }
  });
  
  // Mutation to update SMS configuration
  const updateSmsMutation = useMutation({
    mutationFn: async ({ tenantId, config }: { tenantId: string; config: any }) => {
      return apiRequest('PUT', `/api/admin/tenants/${tenantId}/sms-config`, config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      toast({
        title: "Success",
        description: "SMS configuration updated successfully"
      });
      setSmsConfigDialogOpen(false);
      setSmsConfig({
        twilioAccountSid: '',
        twilioAuthToken: '',
        twilioPhoneNumber: '',
        twilioBusinessName: '',
        twilioCampaignId: ''
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update SMS configuration",
        variant: "destructive"
      });
    }
  });

  // Mutation to create new agency
  const createAgencyMutation = useMutation({
    mutationFn: async ({ name, email }: { name: string; email: string }) => {
      return apiRequest('POST', '/api/admin/agencies', { name, email });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      setIsCreateDialogOpen(false);
      setNewAgencyName('');
      setNewAgencyEmail('');
      toast({
        title: "Agency Created Successfully",
        description: `${data.tenant.name} has been created with dedicated Postmark email server`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Agency",
        description: error.message || "An error occurred while creating the agency",
        variant: "destructive",
      });
    }
  });

  // Mutation to approve subscription request
  const approveSubscriptionMutation = useMutation({
    mutationFn: async ({ id, setupFeeWaived }: { id: string; setupFeeWaived: boolean }) => {
      return apiRequest('POST', `/api/admin/subscription-requests/${id}/approve`, { setupFeeWaived });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      setApproveDialogOpen(false);
      setSelectedSubscriptionRequest(null);
      setSetupFeeWaived(false);
      toast({
        title: "Subscription Approved",
        description: "The subscription plan has been activated for the agency",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve subscription request",
        variant: "destructive",
      });
    }
  });

  // Mutation to reject subscription request
  const rejectSubscriptionMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return apiRequest('POST', `/api/admin/subscription-requests/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      setRejectDialogOpen(false);
      setSelectedSubscriptionRequest(null);
      setRejectionReason('');
      toast({
        title: "Subscription Rejected",
        description: "The subscription request has been declined",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject subscription request",
        variant: "destructive",
      });
    }
  });

  // Mutation to approve service activation request
  const approveServiceRequestMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return apiRequest('POST', `/api/admin/service-activation-requests/${id}/review`, { action: 'approve' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/service-activation-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      setServiceApproveDialogOpen(false);
      setSelectedServiceRequest(null);
      toast({
        title: "Service Activated",
        description: "The service has been activated for the agency",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve service request",
        variant: "destructive",
      });
    }
  });

  // Mutation to reject service activation request
  const rejectServiceRequestMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return apiRequest('POST', `/api/admin/service-activation-requests/${id}/review`, { 
        action: 'reject',
        rejectionReason: reason 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/service-activation-requests'] });
      setServiceRejectDialogOpen(false);
      setSelectedServiceRequest(null);
      setServiceRejectionReason('');
      toast({
        title: "Service Request Rejected",
        description: "The service activation request has been declined",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject service request",
        variant: "destructive",
      });
    }
  });

  // Mutation to assign plan to tenant
  const assignPlanMutation = useMutation({
    mutationFn: async ({ tenantId, planId, setupFeeWaived }: { tenantId: string; planId: string; setupFeeWaived: boolean }) => {
      return apiRequest('POST', `/api/admin/tenants/${tenantId}/assign-plan`, { planId, setupFeeWaived });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/subscription-requests'] });
      setPlanAssignmentDialogOpen(false);
      setSelectedTenantForPlan(null);
      setSelectedPlanId('');
      setWaiveSetupFee(false);
      toast({
        title: "Plan Assigned",
        description: "Subscription plan has been successfully assigned to the agency",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to assign plan",
        variant: "destructive",
      });
    }
  });

  // Mutation to update tenant services directly
  const updateTenantServicesMutation = useMutation({
    mutationFn: async ({ tenantId, isTrialAccount, enabledServices }: { tenantId: string; isTrialAccount: boolean; enabledServices: string[] }) => {
      return apiRequest('POST', `/api/admin/tenants/${tenantId}/services`, { isTrialAccount, enabledServices });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      toast({
        title: "Services Updated",
        description: "Tenant services and trial status updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update tenant services",
        variant: "destructive",
      });
    }
  });

  // Mutation to delete consumer
  const deleteConsumerMutation = useMutation({
    mutationFn: async (consumerId: string) => {
      return apiRequest('DELETE', `/api/admin/consumers/${consumerId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/consumers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      setDeleteConsumerDialogOpen(false);
      setSelectedConsumerForDeletion(null);
      toast({
        title: "Consumer Deleted",
        description: "The consumer and associated accounts have been permanently deleted",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete consumer",
        variant: "destructive",
      });
    }
  });

  // Mutation to send test email
  const sendTestEmailMutation = useMutation({
    mutationFn: async ({ tenantId, toEmail }: { tenantId: string; toEmail: string }) => {
      return apiRequest('POST', '/api/admin/test-email', { tenantId, toEmail });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      setTestEmailDialogOpen(false);
      setSelectedTenantForTestEmail(null);
      setTestEmailAddress('');
      toast({
        title: "Test Email Sent",
        description: "The test email has been sent successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send test email",
        variant: "destructive",
      });
    }
  });

  // Mutation to delete agency
  const deleteAgencyMutation = useMutation({
    mutationFn: async (agencyId: string) => {
      return apiRequest('DELETE', `/api/admin/agencies/${agencyId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      setDeleteAgencyDialogOpen(false);
      setSelectedAgencyForDeletion(null);
      toast({
        title: "Agency Deleted",
        description: "The agency and all associated data have been permanently deleted",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete agency",
        variant: "destructive",
      });
    }
  });

  // Mutation to update service controls
  const updateServiceControlsMutation = useMutation({
    mutationFn: async ({ tenantId, controls }: { tenantId: string; controls: any }) => {
      return apiRequest('PUT', `/api/admin/tenants/${tenantId}/service-controls`, controls);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      toast({
        title: "Service Controls Updated",
        description: "Agency service settings have been updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update service controls",
        variant: "destructive",
      });
    }
  });

  // Mutation to update contact information
  const updateContactMutation = useMutation({
    mutationFn: async ({ tenantId, contactInfo }: { tenantId: string; contactInfo: any }) => {
      return apiRequest('PUT', `/api/admin/tenants/${tenantId}/contact`, contactInfo);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      setEditContactDialogOpen(false);
      setSelectedTenantForContactEdit(null);
      toast({
        title: "Contact Information Updated",
        description: "Agency contact details have been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update contact information",
        variant: "destructive",
      });
    }
  });

  // Mutation to update tenant name
  const updateTenantNameMutation = useMutation({
    mutationFn: async ({ tenantId, name, slug }: { tenantId: string; name: string; slug: string }) => {
      return apiRequest('PUT', `/api/admin/tenants/${tenantId}/name`, { name, slug });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      setEditNameDialogOpen(false);
      setSelectedTenantForNameEdit(null);
      toast({
        title: "Tenant Name Updated",
        description: "Agency name and slug have been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update tenant name",
        variant: "destructive",
      });
    }
  });

  // Mutation to update payment method
  const updatePaymentMethodMutation = useMutation({
    mutationFn: async ({ tenantId, paymentMethod }: { tenantId: string; paymentMethod: any }) => {
      return apiRequest('PUT', `/api/admin/tenants/${tenantId}/payment-method`, paymentMethod);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      setPaymentMethodDialogOpen(false);
      setSelectedTenantForPayment(null);
      toast({
        title: "Payment Method Updated",
        description: "Billing information has been saved securely",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update payment method",
        variant: "destructive",
      });
    }
  });

  // Mutation to update business configuration (business type and modules)
  const updateBusinessConfigMutation = useMutation({
    mutationFn: async ({ tenantId, businessType, enabledModules }: { tenantId: string; businessType: string; enabledModules: string[] }) => {
      return apiRequest('PUT', `/api/admin/tenants/${tenantId}/business-config`, { businessType, enabledModules });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      setBusinessServicesDialogOpen(false);
      setSelectedTenantForBusinessServices(null);
      toast({
        title: "Business Configuration Updated",
        description: "Business type and modules have been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update business configuration",
        variant: "destructive",
      });
    }
  });

  // Fetch all invoices
  const { data: allInvoices, isLoading: invoicesLoading, error: invoicesError } = useQuery({
    queryKey: ['/api/admin/invoices'],
    queryFn: async () => {
      const response = await fetch('/api/admin/invoices', {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch invoices');
      return response.json();
    },
    enabled: isPlatformAdmin
  });

  // Mutation to mark invoice as paid
  const markInvoicePaidMutation = useMutation({
    mutationFn: async ({ invoiceId, notes }: { invoiceId: string; notes?: string }) => {
      return apiRequest('PUT', `/api/admin/invoices/${invoiceId}/mark-paid`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      setMarkPaidDialogOpen(false);
      setSelectedInvoiceForPayment(null);
      setPaymentNotes('');
      toast({
        title: "Invoice Marked as Paid",
        description: "The invoice has been successfully marked as paid",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark invoice as paid",
        variant: "destructive",
      });
    }
  });

  // Mutation to update billing dates
  const updateBillingDatesMutation = useMutation({
    mutationFn: async ({ tenantId, periodStart, periodEnd }: { tenantId: string; periodStart: string; periodEnd: string }) => {
      console.log('🔍 Billing dates mutation - checking auth token:', sessionStorage.getItem('admin_token') ? 'Token exists' : 'NO TOKEN');
      const response = await apiRequest('PUT', `/api/admin/tenants/${tenantId}/billing-dates`, { periodStart, periodEnd });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
      setBillingDateDialogOpen(false);
      setSelectedTenantForBillingDate(null);
      setBillingPeriodStart('');
      setBillingPeriodEnd('');
      toast({
        title: "Billing Dates Updated",
        description: "Subscription billing period has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update billing dates",
        variant: "destructive",
      });
    }
  });

  const handleCreateAgency = () => {
    if (!newAgencyName.trim() || !newAgencyEmail.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both agency name and email",
        variant: "destructive",
      });
      return;
    }

    createAgencyMutation.mutate({
      name: newAgencyName.trim(),
      email: newAgencyEmail.trim(),
    });
  };
  
  const handleOpenSmsConfig = (tenant: any) => {
    setSelectedTenantForSms(tenant);
    setSmsConfig({
      twilioAccountSid: tenant.twilioAccountSid || '',
      twilioAuthToken: tenant.twilioAuthToken || '',
      twilioPhoneNumber: tenant.twilioPhoneNumber || '',
      twilioBusinessName: tenant.twilioBusinessName || '',
      twilioCampaignId: tenant.twilioCampaignId || ''
    });
    setSmsConfigDialogOpen(true);
  };
  
  const handleSaveSmsConfig = () => {
    if (!selectedTenantForSms) return;
    
    updateSmsMutation.mutate({
      tenantId: selectedTenantForSms.id,
      config: smsConfig
    });
  };

  const handleOpenEditContact = (tenant: any) => {
    setSelectedTenantForContactEdit(tenant);
    setContactInfo({
      email: tenant.email || '',
      phoneNumber: tenant.phoneNumber || ''
    });
    setEditContactDialogOpen(true);
  };

  const handleSaveContact = () => {
    if (!selectedTenantForContactEdit) return;
    
    updateContactMutation.mutate({
      tenantId: selectedTenantForContactEdit.id,
      contactInfo
    });
  };

  const handleOpenEditName = (tenant: any) => {
    setSelectedTenantForNameEdit(tenant);
    setTenantNameInfo({
      name: tenant.name || '',
      slug: tenant.slug || ''
    });
    setEditNameDialogOpen(true);
  };

  const handleSaveTenantName = () => {
    if (!selectedTenantForNameEdit) return;
    
    updateTenantNameMutation.mutate({
      tenantId: selectedTenantForNameEdit.id,
      name: tenantNameInfo.name,
      slug: tenantNameInfo.slug
    });
  };

  const handleOpenPaymentMethod = (tenant: any) => {
    setSelectedTenantForPayment(tenant);
    setPaymentInfo({
      paymentMethodType: tenant.paymentMethodType || 'card',
      cardNumber: '',
      cardExpiry: '',
      cardCvc: '',
      bankAccountNumber: '',
      bankRoutingNumber: ''
    });
    setPaymentMethodDialogOpen(true);
  };

  const handleSavePaymentMethod = () => {
    if (!selectedTenantForPayment) return;
    
    // IMPORTANT: This is a placeholder implementation
    // In production, you MUST integrate Stripe.js to tokenize card/bank info
    // NEVER send raw card numbers to your server
    
    toast({
      title: "Stripe Integration Required",
      description: "Please configure Stripe API keys to securely process payment methods. Raw payment data cannot be processed without PCI compliance.",
      variant: "destructive",
    });
    
    // Production implementation would:
    // 1. Use Stripe Elements to collect payment info
    // 2. Call stripe.createPaymentMethod() to tokenize
    // 3. Send only the Stripe payment method ID to backend
    // 4. Backend stores only: stripePaymentMethodId, last4, brand/type
  };

  const handleOpenBusinessServices = async (tenant: any) => {
    setSelectedTenantForBusinessServices(tenant);
    setBusinessType(tenant.businessType || 'call_center');
    
    // Fetch tenant settings to get enabled modules
    try {
      const response = await fetch(`/api/admin/tenants/${tenant.id}/settings`, {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('admin_token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch tenant settings');
      }
      
      const data = await response.json();
      setEnabledModules(data.enabledModules || []);
    } catch (error) {
      console.error('Error fetching tenant settings:', error);
      // Don't clear modules on error - keep current state
      toast({
        title: "Warning",
        description: "Could not load current module settings. Please try again.",
        variant: "destructive",
      });
      return; // Don't open dialog if fetch fails
    }
    
    setBusinessServicesDialogOpen(true);
  };

  const handleSaveBusinessConfig = () => {
    if (!selectedTenantForBusinessServices) return;
    
    updateBusinessConfigMutation.mutate({
      tenantId: selectedTenantForBusinessServices.id,
      businessType,
      enabledModules
    });
  };

  const handleOpenMarkPaid = (invoice: any) => {
    setSelectedInvoiceForPayment(invoice);
    setPaymentNotes('');
    setMarkPaidDialogOpen(true);
  };

  const handleMarkInvoicePaid = () => {
    if (!selectedInvoiceForPayment) return;
    
    if (paymentNotes.length > 500) {
      toast({
        title: "Notes Too Long",
        description: "Payment notes must be 500 characters or less",
        variant: "destructive",
      });
      return;
    }
    
    markInvoicePaidMutation.mutate({
      invoiceId: selectedInvoiceForPayment.id,
      notes: paymentNotes.trim() || undefined
    });
  };

  const handleOpenBillingDate = (tenant: any) => {
    setSelectedTenantForBillingDate(tenant);
    
    // Pre-fill with current billing period if available
    if (tenant.currentPeriodStart) {
      setBillingPeriodStart(new Date(tenant.currentPeriodStart).toISOString().split('T')[0]);
    }
    if (tenant.currentPeriodEnd) {
      setBillingPeriodEnd(new Date(tenant.currentPeriodEnd).toISOString().split('T')[0]);
    }
    
    setBillingDateDialogOpen(true);
  };

  const handleSaveBillingDates = () => {
    if (!selectedTenantForBillingDate) return;
    
    if (!billingPeriodStart) {
      toast({
        title: "Missing Date",
        description: "Billing period start date is required",
        variant: "destructive",
      });
      return;
    }
    
    const start = new Date(billingPeriodStart);
    // Auto-calculate end date as one month after start
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    
    updateBillingDatesMutation.mutate({
      tenantId: selectedTenantForBillingDate.id,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString()
    });
  };

  const handleToggleModule = (moduleId: string) => {
    const isCurrentlyEnabled = enabledModules.includes(moduleId);
    setEnabledModules(
      isCurrentlyEnabled
        ? enabledModules.filter((m: string) => m !== moduleId)
        : [...enabledModules, moduleId]
    );
  };

  // Show admin authentication form if not authenticated
  if (!isAdminAuthenticated) {
    return <AdminAuth onAuthenticated={() => setIsAdminAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-blue-50" data-testid="text-global-admin-title">Global Admin Dashboard</h1>
            <p className="text-blue-100/70 mt-2">Platform-wide overview and management</p>
          </div>
          
          <div className="flex gap-3">
            {/* Logout Button */}
            <Button 
              variant="outline" 
              onClick={() => {
                sessionStorage.removeItem('admin_authenticated');
                sessionStorage.removeItem('admin_token');
                setIsAdminAuthenticated(false);
              }}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
            
            {/* Create Agency Button */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700" data-testid="button-create-agency">
                <Plus className="h-4 w-4 mr-2" />
                Create Agency
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="flex items-center">
                  <Building2 className="h-5 w-5 mr-2" />
                  Create New Agency
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="agency-name">Agency Name</Label>
                  <Input
                    id="agency-name"
                    value={newAgencyName}
                    onChange={(e) => setNewAgencyName(e.target.value)}
                    placeholder="Enter agency name"
                    data-testid="input-agency-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="agency-email">Agency Email</Label>
                  <Input
                    id="agency-email"
                    type="email"
                    value={newAgencyEmail}
                    onChange={(e) => setNewAgencyEmail(e.target.value)}
                    placeholder="contact@agency.com"
                    data-testid="input-agency-email"
                  />
                  <p className="text-sm text-gray-500">This will be used for sending emails from the agency</p>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-start">
                    <Mail className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900">Postmark Integration</p>
                      <p className="text-blue-700 mt-1">
                        A dedicated Postmark server will be created for this agency with its own API token for isolated email delivery.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsCreateDialogOpen(false)}
                    data-testid="button-cancel-create"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateAgency}
                    disabled={createAgencyMutation.isPending}
                    data-testid="button-confirm-create"
                  >
                    {createAgencyMutation.isPending ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Agency
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Platform Stats */}
        {statsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-blue-900/20 backdrop-blur animate-pulse">
                <div className="h-3 w-24 rounded-full bg-white/10" />
                <div className="mt-6 h-8 w-28 rounded-full bg-white/10" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-blue-900/20 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-blue-100/80">Total Agencies</p>
                <Building2 className="h-4 w-4 text-blue-300/60" />
              </div>
              <div className="text-3xl font-bold text-blue-50" data-testid="text-total-agencies">{(stats as any)?.totalTenants || 0}</div>
              <p className="text-xs text-blue-100/60 mt-1">
                {(stats as any)?.activeTenants || 0} active
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-blue-900/20 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-blue-100/80">Trial vs Paid</p>
                <TrendingUp className="h-4 w-4 text-blue-300/60" />
              </div>
              <div className="text-3xl font-bold text-blue-50" data-testid="text-paid-agencies">{(stats as any)?.paidTenants || 0}</div>
              <p className="text-xs text-blue-100/60 mt-1">
                {(stats as any)?.trialTenants || 0} on trial
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-blue-900/20 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-blue-100/80">Total Consumers</p>
                <Users className="h-4 w-4 text-blue-300/60" />
              </div>
              <div className="text-3xl font-bold text-blue-50" data-testid="text-total-consumers">{(stats as any)?.totalConsumers || 0}</div>
              <p className="text-xs text-blue-100/60 mt-1">
                {(stats as any)?.totalAccounts || 0} accounts
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-blue-900/20 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-blue-100/80">Total Balance</p>
                <DollarSign className="h-4 w-4 text-blue-300/60" />
              </div>
              <div className="text-3xl font-bold text-blue-50" data-testid="text-total-balance">
                {formatCurrency(((stats as any)?.totalBalanceCents || 0) / 100)}
              </div>
              <p className="text-xs text-blue-100/60 mt-1">
                Platform-wide
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-blue-900/20 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-blue-100/80">Emails Sent</p>
                <Mail className="h-4 w-4 text-blue-300/60" />
              </div>
              <div className="text-3xl font-bold text-blue-50" data-testid="text-total-emails">
                {((stats as any)?.totalEmailsSent || 0).toLocaleString()}
              </div>
              <p className="text-xs text-blue-100/60 mt-1">
                Platform-wide
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-blue-900/20 backdrop-blur">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-blue-100/80">SMS Sent</p>
                <MessageSquare className="h-4 w-4 text-blue-300/60" />
              </div>
              <div className="text-3xl font-bold text-blue-50" data-testid="text-total-sms">
                {((stats as any)?.totalSmsSent || 0).toLocaleString()}
              </div>
              <p className="text-xs text-blue-100/60 mt-1">
                Platform-wide
              </p>
            </div>
          </div>
        )}

        {/* Marketing QR Code Section */}
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-blue-900/20 backdrop-blur">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <QrCode className="h-5 w-5 text-blue-300" />
              <h2 className="text-xl font-semibold text-blue-50">Marketing QR Code</h2>
            </div>
            <p className="text-sm text-blue-100/60 mt-1">Download QR code for business cards and marketing materials</p>
          </div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="bg-white p-4 rounded-2xl shadow-lg">
                <QRCodeSVG
                  id="marketing-qr-code"
                  value={`${window.location.origin}/info`}
                  size={180}
                  level="H"
                  includeMargin={false}
                />
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-blue-50">Chain Info Page</h3>
                  <p className="text-sm text-blue-100/70 mt-1">
                    This QR code links to the Chain information page showcasing all modules, 
                    AI automation features, and a registration button.
                  </p>
                  <p className="text-xs text-blue-100/50 mt-2 font-mono">
                    {window.location.origin}/info
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      const svg = document.getElementById('marketing-qr-code');
                      if (svg) {
                        const svgData = new XMLSerializer().serializeToString(svg);
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        const img = new Image();
                        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                        const svgUrl = URL.createObjectURL(svgBlob);
                        
                        img.onload = () => {
                          canvas.width = 400;
                          canvas.height = 400;
                          if (ctx) {
                            ctx.fillStyle = 'white';
                            ctx.fillRect(0, 0, 400, 400);
                            ctx.drawImage(img, 10, 10, 380, 380);
                          }
                          URL.revokeObjectURL(svgUrl);
                          canvas.toBlob((pngBlob) => {
                            if (pngBlob) {
                              const pngUrl = URL.createObjectURL(pngBlob);
                              const downloadLink = document.createElement('a');
                              downloadLink.href = pngUrl;
                              downloadLink.download = 'chain-qr-code.png';
                              document.body.appendChild(downloadLink);
                              downloadLink.click();
                              document.body.removeChild(downloadLink);
                              URL.revokeObjectURL(pngUrl);
                            }
                          }, 'image/png');
                        };
                        img.src = svgUrl;
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                    data-testid="button-download-qr-png"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download PNG
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => window.open('/info', '_blank')}
                    className="border-white/20 text-blue-100 hover:bg-white/10"
                    data-testid="button-preview-info-page"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview Page
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Subscription Requests */}
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-blue-900/20 backdrop-blur">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-blue-50">Subscription Requests</h2>
              {(subscriptionRequests as any[])?.length > 0 && (
                <Badge variant="secondary" data-testid="badge-requests-count">
                  {(subscriptionRequests as any[]).length} pending
                </Badge>
              )}
            </div>
          </div>
          <div className="p-6">
            {subscriptionRequestsLoading ? (
              <div className="space-y-4">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-20 bg-white/10 rounded"></div>
                  </div>
                ))}
              </div>
            ) : !subscriptionRequests || (subscriptionRequests as any[]).length === 0 ? (
              <div className="text-center py-8 text-blue-100/60">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 text-blue-300/40" />
                <p>No pending subscription requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(subscriptionRequests as any[]).map((request: any) => (
                  <div key={request.id} className="border border-white/10 rounded-lg p-4 bg-white/5" data-testid={`row-request-${request.id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm font-medium text-blue-50" data-testid={`text-tenant-${request.id}`}>
                            {request.tenantName}
                          </p>
                          <p className="text-xs text-blue-100/60">{request.tenantSlug}</p>
                        </div>
                        <div>
                          <p className="text-sm text-blue-100/70">Requested Plan</p>
                          <p className="text-sm font-medium text-blue-50" data-testid={`text-plan-${request.id}`}>
                            {request.planName}
                          </p>
                          <p className="text-xs text-blue-100/60">{formatCurrency(request.monthlyPrice)}/mo</p>
                        </div>
                        <div>
                          <p className="text-sm text-blue-100/70">Plan Limits</p>
                          <p className="text-xs text-blue-100/60">
                            {request.includedEmails?.toLocaleString()} emails
                          </p>
                          <p className="text-xs text-blue-100/60">
                            {request.includedSms?.toLocaleString()} SMS
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-blue-100/70">Requested By</p>
                          <p className="text-xs text-blue-100/60" data-testid={`text-requester-${request.id}`}>
                            {request.requestedBy}
                          </p>
                          <p className="text-xs text-blue-100/60">
                            {new Date(request.requestedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {/* Add-ons section */}
                      {request.enabledAddons && request.enabledAddons.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <p className="text-sm text-blue-100/70 mb-1">Selected Add-ons:</p>
                          <div className="flex flex-wrap gap-2">
                            {request.enabledAddons.includes('document_signing') && (
                              <Badge variant="outline" className="text-xs border-sky-400/50 text-sky-200">
                                Document Signing (+$40/mo)
                              </Badge>
                            )}
                            {request.enabledAddons.includes('ai_auto_response') && (
                              <Badge variant="outline" className="text-xs border-purple-400/50 text-purple-200">
                                AI Auto-Response (+$50/mo)
                              </Badge>
                            )}
                            {request.enabledAddons.includes('mobile_app_branding') && (
                              <Badge variant="outline" className="text-xs border-blue-400/50 text-blue-200">
                                Mobile App Branding (+$50/mo)
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => {
                            setSelectedSubscriptionRequest(request);
                            setApproveDialogOpen(true);
                          }}
                          data-testid={`button-approve-${request.id}`}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setSelectedSubscriptionRequest(request);
                            setRejectDialogOpen(true);
                          }}
                          data-testid={`button-reject-${request.id}`}
                        >
                          <Ban className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Approval Dialog */}
        <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Subscription Request</DialogTitle>
            </DialogHeader>
            {selectedSubscriptionRequest && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Agency</p>
                  <p className="font-medium">{selectedSubscriptionRequest.tenantName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Plan</p>
                  <p className="font-medium">{selectedSubscriptionRequest.planName} - {formatCurrency(selectedSubscriptionRequest.monthlyPrice)}/mo</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Setup Fee</p>
                  <p className="font-medium">{formatCurrency(selectedSubscriptionRequest.setupFee)}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="waive-setup-fee"
                    checked={setupFeeWaived}
                    onChange={(e) => setSetupFeeWaived(e.target.checked)}
                    className="h-4 w-4"
                    data-testid="checkbox-waive-setup-fee"
                  />
                  <Label htmlFor="waive-setup-fee">Waive setup fee</Label>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      approveSubscriptionMutation.mutate({
                        id: selectedSubscriptionRequest.id,
                        setupFeeWaived,
                      });
                    }}
                    disabled={approveSubscriptionMutation.isPending}
                    data-testid="button-confirm-approve"
                  >
                    {approveSubscriptionMutation.isPending ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Approving...
                      </>
                    ) : (
                      'Approve'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Rejection Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Subscription Request</DialogTitle>
            </DialogHeader>
            {selectedSubscriptionRequest && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Agency</p>
                  <p className="font-medium">{selectedSubscriptionRequest.tenantName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Requested Plan</p>
                  <p className="font-medium">{selectedSubscriptionRequest.planName}</p>
                </div>
                <div>
                  <Label htmlFor="rejection-reason">Reason for rejection</Label>
                  <textarea
                    id="rejection-reason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full mt-1 p-2 border rounded-md"
                    rows={3}
                    placeholder="Please provide a reason..."
                    data-testid="textarea-rejection-reason"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      rejectSubscriptionMutation.mutate({
                        id: selectedSubscriptionRequest.id,
                        reason: rejectionReason || 'No reason provided',
                      });
                    }}
                    disabled={rejectSubscriptionMutation.isPending || !rejectionReason.trim()}
                    data-testid="button-confirm-reject"
                  >
                    {rejectSubscriptionMutation.isPending ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Rejecting...
                      </>
                    ) : (
                      'Reject'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Service Activation Requests */}
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-blue-900/20 backdrop-blur">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-blue-50">Service Activation Requests</h2>
              {serviceActivationRequests.filter((r: any) => r.status === 'pending').length > 0 && (
                <Badge variant="secondary" data-testid="badge-service-requests-count">
                  {serviceActivationRequests.filter((r: any) => r.status === 'pending').length} pending
                </Badge>
              )}
            </div>
          </div>
          <div className="p-6">
            {serviceActivationRequestsLoading ? (
              <div className="space-y-4">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-20 bg-white/10 rounded"></div>
                  </div>
                ))}
              </div>
            ) : !serviceActivationRequests || serviceActivationRequests.filter((r: any) => r.status === 'pending').length === 0 ? (
              <div className="text-center py-8 text-blue-100/60">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 text-blue-300/40" />
                <p>No pending service activation requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {serviceActivationRequests.filter((r: any) => r.status === 'pending').map((request: any) => {
                  const serviceLabels: Record<string, string> = {
                    portal_processing: 'Portal + Processing',
                    email_service: 'Email Service',
                    sms_service: 'SMS Service',
                  };
                  
                  return (
                    <div key={request.id} className="border border-white/10 rounded-lg p-4 bg-white/5" data-testid={`row-service-request-${request.id}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-sm font-medium text-blue-50" data-testid={`text-service-tenant-${request.id}`}>
                              {request.tenantName}
                            </p>
                            <p className="text-xs text-blue-100/60">{request.tenantSlug}</p>
                          </div>
                          <div>
                            <p className="text-sm text-blue-100/70">Requested Service</p>
                            <p className="text-sm font-medium text-blue-50" data-testid={`text-service-type-${request.id}`}>
                              {serviceLabels[request.serviceType] || request.serviceType}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-blue-100/70">Requested By</p>
                            <p className="text-sm font-medium text-blue-50" data-testid={`text-service-requester-${request.id}`}>
                              {request.requestedBy || 'Unknown'}
                            </p>
                            <p className="text-xs text-blue-100/60">
                              {new Date(request.requestedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              setSelectedServiceRequest(request);
                              setServiceApproveDialogOpen(true);
                            }}
                            data-testid={`button-approve-service-${request.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setSelectedServiceRequest(request);
                              setServiceRejectDialogOpen(true);
                            }}
                            data-testid={`button-reject-service-${request.id}`}
                          >
                            <Ban className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Service Approval Dialog */}
        <Dialog open={serviceApproveDialogOpen} onOpenChange={setServiceApproveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Service Activation</DialogTitle>
            </DialogHeader>
            {selectedServiceRequest && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Agency</p>
                  <p className="font-medium">{selectedServiceRequest.tenantName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Service</p>
                  <p className="font-medium">
                    {selectedServiceRequest.serviceType === 'portal_processing' && 'Portal + Processing ($125/month)'}
                    {selectedServiceRequest.serviceType === 'email_service' && 'Email Service ($50/month)'}
                    {selectedServiceRequest.serviceType === 'sms_service' && 'SMS Service ($50/month)'}
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setServiceApproveDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      approveServiceRequestMutation.mutate({
                        id: selectedServiceRequest.id,
                      });
                    }}
                    disabled={approveServiceRequestMutation.isPending}
                    data-testid="button-confirm-approve-service"
                  >
                    {approveServiceRequestMutation.isPending ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Approving...
                      </>
                    ) : (
                      'Approve'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Service Rejection Dialog */}
        <Dialog open={serviceRejectDialogOpen} onOpenChange={setServiceRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Service Activation Request</DialogTitle>
            </DialogHeader>
            {selectedServiceRequest && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Agency</p>
                  <p className="font-medium">{selectedServiceRequest.tenantName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Requested Service</p>
                  <p className="font-medium">
                    {selectedServiceRequest.serviceType === 'portal_processing' && 'Portal + Processing'}
                    {selectedServiceRequest.serviceType === 'email_service' && 'Email Service'}
                    {selectedServiceRequest.serviceType === 'sms_service' && 'SMS Service'}
                  </p>
                </div>
                <div>
                  <Label htmlFor="service-rejection-reason">Reason for rejection</Label>
                  <textarea
                    id="service-rejection-reason"
                    value={serviceRejectionReason}
                    onChange={(e) => setServiceRejectionReason(e.target.value)}
                    className="w-full mt-1 p-2 border rounded-md"
                    rows={3}
                    placeholder="Please provide a reason..."
                    data-testid="textarea-service-rejection-reason"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setServiceRejectDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      rejectServiceRequestMutation.mutate({
                        id: selectedServiceRequest.id,
                        reason: serviceRejectionReason || 'No reason provided',
                      });
                    }}
                    disabled={rejectServiceRequestMutation.isPending || !serviceRejectionReason.trim()}
                    data-testid="button-confirm-reject-service"
                  >
                    {rejectServiceRequestMutation.isPending ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Rejecting...
                      </>
                    ) : (
                      'Reject'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Invoice Management */}
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-blue-900/20 backdrop-blur">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-semibold text-blue-50">Invoice Management</h2>
          </div>
          <div className="p-6">
            {invoicesLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-20 bg-white/10 rounded"></div>
                  </div>
                ))}
              </div>
            ) : invoicesError ? (
              <div className="text-center py-8 text-red-100/60">
                <AlertTriangle className="h-12 w-12 mx-auto mb-2 text-red-300/40" />
                <p>Failed to load invoices</p>
              </div>
            ) : !allInvoices || !Array.isArray(allInvoices) || allInvoices.length === 0 ? (
              <div className="text-center py-8 text-blue-100/60">
                <FileText className="h-12 w-12 mx-auto mb-2 text-blue-300/40" />
                <p>No invoices generated yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allInvoices.map((invoice: any) => (
                  <div key={invoice.id} className="border border-white/10 rounded-lg p-4 bg-white/[0.02]" data-testid={`invoice-row-${invoice.id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div>
                          <p className="text-sm text-blue-100/70">Invoice #</p>
                          <p className="text-sm font-medium text-blue-50" data-testid={`text-invoice-number-${invoice.id}`}>
                            {invoice.invoiceNumber}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-blue-100/70">Company</p>
                          <p className="text-sm font-medium text-blue-50" data-testid={`text-tenant-name-${invoice.id}`}>
                            {invoice.tenantName}
                          </p>
                          <p className="text-xs text-blue-100/60">{invoice.tenantSlug}</p>
                        </div>
                        <div>
                          <p className="text-sm text-blue-100/70">Amount</p>
                          <p className="text-sm font-medium text-blue-50" data-testid={`text-amount-${invoice.id}`}>
                            {formatCurrency(invoice.totalAmountCents / 100)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-blue-100/70">Billing Period</p>
                          <p className="text-xs text-blue-100/60">
                            {new Date(invoice.periodStart).toLocaleDateString()} - {new Date(invoice.periodEnd).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-blue-100/70">Status</p>
                          <Badge 
                            variant={invoice.status === 'paid' ? 'default' : invoice.status === 'overdue' ? 'destructive' : 'secondary'}
                            data-testid={`badge-status-${invoice.id}`}
                          >
                            {invoice.status}
                          </Badge>
                          {invoice.paidAt && (
                            <p className="text-xs text-blue-100/60 mt-1">
                              Paid {new Date(invoice.paidAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      {invoice.status !== 'paid' && (
                        <Button
                          size="sm"
                          onClick={() => handleOpenMarkPaid(invoice)}
                          data-testid={`button-mark-paid-${invoice.id}`}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Mark Paid
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mark Invoice as Paid Dialog */}
        <Dialog open={markPaidDialogOpen} onOpenChange={setMarkPaidDialogOpen}>
          <DialogContent data-testid="dialog-mark-paid">
            <DialogHeader>
              <DialogTitle>Mark Invoice as Paid</DialogTitle>
            </DialogHeader>
            {selectedInvoiceForPayment && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Invoice: <strong>{selectedInvoiceForPayment.invoiceNumber}</strong>
                  </p>
                  <p className="text-sm text-muted-foreground mb-2">
                    Company: <strong>{selectedInvoiceForPayment.tenantName}</strong>
                  </p>
                  <p className="text-sm text-muted-foreground mb-2">
                    Amount: <strong>{formatCurrency(selectedInvoiceForPayment.totalAmountCents / 100)}</strong>
                  </p>
                </div>
                <div>
                  <Label htmlFor="payment-notes">Payment Notes (Optional)</Label>
                  <textarea
                    id="payment-notes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Add any notes about this payment (max 500 characters)"
                    maxLength={500}
                    className="w-full min-h-[100px] p-2 border rounded-md"
                    data-testid="textarea-payment-notes"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {paymentNotes.length}/500 characters
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setMarkPaidDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleMarkInvoicePaid}
                    disabled={markInvoicePaidMutation.isPending}
                    data-testid="button-confirm-mark-paid"
                  >
                    {markInvoicePaidMutation.isPending ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Marking as Paid...
                      </>
                    ) : (
                      'Mark as Paid'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Billing Date Editor Dialog */}
        <Dialog open={billingDateDialogOpen} onOpenChange={setBillingDateDialogOpen}>
          <DialogContent data-testid="dialog-billing-dates">
            <DialogHeader>
              <DialogTitle>Update Billing Start Date</DialogTitle>
            </DialogHeader>
            {selectedTenantForBillingDate && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Update subscription billing start for <strong>{selectedTenantForBillingDate.name}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Next invoice date will automatically be set to one month after the start date.
                  </p>
                </div>
                <div>
                  <Label htmlFor="period-start">Billing Period Start</Label>
                  <Input
                    id="period-start"
                    type="date"
                    value={billingPeriodStart}
                    onChange={(e) => setBillingPeriodStart(e.target.value)}
                    data-testid="input-period-start"
                  />
                </div>
                {billingPeriodStart && (
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-sm text-muted-foreground">Next invoice date:</p>
                    <p className="text-sm font-medium">
                      {new Date(new Date(billingPeriodStart).setMonth(new Date(billingPeriodStart).getMonth() + 1)).toLocaleDateString()}
                    </p>
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setBillingDateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveBillingDates}
                    disabled={updateBillingDatesMutation.isPending || !billingPeriodStart}
                    data-testid="button-save-billing-dates"
                  >
                    {updateBillingDatesMutation.isPending ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Saving...
                      </>
                    ) : (
                      'Save Billing Dates'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Global Consumer Management */}
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-blue-900/20 backdrop-blur">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-blue-50">Global Consumer Management</h2>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search consumers..."
                    value={consumerSearch}
                    onChange={(e) => setConsumerSearch(e.target.value)}
                    className="pl-10 w-64"
                    data-testid="input-consumer-search"
                  />
                </div>
                <select
                  value={selectedTenantFilter}
                  onChange={(e) => setSelectedTenantFilter(e.target.value)}
                  className="border rounded-md px-3 py-2 text-sm"
                  data-testid="select-tenant-filter"
                >
                  <option value="">All Agencies</option>
                  {(tenants as any[])?.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="p-6">
            {consumersLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-12 bg-white/10 rounded"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {(allConsumers as any[])?.length > 0 ? (
                  <div className="max-h-96 overflow-y-auto">
                    {(allConsumers as any[]).map((item: any) => (
                      <div
                        key={item.consumer.id}
                        className="flex items-center justify-between p-3 border border-white/10 rounded-lg hover:bg-white/5 bg-white/[0.02]"
                        data-testid={`consumer-row-${item.consumer.id}`}
                      >
                        <div className="flex-1">
                          <div className="font-medium text-blue-50" data-testid={`text-consumer-name-${item.consumer.id}`}>
                            {item.consumer.firstName} {item.consumer.lastName}
                          </div>
                          <div className="text-sm text-blue-100/70">
                            <span data-testid={`text-consumer-email-${item.consumer.id}`}>{item.consumer.email}</span>
                            {item.consumer.phone && (
                              <> • <span data-testid={`text-consumer-phone-${item.consumer.id}`}>{item.consumer.phone}</span></>
                            )}
                          </div>
                          <div className="text-xs text-blue-100/60 mt-1">
                            Agency: <span data-testid={`text-consumer-agency-${item.consumer.id}`}>{item.tenant?.name || 'Unknown'}</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => {
                            setSelectedConsumerForDeletion(item);
                            setDeleteConsumerDialogOpen(true);
                          }}
                          data-testid={`button-delete-consumer-${item.consumer.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-blue-300/40 mx-auto mb-4" />
                    <p className="text-blue-100/60">
                      {consumerSearch || selectedTenantFilter
                        ? 'No consumers found matching your filters'
                        : 'No consumers in the system'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Delete Consumer Confirmation Dialog */}
        <Dialog open={deleteConsumerDialogOpen} onOpenChange={setDeleteConsumerDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center text-red-600">
                <AlertTriangle className="h-5 w-5 mr-2" />
                Delete Consumer
              </DialogTitle>
            </DialogHeader>
            {selectedConsumerForDeletion && (
              <div className="space-y-4">
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-sm text-red-800">
                    This action cannot be undone. This will permanently delete the consumer and all associated accounts.
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 font-medium">Consumer Details:</p>
                  <p className="font-medium mt-1">
                    {selectedConsumerForDeletion.consumer.firstName} {selectedConsumerForDeletion.consumer.lastName}
                  </p>
                  <p className="text-sm text-gray-600">{selectedConsumerForDeletion.consumer.email}</p>
                  <p className="text-sm text-gray-600">Agency: {selectedConsumerForDeletion.tenant?.name}</p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDeleteConsumerDialogOpen(false);
                      setSelectedConsumerForDeletion(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      deleteConsumerMutation.mutate(selectedConsumerForDeletion.consumer.id);
                    }}
                    disabled={deleteConsumerMutation.isPending}
                    data-testid="button-confirm-delete-consumer"
                  >
                    {deleteConsumerMutation.isPending ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Consumer
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Tenants Table */}
        <div className="rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-blue-900/20 backdrop-blur">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-semibold text-blue-50">Agency Management</h2>
          </div>
          <div className="p-6">
            {tenantsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-16 bg-white/10 rounded"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {(tenants as any[])?.map((tenant: any) => (
                  <div key={tenant.id} className="border border-white/10 rounded-lg p-4 bg-white/[0.02]" data-testid={`card-tenant-${tenant.id}`}>
                    {/* Header Section */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h3 className="text-lg font-semibold text-blue-50" data-testid={`text-tenant-name-${tenant.id}`}>{tenant.name}</h3>
                          {tenant.isTrialAccount && (
                            <Badge variant="secondary" data-testid={`badge-trial-${tenant.id}`}>Trial</Badge>
                          )}
                          {tenant.isPaidAccount && (
                            <Badge variant="default" data-testid={`badge-paid-${tenant.id}`}>Paid</Badge>
                          )}
                          {!tenant.isActive && (
                            <Badge variant="destructive" data-testid={`badge-suspended-${tenant.id}`}>Suspended</Badge>
                          )}
                        </div>
                        <div className="text-sm text-blue-100/70 mt-1">
                          <span data-testid={`text-email-${tenant.id}`}>{tenant.email}</span> • <span data-testid={`text-slug-${tenant.id}`}>{tenant.slug}</span>
                        </div>
                        <div className="text-sm text-blue-100/60 mt-1">
                          {tenant.stats?.consumerCount || 0} consumers • {tenant.stats?.accountCount || 0} accounts
                        </div>
                        <div className="text-sm text-blue-100/60 mt-1">
                          {formatCurrency((tenant.stats?.totalBalanceCents || 0) / 100)} balance • {tenant.stats?.emailCount || 0} emails • {tenant.stats?.smsCount || 0} SMS
                        </div>
                        {tenant.suspensionReason && (
                          <div className="text-sm text-red-400 mt-2">
                            Suspended: {tenant.suspensionReason}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Service Controls Section */}
                    <div className="flex items-center justify-between pt-3 border-t border-white/10">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-blue-100/60 mr-2">Services:</span>
                        <button
                          onClick={() => updateServiceControlsMutation.mutate({
                            tenantId: tenant.id,
                            controls: { emailServiceEnabled: !tenant.emailServiceEnabled }
                          })}
                          className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors border ${
                            tenant.emailServiceEnabled !== false
                              ? 'bg-green-100 text-green-800 hover:bg-green-200 border-green-300'
                              : 'bg-red-50 text-red-700 hover:bg-red-100 border-red-300'
                          }`}
                          data-testid={`toggle-email-${tenant.id}`}
                        >
                          <Mail className="h-3 w-3" />
                          <span>Email</span>
                        </button>
                        
                        <button
                          onClick={() => updateServiceControlsMutation.mutate({
                            tenantId: tenant.id,
                            controls: { smsServiceEnabled: !tenant.smsServiceEnabled }
                          })}
                          className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors border ${
                            tenant.smsServiceEnabled !== false
                              ? 'bg-green-100 text-green-800 hover:bg-green-200 border-green-300'
                              : 'bg-red-50 text-red-700 hover:bg-red-100 border-red-300'
                          }`}
                          data-testid={`toggle-sms-${tenant.id}`}
                        >
                          <MessageSquare className="h-3 w-3" />
                          <span>SMS</span>
                        </button>
                        
                        <button
                          onClick={() => updateServiceControlsMutation.mutate({
                            tenantId: tenant.id,
                            controls: { portalAccessEnabled: !tenant.portalAccessEnabled }
                          })}
                          className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors border ${
                            tenant.portalAccessEnabled !== false
                              ? 'bg-green-100 text-green-800 hover:bg-green-200 border-green-300'
                              : 'bg-red-50 text-red-700 hover:bg-red-100 border-red-300'
                          }`}
                          data-testid={`toggle-portal-${tenant.id}`}
                        >
                          <Shield className="h-3 w-3" />
                          <span>Portal</span>
                        </button>
                        
                        <button
                          onClick={() => updateServiceControlsMutation.mutate({
                            tenantId: tenant.id,
                            controls: { paymentProcessingEnabled: !tenant.paymentProcessingEnabled }
                          })}
                          className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors border ${
                            tenant.paymentProcessingEnabled !== false
                              ? 'bg-green-100 text-green-800 hover:bg-green-200 border-green-300'
                              : 'bg-red-50 text-red-700 hover:bg-red-100 border-red-300'
                          }`}
                          data-testid={`toggle-payment-${tenant.id}`}
                        >
                          <CreditCard className="h-3 w-3" />
                          <span>Payments</span>
                        </button>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex items-center flex-wrap gap-2">
                        {tenant.isActive ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ 
                              tenantId: tenant.id, 
                              isActive: false, 
                              suspensionReason: "Suspended by admin" 
                            })}
                            disabled={updateStatusMutation.isPending}
                            data-testid={`button-suspend-${tenant.id}`}
                          >
                            <Ban className="h-4 w-4 mr-2" />
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ tenantId: tenant.id, isActive: true })}
                            disabled={updateStatusMutation.isPending}
                            data-testid={`button-activate-${tenant.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Activate
                          </Button>
                        )}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-blue-300 text-blue-700 hover:bg-blue-50"
                          onClick={() => handleOpenSmsConfig(tenant)}
                          data-testid={`button-sms-config-${tenant.id}`}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          SMS
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => handleOpenEditContact(tenant)}
                          data-testid={`button-edit-contact-${tenant.id}`}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Contact
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="border-purple-300 text-purple-700 hover:bg-purple-50"
                          onClick={() => handleOpenEditName(tenant)}
                          data-testid={`button-edit-name-${tenant.id}`}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="border-cyan-300 text-cyan-700 hover:bg-cyan-50"
                          onClick={() => {
                            setSelectedTenantForTestEmail(tenant);
                            setTestEmailAddress(tenant.email);
                            setTestEmailDialogOpen(true);
                          }}
                          data-testid={`button-test-email-${tenant.id}`}
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Test
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                          onClick={() => handleOpenPaymentMethod(tenant)}
                          data-testid={`button-billing-${tenant.id}`}
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          Billing
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                          onClick={() => {
                            setSelectedTenantForPlan(tenant);
                            setSelectedPlanId('');
                            setWaiveSetupFee(false);
                            // Initialize service management state
                            setTenantIsTrialAccount(tenant.isTrialAccount ?? false);
                            setTenantEnabledServices(tenant.enabledAddons || []);
                            setPlanAssignmentDialogOpen(true);
                          }}
                          data-testid={`button-manage-plan-${tenant.id}`}
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          Manage Plan
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="border-pink-300 text-pink-700 hover:bg-pink-50"
                          onClick={() => handleOpenBillingDate(tenant)}
                          data-testid={`button-billing-dates-${tenant.id}`}
                        >
                          <Repeat className="h-4 w-4 mr-2" />
                          Billing Dates
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-orange-300 text-orange-700 hover:bg-orange-50"
                          onClick={async () => {
                            const token = sessionStorage.getItem('admin_token');
                            if (!token) {
                              toast({
                                title: "Error",
                                description: "Not authenticated. Please refresh and log in again.",
                                variant: "destructive",
                              });
                              return;
                            }

                            try {
                              const response = await fetch(`/api/admin/impersonate-tenant/${tenant.id}`, {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${token}`,
                                  'Content-Type': 'application/json'
                                }
                              });
                              
                              const data = await response.json();
                              
                              if (!response.ok) {
                                toast({
                                  title: "Error",
                                  description: data.message || `Failed to login as tenant`,
                                  variant: "destructive",
                                });
                                return;
                              }
                              
                              toast({
                                title: "Success",
                                description: `Opening ${data.tenant.name} dashboard...`,
                              });
                              
                              // Open dashboard in new tab with token in URL
                              // The tenant app will read the token from the URL and store it
                              const dashboardUrl = `https://${data.tenant.slug}.chainsoftwaregroup.com/dashboard?impersonate_token=${encodeURIComponent(data.token)}`;
                              window.open(dashboardUrl, '_blank');
                            } catch (error: any) {
                              toast({
                                title: "Error",
                                description: error.message || "Network error. Check your connection.",
                                variant: "destructive",
                              });
                            }
                          }}
                          data-testid={`button-login-as-${tenant.id}`}
                        >
                          <LogIn className="h-4 w-4 mr-2" />
                          Login as Tenant
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-purple-300 text-purple-700 hover:bg-purple-50"
                          onClick={() => handleOpenBusinessServices(tenant)}
                          data-testid={`button-business-services-${tenant.id}`}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Business Services
                        </Button>

                        {tenant.isPaidAccount && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-green-300 text-green-700 hover:bg-green-50"
                            onClick={async () => {
                              const token = sessionStorage.getItem('admin_token');
                              if (!token) {
                                toast({
                                  title: "Error",
                                  description: "Not authenticated. Please refresh and log in again.",
                                  variant: "destructive",
                                });
                                return;
                              }

                              try {
                                const response = await fetch(`/api/admin/tenants/${tenant.id}/fix-services`, {
                                  method: 'POST',
                                  headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                  }
                                });
                                
                                const data = await response.json();
                                
                                if (!response.ok) {
                                  toast({
                                    title: "Error",
                                    description: data.message || `Server error: ${response.status}`,
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                
                                toast({
                                  title: "Success",
                                  description: data.message,
                                });
                                
                                queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants'] });
                              } catch (error: any) {
                                toast({
                                  title: "Error",
                                  description: error.message || "Network error. Check your connection.",
                                  variant: "destructive",
                                });
                              }
                            }}
                            data-testid={`button-fix-services-${tenant.id}`}
                          >
                            <Zap className="h-4 w-4 mr-2" />
                            Fix Services
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          className="border-gray-300 text-gray-700 hover:bg-gray-50"
                          onClick={() => window.open(`/agency/${tenant.slug}`, '_blank')}
                          data-testid={`button-view-${tenant.id}`}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setSelectedAgencyForDeletion(tenant);
                            setDeleteAgencyDialogOpen(true);
                          }}
                          data-testid={`button-delete-${tenant.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                
                {(!(tenants as any[]) || (tenants as any[]).length === 0) && (
                  <div className="text-center py-8">
                    <Building2 className="h-12 w-12 text-blue-300/40 mx-auto mb-4" />
                    <p className="text-blue-100/60">No agencies registered yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tenant Agreements Panel */}
      <TenantAgreementsPanel
        tenants={tenants as any[]}
        isLoadingTenants={tenantsLoading}
        toast={toast}
        isPlatformAdmin={isPlatformAdmin}
      />

      {/* Delete Agency Confirmation Dialog */}
      <Dialog open={deleteAgencyDialogOpen} onOpenChange={setDeleteAgencyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Delete Agency
            </DialogTitle>
          </DialogHeader>
          {selectedAgencyForDeletion && (
            <div className="space-y-4">
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-red-800 font-medium">
                  ⚠️ WARNING: This action cannot be undone!
                </p>
                <p className="text-sm text-red-800 mt-2">
                  This will permanently delete the agency and ALL associated data including:
                </p>
                <ul className="text-sm text-red-800 mt-2 list-disc list-inside">
                  <li>All consumers and their accounts</li>
                  <li>All payment records</li>
                  <li>All communication history</li>
                  <li>All settings and configurations</li>
                </ul>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Agency Details:</p>
                <p className="font-medium mt-1">{selectedAgencyForDeletion.name}</p>
                <p className="text-sm text-gray-600">{selectedAgencyForDeletion.email}</p>
                <p className="text-sm text-gray-600">Slug: {selectedAgencyForDeletion.slug}</p>
                <p className="text-sm text-gray-600 mt-2">
                  {selectedAgencyForDeletion.stats?.consumerCount || 0} consumers • {selectedAgencyForDeletion.stats?.accountCount || 0} accounts
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteAgencyDialogOpen(false);
                    setSelectedAgencyForDeletion(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteAgencyMutation.mutate(selectedAgencyForDeletion.id);
                  }}
                  disabled={deleteAgencyMutation.isPending}
                  data-testid="button-confirm-delete-agency"
                >
                  {deleteAgencyMutation.isPending ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Agency
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* SMS Configuration Dialog */}
      <Dialog open={smsConfigDialogOpen} onOpenChange={setSmsConfigDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Phone className="h-5 w-5 mr-2" />
              SMS Configuration for {selectedTenantForSms?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-start">
                <MessageSquare className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900">Twilio Subaccount Setup</p>
                  <p className="text-blue-700 mt-1">
                    Configure the Twilio subaccount credentials for this agency. Each agency uses their own subaccount for SMS compliance.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="twilio-account-sid">Twilio Account SID</Label>
              <Input
                id="twilio-account-sid"
                value={smsConfig.twilioAccountSid}
                onChange={(e) => setSmsConfig({ ...smsConfig, twilioAccountSid: e.target.value })}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                data-testid="input-twilio-account-sid"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="twilio-auth-token">Twilio Auth Token</Label>
              <Input
                id="twilio-auth-token"
                type="password"
                value={smsConfig.twilioAuthToken}
                onChange={(e) => setSmsConfig({ ...smsConfig, twilioAuthToken: e.target.value })}
                placeholder="Enter auth token"
                data-testid="input-twilio-auth-token"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="twilio-phone-number">Twilio Phone Number</Label>
              <Input
                id="twilio-phone-number"
                value={smsConfig.twilioPhoneNumber}
                onChange={(e) => setSmsConfig({ ...smsConfig, twilioPhoneNumber: e.target.value })}
                placeholder="+1234567890"
                data-testid="input-twilio-phone-number"
              />
              <p className="text-sm text-gray-500">Include country code (e.g., +1 for US)</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="twilio-business-name">Business Name (for A2P 10DLC)</Label>
              <Input
                id="twilio-business-name"
                value={smsConfig.twilioBusinessName}
                onChange={(e) => setSmsConfig({ ...smsConfig, twilioBusinessName: e.target.value })}
                placeholder="Agency business name"
                data-testid="input-twilio-business-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="twilio-campaign-id">Campaign ID (Optional)</Label>
              <Input
                id="twilio-campaign-id"
                value={smsConfig.twilioCampaignId}
                onChange={(e) => setSmsConfig({ ...smsConfig, twilioCampaignId: e.target.value })}
                placeholder="CMPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                data-testid="input-twilio-campaign-id"
              />
              <p className="text-sm text-gray-500">A2P 10DLC Campaign ID if registered</p>
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button 
                variant="outline" 
                onClick={() => setSmsConfigDialogOpen(false)}
                data-testid="button-cancel-sms-config"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSaveSmsConfig}
                disabled={updateSmsMutation.isPending}
                data-testid="button-save-sms-config"
              >
                {updateSmsMutation.isPending ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Phone className="h-4 w-4 mr-2" />
                    Save Configuration
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Information Dialog */}
      <Dialog open={editContactDialogOpen} onOpenChange={setEditContactDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Mail className="h-5 w-5 mr-2" />
              Edit Contact Information
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email Address</Label>
              <Input
                id="edit-email"
                type="email"
                value={contactInfo.email}
                onChange={(e) => setContactInfo({ ...contactInfo, email: e.target.value })}
                placeholder="agency@example.com"
                data-testid="input-edit-email"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone Number</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={contactInfo.phoneNumber}
                onChange={(e) => setContactInfo({ ...contactInfo, phoneNumber: e.target.value })}
                placeholder="+1 (555) 123-4567"
                data-testid="input-edit-phone"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setEditContactDialogOpen(false);
                  setSelectedTenantForContactEdit(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveContact}
                disabled={updateContactMutation.isPending}
                data-testid="button-save-contact"
              >
                {updateContactMutation.isPending ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Tenant Name Dialog */}
      <Dialog open={editNameDialogOpen} onOpenChange={setEditNameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Pencil className="h-5 w-5 mr-2" />
              Edit Agency Name
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-tenant-name">Agency Name</Label>
              <Input
                id="edit-tenant-name"
                type="text"
                value={tenantNameInfo.name}
                onChange={(e) => setTenantNameInfo({ ...tenantNameInfo, name: e.target.value })}
                placeholder="Agency Name"
                data-testid="input-edit-tenant-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-tenant-slug">URL Slug</Label>
              <Input
                id="edit-tenant-slug"
                type="text"
                value={tenantNameInfo.slug}
                onChange={(e) => setTenantNameInfo({ ...tenantNameInfo, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                placeholder="agency-slug"
                data-testid="input-edit-tenant-slug"
              />
              <p className="text-xs text-gray-500">
                This appears in the URL: <strong>{tenantNameInfo.slug || 'agency-slug'}.chainsoftwaregroup.com</strong>
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setEditNameDialogOpen(false);
                  setSelectedTenantForNameEdit(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveTenantName}
                disabled={updateTenantNameMutation.isPending || !tenantNameInfo.name.trim() || !tenantNameInfo.slug.trim()}
                data-testid="button-save-tenant-name"
              >
                {updateTenantNameMutation.isPending ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Pencil className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Method Dialog */}
      <Dialog open={paymentMethodDialogOpen} onOpenChange={setPaymentMethodDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <CreditCard className="h-5 w-5 mr-2" />
              Add Payment Method
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-red-900">Stripe Integration Required</p>
                  <p className="text-red-700 mt-1">
                    To securely process payment methods, you must configure Stripe API keys. Raw card or bank account details cannot be processed without PCI compliance.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm">
                <p className="font-medium text-blue-900 mb-2">Required for Production:</p>
                <ul className="text-blue-700 list-disc list-inside space-y-1">
                  <li>Install and configure Stripe.js / Stripe Elements</li>
                  <li>Tokenize payment data on the client side</li>
                  <li>Send only Stripe payment method IDs to backend</li>
                  <li>Store only: Stripe customer ID, payment method ID, and last 4 digits</li>
                </ul>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-700">
                Current payment method: {selectedTenantForPayment?.cardLast4 ? (
                  <span className="font-medium">Card ending in {selectedTenantForPayment.cardLast4}</span>
                ) : selectedTenantForPayment?.bankAccountLast4 ? (
                  <span className="font-medium">Bank account ending in {selectedTenantForPayment.bankAccountLast4}</span>
                ) : (
                  <span className="text-gray-500">No payment method on file</span>
                )}
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setPaymentMethodDialogOpen(false);
                  setSelectedTenantForPayment(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Email Dialog */}
      <Dialog open={testEmailDialogOpen} onOpenChange={setTestEmailDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Send className="h-5 w-5 mr-2" />
              Send Test Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                Send a test email to verify email tracking for <strong>{selectedTenantForTestEmail?.name}</strong>
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="test-email-address">Email Address</Label>
              <Input
                id="test-email-address"
                type="email"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                placeholder="recipient@example.com"
                data-testid="input-test-email"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setTestEmailDialogOpen(false);
                  setSelectedTenantForTestEmail(null);
                  setTestEmailAddress('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedTenantForTestEmail && testEmailAddress) {
                    sendTestEmailMutation.mutate({
                      tenantId: selectedTenantForTestEmail.id,
                      toEmail: testEmailAddress
                    });
                  }
                }}
                disabled={!testEmailAddress || sendTestEmailMutation.isPending}
                data-testid="button-send-test-email"
              >
                {sendTestEmailMutation.isPending ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Test Email
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan Assignment Dialog */}
      <Dialog open={planAssignmentDialogOpen} onOpenChange={setPlanAssignmentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <CreditCard className="h-5 w-5 mr-2" />
              Manage Subscription Plan
            </DialogTitle>
          </DialogHeader>
          {selectedTenantForPlan && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  Assign a subscription plan to <strong>{selectedTenantForPlan.name}</strong>
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  This will mark the agency as a paid account and deactivate trial mode.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="plan-select">Select Plan</Label>
                {plansLoading ? (
                  <div className="h-10 bg-gray-100 animate-pulse rounded"></div>
                ) : (
                  <select
                    id="plan-select"
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    className="w-full p-2 border rounded-md"
                    data-testid="select-plan"
                  >
                    <option value="">Choose a plan...</option>
                    {(subscriptionPlans as any[])?.map((plan: any) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} - ${(plan.monthlyPriceCents / 100).toFixed(2)}/month
                        {plan.setupFeeCents > 0 && ` (Setup: $${(plan.setupFeeCents / 100).toFixed(2)})`}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="waive-setup-fee"
                  checked={waiveSetupFee}
                  onChange={(e) => setWaiveSetupFee(e.target.checked)}
                  className="w-4 h-4"
                  data-testid="checkbox-waive-setup-fee"
                />
                <Label htmlFor="waive-setup-fee" className="cursor-pointer">
                  Waive setup fee
                </Label>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-700">
                  <strong>Current Status:</strong>
                </p>
                <div className="flex gap-2 mt-2">
                  {selectedTenantForPlan.isTrialAccount && (
                    <Badge variant="secondary">Trial Account</Badge>
                  )}
                  {selectedTenantForPlan.isPaidAccount && (
                    <Badge variant="default">Paid Account</Badge>
                  )}
                </div>
              </div>

              {selectedTenantForPlan.enabledAddons && selectedTenantForPlan.enabledAddons.length > 0 && (
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                  <p className="text-sm text-emerald-800 font-semibold mb-2">
                    Active À la carte Services:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedTenantForPlan.enabledAddons.map((service: string) => (
                      <Badge key={service} variant="default" className="bg-emerald-600">
                        {service === 'portal_processing' ? 'Portal + Processing' :
                         service === 'email_service' ? 'Email Service' :
                         service === 'sms_service' ? 'SMS Service' : service}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-emerald-600 mt-2">
                    Assigning a subscription plan will complement these active services.
                  </p>
                </div>
              )}

              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">Direct Service Management</p>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Trial Mode</p>
                      <p className="text-xs text-gray-500">Account is in trial status</p>
                    </div>
                    <Switch
                      checked={tenantIsTrialAccount}
                      onCheckedChange={setTenantIsTrialAccount}
                      data-testid="switch-trial-mode"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Portal + Processing</p>
                      <p className="text-xs text-gray-500">Consumer portal and payment processing</p>
                    </div>
                    <Switch
                      checked={tenantEnabledServices.includes('portal_processing')}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setTenantEnabledServices([...tenantEnabledServices, 'portal_processing']);
                        } else {
                          setTenantEnabledServices(tenantEnabledServices.filter(s => s !== 'portal_processing'));
                        }
                      }}
                      data-testid="switch-portal-processing"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Email Service</p>
                      <p className="text-xs text-gray-500">Email templates and campaigns</p>
                    </div>
                    <Switch
                      checked={tenantEnabledServices.includes('email_service')}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setTenantEnabledServices([...tenantEnabledServices, 'email_service']);
                        } else {
                          setTenantEnabledServices(tenantEnabledServices.filter(s => s !== 'email_service'));
                        }
                      }}
                      data-testid="switch-email-service"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-700">SMS Service</p>
                      <p className="text-xs text-gray-500">SMS campaigns and messaging</p>
                    </div>
                    <Switch
                      checked={tenantEnabledServices.includes('sms_service')}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setTenantEnabledServices([...tenantEnabledServices, 'sms_service']);
                        } else {
                          setTenantEnabledServices(tenantEnabledServices.filter(s => s !== 'sms_service'));
                        }
                      }}
                      data-testid="switch-sms-service"
                    />
                  </div>

                  <Button
                    className="w-full"
                    variant="default"
                    onClick={() => {
                      updateTenantServicesMutation.mutate({
                        tenantId: selectedTenantForPlan.id,
                        isTrialAccount: tenantIsTrialAccount,
                        enabledServices: tenantEnabledServices,
                      });
                    }}
                    disabled={updateTenantServicesMutation.isPending}
                    data-testid="button-save-services"
                  >
                    {updateTenantServicesMutation.isPending ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Saving...
                      </>
                    ) : (
                      'Save Service Changes'
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPlanAssignmentDialogOpen(false);
                    setSelectedTenantForPlan(null);
                    setSelectedPlanId('');
                    setWaiveSetupFee(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedPlanId) {
                      assignPlanMutation.mutate({
                        tenantId: selectedTenantForPlan.id,
                        planId: selectedPlanId,
                        setupFeeWaived: waiveSetupFee,
                      });
                    }
                  }}
                  disabled={!selectedPlanId || assignPlanMutation.isPending}
                  data-testid="button-assign-plan"
                >
                  {assignPlanMutation.isPending ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Assigning...
                    </>
                  ) : (
                    'Assign Plan'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Business Services Configuration Dialog */}
      <Dialog open={businessServicesDialogOpen} onOpenChange={setBusinessServicesDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center">
              <Settings className="h-5 w-5 mr-2" />
              Business Services Configuration
            </DialogTitle>
          </DialogHeader>
          {selectedTenantForBusinessServices && (
            <div className="space-y-6 pt-4">
              <div className="space-y-2">
                <Label htmlFor="business-type" className="text-white">Business Type</Label>
                <Select value={businessType} onValueChange={setBusinessType}>
                  <SelectTrigger id="business-type" className="bg-white/10 border-white/20 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call_center">Call Center / Debt Collection</SelectItem>
                    <SelectItem value="billing_service">Billing & Service Company</SelectItem>
                    <SelectItem value="subscription_provider">Subscription Provider</SelectItem>
                    <SelectItem value="freelancer_consultant">Freelancer / Consultant</SelectItem>
                    <SelectItem value="property_management">Property Management</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-blue-100/70">
                  This determines the terminology and features shown to consumers in their portal.
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-white">Enabled Business Modules</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Billing Module */}
                  <div className="rounded-xl border border-white/20 bg-white/5 p-4 transition hover:bg-white/10">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="rounded-lg bg-green-500/20 p-2">
                          <DollarSign className="h-5 w-5 text-green-300" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">Billing</h3>
                          <p className="text-xs text-blue-100/70">Send invoices and track payments</p>
                        </div>
                      </div>
                      <Switch
                        checked={enabledModules.includes('billing')}
                        onCheckedChange={() => handleToggleModule('billing')}
                        data-testid="switch-module-billing"
                      />
                    </div>
                  </div>

                  {/* Subscriptions Module */}
                  <div className="rounded-xl border border-white/20 bg-white/5 p-4 transition hover:bg-white/10">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="rounded-lg bg-blue-500/20 p-2">
                          <Repeat className="h-5 w-5 text-blue-300" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">Subscriptions</h3>
                          <p className="text-xs text-blue-100/70">Automate recurring billing</p>
                        </div>
                      </div>
                      <Switch
                        checked={enabledModules.includes('subscriptions')}
                        onCheckedChange={() => handleToggleModule('subscriptions')}
                        data-testid="switch-module-subscriptions"
                      />
                    </div>
                  </div>

                  {/* Work Orders Module */}
                  <div className="rounded-xl border border-white/20 bg-white/5 p-4 transition hover:bg-white/10">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="rounded-lg bg-purple-500/20 p-2">
                          <FileText className="h-5 w-5 text-purple-300" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">Work Orders</h3>
                          <p className="text-xs text-blue-100/70">Create and manage service jobs</p>
                        </div>
                      </div>
                      <Switch
                        checked={enabledModules.includes('work_orders')}
                        onCheckedChange={() => handleToggleModule('work_orders')}
                        data-testid="switch-module-work-orders"
                      />
                    </div>
                  </div>

                  {/* Client CRM Module */}
                  <div className="rounded-xl border border-white/20 bg-white/5 p-4 transition hover:bg-white/10">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="rounded-lg bg-orange-500/20 p-2">
                          <Users className="h-5 w-5 text-orange-300" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">Client CRM</h3>
                          <p className="text-xs text-blue-100/70">Track leads and customers</p>
                        </div>
                      </div>
                      <Switch
                        checked={enabledModules.includes('client_crm')}
                        onCheckedChange={() => handleToggleModule('client_crm')}
                        data-testid="switch-module-client-crm"
                      />
                    </div>
                  </div>

                  {/* Messaging Center Module */}
                  <div className="rounded-xl border border-white/20 bg-white/5 p-4 transition hover:bg-white/10">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="rounded-lg bg-pink-500/20 p-2">
                          <MessagesSquare className="h-5 w-5 text-pink-300" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">Messaging Center</h3>
                          <p className="text-xs text-blue-100/70">Centralize SMS, email, and notes</p>
                        </div>
                      </div>
                      <Switch
                        checked={enabledModules.includes('messaging_center')}
                        onCheckedChange={() => handleToggleModule('messaging_center')}
                        data-testid="switch-module-messaging-center"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-white/10">
                <Button
                  variant="outline"
                  onClick={() => setBusinessServicesDialogOpen(false)}
                  className="bg-white/10 text-white border-white/20 hover:bg-white/20"
                  data-testid="button-cancel-business-services"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveBusinessConfig}
                  disabled={updateBusinessConfigMutation.isPending}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  data-testid="button-save-business-services"
                >
                  {updateBusinessConfigMutation.isPending ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Settings className="h-4 w-4 mr-2" />
                      Save Configuration
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}