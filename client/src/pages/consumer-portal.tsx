import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getArrangementSummary, formatCurrencyFromCents } from "@/lib/arrangements";
import { useAgencyContext } from "@/hooks/useAgencyContext";
import { getTerminology, type BusinessType } from "@shared/terminology";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Upload } from "lucide-react";

export default function ConsumerPortal() {
  const { tenantSlug, email } = useParams();
  const { agencySlug } = useAgencyContext();
  const { toast } = useToast();
  
  // Default terminology for loading and error states
  const defaultTerms = getTerminology('call_center');
  
  // Upload state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadAccountId, setUploadAccountId] = useState<string>('');

  const { encodedEmail, accountsUrl, documentsUrl, arrangementsUrl } = useMemo(() => {
    const safeEmail = email ? encodeURIComponent(email) : "";
    const resolvedTenantSlug = tenantSlug && tenantSlug !== "undefined" ? tenantSlug : agencySlug;
    const safeTenantSlug = resolvedTenantSlug ? encodeURIComponent(resolvedTenantSlug) : "";

    return {
      encodedEmail: safeEmail,
      accountsUrl: safeEmail ? `/api/consumer/accounts/${safeEmail}` : "",
      documentsUrl: safeEmail && safeTenantSlug ? `/api/consumer/documents/${safeEmail}?tenantSlug=${safeTenantSlug}` : "",
      arrangementsUrl: safeEmail && safeTenantSlug ? `/api/consumer/arrangements/${safeEmail}?tenantSlug=${safeTenantSlug}` : ""
    };
  }, [agencySlug, email, tenantSlug]);

  const { data, isLoading, error } = useQuery<any>({
    queryKey: accountsUrl ? ["consumer-accounts", encodedEmail] : ['consumer-portal-accounts'],
    enabled: !!accountsUrl,
  });

  const { data: documents } = useQuery<any>({
    queryKey: documentsUrl ? [documentsUrl] : ['consumer-portal-documents'],
    enabled: !!documentsUrl,
  });

  const { data: arrangements } = useQuery<any>({
    queryKey: arrangementsUrl && (data as any)?.accounts ? [
      `${arrangementsUrl}&balance=${(data as any)?.accounts?.reduce((sum: number, acc: any) => sum + (acc.balanceCents || 0), 0) || 0}`
    ] : ['consumer-portal-arrangements'],
    enabled: !!((data as any)?.accounts && arrangementsUrl),
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/consumer/documents/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
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
      queryClient.invalidateQueries({ queryKey: [documentsUrl] });
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your {defaultTerms.accountPlural.toLowerCase()}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <i className="fas fa-exclamation-triangle text-red-500 text-4xl mb-4"></i>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Access Error</h1>
            <p className="text-gray-600">
              Unable to access your {defaultTerms.account.toLowerCase()} information. Please contact your {defaultTerms.creditor.toLowerCase()} for assistance.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { consumer, accounts, tenant, tenantSettings } = (data as any) || {};
  
  // Get terminology based on business type
  const businessType: BusinessType = tenant?.businessType || 'call_center';
  const terms = getTerminology(businessType);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const formatCurrency = (cents: number) => {
    return formatCurrencyFromCents(cents);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const totalBalance = accounts?.reduce((sum: number, account: any) => sum + (account.balanceCents || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center">
            <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full mx-auto flex items-center justify-center overflow-hidden">
              {(tenantSettings as any)?.customBranding?.logoUrl ? (
                <img 
                  src={(tenantSettings as any).customBranding.logoUrl} 
                  alt="Company Logo" 
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-white font-semibold text-lg">
                  {getInitials(consumer?.firstName, consumer?.lastName)}
                </span>
              )}
            </div>
            <h1 className="text-xl font-semibold text-white mt-4">Your {terms.accountPlural}</h1>
            <p className="text-white mt-1">
              {consumer?.firstName} {consumer?.lastName}
            </p>
            <p className="text-blue-100 text-sm">{consumer?.email}</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 py-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(totalBalance)}
              </div>
              <div className="text-sm text-gray-500">Total {terms.balance}</div>
            </div>
            <div className="bg-white rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {accounts?.length || 0}
              </div>
              <div className="text-sm text-gray-500">Active {terms.accountPlural}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Accounts List */}
      <div className="px-4 pb-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your {terms.accountPlural}</h2>
          
          {!accounts || accounts.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <i className="fas fa-inbox text-gray-400 text-4xl mb-4"></i>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No {terms.accountPlural} Found</h3>
                <p className="text-gray-600">
                  No {terms.account.toLowerCase()} information is currently available. Please contact your {terms.creditor.toLowerCase()} for assistance.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {accounts.map((account: any) => (
                <div key={account.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-medium text-gray-900">{account.creditor}</h3>
                      <p className="text-sm text-gray-500">
                        {account.accountNumber ? `•••• ${account.accountNumber.slice(-4)}` : 'No account number'}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(account.status)}`}>
                      {account.status || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-lg font-semibold text-gray-900">
                        {formatCurrency(account.balanceCents || 0)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {account.dueDate ? `Due: ${formatDate(account.dueDate)}` : 'No due date'}
                      </div>
                    </div>
                    <Button className="bg-blue-600 hover:bg-blue-700">
                      Contact {terms.creditor}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Documents Section */}
        {(documents && Array.isArray(documents) && documents.length > 0) || accounts?.length > 0 ? (
          <div className="max-w-2xl mx-auto mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
              {accounts?.length > 0 && (
                <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-upload-document">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Document
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload Document</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div>
                        <Label htmlFor="file-upload">Select File *</Label>
                        <Input
                          id="file-upload"
                          type="file"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                          data-testid="input-document-file"
                        />
                        {selectedFile && (
                          <p className="text-sm text-gray-500 mt-1">{selectedFile.name}</p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="upload-title">Document Title *</Label>
                        <Input
                          id="upload-title"
                          value={uploadTitle}
                          onChange={(e) => setUploadTitle(e.target.value)}
                          placeholder="e.g., Proof of Payment"
                          data-testid="input-document-title"
                        />
                      </div>
                      <div>
                        <Label htmlFor="upload-description">Description (Optional)</Label>
                        <Textarea
                          id="upload-description"
                          value={uploadDescription}
                          onChange={(e) => setUploadDescription(e.target.value)}
                          placeholder="Add any relevant notes about this document"
                          data-testid="input-document-description"
                        />
                      </div>
                      <div>
                        <Label htmlFor="upload-account">Associated Account (Optional)</Label>
                        <Select value={uploadAccountId} onValueChange={setUploadAccountId}>
                          <SelectTrigger id="upload-account" data-testid="select-document-account">
                            <SelectValue placeholder="Select an account" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {accounts?.map((account: any) => (
                              <SelectItem key={account.id} value={account.id}>
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
                          data-testid="button-cancel-upload"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleUpload}
                          disabled={uploadMutation.isPending || !selectedFile || !uploadTitle}
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
            {documents && Array.isArray(documents) && documents.length > 0 ? (
              <div className="space-y-3">
                {documents.map((document: any) => (
                  <div key={document.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <i className="fas fa-file-alt text-blue-500 text-lg"></i>
                        <div>
                          <h3 className="font-medium text-gray-900">{document.title}</h3>
                          <p className="text-sm text-gray-500">{document.description}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => window.open(document.fileUrl, '_blank')}>
                        <i className="fas fa-download mr-2"></i>
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">No documents available yet.</p>
            )}
          </div>
        ) : null}

        {/* Payment Arrangements Section */}
        {arrangements && Array.isArray(arrangements) && arrangements.length > 0 && (
          <div className="max-w-2xl mx-auto mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Payment Plans</h2>
            <div className="space-y-3">
              {arrangements.map((arrangement: any) => (
                <div key={arrangement.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{arrangement.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{arrangement.description}</p>
                      {(() => {
                        const summary = getArrangementSummary(arrangement);
                        return (
                          <div className="text-sm text-blue-600 mt-2 space-y-1">
                            <div>{summary.headline}</div>
                            {summary.detail && <div className="text-gray-500">{summary.detail}</div>}
                            <div className="text-gray-500">
                              Eligible balance: {formatCurrencyFromCents(arrangement.minBalance)} - {formatCurrencyFromCents(arrangement.maxBalance)}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <Button className="bg-blue-600 hover:bg-blue-700">
                      Select Plan
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm text-gray-500">
            Questions about your accounts? Contact your agency for assistance.
          </p>
        </div>
      </div>
    </div>
  );
}
