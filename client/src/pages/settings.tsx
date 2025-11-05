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
import { Trash2, Upload, Plus, Save, CreditCard, Shield, Settings as SettingsIcon, ImageIcon, Copy, ExternalLink, Repeat, FileText, Users, MessagesSquare, DollarSign } from "lucide-react";
import { isSubdomainSupported } from "@shared/utils/subdomain";
import { resolveConsumerPortalUrl } from "@shared/utils/consumerPortal";
import { getArrangementSummary, getPlanTypeLabel, formatCurrencyFromCents } from "@/lib/arrangements";
import { cn } from "@/lib/utils";
import { balanceTiers, getBalanceRangeFromTier, getBalanceTierLabel, type BalanceTier } from "@shared/schema";

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
    balanceTier: "under_3000" | "3000_to_5000" | "5000_to_10000" | "over_10000" | "";
    planType: "range" | "fixed_monthly" | "pay_in_full" | "settlement" | "custom_terms" | "one_time_payment";
    monthlyPaymentMin: string;
    monthlyPaymentMax: string;
    fixedMonthlyPayment: string;
    oneTimePaymentMin: string;
    payoffPercentage: string;
    payoffDueDate: string;
    settlementPaymentCount: string;
    settlementPaymentFrequency: string;
    settlementOfferExpiresDate: string;
    payoffText: string;
    customTermsText: string;
    maxTermMonths: string;
  };

  const emptyArrangementForm: ArrangementFormState = {
    name: "",
    description: "",
    balanceTier: "",
    planType: "range",
    monthlyPaymentMin: "",
    monthlyPaymentMax: "",
    fixedMonthlyPayment: "",
    oneTimePaymentMin: "",
    payoffPercentage: "",
    payoffDueDate: "",
    settlementPaymentCount: "1",
    settlementPaymentFrequency: "monthly",
    settlementOfferExpiresDate: "",
    payoffText: "",
    customTermsText: "",
    maxTermMonths: "12",
  } as const;

  const [arrangementForm, setArrangementForm] = useState<ArrangementFormState>({ ...emptyArrangementForm });
  const [localSettings, setLocalSettings] = useState<any>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const cardBaseClasses =
    "border border-white/10 bg-white/5 text-blue-50 shadow-lg shadow-blue-900/20 backdrop-blur";
  const inputClasses =
    "border-white/20 bg-white/10 text-white placeholder:text-blue-100/60 focus:border-sky-400/60 focus-visible:ring-sky-400/40";
  const selectTriggerClasses =
    "border-white/20 bg-white/10 text-white placeholder:text-blue-100/60 focus:border-sky-400/60 focus:ring-0 focus-visible:ring-0";
  const textareaClasses =
    "border-white/20 bg-white/10 text-white placeholder:text-blue-100/60 focus:border-sky-400/60 focus-visible:ring-sky-400/40";

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

  const { data: emailUsageStats } = useQuery({
    queryKey: ["/api/email-usage-stats"],
  });

  const quickStatusItems = [
    {
      label: "Portal branding",
      icon: ImageIcon,
      active: Boolean((settings as any)?.customBranding?.logoUrl),
      description: (settings as any)?.customBranding?.logoUrl
        ? "Custom logo in use"
        : "Using default Chain theme",
    },
    {
      label: "Payment plans",
      icon: CreditCard,
      active: localSettings?.showPaymentPlans ?? true,
      description: (localSettings?.showPaymentPlans ?? true)
        ? "Consumers can explore plans"
        : "Hidden from consumers",
    },
    {
      label: "Documents",
      icon: Shield,
      active: localSettings?.showDocuments ?? true,
      description: (localSettings?.showDocuments ?? true)
        ? "Shared with portal users"
        : "Internal only",
    },
    {
      label: "Online payments",
      icon: SettingsIcon,
      active: localSettings?.enableOnlinePayments ?? false,
      description: (localSettings?.enableOnlinePayments ?? false)
        ? "Processing enabled"
        : "Collect offline or by phone",
    },
  ];

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
      setHasUnsavedChanges(false);
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
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error?.message || "Unknown error occurred",
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
    // Filter out businessType for non-admin users
    const settingsToSave = { ...localSettings };
    if (authUser?.role !== 'platform_admin' && settingsToSave.businessType !== undefined) {
      delete settingsToSave.businessType;
    }
    updateSettingsMutation.mutate(settingsToSave);
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
    const balanceTier = arrangementForm.balanceTier;

    if (!name || !balanceTier) {
      toast({
        title: "Missing Information",
        description: "Provide a name and select a balance tier for this plan.",
        variant: "destructive",
      });
      return;
    }

    // Calculate min/max from selected tier
    const { minBalance, maxBalance } = getBalanceRangeFromTier(balanceTier as BalanceTier);

    const payload: any = {
      name,
      description: arrangementForm.description.trim() || undefined,
      balanceTier,
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
    } else if (planType === "settlement") {
      const settlementPercentage = parsePercentageInput(arrangementForm.payoffPercentage);
      const settlementPaymentCount = parseInt(arrangementForm.settlementPaymentCount, 10);
      const settlementPaymentFrequency = arrangementForm.settlementPaymentFrequency.trim();
      const settlementText = arrangementForm.payoffText.trim();

      if (settlementPercentage === null || settlementPercentage <= 0) {
        toast({
          title: "Settlement Percentage Required",
          description: "Enter a valid settlement percentage greater than zero.",
          variant: "destructive",
        });
        return;
      }

      if (settlementPercentage > 10000) {
        toast({
          title: "Invalid Percentage",
          description: "Settlement percentage cannot exceed 100%.",
          variant: "destructive",
        });
        return;
      }

      if (!settlementPaymentCount || settlementPaymentCount < 1) {
        toast({
          title: "Payment Count Required",
          description: "Enter the number of payments allowed (e.g., 1, 3, 6).",
          variant: "destructive",
        });
        return;
      }

      if (!settlementPaymentFrequency) {
        toast({
          title: "Payment Frequency Required",
          description: "Select how often payments will be made.",
          variant: "destructive",
        });
        return;
      }

      payload.payoffPercentageBasisPoints = settlementPercentage;
      payload.settlementPaymentCount = settlementPaymentCount;
      payload.settlementPaymentFrequency = settlementPaymentFrequency;
      payload.settlementOfferExpiresDate = arrangementForm.settlementOfferExpiresDate ? parseDateInput(arrangementForm.settlementOfferExpiresDate) : null;
      payload.payoffText = settlementText || undefined;
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
    } else if (planType === "one_time_payment") {
      const oneTimeMin = parseCurrencyInput(arrangementForm.oneTimePaymentMin);
      if (oneTimeMin === null || oneTimeMin <= 0) {
        toast({
          title: "Minimum Amount Required",
          description: "Enter a valid minimum payment amount for one-time payments.",
          variant: "destructive",
        });
        return;
      }

      payload.oneTimePaymentMin = oneTimeMin;
      payload.maxTermMonths = null;
    }

    createArrangementMutation.mutate(payload);
  };

  return (
    <AdminLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 text-blue-50 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/10 p-8 shadow-2xl shadow-blue-900/30">
          <div className="pointer-events-none absolute -right-16 top-10 h-64 w-64 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-0 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100/80">
                Agency control center
              </span>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">Settings command center</h1>
              <p className="text-sm text-blue-100/70 sm:text-base">
                Configure your portal, payments, and compliance policies from one elevated workspace. Every update saves instantly across the consumer experience.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-blue-100/80">
                  <p className="font-semibold text-white">Unified preferences</p>
                  <p className="mt-1 text-xs text-blue-100/70">
                    Manage branding, portal modules, and operational defaults without leaving the admin.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-blue-100/80">
                  <p className="font-semibold text-white">Compliance ready</p>
                  <p className="mt-1 text-xs text-blue-100/70">
                    Keep consumer disclosures, documents, and legal notices aligned with your policies.
                  </p>
                </div>
              </div>
            </div>

            <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-white/10 p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-100/70">Quick status</p>
              <div className="space-y-3">
                {quickStatusItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-xl border text-sm transition",
                          item.active
                            ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                            : "border-white/10 bg-white/5 text-blue-100/60",
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{item.label}</p>
                        <p className="text-xs text-blue-100/70">{item.description}</p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest",
                        item.active ? "bg-emerald-500/20 text-emerald-100" : "bg-white/5 text-blue-100/60",
                      )}
                    >
                      {item.active ? "On" : "Off"}
                    </span>
                  </div>
                ))}
              </div>
              <Button
                onClick={handleSaveSettings}
                disabled={!hasUnsavedChanges || updateSettingsMutation.isPending}
                className={cn(
                  "w-full rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80",
                  (!hasUnsavedChanges || updateSettingsMutation.isPending) &&
                    "opacity-60 hover:from-sky-500/80 hover:to-indigo-500/80",
                )}
              >
                {updateSettingsMutation.isPending
                  ? "Saving..."
                  : hasUnsavedChanges
                  ? "Save changes"
                  : "All changes saved"}
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-blue-900/20 backdrop-blur">
          <Tabs defaultValue="general" className="space-y-8">
            <TabsList className={cn(
              "grid w-full grid-cols-1 gap-2 p-2 text-blue-100",
              localSettings?.businessType === 'call_center' ? "sm:grid-cols-7" : "sm:grid-cols-6"
            )}>
              <TabsTrigger value="general" className="px-4 py-2">
                General
              </TabsTrigger>
              <TabsTrigger value="merchant" className="px-4 py-2">
                Payment Processing
              </TabsTrigger>
              {localSettings?.businessType === 'call_center' && (
                <TabsTrigger value="smax" className="px-4 py-2">
                  SMAX Integration
                </TabsTrigger>
              )}
              <TabsTrigger value="documents" className="px-4 py-2">
                Documents
              </TabsTrigger>
              <TabsTrigger value="arrangements" className="px-4 py-2">
                Payment Plans
              </TabsTrigger>
              <TabsTrigger value="addons" className="px-4 py-2">
                Add-ons
              </TabsTrigger>
              <TabsTrigger value="privacy" className="px-4 py-2">
                Privacy & Legal
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-6">
              <Card className={cardBaseClasses}>
                <CardHeader className="space-y-1 text-white">
                  <CardTitle className="text-xl font-semibold text-white">Consumer Portal Settings</CardTitle>
                  <p className="text-sm text-blue-100/70">
                    Configure branding, portal modules, and consumer-facing functionality.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6 text-sm text-blue-100/80">
                  {/* Business Type Selection - Global Admins Only */}
                  {authUser?.role === 'platform_admin' && (
                    <div className="space-y-4 border-b border-white/10 pb-6">
                      <div>
                        <Label className="text-base font-medium text-white">Business Type</Label>
                        <p className="text-sm text-blue-100/70">
                          Select your business type to customize available features and subscription plans
                        </p>
                      </div>
                      <Select
                        value={localSettings?.businessType || 'call_center'}
                        onValueChange={(value) => handleSettingsUpdate('businessType', value)}
                      >
                        <SelectTrigger className={selectTriggerClasses} data-testid="select-business-type">
                          <SelectValue placeholder="Select business type" />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#0f172a] text-blue-50">
                          <SelectItem value="call_center">Call Center / Debt Collection</SelectItem>
                          <SelectItem value="property_management">Property Management</SelectItem>
                          <SelectItem value="subscription_provider">Subscription Provider</SelectItem>
                          <SelectItem value="freelancer_consultant">Freelancer / Consultant</SelectItem>
                          <SelectItem value="billing_service">Billing / Service Company</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3">
                        <p className="text-xs text-amber-200">
                          <strong>Note:</strong> Changing your business type will update available subscription plans and features. SMAX integration is only available for Call Centers.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Custom Agency URL Section */}
                  <div className="space-y-4 border-b pb-6">
                    <div>
                      <Label className="text-base font-medium text-white">Your Custom Consumer URL</Label>
                      <p className="text-sm text-blue-100/70">
                        Share this link with consumers to give them direct access to your agency's portal
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {(() => {
                        // Check if user data is still loading
                        if (authLoading || userLoading) {
                          return (
                            <div className="text-sm text-blue-100/70">
                              Loading agency information...
                            </div>
                          );
                        }

                        // Use authUser first, then userData as fallback
                        const user = userData || authUser;

                        const renderUrl = (agencyUrl: string) => (
                          <>
                            <Input
                              readOnly
                              value={agencyUrl}
                              className={`${inputClasses} flex-1 font-mono text-sm`}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-white/20 bg-white/5 text-blue-50 hover:bg-white/10"
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
                              className="border-white/20 bg-white/5 text-blue-50 hover:bg-white/10"
                              onClick={() => {
                                window.open(agencyUrl, '_blank');
                              }}
                              data-testid="button-preview-url"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </>
                        );

                        // Check if there was an error loading user data
                        if (!user) {
                          // Try to get agency slug from the current URL as fallback
                          const pathSegments = window.location.pathname.split('/');
                          let fallbackSlug: string | null = null;

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
                            const agencyUrl = `${window.location.origin}/agency/${fallbackSlug}`;

                            return renderUrl(agencyUrl);
                          }

                          return (
                            <div className="text-sm text-blue-100/70">
                              Unable to load agency information. Please try refreshing the page.
                            </div>
                          );
                        }

                        // Handle both JWT and Replit auth structures
                        let agencySlug: string | null = null;

                        if ((user as any)?.isJwtAuth) {
                          // JWT auth - tenant info is directly on user
                          // Check both tenantSlug and tenant.slug
                          agencySlug = (user as any)?.tenantSlug || (user as any)?.tenant?.slug || null;
                        } else if ((user as any)?.platformUser) {
                          // Replit auth - tenant info is under platformUser
                          agencySlug = (user as any)?.platformUser?.tenant?.slug || null;
                        }

                        if (!agencySlug) {
                          // Try fallback approach if no slug found
                          const storedContext = sessionStorage.getItem('agencyContext');
                          if (storedContext) {
                            try {
                              const parsed = JSON.parse(storedContext);
                              agencySlug = parsed.slug || null;
                            } catch (e) {}
                          }
                        }

                        let agencyUrl = "";

                        if (agencySlug) {
                          // Use subdomain-based routing for agency URLs
                          agencyUrl = `https://${agencySlug}.chainsoftwaregroup.com`;
                        }

                        if (!agencySlug) {
                          // Try fallback approach if no slug found
                          const storedContext = sessionStorage.getItem("agencyContext");
                          if (storedContext) {
                            try {
                              const parsed = JSON.parse(storedContext);
                              agencySlug = parsed.slug || null;
                              if (agencySlug) {
                                agencyUrl = `${window.location.origin}/agency/${agencySlug}`;
                              }
                            } catch (e) {}
                          }

                          if (!agencySlug) {
                            return (
                              <div className="text-sm text-blue-100/70">
                                Agency information not available. Please ensure you're logged in to an agency account.
                              </div>
                            );
                          }
                        }

                        return renderUrl(agencyUrl);
                      })()}
                    </div>
                    <p className="text-xs text-blue-100/70">
                      This link takes consumers directly to a branded page for your agency where they can sign in or create an account.
                    </p>
                  </div>

                  {/* Logo Upload Section */}
                  <div className="space-y-4 border-b pb-6">
                    <div>
                      <Label className="text-base font-medium text-white">Company Logo</Label>
                      <p className="text-sm text-blue-100/70">
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
                            className="h-16 w-16 rounded-md border border-white/10 bg-white/10 object-contain"
                          />
                        </div>
                      )}
                      
                      {/* Upload Button */}
                      <div className="flex-1">
                        <Input
                          type="file"
                          accept="image/*"
                          className={`${inputClasses} mb-2 file:text-white`}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              uploadLogoMutation.mutate(file);
                            }
                          }}
                          disabled={uploadLogoMutation.isPending}
                        />
                        <p className="text-xs text-blue-100/70">
                          Supported formats: PNG, JPG, GIF. Maximum size: 5MB. Recommended: 200x200px
                        </p>
                      </div>
                    </div>
                    
                    {uploadLogoMutation.isPending && (
                      <div className="flex items-center text-sm text-sky-200">
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-sky-200"></div>
                        Uploading logo...
                      </div>
                    )}
                  </div>

                  {/* Landing Page Customization Section */}
                  <div className="space-y-4 border-b pb-6">
                    <div>
                      <Label className="text-base font-medium text-white">Landing Page Welcome Message</Label>
                      <p className="text-sm text-blue-100/70">
                        Customize the greeting consumers see when they visit your agency portal
                      </p>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="landing-headline">Main Headline</Label>
                        <Input
                          id="landing-headline"
                          placeholder={`${(authUser as any)?.platformUser?.tenant?.name || 'Your Agency'} gives you a smarter way to stay current`}
                          value={(localSettings?.customBranding as any)?.landingPageHeadline || ''}
                          onChange={(e) => {
                            const customBranding = (localSettings?.customBranding as any) || {};
                            handleSettingsUpdate('customBranding', {
                              ...customBranding,
                              landingPageHeadline: e.target.value
                            });
                          }}
                          className={inputClasses}
                        />
                        <p className="text-xs text-blue-100/70 mt-1">
                          Leave blank to use the default message
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="landing-subheadline">Subheadline</Label>
                        <Textarea
                          id="landing-subheadline"
                          placeholder="Access your secure portal to review balances, explore payment plans, and stay in control every step of the way. Available 24/7 from any device."
                          value={(localSettings?.customBranding as any)?.landingPageSubheadline || ''}
                          onChange={(e) => {
                            const customBranding = (localSettings?.customBranding as any) || {};
                            handleSettingsUpdate('customBranding', {
                              ...customBranding,
                              landingPageSubheadline: e.target.value
                            });
                          }}
                          className={textareaClasses}
                          rows={3}
                        />
                        <p className="text-xs text-blue-100/70 mt-1">
                          Leave blank to use the default message
                        </p>
                      </div>
                      
                      <div>
                        <Label htmlFor="landing-page-url">Custom Landing Page URL (Optional)</Label>
                        <Input
                          id="landing-page-url"
                          type="url"
                          placeholder="https://yourcompany.com/portal"
                          value={(localSettings?.customBranding as any)?.customLandingPageUrl || ''}
                          onChange={(e) => {
                            const url = e.target.value;
                            const customBranding = (localSettings?.customBranding as any) || {};
                            handleSettingsUpdate('customBranding', {
                              ...customBranding,
                              customLandingPageUrl: url
                            });
                          }}
                          className={inputClasses}
                          data-testid="input-custom-landing-page-url"
                        />
                        {(localSettings?.customBranding as any)?.customLandingPageUrl && 
                         !(localSettings?.customBranding as any)?.customLandingPageUrl.startsWith('http://') &&
                         !(localSettings?.customBranding as any)?.customLandingPageUrl.startsWith('https://') && (
                          <p className="text-xs text-red-400 mt-1">
                            ⚠️ URL must start with http:// or https://
                          </p>
                        )}
                        <p className="text-xs text-blue-100/70 mt-1">
                          If provided, consumers will be redirected to this external URL instead of the built-in portal. Must start with http:// or https://
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Show Payment Plans</Label>
                      <p className="text-sm text-blue-100/70">
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
                      <p className="text-sm text-blue-100/70">
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
                      <p className="text-sm text-blue-100/70">
                        Let consumers request settlement options
                      </p>
                    </div>
                    <Switch
                      checked={localSettings?.allowSettlementRequests ?? true}
                      onCheckedChange={(checked) => handleSettingsUpdate('allowSettlementRequests', checked)}
                    />
                  </div>
                  
                  {/* Blocked Account Statuses */}
                  <div className="space-y-4 border-t border-white/10 pt-6 mt-6">
                    <div>
                      <Label className="text-base font-medium text-white">Blocked Account Statuses</Label>
                      <p className="text-sm text-blue-100/70">
                        Select which account statuses should prevent communications and payments
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {['inactive', 'recalled', 'closed', 'pending', 'suspended'].map((status) => {
                        const isSelected = (localSettings?.blockedAccountStatuses || ['inactive', 'recalled', 'closed']).includes(status);
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => {
                              const current = localSettings?.blockedAccountStatuses || ['inactive', 'recalled', 'closed'];
                              const updated = isSelected
                                ? current.filter((s: string) => s !== status)
                                : [...current, status];
                              handleSettingsUpdate('blockedAccountStatuses', updated);
                            }}
                            className={cn(
                              "rounded-lg border px-4 py-2 text-sm font-medium transition-all",
                              isSelected
                                ? "border-sky-500 bg-sky-500/20 text-sky-300"
                                : "border-white/20 bg-white/5 text-blue-100/60 hover:border-white/30 hover:bg-white/10"
                            )}
                            data-testid={`button-blocked-status-${status}`}
                          >
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-blue-100/60">
                      Accounts with these statuses will not receive emails, SMS, or accept payments
                    </p>
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

              {/* Email Settings Card */}
              <Card className={cardBaseClasses}>
                <CardHeader className="space-y-1 text-white">
                  <CardTitle className="text-xl font-semibold text-white">Email Settings</CardTitle>
                  <p className="text-sm text-blue-100/70">
                    Configure your email sender address and preferences
                  </p>
                </CardHeader>
                <CardContent className="space-y-6 text-sm text-blue-100/80">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-base font-medium text-white">Custom Sender Email</Label>
                      <p className="text-sm text-blue-100/70 mb-2">
                        Set a custom sender email address for outgoing emails. If not set, emails will be sent from {(authUser as any)?.platformUser?.tenant?.slug || 'your-agency'}@chainsoftwaregroup.com
                      </p>
                      <Input
                        type="email"
                        placeholder="noreply@youragency.com"
                        value={localSettings?.customSenderEmail || ''}
                        onChange={(e) => handleSettingsUpdate('customSenderEmail', e.target.value)}
                        className={inputClasses}
                        data-testid="input-custom-sender-email"
                      />
                      <p className="text-xs text-blue-100/60 mt-2">
                        Note: Custom sender email must be verified in Postmark before it can be used
                      </p>
                    </div>
                  </div>
                </CardContent>
                {hasUnsavedChanges && (
                  <CardFooter>
                    <Button 
                      onClick={handleSaveSettings} 
                      disabled={updateSettingsMutation.isPending}
                      className="ml-auto"
                      data-testid="button-save-email-settings"
                    >
                      {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </CardFooter>
                )}
              </Card>

              {/* Email Usage Stats Card */}
              <Card className={cardBaseClasses}>
                <CardHeader className="space-y-1 text-white">
                  <CardTitle className="text-xl font-semibold text-white">Email Usage Statistics</CardTitle>
                  <p className="text-sm text-blue-100/70">
                    Track your email sending activity and delivery metrics
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {emailUsageStats ? (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="text-2xl font-bold text-white">{(emailUsageStats as any).total || 0}</div>
                        <div className="text-sm text-blue-100/70">Total Sent</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="text-2xl font-bold text-green-400">{(emailUsageStats as any).delivered || 0}</div>
                        <div className="text-sm text-blue-100/70">Delivered</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="text-2xl font-bold text-sky-400">{(emailUsageStats as any).opened || 0}</div>
                        <div className="text-sm text-blue-100/70">Opened</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="text-2xl font-bold text-yellow-400">{(emailUsageStats as any).bounced || 0}</div>
                        <div className="text-sm text-blue-100/70">Bounced</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="text-2xl font-bold text-red-400">{(emailUsageStats as any).complained || 0}</div>
                        <div className="text-sm text-blue-100/70">Complained</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="text-2xl font-bold text-blue-400">
                          {(emailUsageStats as any).total > 0 
                            ? `${Math.round(((emailUsageStats as any).opened / (emailUsageStats as any).total) * 100)}%` 
                            : '0%'}
                        </div>
                        <div className="text-sm text-blue-100/70">Open Rate</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-blue-100/70 py-8">Loading email statistics...</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="merchant" className="space-y-6">
              <Card className={cardBaseClasses}>
                <CardHeader className="space-y-1 text-white">
                  <CardTitle className="text-xl font-semibold text-white">Payment Processing Settings</CardTitle>
                  <p className="text-sm text-blue-100/70">
                    Configure your merchant account to accept payments from consumers.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6 text-sm text-blue-100/80">
                  {/* Merchant Account Status */}
                  <div className="rounded-xl border border-white/10 bg-white/10 p-4">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <i className="fas fa-credit-card text-sky-300 text-lg"></i>
                      </div>
                      <div className="flex-1">
                        <h3 className="mb-1 text-sm font-semibold text-white">
                          Payment Processing Status
                        </h3>
                        <p className="text-sm text-blue-100/70">
                          {localSettings?.enableOnlinePayments ?
                            "✓ Online payments are active. Consumers can make payments through their portal." :
                            localSettings?.merchantApiKey && localSettings?.merchantApiPin ?
                            "⚠️ Credentials configured but online payments are disabled. Toggle 'Enable Online Payments' below to activate." :
                            "No payment credentials configured. Set up USAePay credentials and enable online payments."
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Merchant Account Configuration */}
                  <div className="space-y-4">
                      <div>
                        <Label className="text-white">Merchant Provider</Label>
                        <Input
                          value={localSettings?.merchantProvider || ""}
                          onChange={(e) => handleSettingsUpdate('merchantProvider', e.target.value)}
                          placeholder="e.g., Stripe, Square, PayPal"
                          data-testid="input-merchant-provider"
                          className={inputClasses}
                        />
                      </div>

                      <div>
                        <Label className="text-white">Merchant Account ID</Label>
                        <Input
                          value={localSettings?.merchantAccountId || ""}
                          onChange={(e) => handleSettingsUpdate('merchantAccountId', e.target.value)}
                          placeholder="Your merchant account identifier"
                          data-testid="input-merchant-id"
                          className={inputClasses}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-white">API Key</Label>
                          <Input
                            type="password"
                            value={localSettings?.merchantApiKey || ""}
                            onChange={(e) => handleSettingsUpdate('merchantApiKey', e.target.value)}
                            placeholder="Your USAePay API key"
                            data-testid="input-merchant-key"
                            className={inputClasses}
                          />
                        </div>
                        <div>
                          <Label className="text-white">API PIN</Label>
                          <Input
                            type="password"
                            value={localSettings?.merchantApiPin || ""}
                            onChange={(e) => handleSettingsUpdate('merchantApiPin', e.target.value)}
                            placeholder="Your USAePay API PIN"
                            data-testid="input-merchant-pin"
                            className={inputClasses}
                          />
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-blue-100/70">
                        Your credentials are encrypted and stored securely
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-white">Merchant Name</Label>
                          <Input
                            value={localSettings?.merchantName || ""}
                            onChange={(e) => handleSettingsUpdate('merchantName', e.target.value)}
                            placeholder="Name displayed on receipts"
                            data-testid="input-merchant-name"
                            className={inputClasses}
                          />
                        </div>
                        <div>
                          <Label className="text-white">Merchant Type</Label>
                          <Input
                            value={localSettings?.merchantType || ""}
                            onChange={(e) => handleSettingsUpdate('merchantType', e.target.value)}
                            placeholder="e.g., retail, services"
                            data-testid="input-merchant-type"
                            className={inputClasses}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4">
                        <div className="space-y-0.5">
                          <Label className="text-white">Use Sandbox Mode</Label>
                          <p className="text-sm text-blue-100/70">
                            Test payments without charging real cards
                          </p>
                        </div>
                        <Switch
                          checked={localSettings?.useSandbox ?? true}
                          onCheckedChange={(checked) => handleSettingsUpdate('useSandbox', checked)}
                          data-testid="switch-sandbox-mode"
                        />
                      </div>

                      <div className="border-t border-white/10 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const response = await apiRequest("POST", "/api/usaepay/test-connection");
                              const result = await response.json();
                              
                              if (result.success) {
                                toast({
                                  title: "Connection Successful",
                                  description: "USAePay credentials are valid and working.",
                                });
                              } else {
                                toast({
                                  title: "Connection Failed",
                                  description: result.message || "Unable to connect to USAePay. Please check your credentials.",
                                  variant: "destructive",
                                });
                              }
                            } catch (err: any) {
                              toast({
                                title: "Connection Error",
                                description: "Failed to test USAePay connection. Please try again.",
                                variant: "destructive",
                              });
                            }
                          }}
                          data-testid="button-test-connection"
                          className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10"
                        >
                          <i className="fas fa-plug mr-2"></i>
                          Test USAePay Connection
                        </Button>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/10 pt-4">
                        <div className="space-y-0.5">
                          <Label className="text-white">Enable Online Payments</Label>
                          <p className="text-sm text-blue-100/70">
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
                </CardContent>
                {hasUnsavedChanges && (
                  <CardFooter className="border-t border-white/10 pt-6">
                    <Button
                      onClick={handleSaveSettings}
                      disabled={updateSettingsMutation.isPending}
                      className={cn(
                        "ml-auto rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80",
                        updateSettingsMutation.isPending && "opacity-60",
                      )}
                    >
                      {updateSettingsMutation.isPending ? "Saving..." : "Save changes"}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </TabsContent>

            {localSettings?.businessType === 'call_center' && (
              <TabsContent value="smax" className="space-y-6">
                <Card className={cardBaseClasses}>
                <CardHeader className="space-y-1 text-white">
                  <CardTitle className="text-xl font-semibold text-white">SMAX Collection Software Integration</CardTitle>
                  <p className="text-sm text-blue-100/70">
                    Sync payment and communication data with your SMAX collection system in real-time.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6 text-sm text-blue-100/80">
                  {/* Enable SMAX Toggle */}
                  <div className="flex items-center justify-between space-x-4 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex-1">
                      <Label className="text-base font-medium text-white">Enable SMAX Integration</Label>
                      <p className="text-sm text-blue-100/70">
                        Automatically sync payments, email opens, and collection attempts with SMAX
                      </p>
                    </div>
                    <Switch
                      checked={localSettings?.smaxEnabled || false}
                      onCheckedChange={(checked) => handleSettingsUpdate('smaxEnabled', checked)}
                      data-testid="switch-smax-enabled"
                    />
                  </div>

                  {/* SMAX Configuration Fields */}
                  {localSettings?.smaxEnabled && (
                    <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="space-y-2">
                        <Label className="text-white">SMAX API Key</Label>
                        <Input
                          type="text"
                          value={localSettings?.smaxApiKey || ""}
                          onChange={(e) => handleSettingsUpdate('smaxApiKey', e.target.value)}
                          placeholder="Enter your SMAX API key"
                          className={inputClasses}
                          data-testid="input-smax-api-key"
                        />
                        <p className="text-xs text-blue-100/60">
                          Your SMAX API key from the SMAX admin panel
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-white">SMAX PIN</Label>
                        <Input
                          type="password"
                          value={localSettings?.smaxPin || ""}
                          onChange={(e) => handleSettingsUpdate('smaxPin', e.target.value)}
                          placeholder="Enter your SMAX PIN"
                          className={inputClasses}
                          data-testid="input-smax-pin"
                        />
                        <p className="text-xs text-blue-100/60">
                          Your SMAX PIN for API authentication
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-white">SMAX Base URL (Optional)</Label>
                        <Input
                          type="text"
                          value={localSettings?.smaxBaseUrl || "https://api.smaxcollectionsoftware.com:8000"}
                          onChange={(e) => handleSettingsUpdate('smaxBaseUrl', e.target.value)}
                          placeholder="https://api.smaxcollectionsoftware.com:8000"
                          className={inputClasses}
                          data-testid="input-smax-base-url"
                        />
                        <p className="text-xs text-blue-100/60">
                          Leave default unless using a custom SMAX instance
                        </p>
                      </div>

                      {/* Test Connection Button */}
                      <div className="pt-4">
                        <Button
                          onClick={async () => {
                            const REDACTED_VALUE = "••••••••";
                            const apiKeyInput = localSettings?.smaxApiKey?.trim();
                            const pinInput = localSettings?.smaxPin?.trim();
                            const baseUrl = localSettings?.smaxBaseUrl?.trim();

                            const useStoredApiKey = apiKeyInput === REDACTED_VALUE;
                            const useStoredPin = pinInput === REDACTED_VALUE;

                            if (!useStoredApiKey && !apiKeyInput) {
                              toast({
                                title: "Missing Credentials",
                                description: "Please enter your SMAX API key before testing.",
                                variant: "destructive",
                              });
                              return;
                            }

                            if (!useStoredPin && !pinInput) {
                              toast({
                                title: "Missing Credentials",
                                description: "Please enter your SMAX PIN before testing.",
                                variant: "destructive",
                              });
                              return;
                            }

                            try {
                              const response = await apiRequest("POST", "/api/settings/test-smax", {
                                smaxEnabled: localSettings?.smaxEnabled ?? false,
                                smaxApiKey: useStoredApiKey ? undefined : apiKeyInput,
                                smaxPin: useStoredPin ? undefined : pinInput,
                                smaxBaseUrl: baseUrl || undefined,
                              });
                              const result = await response.json();

                              if (result.success) {
                                toast({
                                  title: "Connection Successful",
                                  description: "Successfully connected to SMAX API",
                                });
                              } else {
                                toast({
                                  title: "Connection Failed",
                                  description: result.error || "Failed to connect to SMAX API",
                                  variant: "destructive",
                                });
                              }
                            } catch (error: any) {
                              toast({
                                title: "Connection Error",
                                description: error.message || "Failed to test SMAX connection",
                                variant: "destructive",
                              });
                            }
                          }}
                          className="rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80"
                          data-testid="button-test-smax"
                        >
                          Test Connection
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* SMAX Features Info */}
                  <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-base font-medium text-white">What gets synced to SMAX?</h3>
                    <ul className="space-y-2 text-sm text-blue-100/70">
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Payment attempts and transactions (success/failure status)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Email opens and communication tracking</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Collection attempt notes and consumer interactions</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Account updates and status changes</span>
                      </li>
                    </ul>
                  </div>
                </CardContent>
                {hasUnsavedChanges && (
                  <CardFooter className="border-t border-white/10 pt-6">
                    <Button
                      onClick={handleSaveSettings}
                      disabled={updateSettingsMutation.isPending}
                      className={cn(
                        "ml-auto rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80",
                        updateSettingsMutation.isPending && "opacity-60",
                      )}
                    >
                      {updateSettingsMutation.isPending ? "Saving..." : "Save changes"}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </TabsContent>
            )}

            <TabsContent value="documents" className="space-y-6">
              <Card className={cardBaseClasses}>
                <CardHeader className="text-white">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-xl font-semibold text-white">Document Management</CardTitle>
                      <p className="text-sm text-blue-100/70">
                        Control access to statements, disclosures, and supporting documents.
                      </p>
                    </div>
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
                        <Button className="rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80">
                          <i className="fas fa-plus mr-2"></i>
                          Add Document
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="border-white/10 bg-[#0f172a] text-blue-50 sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle className="text-lg font-semibold text-white">Upload Document</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label className="text-white">Title *</Label>
                            <Input
                              value={documentForm.title}
                              onChange={(e) => setDocumentForm({...documentForm, title: e.target.value})}
                              placeholder="Document title"
                              className={inputClasses}
                            />
                          </div>

                          <div>
                            <Label className="text-white">Description</Label>
                            <Textarea
                              value={documentForm.description}
                              onChange={(e) => setDocumentForm({...documentForm, description: e.target.value})}
                              placeholder="Optional description"
                              className={textareaClasses}
                            />
                          </div>

                          <div>
                            <Label className="text-white">File *</Label>
                            <Input
                              type="file"
                              onChange={handleDocumentUpload}
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              className={`${inputClasses} file:text-white`}
                            />
                          </div>

                          {!documentForm.isPublic && (
                            <div>
                              <Label className="text-white">Account *</Label>
                              <Select
                                value={documentForm.accountId}
                                onValueChange={(value) => setDocumentForm({ ...documentForm, accountId: value })}
                                disabled={accountsLoading || !Array.isArray(accounts) || (accounts as any)?.length === 0}
                              >
                                <SelectTrigger className={selectTriggerClasses}>
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
                                <p className="mt-1 text-xs text-blue-100/70">
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
                            <Label htmlFor="public" className="text-blue-100/80">Share with all consumers</Label>
                          </div>

                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setShowDocumentModal(false);
                                setDocumentForm({ ...emptyDocumentForm });
                              }}
                              className="border-white/20 bg-white/5 text-blue-50 transition hover:bg-white/10"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={handleSubmitDocument}
                              className="rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80"
                            >
                              Upload Document
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-blue-100/80">
                  {documentsLoading ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-blue-100/70">
                      Loading documents...
                    </div>
                  ) : (documents as any)?.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 py-10 text-center text-blue-100/70">
                      No documents uploaded yet. Add documents for consumers to access.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(documents as any)?.map((document: any) => (
                        <div
                          key={document.id}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10">
                              <i className="fas fa-file-alt text-sky-300 text-lg"></i>
                            </div>
                            <div className="space-y-1">
                              <h3 className="text-base font-semibold text-white">{document.title}</h3>
                              <p className="text-xs text-blue-100/70">{document.description}</p>
                              <div className="text-xs text-blue-100/60">
                                {document.fileName} • {(document.fileSize / 1024).toFixed(1)} KB
                              </div>
                              <div className="text-xs text-blue-100/60">
                                {(() => {
                                  if (document.isPublic) {
                                    return <span className="text-emerald-200">Shared with all consumers</span>;
                                  }

                                  if (!document.account) {
                                    return <span className="text-amber-200">Account association missing</span>;
                                  }

                                  const consumerName = document.account.consumer
                                    ? [document.account.consumer.firstName, document.account.consumer.lastName]
                                        .filter(Boolean)
                                        .join(" ")
                                        .trim()
                                    : "";

                                  return (
                                    <span className="text-blue-100/70">
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
                                className="rounded-xl border border-transparent px-3 py-1 text-red-300 transition hover:border-red-300/40 hover:bg-red-500/10 hover:text-red-200"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="border-white/10 bg-[#0f172a] text-blue-50">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-lg font-semibold text-white">Delete document?</AlertDialogTitle>
                                <AlertDialogDescription className="text-sm text-blue-100/70">
                                  This action cannot be undone. The document "{document.title}" will no longer be available to
                                  consumers.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl border-white/20 bg-white/5 px-4 py-2 text-blue-50 transition hover:bg-white/10">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction asChild>
                                  <Button
                                    variant="destructive"
                                    onClick={() => deleteDocumentMutation.mutate(document.id)}
                                    disabled={deleteDocumentMutation.isPending}
                                    className="rounded-xl bg-red-600/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-900/30 transition hover:bg-red-500/80"
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

            <TabsContent value="arrangements" className="space-y-6">
              {/* Minimum Monthly Payment */}
              <Card className={cardBaseClasses}>
                <CardHeader className="text-white">
                  <CardTitle className="text-xl font-semibold text-white">Arrangement Settings</CardTitle>
                  <p className="text-sm text-blue-100/70">
                    Configure global settings that apply to all payment arrangements
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-blue-100/80">
                  <div className="space-y-2">
                    <Label htmlFor="minimumMonthlyPayment" className="text-base font-medium text-white">Minimum Monthly Payment Amount</Label>
                    <p className="text-sm text-blue-100/70">
                      The minimum monthly payment amount for payment arrangements (applies to all accounts)
                    </p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-100/60">$</span>
                      <Input
                        id="minimumMonthlyPayment"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="50.00"
                        value={localSettings?.minimumMonthlyPayment ? (localSettings.minimumMonthlyPayment / 100).toFixed(2) : ''}
                        onChange={(e) => {
                          const dollars = parseFloat(e.target.value) || 0;
                          const cents = Math.round(dollars * 100);
                          handleSettingsUpdate('minimumMonthlyPayment', cents);
                        }}
                        className={cn(inputClasses, "pl-8")}
                        data-testid="input-minimum-monthly-payment"
                      />
                    </div>
                  </div>
                </CardContent>
                {hasUnsavedChanges && (
                  <CardFooter className="border-t border-white/10 pt-6">
                    <Button
                      onClick={handleSaveSettings}
                      disabled={updateSettingsMutation.isPending}
                      className={cn(
                        "ml-auto rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80",
                        updateSettingsMutation.isPending && "opacity-60",
                      )}
                    >
                      {updateSettingsMutation.isPending ? "Saving..." : "Save changes"}
                    </Button>
                  </CardFooter>
                )}
              </Card>

              {/* Payment Arrangement Options */}
              <Card className={cardBaseClasses}>
                <CardHeader className="text-white">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-xl font-semibold text-white">Payment Arrangement Options</CardTitle>
                      <p className="text-sm text-blue-100/70">
                        Define structured plans that consumers can enroll in from their portal.
                      </p>
                    </div>
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
                        <Button className="rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80">
                          <i className="fas fa-plus mr-2"></i>
                          Add Arrangement
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg border-white/10 bg-[#0f172a] text-blue-50">
                        <DialogHeader>
                          <DialogTitle className="text-lg font-semibold text-white">Create Payment Arrangement</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label className="text-white">Plan Name *</Label>
                            <Input
                              value={arrangementForm.name}
                              onChange={(e) => setArrangementForm({...arrangementForm, name: e.target.value})}
                              placeholder="e.g., Standard Payment Plan"
                              className={inputClasses}
                            />
                          </div>

                          <div>
                            <Label className="text-white">Description</Label>
                            <Textarea
                              value={arrangementForm.description}
                              onChange={(e) => setArrangementForm({...arrangementForm, description: e.target.value})}
                              placeholder="Optional description"
                              className={textareaClasses}
                            />
                          </div>

                          <div>
                            <Label className="text-white">Balance Tier *</Label>
                            <Select
                              value={arrangementForm.balanceTier}
                              onValueChange={(value) => setArrangementForm({ ...arrangementForm, balanceTier: value as ArrangementFormState["balanceTier"] })}
                            >
                              <SelectTrigger className={selectTriggerClasses} data-testid="select-balance-tier">
                                <SelectValue placeholder="Select balance tier" />
                              </SelectTrigger>
                              <SelectContent>
                                {balanceTiers.map((tier) => (
                                  <SelectItem key={tier} value={tier} data-testid={`option-tier-${tier}`}>
                                    {getBalanceTierLabel(tier)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="text-white">Plan Type *</Label>
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
                              <SelectTrigger className={selectTriggerClasses}>
                                <SelectValue placeholder="Select plan type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="range">Monthly range (legacy)</SelectItem>
                                <SelectItem value="fixed_monthly">Fixed monthly amount</SelectItem>
                                <SelectItem value="pay_in_full">Pay in full</SelectItem>
                                <SelectItem value="settlement">Settlement (% of balance)</SelectItem>
                                <SelectItem value="custom_terms">Custom terms copy</SelectItem>
                                <SelectItem value="one_time_payment">One-time payment</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {arrangementForm.planType === "range" && (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label className="text-white">Min Payment ($) *</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={arrangementForm.monthlyPaymentMin}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, monthlyPaymentMin: e.target.value })}
                                  placeholder="50.00"
                                  className={inputClasses}
                                />
                              </div>
                              <div>
                                <Label className="text-white">Max Payment ($) *</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={arrangementForm.monthlyPaymentMax}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, monthlyPaymentMax: e.target.value })}
                                  placeholder="100.00"
                                  className={inputClasses}
                                />
                              </div>
                            </div>
                          )}

                          {arrangementForm.planType === "fixed_monthly" && (
                            <div>
                              <Label className="text-white">Monthly Payment ($) *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={arrangementForm.fixedMonthlyPayment}
                                onChange={(e) => setArrangementForm({ ...arrangementForm, fixedMonthlyPayment: e.target.value })}
                                placeholder="150.00"
                                className={inputClasses}
                              />
                            </div>
                          )}

                          {arrangementForm.planType === "pay_in_full" && (
                            <div className="space-y-4">
                              <div>
                                <Label className="text-white">Payoff Percentage (%) *</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="100"
                                  value={arrangementForm.payoffPercentage}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, payoffPercentage: e.target.value })}
                                  placeholder="50"
                                  className={inputClasses}
                                />
                                <p className="mt-1 text-xs text-blue-100/70">
                                  Enter the portion of the outstanding balance the consumer must pay.
                                </p>
                              </div>
                              <div>
                                <Label className="text-white">Payoff Due Date *</Label>
                                <Input
                                  type="date"
                                  value={arrangementForm.payoffDueDate}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, payoffDueDate: e.target.value })}
                                  className={inputClasses}
                                />
                              </div>
                              <div>
                                <Label className="text-white">Additional Notes</Label>
                                <Textarea
                                  value={arrangementForm.payoffText}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, payoffText: e.target.value })}
                                  placeholder="Describe any additional payoff instructions"
                                  className={textareaClasses}
                                />
                              </div>
                            </div>
                          )}

                          {arrangementForm.planType === "settlement" && (
                            <div className="space-y-4">
                              <div>
                                <Label className="text-white">Settlement Percentage (%) *</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="100"
                                  value={arrangementForm.payoffPercentage}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, payoffPercentage: e.target.value })}
                                  placeholder="60"
                                  className={inputClasses}
                                  data-testid="input-settlement-percentage"
                                />
                                <p className="mt-1 text-xs text-blue-100/70">
                                  Enter the percentage of balance required to settle this debt (e.g., 60% means consumer pays 60% of their balance).
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-white">Number of Payments *</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={arrangementForm.settlementPaymentCount}
                                    onChange={(e) => setArrangementForm({ ...arrangementForm, settlementPaymentCount: e.target.value })}
                                    placeholder="3"
                                    className={inputClasses}
                                    data-testid="input-settlement-payment-count"
                                  />
                                  <p className="mt-1 text-xs text-blue-100/70">
                                    How many payments allowed
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-white">Payment Frequency *</Label>
                                  <Select
                                    value={arrangementForm.settlementPaymentFrequency}
                                    onValueChange={(value) => setArrangementForm({ ...arrangementForm, settlementPaymentFrequency: value })}
                                  >
                                    <SelectTrigger className={selectTriggerClasses} data-testid="select-settlement-frequency">
                                      <SelectValue placeholder="Select frequency" />
                                    </SelectTrigger>
                                    <SelectContent className="border-white/10 bg-[#0f172a] text-blue-50">
                                      <SelectItem value="weekly">Weekly</SelectItem>
                                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                                      <SelectItem value="monthly">Monthly</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <p className="mt-1 text-xs text-blue-100/70">
                                    How often payments occur
                                  </p>
                                </div>
                              </div>
                              <div>
                                <Label className="text-white">Settlement Offer Expires (Optional)</Label>
                                <Input
                                  type="date"
                                  value={arrangementForm.settlementOfferExpiresDate}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, settlementOfferExpiresDate: e.target.value })}
                                  className={inputClasses}
                                  data-testid="input-settlement-expires-date"
                                />
                                <p className="mt-1 text-xs text-blue-100/70">
                                  Leave blank for indefinite availability. If set, consumers can only accept this settlement before this date.
                                </p>
                              </div>
                              <div>
                                <Label className="text-white">Settlement Terms</Label>
                                <Textarea
                                  value={arrangementForm.payoffText}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, payoffText: e.target.value })}
                                  placeholder="Describe settlement terms and conditions"
                                  className={textareaClasses}
                                  data-testid="textarea-settlement-terms"
                                />
                              </div>
                            </div>
                          )}

                          {arrangementForm.planType === "custom_terms" && (
                            <div>
                              <Label className="text-white">Custom Terms Copy *</Label>
                              <Textarea
                                value={arrangementForm.customTermsText}
                                onChange={(e) => setArrangementForm({ ...arrangementForm, customTermsText: e.target.value })}
                                placeholder="Enter the custom terms consumers should see"
                                className={textareaClasses}
                              />
                            </div>
                          )}

                          {arrangementForm.planType === "one_time_payment" && (
                            <div>
                              <Label className="text-white">Minimum Payment Amount ($) *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={arrangementForm.oneTimePaymentMin}
                                onChange={(e) => setArrangementForm({ ...arrangementForm, oneTimePaymentMin: e.target.value })}
                                placeholder="25.00"
                                className={inputClasses}
                              />
                              <p className="mt-1 text-xs text-blue-100/70">
                                Minimum amount required for a one-time payment. Customers can pay any amount equal to or greater than this minimum.
                              </p>
                            </div>
                          )}

                          {(arrangementForm.planType === "range" || arrangementForm.planType === "fixed_monthly") && (
                            <div>
                              <Label className="text-white">Max Term (Months)</Label>
                              <Select
                                value={arrangementForm.maxTermMonths}
                                onValueChange={(value) => setArrangementForm({ ...arrangementForm, maxTermMonths: value })}
                              >
                                <SelectTrigger className={selectTriggerClasses}>
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
                              className="border-white/20 bg-white/5 text-blue-50 transition hover:bg-white/10"
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={handleSubmitArrangement}
                              className="rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80"
                            >
                              Create Arrangement
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-blue-100/80">
                  {arrangementsLoading ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-blue-100/70">
                      Loading arrangements...
                    </div>
                  ) : (arrangementOptions as any)?.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 py-10 text-center text-blue-100/70">
                      No payment arrangements configured yet. Add arrangements for different balance ranges.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(arrangementOptions as any)?.map((option: any) => (
                        <div
                          key={option.id}
                          className="flex items-start justify-between gap-6 rounded-2xl border border-white/10 bg-white/5 p-4"
                        >
                          <div className="space-y-2">
                            <h3 className="text-base font-semibold text-white">{option.name}</h3>
                            <p className="text-xs text-blue-100/70">{option.description}</p>
                            {(() => {
                              const summary = getArrangementSummary(option);
                              return (
                                <div className="space-y-1 text-xs text-blue-100/70">
                                  <div className="text-sm font-semibold text-white">{getPlanTypeLabel(option.planType)}</div>
                                  <div>{summary.headline}</div>
                                  {summary.detail && <div className="text-blue-100/70">{summary.detail}</div>}
                                  <div className="text-blue-100/60">
                                    {option.balanceTier ? (
                                      <>Balance tier: {getBalanceTierLabel(option.balanceTier)}</>
                                    ) : (
                                      <>Balance range: {formatCurrencyFromCents(option.minBalance)} - {formatCurrencyFromCents(option.maxBalance)}</>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteArrangementMutation.mutate(option.id)}
                            className="rounded-xl border border-transparent px-3 py-1 text-red-300 transition hover:border-red-300/40 hover:bg-red-500/10 hover:text-red-200"
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

            <TabsContent value="addons" className="space-y-6">
              <Card className={cardBaseClasses}>
                <CardHeader className="space-y-1 text-white">
                  <CardTitle className="text-xl font-semibold text-white">Optional Add-ons</CardTitle>
                  <p className="text-sm text-blue-100/70">
                    Enable premium features for your organization. These add-ons may incur additional costs.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-sky-400" />
                          <h3 className="text-base font-semibold text-white">Document Signing</h3>
                        </div>
                        <p className="text-sm text-blue-100/70">
                          Send documents for electronic signature with full ESIGN Act compliance. Perfect for contracts, agreements, and legal documents.
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-blue-100/60">
                          <span className="rounded-full bg-white/10 px-2 py-1">Legally Binding</span>
                          <span className="rounded-full bg-white/10 px-2 py-1">Full Audit Trail</span>
                          <span className="rounded-full bg-white/10 px-2 py-1">Custom Templates</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={localSettings?.enabledAddons?.includes('document_signing') || false}
                          onCheckedChange={(checked) => {
                            const current = localSettings?.enabledAddons || [];
                            const updated = checked
                              ? [...current, 'document_signing']
                              : current.filter((a: string) => a !== 'document_signing');
                            handleSettingsUpdate('enabledAddons', updated);
                          }}
                          data-testid="switch-document-signing"
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border border-blue-400/30 bg-blue-500/10 p-3">
                      <p className="text-xs text-blue-200">
                        <strong>Note:</strong> More add-ons will be available soon. Contact support to request specific features for your business.
                      </p>
                    </div>
                  </div>
                </CardContent>
                {hasUnsavedChanges && (
                  <CardFooter className="border-t border-white/10 pt-6">
                    <Button
                      onClick={handleSaveSettings}
                      disabled={updateSettingsMutation.isPending}
                      className={cn(
                        "ml-auto rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80",
                        updateSettingsMutation.isPending && "opacity-60",
                      )}
                      data-testid="button-save-addons"
                    >
                      {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="privacy" className="space-y-6">
              <Card className={cardBaseClasses}>
                <CardHeader className="space-y-1 text-white">
                  <CardTitle className="text-xl font-semibold text-white">Privacy & Legal Information</CardTitle>
                  <p className="text-sm text-blue-100/70">
                    Share contact details and the policies that govern your consumer experience.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6 text-sm text-blue-100/80">
                  <div>
                    <Label className="text-white">Contact Email</Label>
                    <Input
                      value={localSettings?.contactEmail || ""}
                      onChange={(e) => handleSettingsUpdate('contactEmail', e.target.value)}
                      placeholder="support@youragency.com"
                      className={inputClasses}
                      data-testid="input-contact-email"
                    />
                  </div>

                  <div>
                    <Label className="text-white">Contact Phone</Label>
                    <Input
                      value={localSettings?.contactPhone || ""}
                      onChange={(e) => handleSettingsUpdate('contactPhone', e.target.value)}
                      placeholder="(555) 123-4567"
                      className={inputClasses}
                      data-testid="input-contact-phone"
                    />
                  </div>

                  <div>
                    <Label className="text-white">Custom Portal URL</Label>
                    <Input
                      value={localSettings?.consumerPortalSettings?.customUrl || ""}
                      onChange={(e) => {
                        const updatedSettings = {
                          ...localSettings,
                          consumerPortalSettings: {
                            ...localSettings?.consumerPortalSettings,
                            customUrl: e.target.value
                          }
                        };
                        setLocalSettings(updatedSettings);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="https://portal.yourdomain.com"
                      className={inputClasses}
                      data-testid="input-custom-portal-url"
                    />
                    <p className="text-xs text-blue-100/60 mt-1">
                      Your custom domain for the consumer portal. If not set, will use default subdomain.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Privacy Policy</Label>
                    <Textarea
                      rows={6}
                      value={localSettings?.privacyPolicy || ""}
                      onChange={(e) => handleSettingsUpdate('privacyPolicy', e.target.value)}
                      placeholder="Enter your privacy policy text that consumers will see..."
                      className={textareaClasses}
                    />
                    <p className="text-xs text-blue-100/70">
                      We recommend including consent language, data usage, and dispute processes.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Terms of Service</Label>
                    <Textarea
                      rows={6}
                      value={localSettings?.termsOfService || ""}
                      onChange={(e) => handleSettingsUpdate('termsOfService', e.target.value)}
                      placeholder="Enter your terms of service text that consumers will see..."
                      className={textareaClasses}
                    />
                    <p className="text-xs text-blue-100/70">
                      Use this section to outline payment expectations, dispute handling, and compliance notes.
                    </p>
                  </div>
                </CardContent>
                {hasUnsavedChanges && (
                  <CardFooter className="border-t border-white/10 pt-6">
                    <Button
                      onClick={handleSaveSettings}
                      disabled={updateSettingsMutation.isPending}
                      className={cn(
                        "ml-auto rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80",
                        updateSettingsMutation.isPending && "opacity-60",
                      )}
                    >
                      {updateSettingsMutation.isPending ? "Saving..." : "Save changes"}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </TabsContent>

          </Tabs>
        </section>
      </div>
    </AdminLayout>
  );
}