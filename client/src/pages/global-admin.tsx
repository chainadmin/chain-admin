import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Users, DollarSign, TrendingUp, Eye, Ban, CheckCircle, AlertTriangle, Plus, Mail, MessageSquare, Phone, Trash2, Search, Shield, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AdminAuth from "@/components/admin-auth";
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

  // Consumer management state
  const [consumerSearch, setConsumerSearch] = useState('');
  const [selectedTenantFilter, setSelectedTenantFilter] = useState('');
  const [deleteConsumerDialogOpen, setDeleteConsumerDialogOpen] = useState(false);
  const [selectedConsumerForDeletion, setSelectedConsumerForDeletion] = useState<any>(null);

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

  // Fetch all consumers
  const { data: allConsumers, isLoading: consumersLoading } = useQuery({
    queryKey: ['/api/admin/consumers', { search: consumerSearch, tenantId: selectedTenantFilter }],
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

  // Show admin authentication form if not authenticated
  if (!isAdminAuthenticated) {
    return <AdminAuth onAuthenticated={() => setIsAdminAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900" data-testid="text-global-admin-title">Global Admin Dashboard</h1>
            <p className="text-gray-600 mt-2">Platform-wide overview and management</p>
          </div>
          
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

        {/* Platform Stats */}
        {statsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Agencies</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-agencies">{(stats as any)?.totalTenants || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {(stats as any)?.activeTenants || 0} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Trial vs Paid</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-paid-agencies">{(stats as any)?.paidTenants || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {(stats as any)?.trialTenants || 0} on trial
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Consumers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-consumers">{(stats as any)?.totalConsumers || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {(stats as any)?.totalAccounts || 0} accounts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-balance">
                  {formatCurrency(((stats as any)?.totalBalanceCents || 0) / 100)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Platform-wide
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Subscription Requests */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Subscription Requests</CardTitle>
              {(subscriptionRequests as any[])?.length > 0 && (
                <Badge variant="secondary" data-testid="badge-requests-count">
                  {(subscriptionRequests as any[]).length} pending
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {subscriptionRequestsLoading ? (
              <div className="space-y-4">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-20 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            ) : !subscriptionRequests || (subscriptionRequests as any[]).length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p>No pending subscription requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(subscriptionRequests as any[]).map((request: any) => (
                  <div key={request.id} className="border rounded-lg p-4" data-testid={`row-request-${request.id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900" data-testid={`text-tenant-${request.id}`}>
                            {request.tenantName}
                          </p>
                          <p className="text-xs text-gray-500">{request.tenantSlug}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Requested Plan</p>
                          <p className="text-sm font-medium text-gray-900" data-testid={`text-plan-${request.id}`}>
                            {request.planName}
                          </p>
                          <p className="text-xs text-gray-500">{formatCurrency(request.monthlyPrice)}/mo</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Plan Limits</p>
                          <p className="text-xs text-gray-500">
                            {request.includedEmails?.toLocaleString()} emails
                          </p>
                          <p className="text-xs text-gray-500">
                            {request.includedSms?.toLocaleString()} SMS
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Requested By</p>
                          <p className="text-xs text-gray-500" data-testid={`text-requester-${request.id}`}>
                            {request.requestedBy}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(request.requestedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
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
          </CardContent>
        </Card>

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

        {/* Global Consumer Management */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Global Consumer Management</CardTitle>
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
          </CardHeader>
          <CardContent>
            {consumersLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-12 bg-gray-200 rounded"></div>
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
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                        data-testid={`consumer-row-${item.consumer.id}`}
                      >
                        <div className="flex-1">
                          <div className="font-medium" data-testid={`text-consumer-name-${item.consumer.id}`}>
                            {item.consumer.firstName} {item.consumer.lastName}
                          </div>
                          <div className="text-sm text-gray-600">
                            <span data-testid={`text-consumer-email-${item.consumer.id}`}>{item.consumer.email}</span>
                            {item.consumer.phone && (
                              <> • <span data-testid={`text-consumer-phone-${item.consumer.id}`}>{item.consumer.phone}</span></>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Agency: <span data-testid={`text-consumer-agency-${item.consumer.id}`}>{item.tenant?.name || 'Unknown'}</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">
                      {consumerSearch || selectedTenantFilter
                        ? 'No consumers found matching your filters'
                        : 'No consumers in the system'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

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
        <Card>
          <CardHeader>
            <CardTitle>Agency Management</CardTitle>
          </CardHeader>
          <CardContent>
            {tenantsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-16 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {(tenants as any[])?.map((tenant: any) => (
                  <div key={tenant.id} className="border rounded-lg p-4" data-testid={`card-tenant-${tenant.id}`}>
                    {/* Header Section */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h3 className="text-lg font-semibold" data-testid={`text-tenant-name-${tenant.id}`}>{tenant.name}</h3>
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
                        <div className="text-sm text-gray-600 mt-1">
                          <span data-testid={`text-email-${tenant.id}`}>{tenant.email}</span> • <span data-testid={`text-slug-${tenant.id}`}>{tenant.slug}</span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {tenant.stats?.consumerCount || 0} consumers • {tenant.stats?.accountCount || 0} accounts • {formatCurrency((tenant.stats?.totalBalanceCents || 0) / 100)} total balance
                        </div>
                        {tenant.suspensionReason && (
                          <div className="text-sm text-red-600 mt-2">
                            Suspended: {tenant.suspensionReason}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Service Controls Section */}
                    <div className="flex items-center justify-between pt-3 border-t">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500 mr-2">Services:</span>
                        <button
                          onClick={() => updateServiceControlsMutation.mutate({
                            tenantId: tenant.id,
                            controls: { emailServiceEnabled: !tenant.emailServiceEnabled }
                          })}
                          className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            tenant.emailServiceEnabled !== false
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
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
                          className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            tenant.smsServiceEnabled !== false
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
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
                          className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            tenant.portalAccessEnabled !== false
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
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
                          className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            tenant.paymentProcessingEnabled !== false
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                          data-testid={`toggle-payment-${tenant.id}`}
                        >
                          <CreditCard className="h-3 w-3" />
                          <span>Payments</span>
                        </button>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="flex items-center space-x-2">
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
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenSmsConfig(tenant)}
                          data-testid={`button-sms-config-${tenant.id}`}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          SMS
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(`/${tenant.slug}`, '_blank')}
                          data-testid={`button-view-${tenant.id}`}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                
                {(!(tenants as any[]) || (tenants as any[]).length === 0) && (
                  <div className="text-center py-8">
                    <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No agencies registered yet</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
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
    </div>
  );
}