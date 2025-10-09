import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
import { Mail, MessageSquare, Plus, Send, FileText, Trash2, Eye, TrendingUp, Users, AlertCircle, MousePointer, UserMinus, Phone, Clock, Calendar, Settings, Copy, Sparkles, Megaphone, Zap, BarChart3, Code } from "lucide-react";
import { POSTMARK_TEMPLATES, type PostmarkTemplateType } from "@shared/postmarkTemplates";

export default function Communications() {
  const [activeTab, setActiveTab] = useState("overview");
  const [communicationType, setCommunicationType] = useState<"email" | "sms">("email");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showCampaignConfirmation, setShowCampaignConfirmation] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const emailTextareaRef = useRef<HTMLTextAreaElement>(null);
  const smsTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [emailTemplateForm, setEmailTemplateForm] = useState({
    name: "",
    subject: "",
    html: "",
    designType: "custom" as PostmarkTemplateType,
  });
  
  const [smsTemplateForm, setSmsTemplateForm] = useState({
    name: "",
    message: "",
  });
  
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    templateId: "",
    targetGroup: "all",
    targetType: "all" as "all" | "folder" | "custom",
    targetFolderIds: [] as string[],
    customFilters: {
      balanceMin: "",
      balanceMax: "",
      status: "",
      lastContactDays: "",
    },
  });

  const [automationForm, setAutomationForm] = useState({
    name: "",
    description: "",
    type: "email" as "email" | "sms",
    templateId: "",
    templateIds: [] as string[], // For multiple templates
    templateSchedule: [] as { templateId: string; dayOffset: number }[], // For day-based scheduling
    triggerType: "schedule" as "schedule" | "event" | "manual",
    scheduleType: "once" as "once" | "daily" | "weekly" | "monthly" | "sequence",
    scheduledDate: "",
    scheduleTime: "",
    scheduleWeekdays: [] as string[],
    scheduleDayOfMonth: "",
    eventType: "account_created" as "account_created" | "payment_overdue" | "custom",
    eventDelay: "1d",
    targetType: "all" as "all" | "folder" | "custom",
    targetFolderIds: [] as string[],
    targetCustomerIds: [] as string[],
  });

  const [showAutomationModal, setShowAutomationModal] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get user data for agency URL
  const { data: userData } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  // Queries
  const { data: emailTemplates, isLoading: emailTemplatesLoading } = useQuery({
    queryKey: ["/api/email-templates"],
  });

  const { data: smsTemplates, isLoading: smsTemplatesLoading } = useQuery({
    queryKey: ["/api/sms-templates"],
  });

  const { data: automations, isLoading: automationsLoading } = useQuery({
    queryKey: ["/api/automations"],
  });

  const { data: folders } = useQuery({
    queryKey: ["/api/folders"],
  });

  const { data: emailCampaigns, isLoading: emailCampaignsLoading } = useQuery({
    queryKey: ["/api/email-campaigns"],
  });

  const { data: smsCampaigns, isLoading: smsCampaignsLoading } = useQuery({
    queryKey: ["/api/sms-campaigns"],
  });

  const { data: emailMetrics } = useQuery({
    queryKey: ["/api/email-metrics"],
  });

  const { data: smsMetrics } = useQuery({
    queryKey: ["/api/sms-metrics"],
  });

  const { data: consumers } = useQuery({
    queryKey: ["/api/consumers"],
  });

  const { data: callbackRequests } = useQuery({
    queryKey: ["/api/callback-requests"],
  });

  const { data: smsRateLimitStatus } = useQuery({
    queryKey: ["/api/sms-rate-limit-status"],
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  const { data: smsQueueStatus } = useQuery({
    queryKey: ["/api/sms-queue-status"],
    refetchInterval: 5000,
  });

  const { data: tenantSettings } = useQuery({
    queryKey: ["/api/settings"],
  });

  // Template variables available for insertion
  const templateVariables = [
    { label: "First Name", value: "{{firstName}}", category: "consumer" },
    { label: "Last Name", value: "{{lastName}}", category: "consumer" },
    { label: "Full Name", value: "{{fullName}}", category: "consumer" },
    { label: "Email", value: "{{email}}", category: "consumer" },
    { label: "Phone", value: "{{phone}}", category: "consumer" },
    { label: "Account Number", value: "{{accountNumber}}", category: "account" },
    { label: "Creditor", value: "{{creditor}}", category: "account" },
    { label: "Balance", value: "{{balance}}", category: "account" },
    { label: "Due Date", value: "{{dueDate}}", category: "account" },
    { label: "Consumer Portal Link", value: "{{consumerPortalLink}}", category: "links" },
    { label: "App Download Link", value: "{{appDownloadLink}}", category: "links" },
    { label: "Agency Name", value: "{{agencyName}}", category: "agency" },
    { label: "Agency Email", value: "{{agencyEmail}}", category: "agency" },
    { label: "Agency Phone", value: "{{agencyPhone}}", category: "agency" },
  ];

  // Function to insert variable at cursor position
  const insertVariable = (variable: string) => {
    const textarea = communicationType === "email" ? emailTextareaRef.current : smsTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = communicationType === "email" ? emailTemplateForm.html : smsTemplateForm.message;
    const before = text.substring(0, start);
    const after = text.substring(end);
    
    const newText = before + variable + after;
    
    if (communicationType === "email") {
      setEmailTemplateForm({ ...emailTemplateForm, html: newText });
    } else {
      setSmsTemplateForm({ ...smsTemplateForm, message: newText });
    }
    
    // Set cursor position after inserted variable
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + variable.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  // Function to handle design selection
  const handleDesignSelect = (designType: PostmarkTemplateType) => {
    const template = POSTMARK_TEMPLATES[designType];
    setEmailTemplateForm({
      ...emailTemplateForm,
      designType,
      html: template.html,
    });
  };

  // Function to render preview with actual data
  const renderPreview = () => {
    let preview = emailTemplateForm.html;
    
    // Replace variables with sample data
    preview = preview.replace(/\{\{firstName\}\}/g, "John");
    preview = preview.replace(/\{\{lastName\}\}/g, "Doe");
    preview = preview.replace(/\{\{fullName\}\}/g, "John Doe");
    preview = preview.replace(/\{\{email\}\}/g, "john.doe@example.com");
    preview = preview.replace(/\{\{phone\}\}/g, "(555) 123-4567");
    preview = preview.replace(/\{\{accountNumber\}\}/g, "ACC-12345");
    preview = preview.replace(/\{\{creditor\}\}/g, "Sample Creditor");
    preview = preview.replace(/\{\{balance\}\}/g, "$1,234.56");
    preview = preview.replace(/\{\{dueDate\}\}/g, "12/31/2024");
    preview = preview.replace(/\{\{consumerPortalLink\}\}/g, "#");
    preview = preview.replace(/\{\{appDownloadLink\}\}/g, "#");
    preview = preview.replace(/\{\{agencyName\}\}/g, (tenantSettings as any)?.agencyName || "Your Agency");
    preview = preview.replace(/\{\{agencyEmail\}\}/g, (tenantSettings as any)?.agencyEmail || "info@agency.com");
    preview = preview.replace(/\{\{agencyPhone\}\}/g, (tenantSettings as any)?.agencyPhone || "(555) 000-0000");

    // Add Postmark styles if using a Postmark template
    const template = POSTMARK_TEMPLATES[emailTemplateForm.designType];
    if (template.styles) {
      return template.styles + preview;
    }

    return preview;
  };

  // Email Mutations
  const createEmailTemplateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/email-templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      setShowTemplateModal(false);
      setEmailTemplateForm({ name: "", subject: "", html: "", designType: "custom" });
      toast({
        title: "Success",
        description: "Email template created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create email template",
        variant: "destructive",
      });
    },
  });

  const updateEmailTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest("PUT", `/api/email-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      setShowTemplateModal(false);
      setEditingTemplate(null);
      setEmailTemplateForm({ name: "", subject: "", html: "", designType: "custom" });
      toast({
        title: "Success",
        description: "Email template updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update email template",
        variant: "destructive",
      });
    },
  });

  const deleteEmailTemplateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/email-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      toast({
        title: "Success",
        description: "Email template deleted successfully",
      });
    },
  });

  // SMS Mutations
  const createSmsTemplateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/sms-templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-templates"] });
      setShowTemplateModal(false);
      setSmsTemplateForm({ name: "", message: "" });
      toast({
        title: "Success",
        description: "SMS template created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create SMS template",
        variant: "destructive",
      });
    },
  });

  const deleteSmsTemplateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sms-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-templates"] });
      toast({
        title: "Success",
        description: "SMS template deleted successfully",
      });
    },
  });

  // Campaign Mutations
  const createEmailCampaignMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/email-campaigns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-campaigns"] });
      setShowCampaignModal(false);
      setShowCampaignConfirmation(false);
      setCampaignForm({ 
        name: "", 
        templateId: "", 
        targetGroup: "all",
        targetType: "all",
        targetFolderIds: [],
        customFilters: {
          balanceMin: "",
          balanceMax: "",
          status: "",
          lastContactDays: "",
        },
      });
      toast({
        title: "Success",
        description: "Email campaign created and scheduled",
      });
    },
  });

  const createSmsCampaignMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/sms-campaigns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
      setShowCampaignModal(false);
      setShowCampaignConfirmation(false);
      setCampaignForm({ 
        name: "", 
        templateId: "", 
        targetGroup: "all",
        targetType: "all",
        targetFolderIds: [],
        customFilters: {
          balanceMin: "",
          balanceMax: "",
          status: "",
          lastContactDays: "",
        },
      });
      toast({
        title: "Success",
        description: "SMS campaign created and scheduled",
      });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: ({ id, type }: { id: string; type: "email" | "sms" }) => {
      const endpoint = type === "email" ? `/api/email-campaigns/${id}` : `/api/sms-campaigns/${id}`;
      return apiRequest("DELETE", endpoint);
    },
    onSuccess: (_, variables) => {
      if (variables.type === "email") {
        queryClient.invalidateQueries({ queryKey: ["/api/email-campaigns"] });
        queryClient.invalidateQueries({ queryKey: ["/api/email-metrics"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
        queryClient.invalidateQueries({ queryKey: ["/api/sms-metrics"] });
      }
      toast({
        title: "Campaign Deleted",
        description: `${variables.type === 'email' ? 'Email' : 'SMS'} campaign has been removed before sending.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete campaign",
        variant: "destructive",
      });
    },
  });

  // Automation Mutations
  const createAutomationMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/automations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      setShowAutomationModal(false);
      setAutomationForm({
        name: "",
        description: "",
        type: "email",
        templateId: "",
        templateIds: [],
        templateSchedule: [],
        triggerType: "schedule",
        scheduleType: "once",
        scheduledDate: "",
        scheduleTime: "",
        scheduleWeekdays: [],
        scheduleDayOfMonth: "",
        eventType: "account_created",
        eventDelay: "1d",
        targetType: "all",
        targetFolderIds: [],
        targetCustomerIds: [],
      });
      toast({
        title: "Success",
        description: "Automation created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create automation",
        variant: "destructive",
      });
    },
  });

  const deleteAutomationMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/automations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      toast({
        title: "Success",
        description: "Automation deleted successfully",
      });
    },
  });

  const toggleAutomationMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PUT", `/api/automations/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      toast({
        title: "Success",
        description: "Automation updated successfully",
      });
    },
  });

  // Settings mutation for SMS throttle
  const updateSettingsMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-rate-limit-status"] });
      toast({
        title: "Success",
        description: "SMS throttle settings updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const handleEditTemplate = (template: any) => {
    setEditingTemplate(template);
    if (communicationType === "email") {
      setEmailTemplateForm({
        name: template.name,
        subject: template.subject,
        html: template.html,
        designType: template.designType || "custom",
      });
    } else {
      setSmsTemplateForm({
        name: template.name,
        message: template.message,
      });
    }
    setShowTemplateModal(true);
  };

  const handleTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (communicationType === "email") {
      if (!emailTemplateForm.name.trim() || !emailTemplateForm.subject.trim() || !emailTemplateForm.html.trim()) {
        toast({
          title: "Error",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }
      
      if (editingTemplate) {
        updateEmailTemplateMutation.mutate({ 
          id: editingTemplate.id, 
          data: emailTemplateForm 
        });
      } else {
        createEmailTemplateMutation.mutate(emailTemplateForm);
      }
    } else {
      if (!smsTemplateForm.name.trim() || !smsTemplateForm.message.trim()) {
        toast({
          title: "Error",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }
      createSmsTemplateMutation.mutate(smsTemplateForm);
    }
  };

  const handleCampaignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignForm.name.trim() || !campaignForm.templateId) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    // Show confirmation dialog instead of immediately creating campaign
    setShowCampaignConfirmation(true);
  };

  const handleCampaignConfirm = () => {
    if (communicationType === "email") {
      createEmailCampaignMutation.mutate(campaignForm);
    } else {
      createSmsCampaignMutation.mutate(campaignForm);
    }
    setShowCampaignConfirmation(false);
  };

  const handleAutomationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!automationForm.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter an automation name",
        variant: "destructive",
      });
      return;
    }

    // Check template selection based on schedule type
    if (automationForm.scheduleType === "once") {
      if (!automationForm.templateId) {
        toast({
          title: "Error",
          description: "Please select a template",
          variant: "destructive",
        });
        return;
      }
    } else {
      if (automationForm.templateIds.length === 0) {
        toast({
          title: "Error",
          description: "Please select at least one template for recurring schedules",
          variant: "destructive",
        });
        return;
      }
    }

    // Format the data for the API
    const automationData = {
      ...automationForm,
      // Use single template for one-time, sequence for email sequences, multiple for recurring
      templateId: automationForm.scheduleType === "once" ? automationForm.templateId : undefined,
      templateIds: automationForm.scheduleType !== "once" && automationForm.scheduleType !== "sequence" ? automationForm.templateIds : undefined,
      templateSchedule: automationForm.scheduleType === "sequence" ? automationForm.templateSchedule : undefined,
      scheduledDate: automationForm.triggerType === "schedule" && automationForm.scheduledDate 
        ? new Date(automationForm.scheduledDate + "T" + (automationForm.scheduleTime || "09:00")).toISOString()
        : undefined,
    };

    createAutomationMutation.mutate(automationData);
  };

  const handlePreview = (template: any) => {
    setPreviewTemplate(template);
  };

  const getTargetGroupLabel = (campaign: any) => {
    if (campaign.targetType === "folder") {
      const selectedFolders = (folders as any)?.filter((f: any) => 
        campaign.targetFolderIds?.includes(f.id)
      ).map((f: any) => f.name).join(", ") || "Selected folders";
      return `Folders: ${selectedFolders}`;
    }
    
    if (campaign.targetType === "custom") {
      const filters = [];
      if (campaign.customFilters?.balanceMin) filters.push(`Min: $${campaign.customFilters.balanceMin}`);
      if (campaign.customFilters?.balanceMax) filters.push(`Max: $${campaign.customFilters.balanceMax}`);
      if (campaign.customFilters?.status) filters.push(`Status: ${campaign.customFilters.status}`);
      if (campaign.customFilters?.lastContactDays) filters.push(`${campaign.customFilters.lastContactDays} days since contact`);
      return filters.length > 0 ? `Custom: ${filters.join(", ")}` : "Custom selection";
    }
    
    switch (campaign.targetGroup) {
      case "all":
        return "All Consumers";
      case "with-balance":
        return "With Outstanding Balance";
      case "decline":
        return "Decline Status";
      case "recent-upload":
        return "Most Recent Upload";
      default:
        return campaign.targetGroup;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
      case "sending":
        return "border-sky-400/40 bg-sky-500/10 text-sky-100";
      case "pending":
        return "border-amber-300/40 bg-amber-500/10 text-amber-100";
      case "failed":
        return "border-rose-400/40 bg-rose-500/10 text-rose-100";
      default:
        return "border-indigo-400/40 bg-indigo-500/10 text-indigo-100";
    }
  };

  const templates = communicationType === "email" ? emailTemplates : smsTemplates;
  const campaigns = communicationType === "email" ? emailCampaigns : smsCampaigns;
  const metrics = communicationType === "email" ? emailMetrics : smsMetrics;
  const templatesLoading = communicationType === "email" ? emailTemplatesLoading : smsTemplatesLoading;
  const campaignsLoading = communicationType === "email" ? emailCampaignsLoading : smsCampaignsLoading;

  const lastSevenDays = Number((metrics as any)?.last7Days || 0);
  const deliveryRate = Number((metrics as any)?.deliveryRate || 0);
  const totalDelivered = Number((metrics as any)?.totalDelivered || 0);
  const activeCampaignsCount = Array.isArray(campaigns)
    ? (campaigns as any).filter((campaign: any) => campaign.status === "active").length
    : 0;
  const engagementRate = communicationType === "email"
    ? Number((metrics as any)?.openRate || 0)
    : typeof (metrics as any)?.responseRate === "number"
      ? Number((metrics as any)?.responseRate || 0)
      : Math.max(0, 100 - Number((metrics as any)?.optOutRate || 0));
  const engagementLabel = communicationType === "email" ? "Open rate" : "Estimated response rate";
  const formatPercent = (value: number) =>
    value.toLocaleString(undefined, {
      maximumFractionDigits: 1,
      minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    });
  const glassPanelClass =
    "rounded-3xl border border-white/20 bg-[#0b1733]/80 text-blue-50 shadow-xl shadow-blue-900/20 backdrop-blur";

  return (
    <AdminLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 text-blue-50 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-sky-600/20 via-indigo-600/20 to-blue-900/10 p-8 shadow-2xl shadow-blue-900/30 backdrop-blur">
          <div className="pointer-events-none absolute -right-10 top-16 h-64 w-64 rounded-full bg-sky-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-10 h-56 w-56 rounded-full bg-indigo-500/30 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100/80">
                <Sparkles className="h-3.5 w-3.5" />
                Engagement workspace
              </span>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                  Communication control center
                </h1>
                <p className="text-sm text-blue-100/70 sm:text-base">
                  Track deliverability, orchestrate outreach, and keep every consumer touchpoint aligned across email and SMS. Switch channels instantly and launch the right workflow without leaving this view.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setCommunicationType("email")}
                  className={cn(
                    "rounded-xl border border-white/15 px-5 py-2 text-sm font-semibold transition",
                    communicationType === "email"
                      ? "bg-white/30 text-white shadow-lg shadow-blue-900/20 hover:bg-white/40"
                      : "bg-white/10 text-blue-100 hover:bg-white/20 hover:text-white"
                  )}
                >
                  <Mail className="mr-2 h-4 w-4" /> Email channel
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setCommunicationType("sms")}
                  className={cn(
                    "rounded-xl border border-white/15 px-5 py-2 text-sm font-semibold transition",
                    communicationType === "sms"
                      ? "bg-white/30 text-white shadow-lg shadow-blue-900/20 hover:bg-white/40"
                      : "bg-white/10 text-blue-100 hover:bg-white/20 hover:text-white"
                  )}
                >
                  <MessageSquare className="mr-2 h-4 w-4" /> SMS channel
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setActiveTab("templates")}
                  className="rounded-xl border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-blue-100 transition hover:bg-white/15 hover:text-white"
                >
                  <FileText className="mr-2 h-4 w-4" /> Manage templates
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setActiveTab("campaigns")}
                  className="rounded-xl border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-blue-100 transition hover:bg-white/15 hover:text-white"
                >
                  <Megaphone className="mr-2 h-4 w-4" /> Plan campaigns
                </Button>
              </div>
            </div>
            <div className="w-full max-w-xl space-y-4 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-xl shadow-blue-900/30 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-blue-100/70">Channel snapshot</p>
                <Zap className="h-5 w-5 text-blue-100/80" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs uppercase text-blue-100/70">Last 7 days</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{lastSevenDays.toLocaleString()}</p>
                  <p className="text-xs text-blue-100/60">{communicationType === "email" ? "emails" : "messages"} sent</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs uppercase text-blue-100/70">Deliverability</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{formatPercent(deliveryRate)}%</p>
                  <p className="text-xs text-blue-100/60">{totalDelivered.toLocaleString()} delivered</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs uppercase text-blue-100/70">Active campaigns</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{activeCampaignsCount.toLocaleString()}</p>
                  <p className="text-xs text-blue-100/60">Live workflows running</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  <p className="text-xs uppercase text-blue-100/70">Engagement</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{formatPercent(engagementRate)}%</p>
                  <p className="text-xs text-blue-100/60">{engagementLabel}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="relative z-10 flex flex-wrap items-center gap-3 border-t border-white/10 pt-6 text-xs text-blue-100/70">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1">
              <Users className="h-3.5 w-3.5" /> Unified audience syncing enabled
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1">
              <BarChart3 className="h-3.5 w-3.5" /> Real-time metrics refresh every 5 minutes
            </div>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-10">
          <TabsList className="grid w-full grid-cols-5 gap-2 rounded-2xl border border-white/15 bg-white/10 p-2 text-blue-100 backdrop-blur">
            <TabsTrigger
              value="overview"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-blue-100 transition data-[state=active]:bg-[#0b1733]/80 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/20"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="templates"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-blue-100 transition data-[state=active]:bg-[#0b1733]/80 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/20"
            >
              Templates
            </TabsTrigger>
            <TabsTrigger
              value="campaigns"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-blue-100 transition data-[state=active]:bg-[#0b1733]/80 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/20"
            >
              Campaigns
            </TabsTrigger>
            <TabsTrigger
              value="automation"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-blue-100 transition data-[state=active]:bg-[#0b1733]/80 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/20"
            >
              Automation
            </TabsTrigger>
            <TabsTrigger
              value="requests"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-blue-100 transition data-[state=active]:bg-[#0b1733]/80 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/20"
            >
              Callback Requests
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-10 text-white">
            {/* Communication Type Selector */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-blue-100/70">Channel focus</span>
              <div className="flex items-center gap-1 rounded-full border border-white/20 bg-white/10 p-1 shadow-sm shadow-blue-900/10">
                <Button
                  variant="ghost"
                  onClick={() => setCommunicationType("email")}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-xs font-semibold transition",
                    communicationType === "email"
                      ? "bg-white/20 text-white shadow-lg shadow-blue-900/20"
                      : "text-blue-100/80 hover:bg-white/10"
                  )}
                >
                  <Mail className="mr-2 h-3.5 w-3.5" /> Email
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setCommunicationType("sms")}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-xs font-semibold transition",
                    communicationType === "sms"
                      ? "bg-white/20 text-white shadow-lg shadow-blue-900/20"
                      : "text-blue-100/80 hover:bg-white/10"
                  )}
                >
                  <MessageSquare className="mr-2 h-3.5 w-3.5" /> SMS
                </Button>
              </div>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className={glassPanelClass}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold text-blue-100/80">
                    {communicationType === "email" ? "Emails" : "Messages"} sent
                  </CardTitle>
                  {communicationType === "email" ? (
                    <Mail className="h-4 w-4 text-blue-200/70" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-blue-200/70" />
                  )}
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="text-2xl font-semibold text-white">{((metrics as any)?.totalSent || 0).toLocaleString()}</div>
                  <p className="text-xs text-blue-100/70">{lastSevenDays.toLocaleString()} in the last 7 days</p>
                </CardContent>
              </Card>

              <Card className={glassPanelClass}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-semibold text-blue-100/80">Deliverability</CardTitle>
                  <TrendingUp className="h-4 w-4 text-blue-200/70" />
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="text-2xl font-semibold text-white">{`${formatPercent(Number((metrics as any)?.deliveryRate || 0))}%`}</div>
                  <p className="text-xs text-blue-100/70">{((metrics as any)?.totalDelivered || 0).toLocaleString()} delivered</p>
                </CardContent>
              </Card>

              {communicationType === "email" && (
                <>
                  <Card className={glassPanelClass}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-semibold text-blue-100/80">Open rate</CardTitle>
                      <Eye className="h-4 w-4 text-blue-200/70" />
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <div className="text-2xl font-semibold text-white">{`${formatPercent(Number((metrics as any)?.openRate || 0))}%`}</div>
                      <p className="text-xs text-blue-100/70">{((metrics as any)?.totalOpened || 0).toLocaleString()} opened</p>
                    </CardContent>
                  </Card>

                  <Card className={glassPanelClass}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-semibold text-blue-100/80">Click rate</CardTitle>
                      <MousePointer className="h-4 w-4 text-blue-200/70" />
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <div className="text-2xl font-semibold text-white">{`${formatPercent(Number((metrics as any)?.clickRate || 0))}%`}</div>
                      <p className="text-xs text-blue-100/70">{((metrics as any)?.totalClicked || 0).toLocaleString()} clicked</p>
                    </CardContent>
                  </Card>
                </>
              )}

              {communicationType === "sms" && (
                <>
                  <Card className={glassPanelClass}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-semibold text-blue-100/80">Failed deliveries</CardTitle>
                      <AlertCircle className="h-4 w-4 text-blue-200/70" />
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <div className="text-2xl font-semibold text-white">{((metrics as any)?.totalErrors || 0).toLocaleString()}</div>
                      <p className="text-xs text-blue-100/70">Monitor queue health and sender reputation</p>
                    </CardContent>
                  </Card>

                  <Card className={glassPanelClass}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-semibold text-blue-100/80">Opt-outs</CardTitle>
                      <UserMinus className="h-4 w-4 text-blue-200/70" />
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <div className="text-2xl font-semibold text-white">{((metrics as any)?.totalOptOuts || 0).toLocaleString()}</div>
                      <p className="text-xs text-blue-100/70">{`${formatPercent(Number((metrics as any)?.optOutRate || 0))}%`} opt-out rate</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* SMS Throttle Status - Only show for SMS mode */}
            {communicationType === "sms" && (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card className={glassPanelClass}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-blue-100/80">SMS rate limit status</CardTitle>
                      <Clock className="h-4 w-4 text-blue-200/70" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {smsRateLimitStatus ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-blue-100/70">Used this minute:</span>
                          <span className="font-semibold text-white">{(smsRateLimitStatus as any).used}/{(smsRateLimitStatus as any).limit}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-200">
                          <div
                            className={`h-2 rounded-full ${(smsRateLimitStatus as any).used >= (smsRateLimitStatus as any).limit * 0.8 ? 'bg-rose-500' : 'bg-sky-500'}`}
                            style={{ width: `${Math.min(((smsRateLimitStatus as any).used / (smsRateLimitStatus as any).limit) * 100, 100)}%` }}
                          ></div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-blue-100/70">
                          <span>Next reset: {new Date((smsRateLimitStatus as any).resetTime).toLocaleTimeString()}</span>
                          <Badge variant={(smsRateLimitStatus as any).canSend ? "default" : "destructive"} className="rounded-full px-3 py-1 text-[10px]">
                            {(smsRateLimitStatus as any).canSend ? "Can Send" : "Rate Limited"}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 text-center text-blue-100/70">Loading status...</div>
                    )}
                  </CardContent>
                </Card>

                <Card className={glassPanelClass}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-blue-100/80">SMS queue status</CardTitle>
                      <Settings className="h-4 w-4 text-blue-200/70" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {smsQueueStatus ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-blue-100/70">Messages in queue:</span>
                          <span className="font-semibold text-white">{(smsQueueStatus as any).queueLength}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-blue-100/70">Est. wait time:</span>
                          <span className="font-semibold text-white">{Math.ceil((smsQueueStatus as any).estimatedWaitTime / 60)} min</span>
                        </div>
                        <div className="mt-3">
                          <Label htmlFor="throttle-limit" className="text-sm font-semibold text-blue-100/80">
                            SMS Per Minute Limit
                          </Label>
                          <div className="flex gap-2 mt-1">
                            <Input
                              id="throttle-limit"
                              type="number"
                              min="1"
                              max="1000"
                              value={(tenantSettings as any)?.smsThrottleLimit || 10}
                              onChange={(e) => {
                                const newLimit = parseInt(e.target.value);
                                if (newLimit >= 1 && newLimit <= 1000) {
                                  updateSettingsMutation.mutate({
                                    smsThrottleLimit: newLimit,
                                  });
                                }
                              }}
                              className="w-20 rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60"
                            />
                            <span className="flex items-center text-sm text-blue-100/70">
                              texts/min
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 text-center text-blue-100/70">Loading status...</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Recent Campaigns */}
            <Card className={glassPanelClass}>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-blue-50">
                  Recent {communicationType === "email" ? "email" : "SMS"} campaigns
                </CardTitle>
              </CardHeader>
              <CardContent>
                {campaignsLoading ? (
                  <div className="py-4 text-center text-blue-100/70">Loading campaigns...</div>
                ) : (campaigns as any)?.length > 0 ? (
                  <div className="space-y-4">
                    {(campaigns as any).slice(0, 5).map((campaign: any) => (
                      <div
                        key={campaign.id}
                        className="flex items-center justify-between rounded-2xl border border-white/20 bg-white/10 p-4 text-blue-50 shadow-sm shadow-blue-900/10"
                      >
                        <div>
                          <h3 className="font-semibold text-blue-50">{campaign.name}</h3>
                          <p className="text-sm text-blue-100/70">
                            Target: {getTargetGroupLabel(campaign)} • Template: {campaign.templateName}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            className={cn(
                              "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide",
                              getStatusColor(campaign.status)
                            )}
                          >
                            {campaign.status}
                          </Badge>
                          <span className="text-sm font-medium text-blue-100/70">{campaign.totalSent || 0} sent</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-blue-100/70">
                    No campaigns yet. Create your first {communicationType} campaign to get started.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-10 text-white">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <h2 className="text-xl font-semibold text-blue-50">
                  {communicationType === "email" ? "Email" : "SMS"} templates
                </h2>
                <div className="flex items-center gap-1 rounded-full border border-white/20 bg-white/10 p-1 shadow-sm shadow-blue-900/10">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCommunicationType("email")}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-xs font-semibold",
                      communicationType === "email"
                        ? "bg-white/20 text-white shadow-lg shadow-blue-900/20"
                        : "text-blue-100/80 hover:bg-white/10"
                    )}
                  >
                    <Mail className="mr-2 h-3.5 w-3.5" /> Email
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCommunicationType("sms")}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-xs font-semibold",
                      communicationType === "sms"
                        ? "bg-white/20 text-white shadow-lg shadow-blue-900/20"
                        : "text-blue-100/80 hover:bg-white/10"
                    )}
                  >
                    <MessageSquare className="mr-2 h-3.5 w-3.5" /> SMS
                  </Button>
                </div>
              </div>
              <Dialog open={showTemplateModal} onOpenChange={(open) => {
                setShowTemplateModal(open);
                if (!open) {
                  setEditingTemplate(null);
                  setEmailTemplateForm({ name: "", subject: "", html: "", designType: "custom" });
                  setSmsTemplateForm({ name: "", message: "" });
                }
              }}>
                <DialogTrigger asChild>
                  <Button
                    data-testid="button-create-template"
                    className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-slate-400/40 transition hover:bg-slate-800"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create {communicationType === "email" ? "email" : "SMS"} template
                  </Button>
                </DialogTrigger>
                <DialogContent className={communicationType === "email" ? "max-w-[95vw] w-full h-[90vh] max-h-[900px]" : "max-w-2xl"}>
                  {communicationType === "email" ? (
                    <>
                      <DialogHeader className="pb-4 border-b">
                        <div className="flex items-center justify-between">
                          <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-blue-600" />
                            {editingTemplate ? "Edit" : "Create"} Email Template
                          </DialogTitle>
                          <div className="flex gap-2">
                            <Button
                              variant={!showPreview ? "default" : "outline"}
                              size="sm"
                              onClick={() => setShowPreview(false)}
                              data-testid="button-code-view"
                            >
                              <Code className="h-4 w-4 mr-1" />
                              Code
                            </Button>
                            <Button
                              variant={showPreview ? "default" : "outline"}
                              size="sm"
                              onClick={() => setShowPreview(true)}
                              data-testid="button-preview-view"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Preview
                            </Button>
                          </div>
                        </div>
                      </DialogHeader>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100%-140px)] overflow-hidden">
                        {/* Left Panel - Template Editor */}
                        <div className="flex flex-col space-y-3 overflow-y-auto pr-2">
                          <div>
                            <Label className="text-sm font-medium mb-2 block">Choose Template Design</Label>
                            <div className="grid grid-cols-2 gap-2">
                              {(Object.keys(POSTMARK_TEMPLATES) as PostmarkTemplateType[]).map((key) => {
                                const template = POSTMARK_TEMPLATES[key];
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => handleDesignSelect(key)}
                                    className={cn(
                                      "p-3 border-2 rounded-lg text-left transition hover:border-blue-400",
                                      emailTemplateForm.designType === key
                                        ? "border-blue-500 bg-blue-50"
                                        : "border-gray-200 bg-white"
                                    )}
                                    data-testid={`button-design-${key}`}
                                  >
                                    <div className="text-2xl mb-1">{template.thumbnail}</div>
                                    <div className="font-medium text-sm">{template.name}</div>
                                    <div className="text-xs text-gray-500 mt-1">{template.description}</div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          
                          <div>
                            <Label className="text-sm font-medium">Template Name *</Label>
                            <Input
                              value={emailTemplateForm.name}
                              onChange={(e) => setEmailTemplateForm({...emailTemplateForm, name: e.target.value})}
                              placeholder="e.g., Payment Reminder"
                              className="mt-1"
                              data-testid="input-template-name"
                            />
                          </div>
                          
                          <div>
                            <Label className="text-sm font-medium">Subject Line *</Label>
                            <Input
                              value={emailTemplateForm.subject}
                              onChange={(e) => setEmailTemplateForm({...emailTemplateForm, subject: e.target.value})}
                              placeholder="e.g., Payment Required - Account {{accountNumber}}"
                              className="mt-1"
                              data-testid="input-subject"
                            />
                          </div>

                          <div>
                            <Label className="text-sm font-medium mb-2 block">Insert Variables</Label>
                            <div className="flex flex-wrap gap-1.5 p-3 bg-gray-50 rounded-lg border mb-2">
                              {templateVariables.map((variable) => (
                                <Button
                                  key={variable.value}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => insertVariable(variable.value)}
                                  className="text-xs h-7 px-2 bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                                  data-testid={`button-var-${variable.value.replace(/[{}]/g, '')}`}
                                >
                                  {variable.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                          
                          <div className="flex-1">
                            <Label className="text-sm font-medium">Email Content (HTML) *</Label>
                            <Textarea
                              ref={emailTextareaRef}
                              rows={16}
                              value={emailTemplateForm.html}
                              onChange={(e) => setEmailTemplateForm({...emailTemplateForm, html: e.target.value})}
                              placeholder="Enter your HTML email content. Click variables above to insert them."
                              className="font-mono text-sm mt-1 resize-none"
                              data-testid="textarea-html"
                            />
                          </div>
                        </div>

                        {/* Right Panel - Preview */}
                        <div className="flex flex-col border-l pl-4 overflow-hidden">
                          <div className="mb-3">
                            <Label className="text-sm font-medium flex items-center gap-2">
                              <Eye className="h-4 w-4" />
                              Email Preview
                            </Label>
                            <p className="text-xs text-gray-500 mt-1">
                              Preview with sample data
                            </p>
                          </div>
                          
                          <div className="flex-1 border rounded-lg overflow-auto bg-gray-50 p-4">
                            {showPreview && emailTemplateForm.html ? (
                              <div className="bg-white rounded shadow-sm p-6 mx-auto max-w-2xl">
                                {/* Logo if available */}
                                {(tenantSettings as any)?.logoUrl && (
                                  <div className="text-center mb-6 pb-6 border-b">
                                    <img 
                                      src={(tenantSettings as any).logoUrl} 
                                      alt="Agency Logo" 
                                      className="h-12 mx-auto"
                                    />
                                  </div>
                                )}
                                {/* Subject */}
                                <div className="mb-4 pb-4 border-b">
                                  <div className="text-xs text-gray-500 mb-1">Subject:</div>
                                  <div className="font-semibold text-gray-900">
                                    {emailTemplateForm.subject.replace(/\{\{accountNumber\}\}/g, "ACC-12345").replace(/\{\{firstName\}\}/g, "John") || "No subject"}
                                  </div>
                                </div>
                                {/* Rendered HTML */}
                                <div 
                                  className="prose prose-sm max-w-none"
                                  dangerouslySetInnerHTML={{ __html: renderPreview() }}
                                />
                              </div>
                            ) : (
                              <div className="h-full flex items-center justify-center text-gray-400">
                                <div className="text-center">
                                  <Eye className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                  <p className="text-sm">
                                    {showPreview ? "Add content to see preview" : "Click Preview to see your email"}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-end space-x-3 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={() => setShowTemplateModal(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleTemplateSubmit} 
                          disabled={createEmailTemplateMutation.isPending || updateEmailTemplateMutation.isPending}
                        >
                          {(createEmailTemplateMutation.isPending || updateEmailTemplateMutation.isPending) ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              {editingTemplate ? "Updating..." : "Creating..."}
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-2" />
                              {editingTemplate ? "Update Template" : "Create Template"}
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <DialogHeader>
                        <DialogTitle>Create SMS Template</DialogTitle>
                        <p className="text-sm text-muted-foreground">
                          Create a new SMS template for your campaigns.
                        </p>
                      </DialogHeader>
                      <form onSubmit={handleTemplateSubmit} className="space-y-4">
                        <div>
                          <Label htmlFor="template-name">Template Name</Label>
                          <Input
                            id="template-name"
                            data-testid="input-template-name"
                            value={smsTemplateForm.name}
                            onChange={(e) => setSmsTemplateForm({ ...smsTemplateForm, name: e.target.value })}
                            placeholder="Enter template name"
                            required
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor="message" className="mb-2 block">Insert Variables</Label>
                          <div className="flex flex-wrap gap-1.5 p-3 bg-gray-50 rounded-lg border mb-2">
                            {templateVariables.filter(v => v.category !== "account" || v.value === "{{accountNumber}}" || v.value === "{{balance}}" || v.value === "{{dueDate}}").map((variable) => (
                              <Button
                                key={variable.value}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => insertVariable(variable.value)}
                                className="text-xs h-7 px-2 bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                              >
                                {variable.label}
                              </Button>
                            ))}
                          </div>
                          
                          <Label htmlFor="message">Message Content</Label>
                          <Textarea
                            id="message"
                            ref={smsTextareaRef}
                            data-testid="textarea-message"
                            value={smsTemplateForm.message}
                            onChange={(e) => setSmsTemplateForm({ ...smsTemplateForm, message: e.target.value })}
                            placeholder="Enter your SMS message. Click variables above to insert them."
                            rows={6}
                            maxLength={1600}
                            required
                            className="font-mono text-sm"
                          />
                          <p className="mt-1 text-sm text-gray-500">
                            {smsTemplateForm.message.length}/1600 characters
                          </p>
                        </div>
                        
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowTemplateModal(false)}
                            data-testid="button-cancel-template"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            disabled={createSmsTemplateMutation.isPending}
                            data-testid="button-save-template"
                          >
                            {createSmsTemplateMutation.isPending ? "Creating..." : "Create Template"}
                          </Button>
                        </div>
                      </form>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {templatesLoading ? (
                <div className="col-span-full text-center py-8">Loading templates...</div>
              ) : (templates as any)?.length > 0 ? (
                (templates as any).map((template: any) => (
                  <Card key={template.id} className={glassPanelClass}>
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-semibold text-blue-50">{template.name}</CardTitle>
                        <Badge variant={template.status === "active" ? "default" : "secondary"}>
                          {template.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {communicationType === "email" ? (
                        <>
                          <p className="text-sm font-semibold text-blue-100/70">Subject</p>
                          <p className="text-sm text-blue-100/80">{template.subject}</p>
                          <p className="text-sm text-blue-100/70 line-clamp-3">
                            {template.html.replace(/<[^>]*>/g, '')}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-blue-100/70 line-clamp-3">
                          {template.message}
                        </p>
                      )}
                      {/* Agency URL Section */}
                      <div className="rounded-xl border border-white/15 bg-white/10 p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-600 mb-1">Agency URL:</p>
                            <p className="text-xs text-gray-800 font-mono truncate">
                              {window.location.origin}/agency/{(userData as any)?.platformUser?.tenant?.slug || 'your-agency'}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-2 h-7 w-7 rounded-full bg-white/10 p-0 text-blue-100/70 hover:bg-slate-900/10"
                            onClick={() => {
                              const url = `${window.location.origin}/agency/${(userData as any)?.platformUser?.tenant?.slug || 'your-agency'}`;
                              navigator.clipboard.writeText(url);
                              toast({
                                title: "URL Copied",
                                description: "Agency URL has been copied to clipboard.",
                              });
                            }}
                            data-testid={`button-copy-url-${template.id}`}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2 rounded-full border border-white/20 bg-transparent px-3 py-1 text-xs font-semibold text-blue-100 transition hover:bg-white/10"
                          onClick={() => handlePreview(template)}
                          data-testid={`button-preview-${template.id}`}
                        >
                          <Eye className="h-4 w-4" /> Preview
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2 rounded-full border border-white/20 bg-transparent px-3 py-1 text-xs font-semibold text-blue-100 transition hover:bg-white/10"
                          onClick={() => handleEditTemplate(template)}
                          data-testid={`button-edit-${template.id}`}
                        >
                          <Settings className="h-4 w-4" /> Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-2 border-rose-200 text-rose-500"
                              data-testid={`button-delete-${template.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Template</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{template.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  if (communicationType === "email") {
                                    deleteEmailTemplateMutation.mutate(template.id);
                                  } else {
                                    deleteSmsTemplateMutation.mutate(template.id);
                                  }
                                }}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="col-span-full text-center py-8 text-gray-500">
                  No templates yet. Create your first {communicationType} template to get started.
                </div>
              )}
            </div>

            {/* Template Preview Modal */}
            <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {communicationType === "email" ? "Email" : "SMS"} Template Preview: {previewTemplate?.name}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    Preview your template content before using it in campaigns.
                  </p>
                </DialogHeader>
                <div className="space-y-4">
                  {communicationType === "email" ? (
                    <>
                      <div>
                        <div className="text-sm font-medium text-gray-600 mb-2">Subject:</div>
                        <div className="text-sm font-medium">{previewTemplate?.subject}</div>
                      </div>
                      <div className="border rounded-lg p-4 bg-gray-50">
                        <div className="text-sm font-medium text-gray-600 mb-2">Email Content:</div>
                        <div className="whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: previewTemplate?.html }} />
                      </div>
                    </>
                  ) : (
                    <div className="border rounded-lg p-4 bg-gray-50">
                      <div className="text-sm font-medium text-gray-600 mb-2">SMS Message:</div>
                      <div className="whitespace-pre-wrap text-sm">
                        {previewTemplate?.message}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>
                      {communicationType === "email" ? 
                        `Content Length: ${previewTemplate?.html?.length || 0} characters` :
                        `Message Length: ${previewTemplate?.message?.length || 0} characters`
                      }
                    </span>
                    <span>Status: {previewTemplate?.status}</span>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setPreviewTemplate(null)}>
                    Close
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="campaigns" className="space-y-10 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-semibold">
                  {communicationType === "email" ? "Email" : "SMS"} Campaigns
                </h2>
                <div className="flex gap-2">
                  <Button
                    variant={communicationType === "email" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCommunicationType("email")}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </Button>
                  <Button
                    variant={communicationType === "sms" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCommunicationType("sms")}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    SMS
                  </Button>
                </div>
              </div>
              <Dialog open={showCampaignModal} onOpenChange={setShowCampaignModal}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-campaign">
                    <Plus className="h-4 w-4 mr-2" />
                    Create {communicationType === "email" ? "Email" : "SMS"} Campaign
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create {communicationType === "email" ? "Email" : "SMS"} Campaign</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      Create a new campaign to send messages to your target audience.
                    </p>
                  </DialogHeader>
                  <form onSubmit={handleCampaignSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="campaign-name">Campaign Name</Label>
                      <Input
                        id="campaign-name"
                        data-testid="input-campaign-name"
                        value={campaignForm.name}
                        onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                        placeholder="Enter campaign name"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="template">{communicationType === "email" ? "Email" : "SMS"} Template</Label>
                      <Select
                        value={campaignForm.templateId}
                        onValueChange={(value) => setCampaignForm({ ...campaignForm, templateId: value })}
                      >
                        <SelectTrigger data-testid="select-template">
                          <SelectValue placeholder="Select a template" />
                        </SelectTrigger>
                        <SelectContent>
                          {(templates as any)?.map((template: any) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="target-type">Target Type</Label>
                      <Select
                        value={campaignForm.targetType}
                        onValueChange={(value: "all" | "folder" | "custom") => {
                          setCampaignForm({ 
                            ...campaignForm, 
                            targetType: value,
                            targetGroup: value === "all" ? "all" : campaignForm.targetGroup,
                            targetFolderIds: value === "folder" ? campaignForm.targetFolderIds : [],
                          });
                        }}
                      >
                        <SelectTrigger data-testid="select-target-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Consumers</SelectItem>
                          <SelectItem value="folder">Specific Folders</SelectItem>
                          <SelectItem value="custom">Custom Selection</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {campaignForm.targetType === "all" && (
                      <div>
                        <Label htmlFor="target-group">Target Group</Label>
                        <Select
                          value={campaignForm.targetGroup}
                          onValueChange={(value) => setCampaignForm({ ...campaignForm, targetGroup: value })}
                        >
                          <SelectTrigger data-testid="select-target-group">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Consumers</SelectItem>
                            <SelectItem value="with-balance">With Outstanding Balance</SelectItem>
                            <SelectItem value="decline">Decline Status</SelectItem>
                            <SelectItem value="recent-upload">Most Recent Upload</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {campaignForm.targetType === "folder" && (
                      <div>
                        <Label>Select Folders</Label>
                        <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                          {(folders as any)?.map((folder: any) => (
                            <div key={folder.id} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`folder-${folder.id}`}
                                checked={campaignForm.targetFolderIds.includes(folder.id)}
                                onChange={(e) => {
                                  const newFolderIds = e.target.checked
                                    ? [...campaignForm.targetFolderIds, folder.id]
                                    : campaignForm.targetFolderIds.filter(id => id !== folder.id);
                                  setCampaignForm({ ...campaignForm, targetFolderIds: newFolderIds });
                                }}
                                className="rounded"
                              />
                              <label htmlFor={`folder-${folder.id}`} className="text-sm font-medium">
                                {folder.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {campaignForm.targetType === "custom" && (
                      <div className="space-y-4">
                        <Label>Custom Filters</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="balance-min">Min Balance</Label>
                            <Input
                              id="balance-min"
                              type="number"
                              placeholder="0.00"
                              value={campaignForm.customFilters.balanceMin}
                              onChange={(e) => setCampaignForm({
                                ...campaignForm,
                                customFilters: { ...campaignForm.customFilters, balanceMin: e.target.value }
                              })}
                            />
                          </div>
                          <div>
                            <Label htmlFor="balance-max">Max Balance</Label>
                            <Input
                              id="balance-max"
                              type="number"
                              placeholder="1000.00"
                              value={campaignForm.customFilters.balanceMax}
                              onChange={(e) => setCampaignForm({
                                ...campaignForm,
                                customFilters: { ...campaignForm.customFilters, balanceMax: e.target.value }
                              })}
                            />
                          </div>
                          <div>
                            <Label htmlFor="status-filter">Account Status</Label>
                            <Select
                              value={campaignForm.customFilters.status}
                              onValueChange={(value) => setCampaignForm({
                                ...campaignForm,
                                customFilters: { ...campaignForm.customFilters, status: value }
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Any status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="">Any Status</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
                                <SelectItem value="dispute">In Dispute</SelectItem>
                                <SelectItem value="payment_plan">Payment Plan</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="last-contact">Days Since Last Contact</Label>
                            <Input
                              id="last-contact"
                              type="number"
                              placeholder="30"
                              value={campaignForm.customFilters.lastContactDays}
                              onChange={(e) => setCampaignForm({
                                ...campaignForm,
                                customFilters: { ...campaignForm.customFilters, lastContactDays: e.target.value }
                              })}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowCampaignModal(false)}
                        data-testid="button-cancel-campaign"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createEmailCampaignMutation.isPending || createSmsCampaignMutation.isPending}
                        data-testid="button-save-campaign"
                      >
                        {(createEmailCampaignMutation.isPending || createSmsCampaignMutation.isPending) ? "Creating..." : "Create Campaign"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card className={glassPanelClass}>
              <CardHeader className="border-b border-white/20 pb-4">
                <CardTitle className="text-lg font-semibold text-blue-50">
                  All {communicationType === "email" ? "Email" : "SMS"} Campaigns
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {campaignsLoading ? (
                  <div className="py-8 text-center text-blue-100/70">Loading campaigns...</div>
                ) : (campaigns as any)?.length > 0 ? (
                  <div className="space-y-4">
                    {(campaigns as any).map((campaign: any) => (
                      <div
                        key={campaign.id}
                        className="rounded-2xl border border-white/15 bg-white/10 p-5 shadow-sm shadow-blue-900/10"
                      >
                        <div className="mb-3 flex items-start justify-between gap-4">
                          <h3 className="text-base font-semibold text-blue-50">{campaign.name}</h3>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={cn(
                                "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide",
                                getStatusColor(campaign.status)
                              )}
                            >
                              {campaign.status}
                            </Badge>
                            {campaign.status === "pending" && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-600 hover:text-red-700"
                                    aria-label="Delete campaign"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will cancel the pending {communicationType.toUpperCase()} campaign before it is sent to consumers. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 hover:bg-red-700"
                                      onClick={() => deleteCampaignMutation.mutate({ id: campaign.id, type: communicationType })}
                                      disabled={deleteCampaignMutation.isPending}
                                    >
                                      {deleteCampaignMutation.isPending ? "Deleting..." : "Delete"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm text-blue-100/70 md:grid-cols-4">
                          <div>
                            <span className="text-xs uppercase tracking-wide text-blue-100/70">Template</span>
                            <div className="mt-1 font-semibold text-blue-50">{campaign.templateName}</div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wide text-blue-100/70">Target</span>
                            <div className="mt-1 font-semibold text-blue-50">{getTargetGroupLabel(campaign)}</div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wide text-blue-100/70">Recipients</span>
                            <div className="mt-1 font-semibold text-blue-50">{campaign.totalRecipients || 0}</div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wide text-blue-100/70">Sent</span>
                            <div className="mt-1 font-semibold text-blue-50">{campaign.totalSent || 0}</div>
                          </div>
                        </div>
                        {/* Agency URL for reference */}
                        <div className="mt-4 border-t border-white/15 pt-4">
                          <span className="text-[11px] uppercase tracking-wide text-blue-100/70">Agency URL</span>
                          <span className="mt-1 block font-mono text-xs text-blue-50">
                            {window.location.origin}/agency/{(userData as any)?.platformUser?.tenant?.slug || 'your-agency'}
                          </span>
                        </div>
                        {campaign.status === "completed" && (
                          <div className="mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-blue-100/70 md:grid-cols-4">
                            <div>
                              <span className="text-xs uppercase tracking-wide text-blue-100/70">Delivered</span>
                              <div className="mt-1 font-semibold text-emerald-600">{campaign.totalDelivered || 0}</div>
                            </div>
                            {communicationType === "email" && (
                              <>
                                <div>
                                  <span className="text-xs uppercase tracking-wide text-blue-100/70">Opened</span>
                                  <div className="mt-1 font-semibold text-sky-600">{campaign.totalOpened || 0}</div>
                                </div>
                                <div>
                                  <span className="text-xs uppercase tracking-wide text-blue-100/70">Clicked</span>
                                  <div className="mt-1 font-semibold text-indigo-600">{campaign.totalClicked || 0}</div>
                                </div>
                              </>
                            )}
                            <div>
                              <span className="text-xs uppercase tracking-wide text-blue-100/70">
                                {communicationType === "email" ? "Errors" : "Failed"}
                              </span>
                              <div className="mt-1 font-semibold text-rose-600">{campaign.totalErrors || 0}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 py-10 text-center text-blue-100/70">
                    No campaigns yet. Create your first {communicationType} campaign to get started.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="space-y-10 text-white">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-blue-50">Callback Requests</h2>
            </div>

            <Card className={glassPanelClass}>
              <CardHeader className="border-b border-white/20 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold text-blue-50">
                  <Phone className="h-5 w-5 text-sky-600" />
                  Consumer Callback Requests
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {(callbackRequests as any)?.length > 0 ? (
                  <div className="space-y-4">
                    {(callbackRequests as any).map((request: any) => (
                      <div
                        key={request.id}
                        className="rounded-2xl border border-white/15 bg-white/10 p-5 shadow-sm shadow-blue-900/10"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-base font-semibold text-blue-50">
                            {request.consumer?.firstName} {request.consumer?.lastName}
                          </h3>
                          <Badge
                            className={cn(
                              "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide",
                              request.status === "pending"
                                ? "border-amber-200/70 bg-amber-100/80 text-amber-700"
                                : "border-emerald-200/70 bg-emerald-100/80 text-emerald-700"
                            )}
                          >
                            {request.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 gap-4 text-sm text-blue-100/70 md:grid-cols-3">
                          <div>
                            <span className="text-xs uppercase tracking-wide text-blue-100/70">Phone</span>
                            <div className="mt-1 font-semibold text-blue-50">{request.phoneNumber}</div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wide text-blue-100/70">Preferred Time</span>
                            <div className="mt-1 font-semibold text-blue-50">{request.preferredTime || "Any time"}</div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wide text-blue-100/70">Requested</span>
                            <div className="mt-1 font-semibold text-blue-50">
                              {new Date(request.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        {request.message && (
                          <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-blue-100/70">
                            <span className="text-xs uppercase tracking-wide text-blue-100/70">Message</span>
                            <p className="mt-1 text-blue-100/80">{request.message}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 py-10 text-center text-blue-100/70">
                    No callback requests yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automation" className="space-y-10 text-white">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Communication Automation</h2>
              <Dialog open={showAutomationModal} onOpenChange={setShowAutomationModal}>
                <DialogTrigger asChild>
                  <Button 
                    data-testid="button-create-automation"
                    className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-slate-400/40 transition hover:bg-slate-800"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create Automation
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Communication Automation</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      Set up automated messaging campaigns based on schedules or events.
                    </p>
                  </DialogHeader>
                  <form onSubmit={handleAutomationSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="automation-name">Automation Name *</Label>
                        <Input
                          id="automation-name"
                          value={automationForm.name}
                          onChange={(e) => setAutomationForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g., Welcome Email Series"
                          data-testid="input-automation-name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="automation-type">Communication Type *</Label>
                        <Select 
                          value={automationForm.type} 
                          onValueChange={(value: "email" | "sms") => setAutomationForm(prev => ({ ...prev, type: value }))}
                        >
                          <SelectTrigger data-testid="select-automation-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="sms">SMS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="automation-description">Description</Label>
                      <Textarea
                        id="automation-description"
                        value={automationForm.description}
                        onChange={(e) => setAutomationForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe what this automation does..."
                        data-testid="textarea-automation-description"
                      />
                    </div>

                    <div>
                      <Label htmlFor="automation-template">
                        {automationForm.scheduleType === "once" ? "Template *" : 
                         automationForm.scheduleType === "sequence" ? "Template Sequence *" : 
                         "Templates * (Select multiple for rotation)"}
                      </Label>
                      {automationForm.scheduleType === "once" ? (
                        <Select 
                          value={automationForm.templateId} 
                          onValueChange={(value) => setAutomationForm(prev => ({ ...prev, templateId: value }))}
                        >
                          <SelectTrigger data-testid="select-automation-template">
                            <SelectValue placeholder="Choose a template" />
                          </SelectTrigger>
                          <SelectContent>
                            {automationForm.type === "email" 
                              ? (emailTemplates as any[])?.map((template: any) => (
                                  <SelectItem key={template.id} value={template.id}>
                                    {template.name}
                                  </SelectItem>
                                )) || []
                              : (smsTemplates as any[])?.map((template: any) => (
                                  <SelectItem key={template.id} value={template.id}>
                                    {template.name}
                                  </SelectItem>
                                )) || []
                            }
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-sm text-gray-600">
                            {automationForm.scheduleType === "sequence" 
                              ? "Create a sequence of emails to send on different days. Day 0 is the trigger day."
                              : "Select multiple templates to rotate between on each execution"
                            }
                          </div>
                          {automationForm.scheduleType === "sequence" ? (
                            <div className="space-y-3">
                              {automationForm.templateSchedule.map((item, index) => (
                                <div key={index} className="flex items-center space-x-3 p-3 border rounded-lg">
                                  <div className="flex-1">
                                    <Label className="text-xs text-gray-500">Day {item.dayOffset}</Label>
                                    <Select
                                      value={item.templateId}
                                      onValueChange={(templateId) => {
                                        const newSchedule = [...automationForm.templateSchedule];
                                        newSchedule[index].templateId = templateId;
                                        setAutomationForm(prev => ({ ...prev, templateSchedule: newSchedule }));
                                      }}
                                    >
                                      <SelectTrigger className="h-8">
                                        <SelectValue placeholder="Choose template" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {automationForm.type === "email" 
                                          ? (emailTemplates as any[])?.map((template: any) => (
                                              <SelectItem key={template.id} value={template.id}>
                                                {template.name}
                                              </SelectItem>
                                            )) || []
                                          : (smsTemplates as any[])?.map((template: any) => (
                                              <SelectItem key={template.id} value={template.id}>
                                                {template.name}
                                              </SelectItem>
                                            )) || []
                                        }
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const newSchedule = automationForm.templateSchedule.filter((_, i) => i !== index);
                                      setAutomationForm(prev => ({ ...prev, templateSchedule: newSchedule }));
                                    }}
                                    data-testid={`button-remove-template-${index}`}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              ))}
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  const maxDay = automationForm.templateSchedule.length > 0 
                                    ? Math.max(...automationForm.templateSchedule.map(s => s.dayOffset)) + 1 
                                    : 0;
                                  setAutomationForm(prev => ({
                                    ...prev,
                                    templateSchedule: [...prev.templateSchedule, { templateId: "", dayOffset: maxDay }]
                                  }));
                                }}
                                data-testid="button-add-template-to-sequence"
                              >
                                + Add Template to Sequence
                              </Button>
                            </div>
                          ) : (
                            <>
                              {automationForm.type === "email" 
                                ? (emailTemplates as any[])?.map((template: any) => (
                                    <div key={template.id} className="flex items-center space-x-2">
                                      <input
                                        type="checkbox"
                                        id={`template-${template.id}`}
                                        checked={automationForm.templateIds.includes(template.id)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setAutomationForm(prev => ({
                                              ...prev,
                                              templateIds: [...prev.templateIds, template.id]
                                            }));
                                          } else {
                                            setAutomationForm(prev => ({
                                              ...prev,
                                              templateIds: prev.templateIds.filter(id => id !== template.id)
                                            }));
                                          }
                                        }}
                                        data-testid={`checkbox-template-${template.id}`}
                                        className="rounded border-gray-300"
                                      />
                                      <Label htmlFor={`template-${template.id}`} className="text-sm">
                                        {template.name}
                                      </Label>
                                    </div>
                                  )) || []
                                : (smsTemplates as any[])?.map((template: any) => (
                                    <div key={template.id} className="flex items-center space-x-2">
                                      <input
                                        type="checkbox"
                                        id={`template-${template.id}`}
                                        checked={automationForm.templateIds.includes(template.id)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setAutomationForm(prev => ({
                                              ...prev,
                                              templateIds: [...prev.templateIds, template.id]
                                            }));
                                          } else {
                                            setAutomationForm(prev => ({
                                              ...prev,
                                              templateIds: prev.templateIds.filter(id => id !== template.id)
                                            }));
                                          }
                                        }}
                                        data-testid={`checkbox-template-${template.id}`}
                                        className="rounded border-gray-300"
                                      />
                                      <Label htmlFor={`template-${template.id}`} className="text-sm">
                                        {template.name}
                                      </Label>
                                    </div>
                                  )) || []
                              }
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <Label>Trigger Type *</Label>
                      <Select 
                        value={automationForm.triggerType} 
                        onValueChange={(value: "schedule" | "event" | "manual") => setAutomationForm(prev => ({ ...prev, triggerType: value }))}
                      >
                        <SelectTrigger data-testid="select-trigger-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="schedule">Scheduled</SelectItem>
                          <SelectItem value="event">Event-based</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {automationForm.triggerType === "schedule" && (
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>Schedule Type</Label>
                          <Select 
                            value={automationForm.scheduleType} 
                            onValueChange={(value: "once" | "daily" | "weekly" | "monthly") => setAutomationForm(prev => ({ ...prev, scheduleType: value }))}
                          >
                            <SelectTrigger data-testid="select-schedule-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="once">One-time</SelectItem>
                              <SelectItem value="sequence">Email Sequence (Different templates on different days)</SelectItem>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Date</Label>
                          <Input
                            type="date"
                            value={automationForm.scheduledDate}
                            onChange={(e) => setAutomationForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
                            data-testid="input-schedule-date"
                          />
                        </div>
                        <div>
                          <Label>Time</Label>
                          <Input
                            type="time"
                            value={automationForm.scheduleTime}
                            onChange={(e) => setAutomationForm(prev => ({ ...prev, scheduleTime: e.target.value }))}
                            data-testid="input-schedule-time"
                          />
                        </div>
                      </div>
                    )}

                    {automationForm.triggerType === "event" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Event Type</Label>
                          <Select 
                            value={automationForm.eventType} 
                            onValueChange={(value: "account_created" | "payment_overdue" | "custom") => setAutomationForm(prev => ({ ...prev, eventType: value }))}
                          >
                            <SelectTrigger data-testid="select-event-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="account_created">Account Created</SelectItem>
                              <SelectItem value="payment_overdue">Payment Overdue</SelectItem>
                              <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Delay</Label>
                          <Select 
                            value={automationForm.eventDelay} 
                            onValueChange={(value) => setAutomationForm(prev => ({ ...prev, eventDelay: value }))}
                          >
                            <SelectTrigger data-testid="select-event-delay">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">Immediately</SelectItem>
                              <SelectItem value="1h">1 Hour</SelectItem>
                              <SelectItem value="1d">1 Day</SelectItem>
                              <SelectItem value="3d">3 Days</SelectItem>
                              <SelectItem value="7d">1 Week</SelectItem>
                              <SelectItem value="30d">1 Month</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    <div>
                      <Label>Target Audience</Label>
                      <Select 
                        value={automationForm.targetType} 
                        onValueChange={(value: "all" | "folder" | "custom") => setAutomationForm(prev => ({ ...prev, targetType: value }))}
                      >
                        <SelectTrigger data-testid="select-target-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Accounts</SelectItem>
                          <SelectItem value="folder">Specific Folders</SelectItem>
                          <SelectItem value="custom">Custom Selection</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex justify-end gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowAutomationModal(false)}
                        data-testid="button-cancel-automation"
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createAutomationMutation.isPending}
                        data-testid="button-submit-automation"
                      >
                        {createAutomationMutation.isPending ? "Creating..." : "Create Automation"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card className={glassPanelClass}>
              <CardHeader className="border-b border-white/20 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold text-blue-50">
                  <Clock className="h-5 w-5 text-sky-600" />
                  Active Automations
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {automationsLoading ? (
                  <div className="py-8 text-center text-blue-100/70">Loading automations...</div>
                ) : (automations as any[])?.length > 0 ? (
                  <div className="space-y-4">
                    {(automations as any[]).map((automation: any) => (
                      <div
                        key={automation.id}
                        className="rounded-2xl border border-white/15 bg-white/10 p-5 shadow-sm shadow-blue-900/10"
                      >
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-semibold text-blue-50">{automation.name}</h3>
                              <Badge
                                className={cn(
                                  "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide",
                                  automation.isActive
                                    ? "border-emerald-200/70 bg-emerald-100/80 text-emerald-700"
                                    : "border-white/15 bg-slate-100/80 text-blue-100/70"
                                )}
                              >
                                {automation.isActive ? "Active" : "Inactive"}
                              </Badge>
                              <Badge className="rounded-full border border-sky-200/70 bg-sky-100/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                                {automation.type.toUpperCase()}
                              </Badge>
                            </div>
                            {automation.description && (
                              <p className="text-sm text-blue-100/70">{automation.description}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-full border border-white/15 bg-white/10 px-4 py-1 text-xs font-semibold text-blue-100/80 shadow-sm hover:bg-white"
                              onClick={() =>
                                toggleAutomationMutation.mutate({
                                  id: automation.id,
                                  isActive: !automation.isActive,
                                })
                              }
                              data-testid={`button-toggle-automation-${automation.id}`}
                            >
                              {automation.isActive ? "Pause" : "Resume"}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="rounded-full border border-rose-200/60 bg-rose-50/60 px-4 py-1 text-xs font-semibold text-rose-600 shadow-sm hover:bg-rose-50"
                                  data-testid={`button-delete-automation-${automation.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Automation</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this automation? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteAutomationMutation.mutate(automation.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-4 text-sm text-blue-100/70 md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <span className="text-xs uppercase tracking-wide text-blue-100/70">Trigger</span>
                            <div className="mt-1 font-semibold capitalize text-blue-50">{automation.triggerType}</div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wide text-blue-100/70">
                              Template{automation.templateIds?.length > 1 ? "s" : ""}
                            </span>
                            <div className="mt-1 font-semibold text-blue-50">
                              {automation.templateIds && automation.templateIds.length > 0 ? (
                                automation.templateIds.length === 1 ? (
                                  automation.type === "email"
                                    ? (emailTemplates as any[])?.find((t: any) => t.id === automation.templateIds[0])?.name || "Unknown"
                                    : (smsTemplates as any[])?.find((t: any) => t.id === automation.templateIds[0])?.name || "Unknown"
                                ) : (
                                  `${automation.templateIds.length} templates (rotating)`
                                )
                              ) : (
                                automation.type === "email"
                                  ? (emailTemplates as any[])?.find((t: any) => t.id === automation.templateId)?.name || "Unknown"
                                  : (smsTemplates as any[])?.find((t: any) => t.id === automation.templateId)?.name || "Unknown"
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wide text-blue-100/70">Target</span>
                            <div className="mt-1 font-semibold capitalize text-blue-50">{automation.targetType}</div>
                          </div>
                          <div>
                            <span className="text-xs uppercase tracking-wide text-blue-100/70">Next Run</span>
                            <div className="mt-1 font-semibold text-blue-50">
                              {automation.nextExecution
                                ? new Date(automation.nextExecution).toLocaleDateString()
                                : "Not scheduled"}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-white/15 pt-4 text-sm text-blue-100/70 sm:grid-cols-2">
                          <div>Created: {new Date(automation.createdAt).toLocaleString()}</div>
                          {automation.lastRunAt && <div>Last Run: {new Date(automation.lastRunAt).toLocaleString()}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 py-10 text-center text-blue-100/70">
                    <Calendar className="mx-auto mb-4 h-12 w-12 text-blue-200/60" />
                    <p className="text-base font-semibold">No automations created yet.</p>
                    <p className="text-sm text-blue-100/70">Create your first automation to start scheduling communications.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Campaign Confirmation Dialog */}
        <AlertDialog open={showCampaignConfirmation} onOpenChange={setShowCampaignConfirmation}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Campaign Creation</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to create this {communicationType} campaign? 
                This will send messages to: {getTargetGroupLabel(campaignForm)}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-campaign">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleCampaignConfirm}
                data-testid="button-confirm-campaign"
                className="bg-red-600 hover:bg-red-700"
              >
                Yes, Create Campaign
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}