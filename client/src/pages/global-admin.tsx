import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Users, DollarSign, TrendingUp, Eye, Ban, CheckCircle, AlertTriangle, Plus, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
// Simple currency formatter
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export default function GlobalAdmin() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  
  // Form state for creating new agency
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newAgencyName, setNewAgencyName] = useState('');
  const [newAgencyEmail, setNewAgencyEmail] = useState('');

  // Check if user is platform admin
  const { data: userData } = useQuery({
    queryKey: ['/api/auth/user'],
    enabled: !!user
  });

  const isPlatformAdmin = (userData as any)?.platformUser?.role === 'platform_admin';

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

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-gray-600">You need platform admin access to view this page.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
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
                    <div className="flex items-center justify-between">
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
                          <div className="text-sm text-red-600 mt-1">
                            Suspended: {tenant.suspensionReason}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {tenant.isTrialAccount && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => upgradeMutation.mutate(tenant.id)}
                            disabled={upgradeMutation.isPending}
                            data-testid={`button-upgrade-${tenant.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Upgrade to Paid
                          </Button>
                        )}
                        
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
                          onClick={() => window.open(`/${tenant.slug}`, '_blank')}
                          data-testid={`button-view-${tenant.id}`}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Portal
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
    </div>
  );
}