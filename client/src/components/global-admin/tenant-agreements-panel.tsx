import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Send, CheckCircle2, XCircle, Eye, Clock } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface TenantAgreementsPanelProps {
  tenants: any[];
  isLoadingTenants: boolean;
  toast: any;
  isPlatformAdmin: boolean;
}

export function TenantAgreementsPanel({ tenants, isLoadingTenants, toast, isPlatformAdmin }: TenantAgreementsPanelProps) {
  const [selectedTenantForAgreement, setSelectedTenantForAgreement] = useState('');
  const [selectedAgreementTemplate, setSelectedAgreementTemplate] = useState('');

  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/admin/global-document-templates'],
    enabled: isPlatformAdmin
  });

  const { data: sentAgreements, isLoading: agreementsLoading } = useQuery({
    queryKey: ['/api/admin/tenants', selectedTenantForAgreement, 'agreements'],
    enabled: isPlatformAdmin && !!selectedTenantForAgreement
  });

  const sendAgreementMutation = useMutation({
    mutationFn: async ({ tenantId, templateSlug }: { tenantId: string; templateSlug: string }) => {
      // Backend builds complete metadata from tenant/subscription data
      return apiRequest('POST', `/api/admin/tenants/${tenantId}/send-agreement`, { 
        templateSlug
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tenants', selectedTenantForAgreement, 'agreements'] });
      toast({
        title: "Success",
        description: "Agreement sent successfully via email",
      });
      setSelectedAgreementTemplate('');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send agreement",
        variant: "destructive",
      });
    }
  });

  const handleSendAgreement = () => {
    if (!selectedTenantForAgreement || !selectedAgreementTemplate) {
      toast({
        title: "Error",
        description: "Please select both a tenant and an agreement template",
        variant: "destructive",
      });
      return;
    }

    sendAgreementMutation.mutate({
      tenantId: selectedTenantForAgreement,
      templateSlug: selectedAgreementTemplate,
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'agreed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'declined':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'viewed':
        return <Eye className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'agreed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'declined':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'viewed':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 shadow-lg shadow-blue-900/20 backdrop-blur mt-8">
      <div className="p-6 border-b border-white/10">
        <h2 className="text-xl font-semibold text-blue-50 flex items-center">
          <FileText className="h-5 w-5 mr-2" />
          Tenant Agreements
        </h2>
        <p className="text-blue-100/70 text-sm mt-1">Send software proposals and payment authorization forms to tenants</p>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Send Agreement Form */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
          <h3 className="text-lg font-medium text-blue-50 mb-4">Send Agreement</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-blue-100/70">Select Tenant</label>
              <Select value={selectedTenantForAgreement} onValueChange={setSelectedTenantForAgreement}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-tenant-for-agreement">
                  <SelectValue placeholder="Choose a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingTenants ? (
                    <SelectItem value="loading" disabled>Loading tenants...</SelectItem>
                  ) : (
                    (tenants || []).map((tenant: any) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-blue-100/70">Agreement Type</label>
              <Select value={selectedAgreementTemplate} onValueChange={setSelectedAgreementTemplate}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-agreement-template">
                  <SelectValue placeholder="Choose agreement type" />
                </SelectTrigger>
                <SelectContent>
                  {templatesLoading ? (
                    <SelectItem value="loading" disabled>Loading templates...</SelectItem>
                  ) : (
                    ((templates as any[]) || []).map((template: any) => (
                      <SelectItem key={template.id} value={template.slug}>
                        {template.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleSendAgreement}
                disabled={!selectedTenantForAgreement || !selectedAgreementTemplate || sendAgreementMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700"
                data-testid="button-send-agreement"
              >
                {sendAgreementMutation.isPending ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Agreement
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Sent Agreements List */}
        {selectedTenantForAgreement && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
            <h3 className="text-lg font-medium text-blue-50 mb-4">
              Sent Agreements for {tenants?.find((t: any) => t.id === selectedTenantForAgreement)?.name}
            </h3>
            
            {agreementsLoading ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="animate-pulse h-16 bg-white/10 rounded"></div>
                ))}
              </div>
            ) : sentAgreements && (sentAgreements as any[]).length > 0 ? (
              <div className="space-y-3">
                {((sentAgreements as any[]) || []).map((agreement: any) => (
                  <div 
                    key={agreement.id} 
                    className="border border-white/10 rounded-lg p-4 bg-white/[0.01]"
                    data-testid={`agreement-${agreement.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(agreement.status)}
                          <h4 className="font-medium text-blue-50" data-testid={`agreement-title-${agreement.id}`}>
                            {agreement.title}
                          </h4>
                          <span className={`text-xs px-2 py-1 rounded border ${getStatusBadgeColor(agreement.status)}`}>
                            {agreement.status}
                          </span>
                        </div>
                        <p className="text-sm text-blue-100/70 mt-1">{agreement.description}</p>
                        <div className="text-xs text-blue-100/50 mt-2 space-y-1">
                          <div>Sent: {new Date(agreement.createdAt).toLocaleString()}</div>
                          {agreement.viewedAt && <div>Viewed: {new Date(agreement.viewedAt).toLocaleString()}</div>}
                          {agreement.agreedAt && <div>Agreed: {new Date(agreement.agreedAt).toLocaleString()}</div>}
                          {agreement.declinedAt && (
                            <>
                              <div>Declined: {new Date(agreement.declinedAt).toLocaleString()}</div>
                              {agreement.declineReason && <div>Reason: {agreement.declineReason}</div>}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-blue-100/30 mx-auto mb-3" />
                <p className="text-blue-100/50">No agreements sent to this tenant yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
