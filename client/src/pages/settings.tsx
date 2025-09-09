import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Upload, Plus, Save, CreditCard, Shield, Settings as SettingsIcon, ImageIcon, Copy, ExternalLink } from "lucide-react";
import { isSubdomainSupported } from "@shared/utils/subdomain";

export default function Settings() {
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showArrangementModal, setShowArrangementModal] = useState(false);
  const [documentForm, setDocumentForm] = useState({
    title: "",
    description: "",
    fileName: "",
    fileUrl: "",
    fileSize: 0,
    mimeType: "",
    isPublic: true,
  });
  const [arrangementForm, setArrangementForm] = useState({
    name: "",
    description: "",
    minBalance: "",
    maxBalance: "",
    monthlyPaymentMin: "",
    monthlyPaymentMax: "",
    maxTermMonths: "12",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/settings"],
  });

  const { data: documents, isLoading: documentsLoading } = useQuery({
    queryKey: ["/api/documents"],
  });

  const { data: arrangementOptions, isLoading: arrangementsLoading } = useQuery({
    queryKey: ["/api/arrangement-options"],
  });

  const { data: userData } = useQuery({
    queryKey: ["/api/auth/user"],
  });


  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PUT", "/api/settings", data);
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "Your settings have been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('logo', file);
      return await apiRequest("POST", "/api/upload/logo", formData);
    },
    onSuccess: () => {
      toast({
        title: "Logo Updated",
        description: "Your logo has been uploaded successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/documents", data);
    },
    onSuccess: () => {
      toast({
        title: "Document Added",
        description: "Document has been uploaded successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setShowDocumentModal(false);
      setDocumentForm({
        title: "",
        description: "",
        fileName: "",
        fileUrl: "",
        fileSize: 0,
        mimeType: "",
        isPublic: true,
      });
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/documents/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Document Deleted",
        description: "Document has been removed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
  });



  const createArrangementMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/arrangement-options", data);
    },
    onSuccess: () => {
      toast({
        title: "Arrangement Option Added",
        description: "Payment arrangement option has been created.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/arrangement-options"] });
      setShowArrangementModal(false);
      setArrangementForm({
        name: "",
        description: "",
        minBalance: "",
        maxBalance: "",
        monthlyPaymentMin: "",
        monthlyPaymentMax: "",
        maxTermMonths: "12",
      });
    },
    onError: (error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteArrangementMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/arrangement-options/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Arrangement Deleted",
        description: "Payment arrangement option has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/arrangement-options"] });
    },
  });

  const handleSettingsUpdate = (field: string, value: any) => {
    updateSettingsMutation.mutate({
      ...(settings as any),
      [field]: value,
    });
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // For demo purposes, we'll create a mock file URL
    // In a real app, you'd upload to a file storage service
    const mockFileUrl = `https://storage.example.com/documents/${file.name}`;
    
    setDocumentForm({
      ...documentForm,
      title: documentForm.title || file.name,
      fileName: file.name,
      fileUrl: mockFileUrl,
      fileSize: file.size,
      mimeType: file.type,
    });
  };

  const handleSubmitDocument = () => {
    if (!documentForm.title || !documentForm.fileName) {
      toast({
        title: "Missing Information",
        description: "Please provide a title and select a file.",
        variant: "destructive",
      });
      return;
    }

    createDocumentMutation.mutate(documentForm);
  };

  const handleSubmitArrangement = () => {
    if (!arrangementForm.name || !arrangementForm.minBalance || !arrangementForm.maxBalance) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    createArrangementMutation.mutate({
      ...arrangementForm,
      minBalance: Math.round(parseFloat(arrangementForm.minBalance) * 100),
      maxBalance: Math.round(parseFloat(arrangementForm.maxBalance) * 100),
      monthlyPaymentMin: Math.round(parseFloat(arrangementForm.monthlyPaymentMin) * 100),
      monthlyPaymentMax: Math.round(parseFloat(arrangementForm.monthlyPaymentMax) * 100),
      maxTermMonths: parseInt(arrangementForm.maxTermMonths),
    });
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  return (
    <AdminLayout>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure your agency settings, privacy options, and consumer portal features
          </p>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-8">
          <Tabs defaultValue="general" className="space-y-4">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="merchant">Payment Processing</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="arrangements">Payment Plans</TabsTrigger>
              <TabsTrigger value="privacy">Privacy & Legal</TabsTrigger>
            </TabsList>

            <TabsContent value="general">
              <Card>
                <CardHeader>
                  <CardTitle>Consumer Portal Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Custom Agency URL Section */}
                  <div className="space-y-4 border-b pb-6">
                    <div>
                      <Label className="text-base font-medium">Your Custom Consumer URL</Label>
                      <p className="text-sm text-gray-500">
                        Share this link with consumers to give them direct access to your agency's portal
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {(() => {
                        const agencySlug = (userData as any)?.platformUser?.tenant?.slug;
                        let agencyUrl = '';
                        
                        if (isSubdomainSupported() && agencySlug) {
                          // Production with custom domain - use subdomain
                          const url = new URL(window.location.origin);
                          const parts = url.hostname.split('.');
                          
                          if (parts.length >= 2) {
                            // Replace or add subdomain
                            if (parts[0] === 'www' || parts.length === 2) {
                              url.hostname = `${agencySlug}.${parts.slice(-2).join('.')}`;
                            } else {
                              parts[0] = agencySlug;
                              url.hostname = parts.join('.');
                            }
                          }
                          
                          agencyUrl = url.origin;
                        } else if (agencySlug) {
                          // Development or no subdomain support - use path-based
                          agencyUrl = `${window.location.origin}/agency/${agencySlug}`;
                        }
                        
                        return (
                          <>
                            <Input
                              readOnly
                              value={agencyUrl}
                              className="flex-1 font-mono text-sm"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(agencyUrl);
                                toast({
                                  title: "URL Copied",
                                  description: "The custom URL has been copied to your clipboard.",
                                });
                              }}
                              data-testid="button-copy-url"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                window.open(agencyUrl, '_blank');
                              }}
                              data-testid="button-preview-url"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-gray-500">
                      This link takes consumers directly to a branded page for your agency where they can sign in or create an account.
                    </p>
                  </div>

                  {/* Logo Upload Section */}
                  <div className="space-y-4 border-b pb-6">
                    <div>
                      <Label className="text-base font-medium">Company Logo</Label>
                      <p className="text-sm text-gray-500">
                        Upload your company logo to display on the consumer portal
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      {/* Current Logo Display */}
                      {(settings as any)?.customBranding?.logoUrl && (
                        <div className="flex-shrink-0">
                          <img 
                            src={(settings as any).customBranding.logoUrl} 
                            alt="Company Logo" 
                            className="h-16 w-16 object-contain border rounded-md bg-white"
                          />
                        </div>
                      )}
                      
                      {/* Upload Button */}
                      <div className="flex-1">
                        <Input
                          type="file"
                          accept="image/*"
                          className="mb-2"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              uploadLogoMutation.mutate(file);
                            }
                          }}
                          disabled={uploadLogoMutation.isPending}
                        />
                        <p className="text-xs text-gray-500">
                          Supported formats: PNG, JPG, GIF. Maximum size: 5MB. Recommended: 200x200px
                        </p>
                      </div>
                    </div>
                    
                    {uploadLogoMutation.isPending && (
                      <div className="text-sm text-blue-600 flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                        Uploading logo...
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Show Payment Plans</Label>
                      <p className="text-sm text-gray-500">
                        Allow consumers to view available payment arrangements
                      </p>
                    </div>
                    <Switch
                      checked={(settings as any)?.showPaymentPlans ?? true}
                      onCheckedChange={(checked) => handleSettingsUpdate('showPaymentPlans', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Show Documents</Label>
                      <p className="text-sm text-gray-500">
                        Allow consumers to access uploaded documents
                      </p>
                    </div>
                    <Switch
                      checked={(settings as any)?.showDocuments ?? true}
                      onCheckedChange={(checked) => handleSettingsUpdate('showDocuments', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Allow Settlement Requests</Label>
                      <p className="text-sm text-gray-500">
                        Let consumers request settlement options
                      </p>
                    </div>
                    <Switch
                      checked={(settings as any)?.allowSettlementRequests ?? true}
                      onCheckedChange={(checked) => handleSettingsUpdate('allowSettlementRequests', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="merchant">
              <Card>
                <CardHeader>
                  <CardTitle>Payment Processing Settings</CardTitle>
                  <p className="text-sm text-gray-500">
                    Configure your merchant account to accept payments from consumers
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Merchant Account Status */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <i className="fas fa-credit-card text-blue-600 text-lg"></i>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-blue-900 mb-1">
                          Payment Processing Status
                        </h3>
                        <p className="text-sm text-blue-700">
                          {(settings as any)?.merchantAccountId ? 
                            "Your merchant account is configured and ready to process payments." :
                            "No merchant account configured. Set up payment processing to accept consumer payments."
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Merchant Account Configuration */}
                  {(settings as any)?.merchantAccountId ? (
                    <div className="space-y-4">
                      <div>
                        <Label>Merchant Provider</Label>
                        <Input
                          value={(settings as any)?.merchantProvider || ""}
                          onChange={(e) => handleSettingsUpdate('merchantProvider', e.target.value)}
                          placeholder="e.g., Stripe, Square, PayPal"
                          data-testid="input-merchant-provider"
                        />
                      </div>
                      
                      <div>
                        <Label>Merchant Account ID</Label>
                        <Input
                          value={(settings as any)?.merchantAccountId || ""}
                          onChange={(e) => handleSettingsUpdate('merchantAccountId', e.target.value)}
                          placeholder="Your merchant account identifier"
                          data-testid="input-merchant-id"
                        />
                      </div>
                      
                      <div>
                        <Label>API Key</Label>
                        <Input
                          type="password"
                          value={(settings as any)?.merchantApiKey || ""}
                          onChange={(e) => handleSettingsUpdate('merchantApiKey', e.target.value)}
                          placeholder="Your merchant API key"
                          data-testid="input-merchant-key"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          This key is encrypted and stored securely
                        </p>
                      </div>
                      
                      <div>
                        <Label>Merchant Name</Label>
                        <Input
                          value={(settings as any)?.merchantName || ""}
                          onChange={(e) => handleSettingsUpdate('merchantName', e.target.value)}
                          placeholder="Name displayed on payment receipts"
                          data-testid="input-merchant-name"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="space-y-0.5">
                          <Label>Enable Online Payments</Label>
                          <p className="text-sm text-gray-500">
                            Allow consumers to make payments through their portal
                          </p>
                        </div>
                        <Switch
                          checked={(settings as any)?.enableOnlinePayments ?? false}
                          onCheckedChange={(checked) => handleSettingsUpdate('enableOnlinePayments', checked)}
                          data-testid="switch-online-payments"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                        <i className="fas fa-credit-card text-gray-400 text-xl"></i>
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Set Up Payment Processing
                      </h3>
                      <p className="text-gray-600 mb-6 max-w-md mx-auto">
                        Configure your merchant account to start accepting online payments from consumers.
                        If you don't have a merchant account, we can help you get one.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <Button 
                          onClick={() => handleSettingsUpdate('merchantAccountId', 'setup')}
                          data-testid="button-setup-merchant"
                        >
                          <i className="fas fa-cog mr-2"></i>
                          Configure Existing Account
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => {
                            toast({
                              title: "Merchant Request Submitted",
                              description: "We'll contact you within 24 hours to help set up your merchant account.",
                            });
                          }}
                          data-testid="button-request-merchant"
                        >
                          <i className="fas fa-handshake mr-2"></i>
                          Request Merchant Account
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Document Management</CardTitle>
                    <Dialog open={showDocumentModal} onOpenChange={setShowDocumentModal}>
                      <DialogTrigger asChild>
                        <Button>
                          <i className="fas fa-plus mr-2"></i>
                          Add Document
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Upload Document</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Title *</Label>
                            <Input
                              value={documentForm.title}
                              onChange={(e) => setDocumentForm({...documentForm, title: e.target.value})}
                              placeholder="Document title"
                            />
                          </div>
                          
                          <div>
                            <Label>Description</Label>
                            <Textarea
                              value={documentForm.description}
                              onChange={(e) => setDocumentForm({...documentForm, description: e.target.value})}
                              placeholder="Optional description"
                            />
                          </div>
                          
                          <div>
                            <Label>File *</Label>
                            <Input
                              type="file"
                              onChange={handleDocumentUpload}
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                            />
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <Switch
                              id="public"
                              checked={documentForm.isPublic}
                              onCheckedChange={(checked) => setDocumentForm({...documentForm, isPublic: checked})}
                            />
                            <Label htmlFor="public">Visible to consumers</Label>
                          </div>
                          
                          <div className="flex justify-end space-x-2">
                            <Button variant="outline" onClick={() => setShowDocumentModal(false)}>
                              Cancel
                            </Button>
                            <Button onClick={handleSubmitDocument}>
                              Upload Document
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {documentsLoading ? (
                    <div className="text-center py-8">Loading documents...</div>
                  ) : (documents as any)?.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No documents uploaded yet. Add documents for consumers to access.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(documents as any)?.map((document: any) => (
                        <div key={document.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            <i className="fas fa-file-alt text-blue-500 text-lg"></i>
                            <div>
                              <h3 className="font-medium">{document.title}</h3>
                              <p className="text-sm text-gray-500">{document.description}</p>
                              <div className="text-xs text-gray-400">
                                {document.fileName} • {(document.fileSize / 1024).toFixed(1)} KB
                                {document.isPublic && <span className="ml-2 text-green-600">• Public</span>}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteDocumentMutation.mutate(document.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <i className="fas fa-trash"></i>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="arrangements">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Payment Arrangement Options</CardTitle>
                    <Dialog open={showArrangementModal} onOpenChange={setShowArrangementModal}>
                      <DialogTrigger asChild>
                        <Button>
                          <i className="fas fa-plus mr-2"></i>
                          Add Arrangement
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Create Payment Arrangement</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Plan Name *</Label>
                            <Input
                              value={arrangementForm.name}
                              onChange={(e) => setArrangementForm({...arrangementForm, name: e.target.value})}
                              placeholder="e.g., Standard Payment Plan"
                            />
                          </div>
                          
                          <div>
                            <Label>Description</Label>
                            <Textarea
                              value={arrangementForm.description}
                              onChange={(e) => setArrangementForm({...arrangementForm, description: e.target.value})}
                              placeholder="Optional description"
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Min Balance ($) *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={arrangementForm.minBalance}
                                onChange={(e) => setArrangementForm({...arrangementForm, minBalance: e.target.value})}
                                placeholder="100.00"
                              />
                            </div>
                            <div>
                              <Label>Max Balance ($) *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={arrangementForm.maxBalance}
                                onChange={(e) => setArrangementForm({...arrangementForm, maxBalance: e.target.value})}
                                placeholder="1999.99"
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Min Payment ($) *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={arrangementForm.monthlyPaymentMin}
                                onChange={(e) => setArrangementForm({...arrangementForm, monthlyPaymentMin: e.target.value})}
                                placeholder="50.00"
                              />
                            </div>
                            <div>
                              <Label>Max Payment ($) *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={arrangementForm.monthlyPaymentMax}
                                onChange={(e) => setArrangementForm({...arrangementForm, monthlyPaymentMax: e.target.value})}
                                placeholder="100.00"
                              />
                            </div>
                          </div>
                          
                          <div>
                            <Label>Max Term (Months)</Label>
                            <Select value={arrangementForm.maxTermMonths} onValueChange={(value) => setArrangementForm({...arrangementForm, maxTermMonths: value})}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="6">6 months</SelectItem>
                                <SelectItem value="12">12 months</SelectItem>
                                <SelectItem value="18">18 months</SelectItem>
                                <SelectItem value="24">24 months</SelectItem>
                                <SelectItem value="36">36 months</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="flex justify-end space-x-2">
                            <Button variant="outline" onClick={() => setShowArrangementModal(false)}>
                              Cancel
                            </Button>
                            <Button onClick={handleSubmitArrangement}>
                              Create Arrangement
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {arrangementsLoading ? (
                    <div className="text-center py-8">Loading arrangements...</div>
                  ) : (arrangementOptions as any)?.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No payment arrangements configured yet. Add arrangements for different balance ranges.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(arrangementOptions as any)?.map((option: any) => (
                        <div key={option.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <h3 className="font-medium">{option.name}</h3>
                            <p className="text-sm text-gray-500">{option.description}</p>
                            <div className="text-sm text-gray-600 mt-1">
                              Balance: {formatCurrency(option.minBalance)} - {formatCurrency(option.maxBalance)}
                              <span className="mx-2">•</span>
                              Payment: {formatCurrency(option.monthlyPaymentMin)} - {formatCurrency(option.monthlyPaymentMax)}/month
                              <span className="mx-2">•</span>
                              Max term: {option.maxTermMonths} months
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteArrangementMutation.mutate(option.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <i className="fas fa-trash"></i>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

<TabsContent value="privacy">
              <Card>
                <CardHeader>
                  <CardTitle>Privacy & Legal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label>Contact Email</Label>
                    <Input
                      value={(settings as any)?.contactEmail || ""}
                      onChange={(e) => handleSettingsUpdate('contactEmail', e.target.value)}
                      placeholder="support@youragency.com"
                    />
                  </div>
                  
                  <div>
                    <Label>Contact Phone</Label>
                    <Input
                      value={(settings as any)?.contactPhone || ""}
                      onChange={(e) => handleSettingsUpdate('contactPhone', e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  
                  <div>
                    <Label>Privacy Policy</Label>
                    <Textarea
                      rows={6}
                      value={(settings as any)?.privacyPolicy || ""}
                      onChange={(e) => handleSettingsUpdate('privacyPolicy', e.target.value)}
                      placeholder="Enter your privacy policy text that consumers will see..."
                    />
                  </div>
                  
                  <div>
                    <Label>Terms of Service</Label>
                    <Textarea
                      rows={6}
                      value={(settings as any)?.termsOfService || ""}
                      onChange={(e) => handleSettingsUpdate('termsOfService', e.target.value)}
                      placeholder="Enter your terms of service text that consumers will see..."
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        </div>
      </div>
    </AdminLayout>
  );
}