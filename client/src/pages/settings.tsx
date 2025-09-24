import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import { getArrangementSummary, getPlanTypeLabel, formatCurrencyFromCents } from "@/lib/arrangements";

export default function Settings() {
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showArrangementModal, setShowArrangementModal] = useState(false);
  type DocumentFormState = {
    title: string;
    description: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    isPublic: boolean;
    accountId: string;
  };

  const emptyDocumentForm: DocumentFormState = {
    title: "",
    description: "",
    fileName: "",
    fileUrl: "",
    fileSize: 0,
    mimeType: "",
    isPublic: true,
    accountId: "",
  };

  const [documentForm, setDocumentForm] = useState<DocumentFormState>({ ...emptyDocumentForm });
  type ArrangementFormState = {
    name: string;
    description: string;
    minBalance: string;
    maxBalance: string;
    planType: "range" | "fixed_monthly" | "pay_in_full" | "custom_terms";
    monthlyPaymentMin: string;
    monthlyPaymentMax: string;
    fixedMonthlyPayment: string;
    payoffPercentage: string;
    payoffDueDate: string;
    payoffText: string;
    customTermsText: string;
    maxTermMonths: string;
  };

  const emptyArrangementForm: ArrangementFormState = {
    name: "",
    description: "",
    minBalance: "",
    maxBalance: "",
    planType: "range",
    monthlyPaymentMin: "",
    monthlyPaymentMax: "",
    fixedMonthlyPayment: "",
    payoffPercentage: "",
    payoffDueDate: "",
    payoffText: "",
    customTermsText: "",
    maxTermMonths: "12",
  } as const;

  const [arrangementForm, setArrangementForm] = useState<ArrangementFormState>({ ...emptyArrangementForm });
  const [localSettings, setLocalSettings] = useState<any>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: authUser, isLoading: authLoading } = useAuth();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/settings"],
  });

  const { data: documents, isLoading: documentsLoading } = useQuery({
    queryKey: ["/api/documents"],
  });

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["/api/accounts"],
  });

  const { data: arrangementOptions, isLoading: arrangementsLoading } = useQuery({
    queryKey: ["/api/arrangement-options"],
  });

  // Fetch full user data with tenant info if needed
  const { data: userData, isLoading: userLoading, error: userError } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: 1,
    enabled: !!authUser, // Only fetch if authenticated
  });

  // Initialize local settings when data loads
  useEffect(() => {
    if (settings && !hasUnsavedChanges) {
      setLocalSettings(settings);
    }
  }, [settings]);

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
      // Convert file to base64
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = reader.result as string;
            const result = await apiRequest("POST", "/api/upload/logo", {
              image: base64,
              filename: file.name
            });
            resolve(result);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
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
      setDocumentForm({ ...emptyDocumentForm });
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
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error?.message || "Unable to delete document.",
        variant: "destructive",
      });
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
      setArrangementForm({ ...emptyArrangementForm });
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
    setLocalSettings((prev: any) => ({
      ...prev,
      [field]: value,
    }));
    setHasUnsavedChanges(true);
  };

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate(localSettings, {
      onSuccess: () => {
        setHasUnsavedChanges(false);
        toast({
          title: "Settings Saved",
          description: "Your changes have been saved successfully.",
        });
      },
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
    if (!documentForm.title || !documentForm.fileName || !documentForm.fileUrl) {
      toast({
        title: "Missing Information",
        description: "Please provide a title and select a file to upload.",
        variant: "destructive",
      });
      return;
    }

    if (!documentForm.isPublic && !documentForm.accountId) {
      toast({
        title: "Account Required",
        description: "Select an account to share this document with or enable sharing with all consumers.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      ...documentForm,
      accountId: documentForm.isPublic ? null : documentForm.accountId,
    };

    createDocumentMutation.mutate(payload);
  };

  const parseCurrencyInput = (value: string): number | null => {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.toString().trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (Number.isNaN(numeric)) {
      return null;
    }
    return Math.round(numeric * 100);
  };

  const parseMaxTermValue = (value: string): number | null => {
    if (!value || value === "until_paid") {
      return null;
    }

    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      return null;
    }

    return Math.trunc(numeric);
  };

  const parsePercentageInput = (value: string): number | null => {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.toString().trim();
    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed);
    if (Number.isNaN(numeric)) {
      return null;
    }

    return Math.round(numeric * 100);
  };

  const parseDateInput = (value: string): string | null => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return null;
    }

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return trimmed;
  };

  const handleSubmitArrangement = () => {
    const name = arrangementForm.name.trim();
    const planType = arrangementForm.planType;

    const minBalance = parseCurrencyInput(arrangementForm.minBalance);
    const maxBalance = parseCurrencyInput(arrangementForm.maxBalance);

    if (!name || minBalance === null || maxBalance === null) {
      toast({
        title: "Missing Information",
        description: "Provide a name and valid balance range for this plan.",
        variant: "destructive",
      });
      return;
    }

    if (minBalance < 0 || maxBalance < 0 || minBalance > maxBalance) {
      toast({
        title: "Invalid Balance Range",
        description: "Balance amounts must be positive and the minimum cannot exceed the maximum.",
        variant: "destructive",
      });
      return;
    }

    const payload: any = {
      name,
      description: arrangementForm.description.trim() || undefined,
      minBalance,
      maxBalance,
      planType,
    };

    const maxTermMonths = parseMaxTermValue(arrangementForm.maxTermMonths);

    if (planType === "range") {
      const monthlyMin = parseCurrencyInput(arrangementForm.monthlyPaymentMin);
      const monthlyMax = parseCurrencyInput(arrangementForm.monthlyPaymentMax);

      if (monthlyMin === null || monthlyMax === null) {
        toast({
          title: "Missing Monthly Range",
          description: "Provide both minimum and maximum monthly payment amounts.",
          variant: "destructive",
        });
        return;
      }

      if (monthlyMin < 0 || monthlyMax < 0 || monthlyMin > monthlyMax) {
        toast({
          title: "Invalid Monthly Range",
          description: "Monthly amounts must be positive and the minimum cannot exceed the maximum.",
          variant: "destructive",
        });
        return;
      }

      if (maxTermMonths !== null && maxTermMonths <= 0) {
        toast({
          title: "Invalid Term",
          description: "Max term must be a positive number of months.",
          variant: "destructive",
        });
        return;
      }

      payload.monthlyPaymentMin = monthlyMin;
      payload.monthlyPaymentMax = monthlyMax;
      payload.maxTermMonths = maxTermMonths ?? 12;
    } else if (planType === "fixed_monthly") {
      const fixedMonthly = parseCurrencyInput(arrangementForm.fixedMonthlyPayment);
      if (fixedMonthly === null || fixedMonthly <= 0) {
        toast({
          title: "Monthly Amount Required",
          description: "Enter a valid monthly payment amount for this plan.",
          variant: "destructive",
        });
        return;
      }

      if (maxTermMonths !== null && maxTermMonths <= 0) {
        toast({
          title: "Invalid Term",
          description: "Max term must be a positive number of months or set to until paid in full.",
          variant: "destructive",
        });
        return;
      }

      payload.fixedMonthlyPayment = fixedMonthly;
      payload.maxTermMonths = maxTermMonths ?? null;
    } else if (planType === "pay_in_full") {
      const payoffPercentage = parsePercentageInput(arrangementForm.payoffPercentage);
      const payoffDueDate = parseDateInput(arrangementForm.payoffDueDate);
      const payoffText = arrangementForm.payoffText.trim();

      if (payoffPercentage === null || payoffPercentage <= 0) {
        toast({
          title: "Payoff Percentage Required",
          description: "Enter a valid payoff percentage greater than zero.",
          variant: "destructive",
        });
        return;
      }

      if (payoffPercentage > 10000) {
        toast({
          title: "Invalid Percentage",
          description: "Payoff percentage cannot exceed 100%.",
          variant: "destructive",
        });
        return;
      }

      if (!payoffDueDate) {
        toast({
          title: "Payoff Due Date Required",
          description: "Select a valid date for the payoff terms.",
          variant: "destructive",
        });
        return;
      }

      payload.payoffPercentageBasisPoints = payoffPercentage;
      payload.payoffDueDate = payoffDueDate;
      payload.payoffText = payoffText || undefined;
      payload.maxTermMonths = null;
    } else if (planType === "custom_terms") {
      const customText = arrangementForm.customTermsText.trim();
      if (!customText) {
        toast({
          title: "Custom Copy Required",
          description: "Provide the copy that describes your custom terms.",
          variant: "destructive",
        });
        return;
      }

      payload.customTermsText = customText;
      payload.maxTermMonths = null;
    }

    createArrangementMutation.mutate(payload);
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
                        // Check if user data is still loading
                        if (authLoading || userLoading) {
                          return (
                            <div className="text-sm text-gray-500">
                              Loading agency information...
                            </div>
                          );
                        }
                        
                        // Use authUser first, then userData as fallback
                        const user = userData || authUser;
                        
                        // Check if there was an error loading user data
                        if (!user) {
                          // Try to get agency slug from the current URL as fallback
                          const pathSegments = window.location.pathname.split('/');
                          let fallbackSlug = null;
                          
                          // Check if we're in an agency context path
                          if (pathSegments[1] && pathSegments[1] !== 'admin' && pathSegments[1] !== 'settings') {
                            fallbackSlug = pathSegments[1];
                          }
                          
                          // Or try to get from sessionStorage (if stored from agency login)
                          const storedContext = sessionStorage.getItem('agencyContext');
                          if (storedContext) {
                            try {
                              const parsed = JSON.parse(storedContext);
                              fallbackSlug = parsed.slug;
                            } catch (e) {}
                          }
                          
                          if (fallbackSlug) {
                            const agencyUrl = isSubdomainSupported() 
                              ? `https://${fallbackSlug}.${window.location.hostname.split('.').slice(-2).join('.')}`
                              : `${window.location.origin}/agency/${fallbackSlug}`;
                            
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
                          }
                          
                          return (
                            <div className="text-sm text-gray-500">
                              Unable to load agency information. Please try refreshing the page.
                            </div>
                          );
                        }
                        
                        // Handle both JWT and Replit auth structures
                        let agencySlug = null;
                        
                        if ((user as any)?.isJwtAuth) {
                          // JWT auth - tenant info is directly on user
                          // Check both tenantSlug and tenant.slug
                          agencySlug = (user as any)?.tenantSlug || (user as any)?.tenant?.slug;
                        } else if ((user as any)?.platformUser) {
                          // Replit auth - tenant info is under platformUser
                          agencySlug = (user as any)?.platformUser?.tenant?.slug;
                        }
                        
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
                        
                        if (!agencySlug) {
                          // Try fallback approach if no slug found
                          const storedContext = sessionStorage.getItem('agencyContext');
                          if (storedContext) {
                            try {
                              const parsed = JSON.parse(storedContext);
                              agencySlug = parsed.slug;
                              agencyUrl = isSubdomainSupported() 
                                ? `https://${agencySlug}.${window.location.hostname.split('.').slice(-2).join('.')}`
                                : `${window.location.origin}/agency/${agencySlug}`;
                            } catch (e) {}
                          }
                          
                          if (!agencySlug) {
                            return (
                              <div className="text-sm text-gray-500">
                                Agency information not available. Please ensure you're logged in to an agency account.
                              </div>
                            );
                          }
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
                      checked={localSettings?.showPaymentPlans ?? true}
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
                      checked={localSettings?.showDocuments ?? true}
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
                      checked={localSettings?.allowSettlementRequests ?? true}
                      onCheckedChange={(checked) => handleSettingsUpdate('allowSettlementRequests', checked)}
                    />
                  </div>
                </CardContent>
                {hasUnsavedChanges && (
                  <CardFooter>
                    <Button 
                      onClick={handleSaveSettings} 
                      disabled={updateSettingsMutation.isPending}
                      className="ml-auto"
                    >
                      {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </CardFooter>
                )}
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
                          value={localSettings?.merchantProvider || ""}
                          onChange={(e) => handleSettingsUpdate('merchantProvider', e.target.value)}
                          placeholder="e.g., Stripe, Square, PayPal"
                          data-testid="input-merchant-provider"
                        />
                      </div>
                      
                      <div>
                        <Label>Merchant Account ID</Label>
                        <Input
                          value={localSettings?.merchantAccountId || ""}
                          onChange={(e) => handleSettingsUpdate('merchantAccountId', e.target.value)}
                          placeholder="Your merchant account identifier"
                          data-testid="input-merchant-id"
                        />
                      </div>
                      
                      <div>
                        <Label>API Key</Label>
                        <Input
                          type="password"
                          value={localSettings?.merchantApiKey || ""}
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
                          value={localSettings?.merchantName || ""}
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
                          checked={localSettings?.enableOnlinePayments ?? false}
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
                {hasUnsavedChanges && (
                  <CardFooter>
                    <Button 
                      onClick={handleSaveSettings} 
                      disabled={updateSettingsMutation.isPending}
                      className="ml-auto"
                    >
                      {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="documents">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Document Management</CardTitle>
                    <Dialog
                      open={showDocumentModal}
                      onOpenChange={(open) => {
                        setShowDocumentModal(open);
                        if (!open) {
                          setDocumentForm({ ...emptyDocumentForm });
                        }
                      }}
                    >
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

                          {!documentForm.isPublic && (
                            <div>
                              <Label>Account *</Label>
                              <Select
                                value={documentForm.accountId}
                                onValueChange={(value) => setDocumentForm({ ...documentForm, accountId: value })}
                                disabled={accountsLoading || !Array.isArray(accounts) || (accounts as any)?.length === 0}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={accountsLoading ? "Loading accounts..." : "Select account"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.isArray(accounts) && (accounts as any).length > 0 ? (
                                    (accounts as any).map((account: any) => (
                                      <SelectItem key={account.id} value={account.id}>
                                        {account.consumer
                                          ? `${account.consumer.firstName} ${account.consumer.lastName}`.trim()
                                          : "Unassigned Account"}
                                        {account.accountNumber ? ` • ${account.accountNumber}` : ""}
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <SelectItem value="__no_accounts" disabled>
                                      {accountsLoading ? "Loading accounts..." : "No accounts available"}
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              {!accountsLoading && (!Array.isArray(accounts) || (accounts as any)?.length === 0) && (
                                <p className="text-xs text-gray-500 mt-1">
                                  No accounts available. Create or import an account before attaching documents.
                                </p>
                              )}
                            </div>
                          )}

                          <div className="flex items-center space-x-2">
                            <Switch
                              id="public"
                              checked={documentForm.isPublic}
                              onCheckedChange={(checked) =>
                                setDocumentForm((prev) => ({
                                  ...prev,
                                  isPublic: checked,
                                  accountId: checked ? "" : prev.accountId,
                                }))
                              }
                            />
                            <Label htmlFor="public">Share with all consumers</Label>
                          </div>

                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setShowDocumentModal(false);
                                setDocumentForm({ ...emptyDocumentForm });
                              }}
                            >
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
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                {(() => {
                                  if (document.isPublic) {
                                    return <span className="text-green-600">Shared with all consumers</span>;
                                  }

                                  if (!document.account) {
                                    return <span className="text-amber-600">Account association missing</span>;
                                  }

                                  const consumerName = document.account.consumer
                                    ? [document.account.consumer.firstName, document.account.consumer.lastName]
                                        .filter(Boolean)
                                        .join(" ")
                                        .trim()
                                    : "";

                                  return (
                                    <span>
                                      Shared with {consumerName || "selected account"}
                                      {document.account.accountNumber
                                        ? ` • Account ${document.account.accountNumber}`
                                        : ""}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete document?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. The document "{document.title}" will no longer be available to
                                  consumers.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction asChild>
                                  <Button
                                    variant="destructive"
                                    onClick={() => deleteDocumentMutation.mutate(document.id)}
                                    disabled={deleteDocumentMutation.isPending}
                                  >
                                    Delete
                                  </Button>
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
                    <Dialog
                      open={showArrangementModal}
                      onOpenChange={(open) => {
                        setShowArrangementModal(open);
                        if (!open) {
                          setArrangementForm({ ...emptyArrangementForm });
                        }
                      }}
                    >
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
                                onChange={(e) => setArrangementForm({ ...arrangementForm, minBalance: e.target.value })}
                                placeholder="100.00"
                              />
                            </div>
                            <div>
                              <Label>Max Balance ($) *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={arrangementForm.maxBalance}
                                onChange={(e) => setArrangementForm({ ...arrangementForm, maxBalance: e.target.value })}
                                placeholder="1999.99"
                              />
                            </div>
                          </div>

                          <div>
                            <Label>Plan Type *</Label>
                            <Select
                              value={arrangementForm.planType}
                              onValueChange={(value) =>
                                setArrangementForm({
                                  ...arrangementForm,
                                  planType: value as ArrangementFormState["planType"],
                                  monthlyPaymentMin: "",
                                  monthlyPaymentMax: "",
                                  fixedMonthlyPayment: "",
                                  payoffPercentage: "",
                                  payoffDueDate: "",
                                  payoffText: "",
                                  customTermsText: "",
                                  maxTermMonths: value === "fixed_monthly" ? "until_paid" : "12",
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select plan type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="range">Monthly range (legacy)</SelectItem>
                                <SelectItem value="fixed_monthly">Fixed monthly amount</SelectItem>
                                <SelectItem value="pay_in_full">Pay in full</SelectItem>
                                <SelectItem value="custom_terms">Custom terms copy</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {arrangementForm.planType === "range" && (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Min Payment ($) *</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={arrangementForm.monthlyPaymentMin}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, monthlyPaymentMin: e.target.value })}
                                  placeholder="50.00"
                                />
                              </div>
                              <div>
                                <Label>Max Payment ($) *</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={arrangementForm.monthlyPaymentMax}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, monthlyPaymentMax: e.target.value })}
                                  placeholder="100.00"
                                />
                              </div>
                            </div>
                          )}

                          {arrangementForm.planType === "fixed_monthly" && (
                            <div>
                              <Label>Monthly Payment ($) *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={arrangementForm.fixedMonthlyPayment}
                                onChange={(e) => setArrangementForm({ ...arrangementForm, fixedMonthlyPayment: e.target.value })}
                                placeholder="150.00"
                              />
                            </div>
                          )}

                          {arrangementForm.planType === "pay_in_full" && (
                            <div className="space-y-4">
                              <div>
                                <Label>Payoff Percentage (%) *</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="100"
                                  value={arrangementForm.payoffPercentage}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, payoffPercentage: e.target.value })}
                                  placeholder="50"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  Enter the portion of the outstanding balance the consumer must pay.
                                </p>
                              </div>
                              <div>
                                <Label>Payoff Due Date *</Label>
                                <Input
                                  type="date"
                                  value={arrangementForm.payoffDueDate}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, payoffDueDate: e.target.value })}
                                />
                              </div>
                              <div>
                                <Label>Additional Notes</Label>
                                <Textarea
                                  value={arrangementForm.payoffText}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, payoffText: e.target.value })}
                                  placeholder="Describe any additional payoff instructions"
                                />
                              </div>
                            </div>
                          )}

                          {arrangementForm.planType === "custom_terms" && (
                            <div>
                              <Label>Custom Terms Copy *</Label>
                              <Textarea
                                value={arrangementForm.customTermsText}
                                onChange={(e) => setArrangementForm({ ...arrangementForm, customTermsText: e.target.value })}
                                placeholder="Enter the custom terms consumers should see"
                              />
                            </div>
                          )}

                          {(arrangementForm.planType === "range" || arrangementForm.planType === "fixed_monthly") && (
                            <div>
                              <Label>Max Term (Months)</Label>
                              <Select
                                value={arrangementForm.maxTermMonths}
                                onValueChange={(value) => setArrangementForm({ ...arrangementForm, maxTermMonths: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="6">6 months</SelectItem>
                                  <SelectItem value="12">12 months</SelectItem>
                                  <SelectItem value="18">18 months</SelectItem>
                                  <SelectItem value="24">24 months</SelectItem>
                                  <SelectItem value="36">36 months</SelectItem>
                                  {arrangementForm.planType === "fixed_monthly" && (
                                    <SelectItem value="until_paid">Until paid in full</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          
                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setShowArrangementModal(false);
                                setArrangementForm({ ...emptyArrangementForm });
                              }}
                            >
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
                            {(() => {
                              const summary = getArrangementSummary(option);
                              return (
                                <div className="text-sm text-gray-600 mt-2 space-y-1">
                                  <div className="font-medium text-gray-700">{getPlanTypeLabel(option.planType)}</div>
                                  <div>{summary.headline}</div>
                                  {summary.detail && <div className="text-gray-500">{summary.detail}</div>}
                                  <div className="text-gray-500">
                                    Balance range: {formatCurrencyFromCents(option.minBalance)} - {formatCurrencyFromCents(option.maxBalance)}
                                  </div>
                                </div>
                              );
                            })()}
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
                      value={localSettings?.contactEmail || ""}
                      onChange={(e) => handleSettingsUpdate('contactEmail', e.target.value)}
                      placeholder="support@youragency.com"
                    />
                  </div>
                  
                  <div>
                    <Label>Contact Phone</Label>
                    <Input
                      value={localSettings?.contactPhone || ""}
                      onChange={(e) => handleSettingsUpdate('contactPhone', e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  
                  <div>
                    <Label>Privacy Policy</Label>
                    <Textarea
                      rows={6}
                      value={localSettings?.privacyPolicy || ""}
                      onChange={(e) => handleSettingsUpdate('privacyPolicy', e.target.value)}
                      placeholder="Enter your privacy policy text that consumers will see..."
                    />
                  </div>
                  
                  <div>
                    <Label>Terms of Service</Label>
                    <Textarea
                      rows={6}
                      value={localSettings?.termsOfService || ""}
                      onChange={(e) => handleSettingsUpdate('termsOfService', e.target.value)}
                      placeholder="Enter your terms of service text that consumers will see..."
                    />
                  </div>
                </CardContent>
                {hasUnsavedChanges && (
                  <CardFooter>
                    <Button 
                      onClick={handleSaveSettings} 
                      disabled={updateSettingsMutation.isPending}
                      className="ml-auto"
                    >
                      {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </TabsContent>

          </Tabs>
        </div>
      </div>
    </AdminLayout>
  );
}