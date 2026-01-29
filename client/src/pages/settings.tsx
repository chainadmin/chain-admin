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
import { Trash2, Upload, Plus, Save, CreditCard, Shield, Settings as SettingsIcon, ImageIcon, Copy, ExternalLink, Repeat, FileText, Users, MessagesSquare, DollarSign, Code, Table, Eye, Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, Heading3, Palette, Link2, Link2Off, Eraser, Send, Check, ChevronsUpDown, Download } from "lucide-react";
import { useRef } from "react";
import { isSubdomainSupported } from "@shared/utils/subdomain";
import { resolveConsumerPortalUrl } from "@shared/utils/consumerPortal";
import { getArrangementSummary, getPlanTypeLabel, formatCurrencyFromCents } from "@/lib/arrangements";
import { cn } from "@/lib/utils";
import { balanceTiers, getBalanceRangeFromTier, getBalanceTierLabel, type BalanceTier } from "@shared/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import AutoResponseSettings from "@/components/auto-response-settings";
import TeamMembersSection from "@/components/team-members-section";

export default function Settings() {
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showArrangementModal, setShowArrangementModal] = useState(false);
  const [showDocTemplateModal, setShowDocTemplateModal] = useState(false);
  const [editingDocTemplate, setEditingDocTemplate] = useState<any>(null);
  const [showSendTemplateModal, setShowSendTemplateModal] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState<any>(null);
  const docEditorRef = useRef<HTMLDivElement>(null);
  
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

  type DocTemplateFormState = {
    name: string;
    title: string;
    description: string;
    content: string;
  };

  const emptyDocTemplateForm: DocTemplateFormState = {
    name: "",
    title: "",
    description: "",
    content: "",
  };

  const [docTemplateForm, setDocTemplateForm] = useState<DocTemplateFormState>({ ...emptyDocTemplateForm });
  
  type SendTemplateFormState = {
    consumerId: string;
    accountId: string;
    expiresInDays: number;
    message: string;
  };

  const emptySendTemplateForm: SendTemplateFormState = {
    consumerId: "",
    accountId: "",
    expiresInDays: 7,
    message: "",
  };

  const [sendTemplateForm, setSendTemplateForm] = useState<SendTemplateFormState>({ ...emptySendTemplateForm });
  const [consumerSearchOpen, setConsumerSearchOpen] = useState(false);

  type ArrangementFormState = {
    name: string;
    description: string;
    balanceTier: "under_3000" | "3000_to_5000" | "5000_to_10000" | "over_10000" | "";
    planType: "range" | "fixed_monthly" | "settlement" | "custom_terms" | "one_time_payment" | "pay_in_full";
    monthlyPaymentMin: string;
    monthlyPaymentMax: string;
    fixedMonthlyPayment: string;
    oneTimePaymentMin: string;
    payoffPercentage: string;
    payoffDueDate: string;
    settlementPaymentCounts: string; // Comma-separated values like "1,3,6"
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
    settlementPaymentCounts: "1,3,6", // Default to 3 options
    settlementPaymentFrequency: "monthly",
    settlementOfferExpiresDate: "",
    payoffText: "",
    customTermsText: "",
    maxTermMonths: "12",
  } as const;

  const [arrangementForm, setArrangementForm] = useState<ArrangementFormState>({ ...emptyArrangementForm });
  const [localSettings, setLocalSettings] = useState<any>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showAddonConfirmDialog, setShowAddonConfirmDialog] = useState(false);
  const [newStatusInput, setNewStatusInput] = useState("");

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

  const { data: documentTemplates, isLoading: documentTemplatesLoading } = useQuery({
    queryKey: ["/api/document-templates"],
  });

  const { data: consumers = [] } = useQuery<any[]>({
    queryKey: ["/api/consumers"],
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

  // Initialize document editor settings
  useEffect(() => {
    if (typeof document !== "undefined") {
      try {
        document.execCommand("defaultParagraphSeparator", false, "p");
        document.execCommand("styleWithCSS", false, "true");
      } catch (error) {
        // Ignore browsers that no longer support execCommand
      }
    }
  }, []);

  // Formatting options for document editor
  const blockOptions = [
    { label: "Normal", value: "p" },
    { label: "Heading 1", value: "h1" },
    { label: "Heading 2", value: "h2" },
    { label: "Heading 3", value: "h3" },
  ];

  const colorOptions = [
    { label: "Black", value: "#000000" },
    { label: "Dark Gray", value: "#4B5563" },
    { label: "Blue", value: "#3B82F6" },
    { label: "Red", value: "#EF4444" },
    { label: "Green", value: "#10B981" },
    { label: "Orange", value: "#F59E0B" },
    { label: "Purple", value: "#8B5CF6" },
  ];

  // Helper to get plain text from HTML
  const getPlainText = (html: string) => {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || "";
  };

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

  const createDocTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/document-templates", data);
    },
    onSuccess: () => {
      toast({
        title: "Template Created",
        description: "Document template has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/document-templates"] });
      setShowDocTemplateModal(false);
      setDocTemplateForm({ ...emptyDocTemplateForm });
      setEditingDocTemplate(null);
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error?.message || "Unable to create template.",
        variant: "destructive",
      });
    },
  });

  const updateDocTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest("PUT", `/api/document-templates/${id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Template Updated",
        description: "Document template has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/document-templates"] });
      setShowDocTemplateModal(false);
      setDocTemplateForm({ ...emptyDocTemplateForm });
      setEditingDocTemplate(null);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error?.message || "Unable to update template.",
        variant: "destructive",
      });
    },
  });

  const deleteDocTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/document-templates/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Template Deleted",
        description: "Document template has been removed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/document-templates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error?.message || "Unable to delete template.",
        variant: "destructive",
      });
    },
  });

  const sendTemplateMutation = useMutation({
    mutationFn: async ({ templateId, data }: { templateId: string; data: any }) => {
      const response = await apiRequest("POST", `/api/document-templates/${templateId}/send`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Signature Request Sent",
        description: "The document has been sent to the consumer for signature.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/signature-requests"] });
      setShowSendTemplateModal(false);
      setSendTemplateForm({ ...emptySendTemplateForm });
      setSendingTemplate(null);
    },
    onError: (error: any) => {
      toast({
        title: "Send Failed",
        description: error?.message || "Unable to send template.",
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
    // Debug logging for authnetPublicClientKey changes
    if (field === 'authnetPublicClientKey') {
      console.log('🔍 [Frontend Update] authnetPublicClientKey changed:', {
        newValue: value,
        length: value?.length || 0,
        first10: value?.substring(0, 10) || '',
        containsWaypoint: value?.includes?.('Waypoint') || false,
      });
    }
    
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
    
    // Debug logging for Authorize.net Public Client Key
    if (settingsToSave.authnetPublicClientKey) {
      console.log('🔍 [Frontend Save] Authorize.net Public Client Key being sent:', {
        value: settingsToSave.authnetPublicClientKey,
        length: settingsToSave.authnetPublicClientKey.length,
        first10: settingsToSave.authnetPublicClientKey.substring(0, 10),
        containsWaypoint: settingsToSave.authnetPublicClientKey.includes('Waypoint'),
      });
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

  const handleOpenDocTemplateDialog = (template?: any) => {
    if (template) {
      setEditingDocTemplate(template);
      setDocTemplateForm({
        name: template.name,
        title: template.title,
        description: template.description || "",
        content: template.content || "",
      });
      // Set editor content after modal opens
      setTimeout(() => {
        if (docEditorRef.current) {
          docEditorRef.current.innerHTML = template.content || "";
        }
      }, 100);
    } else {
      setEditingDocTemplate(null);
      setDocTemplateForm({ ...emptyDocTemplateForm });
      // Clear editor content
      setTimeout(() => {
        if (docEditorRef.current) {
          docEditorRef.current.innerHTML = "";
        }
      }, 100);
    }
    setShowDocTemplateModal(true);
  };

  const handleSubmitDocTemplate = () => {
    if (!docTemplateForm.name || !docTemplateForm.title || !docTemplateForm.content) {
      toast({
        title: "Missing Information",
        description: "Please provide name, title, and content for the template.",
        variant: "destructive",
      });
      return;
    }

    if (editingDocTemplate) {
      updateDocTemplateMutation.mutate({
        id: editingDocTemplate.id,
        data: docTemplateForm,
      });
    } else {
      createDocTemplateMutation.mutate(docTemplateForm);
    }
  };

  // Template variables for document templates
  const docTemplateVariables = [
    { label: "First Name", value: "{{firstName}}", category: "consumer" },
    { label: "Last Name", value: "{{lastName}}", category: "consumer" },
    { label: "Full Name", value: "{{consumer_name}}", category: "consumer" },
    { label: "Email", value: "{{email}}", category: "consumer" },
    { label: "Phone", value: "{{phone}}", category: "consumer" },
    { label: "Phone 2", value: "{{phone2}}", category: "consumer" },
    { label: "Address", value: "{{address}}", category: "consumer" },
    { label: "City", value: "{{city}}", category: "consumer" },
    { label: "State", value: "{{state}}", category: "consumer" },
    { label: "ZIP", value: "{{zip}}", category: "consumer" },
    { label: "Date of Birth", value: "{{dateOfBirth}}", category: "consumer" },
    { label: "SSN Last 4", value: "{{ssn_last_4}}", category: "consumer" },
    
    { label: "Account Number", value: "{{account_number}}", category: "account" },
    { label: "Original Creditor", value: "{{original_creditor}}", category: "account" },
    { label: "Current Balance", value: "{{balance}}", category: "account" },
    { label: "Original Balance", value: "{{original_balance}}", category: "account" },
    { label: "Last Payment", value: "{{last_payment}}", category: "account" },
    { label: "Last Payment Date", value: "{{last_payment_date}}", category: "account" },
    { label: "Account Status", value: "{{status}}", category: "account" },
    { label: "Charge-Off Date", value: "{{charge_off_date}}", category: "account" },
    { label: "Client Reference", value: "{{client_reference}}", category: "account" },
    { label: "Account Type", value: "{{account_type}}", category: "account" },
    
    { label: "Today's Date", value: "{{today_date}}", category: "dates" },
    { label: "Current Month", value: "{{current_month}}", category: "dates" },
    { label: "Current Year", value: "{{current_year}}", category: "dates" },
    { label: "Tomorrow's Date", value: "{{tomorrow_date}}", category: "dates" },
    { label: "Next Week Date", value: "{{next_week_date}}", category: "dates" },
    { label: "Next Month Date", value: "{{next_month_date}}", category: "dates" },
    { label: "Current Date Time", value: "{{current_datetime}}", category: "dates" },
    
    { label: "Monthly Payment", value: "{{monthly_payment}}", category: "payments" },
    { label: "Number of Payments", value: "{{number_of_payments}}", category: "payments" },
    { label: "Arrangement Start", value: "{{arrangement_start}}", category: "payments" },
    { label: "Arrangement End", value: "{{arrangement_end}}", category: "payments" },
    { label: "Next Payment Date", value: "{{next_payment_date}}", category: "payments" },
    { label: "Payment Frequency", value: "{{payment_frequency}}", category: "payments" },
    { label: "Settlement Offer", value: "{{settlement_offer}}", category: "payments" },
    { label: "Settlement Expires", value: "{{settlement_expires}}", category: "payments" },
    { label: "Total Paid", value: "{{total_paid}}", category: "payments" },
    { label: "Remaining Balance", value: "{{remaining_balance}}", category: "payments" },
    { label: "Payoff Amount", value: "{{payoff_amount}}", category: "payments" },
    
    { label: "Portal Login Link", value: "{{portal_login_link}}", category: "links" },
    { label: "Make Payment Link", value: "{{payment_link}}", category: "links" },
    { label: "View Account Link", value: "{{account_link}}", category: "links" },
    { label: "Unsubscribe Link", value: "{{unsubscribe_link}}", category: "links" },
    
    { label: "Agency Name", value: "{{agency_name}}", category: "agency" },
    { label: "Agency Email", value: "{{agency_email}}", category: "agency" },
    { label: "Agency Phone", value: "{{agency_phone}}", category: "agency" },
    { label: "Agency Address", value: "{{agency_address}}", category: "agency" },
    { label: "Agent Name", value: "{{agent_name}}", category: "agency" },
    { label: "License Number", value: "{{license_number}}", category: "agency" },
    { label: "Company Website", value: "{{company_website}}", category: "agency" },
    
    { label: "Validation Notice", value: "{{validation_notice}}", category: "compliance" },
    { label: "FDCPA Disclaimer", value: "{{fdcpa_disclaimer}}", category: "compliance" },
    { label: "Privacy Notice", value: "{{privacy_notice}}", category: "compliance" },
    { label: "ESIGN Consent", value: "{{esign_consent}}", category: "compliance" },
    { label: "Terms of Service", value: "{{terms_of_service}}", category: "compliance" },
    
    { label: "Signature Field", value: "{{signature}}", category: "signature" },
    { label: "Initials Field", value: "{{initials}}", category: "signature" },
    { label: "Date Signed", value: "{{date_signed}}", category: "signature" },
    { label: "Signature Line", value: "{{signature_line}}", category: "signature" },
  ];

  // Table templates for document templates
  const docTableTemplates = [
    {
      name: "Basic Table",
      description: "Simple bordered table with account details",
      html: `<table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
  <tr style="background-color: #f8f9fa;">
    <th style="border: 1px solid #ddd; padding: 12px; text-align: left; font-weight: 600;">Field</th>
    <th style="border: 1px solid #ddd; padding: 12px; text-align: left; font-weight: 600;">Details</th>
  </tr>
  <tr>
    <td style="border: 1px solid #ddd; padding: 10px;">Account Number</td>
    <td style="border: 1px solid #ddd; padding: 10px;">{{account_number}}</td>
  </tr>
  <tr>
    <td style="border: 1px solid #ddd; padding: 10px;">Current Balance</td>
    <td style="border: 1px solid #ddd; padding: 10px;">{{balance}}</td>
  </tr>
  <tr>
    <td style="border: 1px solid #ddd; padding: 10px;">Monthly Payment</td>
    <td style="border: 1px solid #ddd; padding: 10px;">{{monthly_payment}}</td>
  </tr>
  <tr>
    <td style="border: 1px solid #ddd; padding: 10px;">Payment Start Date</td>
    <td style="border: 1px solid #ddd; padding: 10px;">{{arrangement_start}}</td>
  </tr>
</table>`
    },
    {
      name: "Modern Table",
      description: "Rounded corners with subtle shadows",
      html: `<table style="width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
  <tr style="background-color: #3b82f6; color: white;">
    <th style="padding: 14px; text-align: left; font-weight: 600;">Item</th>
    <th style="padding: 14px; text-align: left; font-weight: 600;">Value</th>
  </tr>
  <tr style="background-color: #f9fafb;">
    <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">Consumer Name</td>
    <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">{{consumer_name}}</td>
  </tr>
  <tr style="background-color: white;">
    <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">Account Number</td>
    <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">{{account_number}}</td>
  </tr>
  <tr style="background-color: #f9fafb;">
    <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">Balance</td>
    <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">{{balance}}</td>
  </tr>
  <tr style="background-color: white;">
    <td style="padding: 12px;">Settlement Amount</td>
    <td style="padding: 12px;">{{settlement_offer}}</td>
  </tr>
</table>`
    },
    {
      name: "Minimal Table",
      description: "Clean lines without borders",
      html: `<table style="width: 100%; border-collapse: collapse;">
  <tr style="border-bottom: 2px solid #e5e7eb;">
    <th style="padding: 12px 0; text-align: left; font-weight: 600; color: #374151;">Description</th>
    <th style="padding: 12px 0; text-align: left; font-weight: 600; color: #374151;">Amount</th>
  </tr>
  <tr style="border-bottom: 1px solid #f3f4f6;">
    <td style="padding: 12px 0; color: #6b7280;">Original Balance</td>
    <td style="padding: 12px 0;">{{original_balance}}</td>
  </tr>
  <tr style="border-bottom: 1px solid #f3f4f6;">
    <td style="padding: 12px 0; color: #6b7280;">Current Balance</td>
    <td style="padding: 12px 0;">{{balance}}</td>
  </tr>
  <tr style="border-bottom: 1px solid #f3f4f6;">
    <td style="padding: 12px 0; color: #6b7280;">Monthly Payment</td>
    <td style="padding: 12px 0;">{{monthly_payment}}</td>
  </tr>
  <tr>
    <td style="padding: 12px 0; font-weight: 600;">Remaining Balance</td>
    <td style="padding: 12px 0; font-weight: 600;">{{remaining_balance}}</td>
  </tr>
</table>`
    }
  ];

  // Sync document editor HTML to form state
  const syncDocEditorHtml = () => {
    const editor = docEditorRef.current;
    if (!editor) return;
    const html = editor.innerHTML;
    setDocTemplateForm({ ...docTemplateForm, content: html });
  };

  // Apply formatting command to document editor
  const applyDocCommand = (command: string, value?: string) => {
    const editor = docEditorRef.current;
    if (!editor) return;
    editor.focus();
    if (command === "foreColor") {
      document.execCommand("styleWithCSS", false, "true");
    }
    document.execCommand(command, false, value);
    setTimeout(syncDocEditorHtml, 0);
  };

  // Insert variable at cursor position in document template
  const insertDocVariable = (variable: string) => {
    const editor = docEditorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (range) {
      range.deleteContents();
      const textNode = document.createTextNode(variable);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    syncDocEditorHtml();
  };

  // Insert table at cursor position in document template
  const insertDocTable = (html: string) => {
    const editor = docEditorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (range) {
      range.deleteContents();
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      const fragment = document.createDocumentFragment();
      while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
      }
      range.insertNode(fragment);
    }
    syncDocEditorHtml();
  };

  // Insert link in document editor
  const handleDocCreateLink = () => {
    if (typeof window === "undefined") return;
    const url = window.prompt("Enter URL:");
    if (url) {
      applyDocCommand("createLink", url);
    }
  };

  // Remove link in document editor
  const handleDocRemoveLink = () => {
    applyDocCommand("unlink");
  };

  // Render document preview with sample data
  const renderDocumentPreview = () => {
    if (!docTemplateForm.content) {
      return "";
    }

    let output = docTemplateForm.content;

    // Replace variables with sample data
    output = output.replace(/\{\{consumer_name\}\}/gi, "John Doe");
    output = output.replace(/\{\{consumer_first_name\}\}/gi, "John");
    output = output.replace(/\{\{consumer_last_name\}\}/gi, "Doe");
    output = output.replace(/\{\{consumer_email\}\}/gi, "john.doe@example.com");
    output = output.replace(/\{\{consumer_phone\}\}/gi, "(555) 123-4567");
    output = output.replace(/\{\{consumer_address\}\}/gi, "123 Main St, Anytown, ST 12345");
    
    output = output.replace(/\{\{account_number\}\}/gi, "ACC-123456");
    output = output.replace(/\{\{creditor_name\}\}/gi, "Sample Creditor");
    output = output.replace(/\{\{balance\}\}/gi, "$1,234.56");
    output = output.replace(/\{\{original_balance\}\}/gi, "$1,500.00");
    output = output.replace(/\{\{monthly_payment\}\}/gi, "$150.00");
    output = output.replace(/\{\{remaining_balance\}\}/gi, "$1,084.56");
    
    output = output.replace(/\{\{current_date\}\}/gi, new Date().toLocaleDateString());
    output = output.replace(/\{\{today\}\}/gi, new Date().toLocaleDateString());
    output = output.replace(/\{\{signature_date\}\}/gi, new Date().toLocaleDateString());
    
    output = output.replace(/\{\{agency_name\}\}/gi, (settings as any)?.agencyName || "Your Agency");
    output = output.replace(/\{\{agency_email\}\}/gi, (settings as any)?.agencyEmail || "support@example.com");
    output = output.replace(/\{\{agency_phone\}\}/gi, (settings as any)?.agencyPhone || "(555) 123-4567");
    
    output = output.replace(/\{\{consumer_signature\}\}/gi, '<div style="margin: 20px 0; padding: 10px; border: 2px dashed #cbd5e1; border-radius: 4px; color: #64748b; font-style: italic;">Consumer signature will appear here</div>');
    output = output.replace(/\{\{signature_field\}\}/gi, '<div style="margin: 20px 0; padding: 10px; border: 2px dashed #cbd5e1; border-radius: 4px; color: #64748b; font-style: italic;">Signature field</div>');

    return output;
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
      // Max is optional now - if not set, consumers can pay up to full balance
      const monthlyMax = parseCurrencyInput(arrangementForm.monthlyPaymentMax);

      // Minimum is optional - if not set, will use tenant's global minimum as fallback
      if (monthlyMin !== null && monthlyMin < 0) {
        toast({
          title: "Invalid Monthly Minimum",
          description: "Monthly minimum must be a positive amount.",
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

      // Only include min if set (otherwise tenant global minimum will be used as fallback)
      if (monthlyMin !== null) {
        payload.monthlyPaymentMin = monthlyMin;
      }
      // Max is deprecated - always allow up to full balance, but keep for backward compatibility
      if (monthlyMax !== null) {
        payload.monthlyPaymentMax = monthlyMax;
      }
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
    } else if (planType === "settlement") {
      const settlementPercentage = parsePercentageInput(arrangementForm.payoffPercentage);
      // Parse comma-separated payment counts like "1,3,6"
      const settlementPaymentCounts = arrangementForm.settlementPaymentCounts
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);
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

      if (settlementPaymentCounts.length === 0) {
        toast({
          title: "Payment Count Options Required",
          description: "Enter payment count options separated by commas (e.g., 1,3,6).",
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
      payload.settlementPaymentCounts = settlementPaymentCounts;
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
              localSettings?.businessType === 'call_center' ? "sm:grid-cols-8" : "sm:grid-cols-7"
            )}>
              <TabsTrigger value="general" className="px-4 py-2">
                General
              </TabsTrigger>
              <TabsTrigger value="merchant" className="px-4 py-2">
                Payment Processing
              </TabsTrigger>
              {localSettings?.businessType === 'call_center' && (
                <TabsTrigger value="integrations" className="px-4 py-2">
                  Integrations
                </TabsTrigger>
              )}
              <TabsTrigger value="documents" className="px-4 py-2">
                Documents
              </TabsTrigger>
              <TabsTrigger value="arrangements" className="px-4 py-2">
                Payment Plans
              </TabsTrigger>
              <TabsTrigger value="privacy" className="px-4 py-2">
                Privacy & Legal
              </TabsTrigger>
              <TabsTrigger value="auto-response" className="px-4 py-2">
                AI Auto-Response
              </TabsTrigger>
              {(authUser?.role === 'owner' || authUser?.role === 'platform_admin') && (
                <TabsTrigger value="team" className="px-4 py-2">
                  Team Members
                </TabsTrigger>
              )}
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
                        Add status names that should prevent communications and payments. These should match SMAX statusname values or status values from CSV imports.
                      </p>
                    </div>
                    
                    {/* Add Status Input */}
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="Enter status name (e.g., 'Litigation', 'Bankruptcy', 'Deceased')"
                        value={newStatusInput}
                        onChange={(e) => setNewStatusInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const trimmed = newStatusInput.trim();
                            if (trimmed) {
                              const current = localSettings?.blockedAccountStatuses || [];
                              if (!current.includes(trimmed)) {
                                handleSettingsUpdate('blockedAccountStatuses', [...current, trimmed]);
                              }
                              setNewStatusInput("");
                            }
                          }
                        }}
                        className="flex-1 bg-white/5 border-white/20 text-white placeholder:text-blue-100/40"
                        data-testid="input-new-blocked-status"
                      />
                      <Button
                        type="button"
                        onClick={() => {
                          const trimmed = newStatusInput.trim();
                          if (trimmed) {
                            const current = localSettings?.blockedAccountStatuses || [];
                            if (!current.includes(trimmed)) {
                              handleSettingsUpdate('blockedAccountStatuses', [...current, trimmed]);
                            }
                            setNewStatusInput("");
                          }
                        }}
                        disabled={!newStatusInput.trim()}
                        className="px-6"
                        data-testid="button-add-blocked-status"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                    
                    {/* Current Blocked Statuses */}
                    {(localSettings?.blockedAccountStatuses || []).length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm text-blue-100/70">Current Blocked Statuses:</Label>
                        <div className="flex flex-wrap gap-2">
                          {(localSettings?.blockedAccountStatuses || []).map((status: string) => (
                            <div
                              key={status}
                              className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-300"
                              data-testid={`chip-blocked-status-${status}`}
                            >
                              <span>{status}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const current = localSettings?.blockedAccountStatuses || [];
                                  const updated = current.filter((s: string) => s !== status);
                                  handleSettingsUpdate('blockedAccountStatuses', updated);
                                }}
                                className="hover:text-red-100 transition-colors"
                                data-testid={`button-remove-blocked-status-${status}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <p className="text-xs text-blue-100/60">
                      Accounts with these statuses will not receive emails, SMS, or accept payments. Status matching is case-insensitive (e.g., "Closed" and "closed" are treated the same).
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
                        <Label className="text-white">Payment Processor</Label>
                        <Select
                          value={localSettings?.merchantProvider || ""}
                          onValueChange={(value) => handleSettingsUpdate('merchantProvider', value)}
                        >
                          <SelectTrigger className={inputClasses} data-testid="select-merchant-provider">
                            <SelectValue placeholder="Select payment processor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="usaepay">USAePay</SelectItem>
                            <SelectItem value="authorize_net">Authorize.net</SelectItem>
                            <SelectItem value="nmi">NMI (Network Merchants Inc.)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="mt-1 text-xs text-blue-100/70">
                          Choose your payment gateway provider
                        </p>
                      </div>

                      {localSettings?.merchantProvider === 'nmi' && (
                        <>
                          <div>
                            <Label className="text-white">Security Key</Label>
                            <Input
                              type="password"
                              value={localSettings?.nmiSecurityKey || ""}
                              onChange={(e) => handleSettingsUpdate('nmiSecurityKey', e.target.value)}
                              placeholder="Your NMI Security Key"
                              data-testid="input-nmi-security-key"
                              className={inputClasses}
                            />
                            <p className="mt-1 text-xs text-blue-100/70">
                              Found in Settings → Security Keys in your NMI control panel
                            </p>
                          </div>

                          <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-4">
                            <div className="flex gap-3">
                              <i className="fas fa-info-circle text-sky-300 mt-0.5"></i>
                              <div className="text-xs text-sky-100/90">
                                <p className="font-semibold mb-1">NMI Security Key</p>
                                <p>Your Security Key is used to authenticate all API requests. Keep this credential secure and never share it publicly.</p>
                              </div>
                            </div>
                          </div>

                          <div className="border-t border-white/10 pt-4">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  const response = await apiRequest("POST", "/api/nmi/test-connection");
                                  const result = await response.json();
                                  
                                  if (result.success) {
                                    toast({
                                      title: "Connection Successful",
                                      description: "NMI credentials are valid and working.",
                                    });
                                  } else {
                                    toast({
                                      title: "Connection Failed",
                                      description: result.message || "Unable to connect to NMI. Please check your credentials.",
                                      variant: "destructive",
                                    });
                                  }
                                } catch (err: any) {
                                  toast({
                                    title: "Connection Error",
                                    description: "Failed to test NMI connection. Please try again.",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              data-testid="button-test-nmi-connection"
                              className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10"
                            >
                              <i className="fas fa-plug mr-2"></i>
                              Test NMI Connection
                            </Button>
                          </div>
                        </>
                      )}

                      {localSettings?.merchantProvider === 'usaepay' && (
                        <>
                          <div>
                            <Label className="text-white">Merchant Account ID</Label>
                            <Input
                              value={localSettings?.merchantAccountId || ""}
                              onChange={(e) => handleSettingsUpdate('merchantAccountId', e.target.value)}
                              placeholder="Your USAePay account identifier"
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
                        </>
                      )}

                      {localSettings?.merchantProvider === 'authorize_net' && (
                        <>
                          <div>
                            <Label className="text-white">API Login ID</Label>
                            <Input
                              value={localSettings?.authnetApiLoginId || ""}
                              onChange={(e) => handleSettingsUpdate('authnetApiLoginId', e.target.value)}
                              placeholder="Your Authorize.net API Login ID"
                              data-testid="input-authnet-login-id"
                              className={inputClasses}
                            />
                            <p className="mt-1 text-xs text-blue-100/70">
                              Found in Account → Settings → API Credentials & Keys
                            </p>
                          </div>

                          <div>
                            <Label className="text-white">Transaction Key</Label>
                            <Input
                              type="password"
                              value={localSettings?.authnetTransactionKey || ""}
                              onChange={(e) => handleSettingsUpdate('authnetTransactionKey', e.target.value)}
                              placeholder="Your Authorize.net Transaction Key"
                              data-testid="input-authnet-transaction-key"
                              className={inputClasses}
                            />
                            <p className="mt-1 text-xs text-blue-100/70">
                              Used for server-side payment processing (keep this secret)
                            </p>
                          </div>

                          <div>
                            <Label className="text-white">Public Client Key</Label>
                            <Input
                              type="password"
                              value={localSettings?.authnetPublicClientKey || ""}
                              onChange={(e) => handleSettingsUpdate('authnetPublicClientKey', e.target.value)}
                              placeholder="Your Authorize.net Public Client Key"
                              data-testid="input-authnet-public-key"
                              className={inputClasses}
                            />
                            <p className="mt-1 text-xs text-blue-100/70">
                              Used for client-side card tokenization (safe to expose in frontend)
                            </p>
                          </div>

                          <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-4">
                            <div className="flex gap-3">
                              <i className="fas fa-info-circle text-sky-300 mt-0.5"></i>
                              <div className="text-xs text-sky-100/90">
                                <p className="font-semibold mb-1">About the Public Client Key</p>
                                <p>The Public Client Key is safe to use in your website's frontend code. It can only tokenize card data - it cannot charge cards or initiate transactions. Actual payments require the Transaction Key, which stays secure on your server.</p>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

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

                      {localSettings?.merchantProvider === 'usaepay' && (
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
                            data-testid="button-test-usaepay-connection"
                            className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10"
                          >
                            <i className="fas fa-plug mr-2"></i>
                            Test USAePay Connection
                          </Button>
                        </div>
                      )}

                      {localSettings?.merchantProvider === 'authorize_net' && (
                        <div className="border-t border-white/10 pt-4">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={async () => {
                              try {
                                const response = await apiRequest("POST", "/api/authorizenet/test-connection");
                                const result = await response.json();
                                
                                if (result.success) {
                                  toast({
                                    title: "Connection Successful",
                                    description: "Authorize.net credentials are valid and working.",
                                  });
                                } else {
                                  toast({
                                    title: "Connection Failed",
                                    description: result.message || "Unable to connect to Authorize.net. Please check your credentials.",
                                    variant: "destructive",
                                  });
                                }
                              } catch (err: any) {
                                toast({
                                  title: "Connection Error",
                                  description: "Failed to test Authorize.net connection. Please try again.",
                                  variant: "destructive",
                                });
                              }
                            }}
                            data-testid="button-test-authnet-connection"
                            className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10"
                          >
                            <i className="fas fa-plug mr-2"></i>
                            Test Authorize.net Connection
                          </Button>
                        </div>
                      )}

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
              <TabsContent value="integrations" className="space-y-6">
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

              {/* Collection Max Integration Card */}
              <Card className={cardBaseClasses}>
                <CardHeader className="space-y-1 text-white">
                  <CardTitle className="text-xl font-semibold text-white">Collection Max Integration</CardTitle>
                  <p className="text-sm text-blue-100/70">
                    Generate daily CSV exports of payment results for upload to Collection Max.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6 text-sm text-blue-100/80">
                  {/* Enable Collection Max Toggle */}
                  <div className="flex items-center justify-between space-x-4 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex-1">
                      <Label className="text-base font-medium text-white">Enable Collection Max Export</Label>
                      <p className="text-sm text-blue-100/70">
                        When enabled, a daily CSV file will be generated with payment results (account number, file number, status)
                      </p>
                    </div>
                    <Switch
                      checked={localSettings?.collectionMaxEnabled || false}
                      onCheckedChange={(checked) => handleSettingsUpdate('collectionMaxEnabled', checked)}
                      data-testid="switch-collection-max-enabled"
                    />
                  </div>

                  {/* Collection Max Features Info */}
                  <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-base font-medium text-white">What's included in the export?</h3>
                    <ul className="space-y-2 text-sm text-blue-100/70">
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Account Number</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>File Number</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Payment Status (Posted/Declined)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Payment Amount</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Transaction Date</span>
                      </li>
                    </ul>
                  </div>

                  {/* Download Collection Max Export */}
                  {localSettings?.collectionMaxEnabled && (
                    <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                      <h3 className="text-base font-medium text-white">Download Export</h3>
                      <p className="text-sm text-blue-100/70">
                        Download payment results CSV for a specific date. The CSV includes all payments processed that day.
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          type="date"
                          id="collection-max-export-date"
                          defaultValue={new Date().toISOString().split('T')[0]}
                          className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white text-sm focus:border-sky-400 focus:outline-none"
                          data-testid="input-collection-max-date"
                        />
                        <Button
                          onClick={() => {
                            const dateInput = document.getElementById('collection-max-export-date') as HTMLInputElement;
                            const date = dateInput?.value || new Date().toISOString().split('T')[0];
                            window.open(`/api/collection-max/download/${tenantId}?date=${date}`, '_blank');
                          }}
                          className="rounded-xl bg-gradient-to-r from-emerald-500/80 to-teal-500/80 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:from-emerald-400/80 hover:to-teal-400/80"
                          data-testid="button-download-collection-max"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download CSV
                        </Button>
                      </div>
                    </div>
                  )}
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

              {/* Debt Manager Pro Integration Card */}
              <Card className={cardBaseClasses}>
                <CardHeader className="space-y-1 text-white">
                  <CardTitle className="text-xl font-semibold text-white">Debt Manager Pro Integration</CardTitle>
                  <p className="text-sm text-blue-100/70">
                    Connect to Debt Manager Pro for bidirectional sync of accounts, payments, and communications.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6 text-sm text-blue-100/80">
                  {/* Enable DMP Toggle */}
                  <div className="flex items-center justify-between space-x-4 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex-1">
                      <Label className="text-base font-medium text-white">Enable Debt Manager Pro</Label>
                      <p className="text-sm text-blue-100/70">
                        Sync accounts, payments, notes, and communication attempts with DMP
                      </p>
                    </div>
                    <Switch
                      checked={(localSettings as any)?.dmpEnabled || false}
                      onCheckedChange={(checked) => handleSettingsUpdate('dmpEnabled', checked)}
                      data-testid="switch-dmp-enabled"
                    />
                  </div>

                  {/* DMP Configuration Fields */}
                  {(localSettings as any)?.dmpEnabled && (
                    <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="space-y-2">
                        <Label className="text-white">API URL</Label>
                        <Input
                          type="text"
                          placeholder="https://your-dmp-server.com"
                          value={(localSettings as any)?.dmpApiUrl || ''}
                          onChange={(e) => handleSettingsUpdate('dmpApiUrl', e.target.value)}
                          className={inputClasses}
                          data-testid="input-dmp-api-url"
                        />
                        <p className="text-xs text-blue-100/50">
                          The base URL for your Debt Manager Pro API server
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-white">Username</Label>
                        <Input
                          type="text"
                          placeholder="Your DMP username"
                          value={(localSettings as any)?.dmpUsername || ''}
                          onChange={(e) => handleSettingsUpdate('dmpUsername', e.target.value)}
                          className={inputClasses}
                          data-testid="input-dmp-username"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-white">Password</Label>
                        <Input
                          type="password"
                          placeholder="Your DMP password"
                          value={(localSettings as any)?.dmpPassword || ''}
                          onChange={(e) => handleSettingsUpdate('dmpPassword', e.target.value)}
                          className={inputClasses}
                          data-testid="input-dmp-password"
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          onClick={async () => {
                            try {
                              const response = await apiRequest("POST", "/api/settings/test-dmp", {
                                dmpEnabled: (localSettings as any)?.dmpEnabled ?? false,
                                dmpApiUrl: (localSettings as any)?.dmpApiUrl,
                                dmpUsername: (localSettings as any)?.dmpUsername,
                                dmpPassword: (localSettings as any)?.dmpPassword,
                              });
                              const result = await response.json();

                              if (result.success) {
                                toast({
                                  title: "Connection Successful",
                                  description: "Successfully connected to Debt Manager Pro",
                                });
                              } else {
                                toast({
                                  title: "Connection Failed",
                                  description: result.message || "Failed to connect to DMP",
                                  variant: "destructive",
                                });
                              }
                            } catch (error: any) {
                              toast({
                                title: "Connection Error",
                                description: error.message || "Failed to test DMP connection",
                                variant: "destructive",
                              });
                            }
                          }}
                          className="rounded-xl bg-gradient-to-r from-purple-500/80 to-pink-500/80 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-900/30 transition hover:from-purple-400/80 hover:to-pink-400/80"
                          data-testid="button-test-dmp"
                        >
                          Test Connection
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* DMP Import Accounts - Only show when enabled */}
                  {(localSettings as any)?.dmpEnabled && (
                    <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                      <h3 className="text-base font-medium text-white">Import Accounts from DMP</h3>
                      <p className="text-sm text-blue-100/70">
                        Manually import accounts from Debt Manager Pro. This will create new accounts or update existing ones.
                      </p>
                      <Button
                        type="button"
                        onClick={async () => {
                          try {
                            toast({
                              title: "Importing...",
                              description: "Fetching accounts from DMP...",
                            });
                            const response = await apiRequest("POST", "/api/dmp/import-accounts", {});
                            const result = await response.json();

                            if (result.success) {
                              toast({
                                title: "Import Complete",
                                description: result.message || `Imported ${result.imported} accounts, updated ${result.updated}`,
                              });
                            } else {
                              toast({
                                title: "Import Failed",
                                description: result.error || "Failed to import accounts from DMP",
                                variant: "destructive",
                              });
                            }
                          } catch (error: any) {
                            toast({
                              title: "Import Error",
                              description: error.message || "Failed to import accounts from DMP",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="rounded-xl bg-gradient-to-r from-emerald-500/80 to-teal-500/80 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:from-emerald-400/80 hover:to-teal-400/80"
                        data-testid="button-import-dmp-accounts"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Import Accounts
                      </Button>
                    </div>
                  )}

                  {/* DMP Features Info */}
                  <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-base font-medium text-white">What gets synced with DMP?</h3>
                    <ul className="space-y-2 text-sm text-blue-100/70">
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Payment transactions and results</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>SMS and email communications</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Account notes and collection attempts</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>VoIP call results and dispositions (if VoIP enabled)</span>
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

              {/* Document Signing Templates Section */}
              <Card className={cardBaseClasses}>
                <CardHeader className="text-white">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-xl font-semibold text-white">Document Signing Templates</CardTitle>
                      <p className="text-sm text-blue-100/70 mt-2">
                        Create customizable document templates for e-signatures. Great for agreements, authorizations, and contracts.
                      </p>
                    </div>
                    {(localSettings as any)?.enabledAddons?.includes('document_signing') && (
                      <Button
                        onClick={() => handleOpenDocTemplateDialog()}
                        className="rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80"
                        data-testid="button-create-doc-template"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Template
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-blue-100/80">
                  {!(localSettings as any)?.enabledAddons?.includes('document_signing') ? (
                    <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 py-10 text-center">
                      <FileText className="h-16 w-16 mx-auto mb-4 text-blue-400/60" />
                      <h3 className="text-lg font-semibold text-blue-100 mb-2">Document Signing Not Enabled</h3>
                      <p className="text-sm text-blue-200/70 mb-6 max-w-md mx-auto">
                        Enable document signing in Billing → Services to create professional document templates for e-signatures, payment agreements, service contracts, and authorization forms.
                      </p>
                      <Button
                        onClick={() => {
                          window.location.href = '/billing?tab=services';
                        }}
                        className="rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80"
                      >
                        Go to Billing Services
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <p className="text-sm text-blue-200/70">
                        Manage your document templates for electronic signatures. Templates can be used in communication sequences and sent to consumers for signing.
                      </p>
                      
                      {documentTemplatesLoading ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-blue-100/70">
                          Loading document templates...
                        </div>
                      ) : (documentTemplates as any)?.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                          {(documentTemplates as any).map((template: any) => (
                            <div key={template.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <h3 className="text-base font-semibold text-white">{template.name}</h3>
                                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-blue-100">
                                  Template
                                </span>
                              </div>
                              <div className="space-y-2 text-sm">
                                <div>
                                  <p className="text-xs text-blue-100/50">Title:</p>
                                  <p className="text-blue-100 font-medium">{template.title}</p>
                                </div>
                                {template.description && (
                                  <div>
                                    <p className="text-xs text-blue-100/50">Description:</p>
                                    <p className="text-xs text-blue-100/80">{template.description}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs text-blue-100/50">Created:</p>
                                  <p className="text-xs text-blue-100/70">
                                    {new Date(template.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2 pt-2 border-t border-white/10">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSendingTemplate(template);
                                    setShowSendTemplateModal(true);
                                  }}
                                  className="flex-1 border-white/20 bg-white/5 text-blue-100 hover:bg-white/10"
                                  data-testid={`button-send-template-${template.id}`}
                                >
                                  <Send className="h-3 w-3 mr-1" />
                                  Send
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenDocTemplateDialog(template)}
                                  className="border-white/20 bg-white/5 text-blue-100 hover:bg-white/10"
                                  data-testid={`button-edit-template-${template.id}`}
                                >
                                  <SettingsIcon className="h-3 w-3" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                                      data-testid={`button-delete-template-${template.id}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="border-white/10 bg-[#0f172a] text-blue-50">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle className="text-lg font-semibold text-white">Delete Template?</AlertDialogTitle>
                                      <AlertDialogDescription className="text-sm text-blue-100/70">
                                        This action cannot be undone. The template "{template.name}" will be permanently deleted.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="rounded-xl border-white/20 bg-white/5 px-4 py-2 text-blue-50 transition hover:bg-white/10">
                                        Cancel
                                      </AlertDialogCancel>
                                      <AlertDialogAction asChild>
                                        <Button
                                          variant="destructive"
                                          onClick={() => deleteDocTemplateMutation.mutate(template.id)}
                                          disabled={deleteDocTemplateMutation.isPending}
                                          className="rounded-xl bg-red-600/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-900/30 transition hover:bg-red-500/80"
                                        >
                                          Delete
                                        </Button>
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 py-10 text-center">
                          <FileText className="h-12 w-12 mx-auto mb-4 text-blue-400/40" />
                          <h3 className="text-lg font-semibold text-blue-100 mb-2">No Document Templates Yet</h3>
                          <p className="text-sm text-blue-200/70 mb-6 max-w-md mx-auto">
                            Create your first document template to send for electronic signatures. Perfect for payment agreements, service contracts, and authorization forms.
                          </p>
                          <Button
                            onClick={() => handleOpenDocTemplateDialog()}
                            className="rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Create Your First Template
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Document Template Dialog */}
              <Dialog open={showDocTemplateModal} onOpenChange={setShowDocTemplateModal}>
                <DialogContent className="border-white/10 bg-[#0f172a] text-blue-50 max-w-6xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-white">
                      {editingDocTemplate ? "Edit Template" : "Create Document Template"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-white">Template Name *</Label>
                        <Input
                          value={docTemplateForm.name}
                          onChange={(e) => setDocTemplateForm({ ...docTemplateForm, name: e.target.value })}
                          placeholder="e.g., Payment Agreement, Authorization Form"
                          className={inputClasses}
                          data-testid="input-template-name"
                        />
                        <p className="text-xs text-blue-100/60 mt-1">Internal name for reference</p>
                      </div>

                      <div>
                        <Label className="text-white">Document Title *</Label>
                        <Input
                          value={docTemplateForm.title}
                          onChange={(e) => setDocTemplateForm({ ...docTemplateForm, title: e.target.value })}
                          placeholder="e.g., Payment Plan Agreement"
                          className={inputClasses}
                          data-testid="input-template-title"
                        />
                        <p className="text-xs text-blue-100/60 mt-1">Title shown to signers</p>
                      </div>
                    </div>

                    <div>
                      <Label className="text-white">Description (Optional)</Label>
                      <Textarea
                        value={docTemplateForm.description}
                        onChange={(e) => setDocTemplateForm({ ...docTemplateForm, description: e.target.value })}
                        placeholder="Brief description of this template"
                        className={textareaClasses}
                        rows={2}
                        data-testid="input-template-description"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      {/* Content Editor */}
                      <div className="col-span-2 space-y-4">
                        <div>
                          <Label className="text-white mb-2 block">Document Content *</Label>
                          
                          {/* Formatting Toolbar */}
                          <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-white/20 bg-white/5 p-2">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
                              onClick={() => applyDocCommand("bold")}
                              title="Bold"
                            >
                              <Bold className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
                              onClick={() => applyDocCommand("italic")}
                              title="Italic"
                            >
                              <Italic className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
                              onClick={() => applyDocCommand("underline")}
                              title="Underline"
                            >
                              <Underline className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
                              onClick={() => applyDocCommand("insertUnorderedList")}
                              title="Bullet list"
                            >
                              <List className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
                              onClick={() => applyDocCommand("insertOrderedList")}
                              title="Numbered list"
                            >
                              <ListOrdered className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
                              onClick={() => applyDocCommand("removeFormat")}
                              title="Clear formatting"
                            >
                              <Eraser className="h-4 w-4" />
                            </Button>
                            <Select onValueChange={(value) => applyDocCommand("formatBlock", value)}>
                              <SelectTrigger className="flex h-8 w-[130px] items-center gap-2 border-white/20 bg-white/10 text-blue-100 text-xs">
                                <SelectValue placeholder="Text style" />
                              </SelectTrigger>
                              <SelectContent>
                                {blockOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value} className="text-sm">
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select onValueChange={(value) => applyDocCommand("foreColor", value)}>
                              <SelectTrigger className="flex h-8 w-[120px] items-center gap-2 border-white/20 bg-white/10 text-blue-100 text-xs">
                                <Palette className="h-3.5 w-3.5" />
                                <SelectValue placeholder="Color" />
                              </SelectTrigger>
                              <SelectContent>
                                {colorOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value} className="flex items-center gap-2">
                                    <span
                                      className="h-4 w-4 rounded-full border"
                                      style={{ backgroundColor: option.value }}
                                    ></span>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
                              onClick={handleDocCreateLink}
                              title="Insert link"
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
                              onClick={handleDocRemoveLink}
                              title="Remove link"
                            >
                              <Link2Off className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* WYSIWYG Editor */}
                          <div className="rounded-lg border border-white/20 bg-white shadow-sm">
                            <div className="relative">
                              {!getPlainText(docTemplateForm.content) && (
                                <div className="pointer-events-none absolute inset-0 flex h-full w-full items-start justify-start p-5 text-sm text-blue-400">
                                  <p>
                                    Start typing your document here. Use the formatting toolbar above and click variables or tables from the right sidebar to insert them.
                                  </p>
                                </div>
                              )}
                              <div
                                ref={docEditorRef}
                                className="min-h-[420px] w-full resize-y overflow-auto rounded-lg bg-white p-5 text-sm leading-relaxed text-slate-900 focus:outline-none"
                                contentEditable
                                suppressContentEditableWarning
                                onInput={syncDocEditorHtml}
                                onBlur={syncDocEditorHtml}
                                spellCheck
                                data-testid="input-template-content"
                              />
                            </div>
                          </div>
                          <p className="text-xs text-blue-100/60 mt-1">
                            Use the toolbar to format text, and click variables or tables to insert them
                          </p>
                        </div>

                        {/* Preview Section */}
                        <div className="border border-white/20 rounded-lg p-4 bg-white/5">
                          <Label className="text-sm font-medium flex items-center gap-2 mb-3 text-blue-100">
                            <Eye className="h-4 w-4" />
                            Preview
                          </Label>
                          <div className="border border-white/20 rounded-lg overflow-auto bg-white p-4 max-h-96">
                            {docTemplateForm.content ? (
                              <div
                                className="prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: renderDocumentPreview() }}
                              />
                            ) : (
                              <div className="h-full flex items-center justify-center text-gray-400 py-8">
                                <div className="text-center">
                                  <Eye className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                  <p className="text-sm">Enter content to see preview</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Variables & Tables Sidebar */}
                      <div className="space-y-4">
                        {/* Variables */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Code className="h-4 w-4 text-sky-400" />
                            <Label className="text-white text-sm">Variables</Label>
                          </div>
                          <div className="h-80 overflow-y-auto border border-white/20 rounded-lg p-2 bg-white/5 space-y-2">
                            {[
                              { name: "Consumer Info", vars: docTemplateVariables.filter(v => v.category === "consumer") },
                              { name: "Account Details", vars: docTemplateVariables.filter(v => v.category === "account") },
                              { name: "Dates", vars: docTemplateVariables.filter(v => v.category === "dates") },
                              { name: "Payment Info", vars: docTemplateVariables.filter(v => v.category === "payments") },
                              { name: "Links", vars: docTemplateVariables.filter(v => v.category === "links") },
                              { name: "Agency Info", vars: docTemplateVariables.filter(v => v.category === "agency") },
                              { name: "Compliance", vars: docTemplateVariables.filter(v => v.category === "compliance") },
                              { name: "Signature Fields", vars: docTemplateVariables.filter(v => v.category === "signature") },
                            ].map((group) => (
                              <div key={group.name}>
                                <p className="text-xs font-semibold text-blue-300 mb-1">{group.name}</p>
                                <div className="flex flex-wrap gap-1">
                                  {group.vars.map((variable) => (
                                    <button
                                      key={variable.value}
                                      onClick={() => insertDocVariable(variable.value)}
                                      className="px-2 py-1 text-xs rounded bg-sky-500/20 text-sky-100 border border-sky-400/30 hover:bg-sky-500/30 hover:border-sky-400/50 transition"
                                      data-testid={`button-insert-var-${variable.value}`}
                                    >
                                      {variable.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Table Templates */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Table className="h-4 w-4 text-emerald-400" />
                            <Label className="text-white text-sm">Table Templates</Label>
                          </div>
                          <div className="space-y-2">
                            {docTableTemplates.map((template) => (
                              <button
                                key={template.name}
                                onClick={() => insertDocTable(template.html)}
                                className="w-full text-left px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/30 hover:bg-emerald-500/30 hover:border-emerald-400/50 transition"
                                data-testid={`button-insert-table-${template.name.toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                <p className="text-sm font-semibold text-emerald-100">{template.name}</p>
                                <p className="text-xs text-emerald-200/70">{template.description}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-2 pt-4 border-t border-white/10">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowDocTemplateModal(false);
                          setDocTemplateForm({ ...emptyDocTemplateForm });
                          setEditingDocTemplate(null);
                        }}
                        className="border-white/20 bg-white/5 text-blue-50 transition hover:bg-white/10"
                        data-testid="button-cancel-template"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSubmitDocTemplate}
                        disabled={createDocTemplateMutation.isPending || updateDocTemplateMutation.isPending}
                        className="rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80"
                        data-testid="button-save-template"
                      >
                        {createDocTemplateMutation.isPending || updateDocTemplateMutation.isPending
                          ? "Saving..."
                          : editingDocTemplate
                          ? "Update Template"
                          : "Create Template"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Send Template Dialog */}
              <Dialog open={showSendTemplateModal} onOpenChange={setShowSendTemplateModal}>
                <DialogContent className="border-white/10 bg-[#0f172a] text-blue-50 max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-semibold text-white">
                      Send Document for Signature
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="rounded-lg bg-white/5 p-3 border border-white/10">
                      <p className="text-sm text-blue-100/70">Template: <span className="font-semibold text-white">{sendingTemplate?.name}</span></p>
                    </div>

                    <div>
                      <Label className="text-white">Consumer *</Label>
                      <Popover open={consumerSearchOpen} onOpenChange={setConsumerSearchOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={consumerSearchOpen}
                            className={cn(selectTriggerClasses, "w-full justify-between")}
                            data-testid="select-send-consumer"
                          >
                            {sendTemplateForm.consumerId
                              ? (() => {
                                  const consumer = consumers.find((c: any) => c.id === sendTemplateForm.consumerId);
                                  return consumer ? `${consumer.firstName} ${consumer.lastName} - ${consumer.email}` : "Select consumer...";
                                })()
                              : "Select consumer..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0 border-white/10 bg-[#0f172a] text-blue-50">
                          <Command className="border-0">
                            <CommandInput placeholder="Search consumers by name or email..." className="border-0" />
                            <CommandList>
                              <CommandEmpty>No consumer found.</CommandEmpty>
                              <CommandGroup>
                                {consumers.map((consumer: any) => (
                                  <CommandItem
                                    key={consumer.id}
                                    value={`${consumer.firstName} ${consumer.lastName} ${consumer.email}`}
                                    onSelect={() => {
                                      // Auto-select account if consumer has only one account
                                      const consumerAccounts = (accounts as any)?.filter((acc: any) => acc.consumerId === consumer.id) || [];
                                      const autoSelectedAccountId = consumerAccounts.length === 1 ? consumerAccounts[0].id : "";
                                      setSendTemplateForm({ ...sendTemplateForm, consumerId: consumer.id, accountId: autoSelectedAccountId });
                                      setConsumerSearchOpen(false);
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        sendTemplateForm.consumerId === consumer.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {consumer.firstName} {consumer.lastName} - {consumer.email}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div>
                      <Label className="text-white">Account (Optional)</Label>
                      <p className="text-xs text-blue-100/60 mb-2">
                        Link this document to a specific account to include account details like balance and account number
                      </p>
                      <Select 
                        value={sendTemplateForm.accountId || "none"}
                        onValueChange={(value) => setSendTemplateForm({ ...sendTemplateForm, accountId: value === "none" ? "" : value })}
                      >
                        <SelectTrigger className={selectTriggerClasses} data-testid="select-send-account">
                          <SelectValue placeholder="Select account (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {(accounts as any)?.filter((acc: any) => !sendTemplateForm.consumerId || acc.consumerId === sendTemplateForm.consumerId).map((account: any) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.creditor} - Balance: ${((account.balanceCents || 0) / 100).toFixed(2)} (Acct: {account.accountNumber})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-white">Expires In (Days)</Label>
                      <Input
                        type="number"
                        value={sendTemplateForm.expiresInDays}
                        onChange={(e) => setSendTemplateForm({ ...sendTemplateForm, expiresInDays: parseInt(e.target.value) || 7 })}
                        className={inputClasses}
                        min="1"
                        max="90"
                        data-testid="input-expires-days"
                      />
                    </div>

                    <div>
                      <Label className="text-white">Custom Message (Optional)</Label>
                      <Textarea
                        value={sendTemplateForm.message}
                        onChange={(e) => setSendTemplateForm({ ...sendTemplateForm, message: e.target.value })}
                        placeholder="Add a personal message to the consumer..."
                        className={textareaClasses}
                        rows={3}
                        data-testid="textarea-custom-message"
                      />
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowSendTemplateModal(false);
                          setSendTemplateForm({ ...emptySendTemplateForm });
                          setSendingTemplate(null);
                        }}
                        className="flex-1 border-white/20 bg-white/5 text-blue-50 transition hover:bg-white/10"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          if (!sendTemplateForm.consumerId) {
                            toast({ title: "Please select a consumer", variant: "destructive" });
                            return;
                          }
                          sendTemplateMutation.mutate({
                            templateId: sendingTemplate.id,
                            data: {
                              consumerId: sendTemplateForm.consumerId,
                              accountId: sendTemplateForm.accountId || undefined,
                              expiresInDays: sendTemplateForm.expiresInDays,
                              message: sendTemplateForm.message || undefined,
                            },
                          });
                        }}
                        disabled={sendTemplateMutation.isPending || !sendTemplateForm.consumerId}
                        className="flex-1 rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80"
                        data-testid="button-send-signature-request"
                      >
                        {sendTemplateMutation.isPending ? "Sending..." : "Send for Signature"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
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
                  
                  <div className="flex items-center justify-between border-t border-white/10 pt-4">
                    <div className="space-y-0.5">
                      <Label className="text-base font-medium text-white">Force Payment Arrangement</Label>
                      <p className="text-sm text-blue-100/70">
                        When enabled, consumers must set up a payment plan and cannot make one-time payments
                      </p>
                    </div>
                    <Switch
                      checked={localSettings?.forceArrangement ?? false}
                      onCheckedChange={(checked) => handleSettingsUpdate('forceArrangement', checked)}
                      data-testid="switch-force-arrangement"
                    />
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
                      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto border-white/10 bg-[#0f172a] text-blue-50">
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
                                <SelectItem value="settlement">Settlement (% of balance)</SelectItem>
                                <SelectItem value="custom_terms">Custom terms copy</SelectItem>
                                <SelectItem value="one_time_payment">One-time payment</SelectItem>
                                <SelectItem value="pay_in_full">Pay Balance in Full</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {arrangementForm.planType === "range" && (
                            <div className="space-y-4">
                              <div>
                                <Label className="text-white">Minimum Monthly Payment ($)</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={arrangementForm.monthlyPaymentMin}
                                  onChange={(e) => setArrangementForm({ ...arrangementForm, monthlyPaymentMin: e.target.value })}
                                  placeholder="50.00"
                                  className={inputClasses}
                                />
                                <p className="mt-1 text-xs text-blue-100/70">
                                  Leave blank to use the global Minimum Monthly Payment from Settings. Consumers can pay any amount from this minimum up to the full balance.
                                </p>
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
                                  <Label className="text-white">Payment Options *</Label>
                                  <Input
                                    type="text"
                                    value={arrangementForm.settlementPaymentCounts}
                                    onChange={(e) => setArrangementForm({ ...arrangementForm, settlementPaymentCounts: e.target.value })}
                                    placeholder="1,3,6"
                                    className={inputClasses}
                                    data-testid="input-settlement-payment-counts"
                                  />
                                  <p className="mt-1 text-xs text-blue-100/70">
                                    Comma-separated (e.g., "1,3,6" creates 3 options)
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

            <TabsContent value="auto-response" className="space-y-6">
              <AutoResponseSettings />
            </TabsContent>

            {(authUser?.role === 'owner' || authUser?.role === 'platform_admin') && (
              <TabsContent value="team" className="space-y-6">
                <TeamMembersSection cardBaseClasses={cardBaseClasses} inputClasses={inputClasses} />
              </TabsContent>
            )}

          </Tabs>
        </section>
      </div>
    </AdminLayout>
  );
}