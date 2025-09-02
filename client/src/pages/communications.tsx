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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import { Mail, MessageSquare, Plus, Send, FileText, Trash2, Eye, TrendingUp, Users, AlertCircle, MousePointer, UserMinus, Phone, Clock, Calendar, Settings } from "lucide-react";

export default function Communications() {
  const [activeTab, setActiveTab] = useState("overview");
  const [communicationType, setCommunicationType] = useState<"email" | "sms">("email");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  
  const [emailTemplateForm, setEmailTemplateForm] = useState({
    name: "",
    subject: "",
    html: "",
  });
  
  const [smsTemplateForm, setSmsTemplateForm] = useState({
    name: "",
    message: "",
  });
  
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    templateId: "",
    targetGroup: "all",
  });

  const [automationForm, setAutomationForm] = useState({
    name: "",
    description: "",
    type: "email" as "email" | "sms",
    templateId: "",
    templateIds: [] as string[], // For multiple templates
    triggerType: "schedule" as "schedule" | "event" | "manual",
    scheduleType: "once" as "once" | "daily" | "weekly" | "monthly",
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

  // Email Mutations
  const createEmailTemplateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/email-templates", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      setShowTemplateModal(false);
      setEmailTemplateForm({ name: "", subject: "", html: "" });
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

  const deleteEmailTemplateMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/email-templates/${id}`, "DELETE"),
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
    mutationFn: (data: any) => apiRequest("/api/sms-templates", "POST", data),
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
    mutationFn: (id: string) => apiRequest(`/api/sms-templates/${id}`, "DELETE"),
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
    mutationFn: (data: any) => apiRequest("/api/email-campaigns", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-campaigns"] });
      setShowCampaignModal(false);
      setCampaignForm({ name: "", templateId: "", targetGroup: "all" });
      toast({
        title: "Success",
        description: "Email campaign created and scheduled",
      });
    },
  });

  const createSmsCampaignMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/sms-campaigns", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
      setShowCampaignModal(false);
      setCampaignForm({ name: "", templateId: "", targetGroup: "all" });
      toast({
        title: "Success",
        description: "SMS campaign created and scheduled",
      });
    },
  });

  // Automation Mutations
  const createAutomationMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/automations", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      setShowAutomationModal(false);
      setAutomationForm({
        name: "",
        description: "",
        type: "email",
        templateId: "",
        templateIds: [],
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
    mutationFn: (id: string) => apiRequest(`/api/automations/${id}`, "DELETE"),
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
      apiRequest(`/api/automations/${id}`, "PUT", { isActive }),
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
    mutationFn: (data: any) => apiRequest("/api/settings", "PUT", data),
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
      createEmailTemplateMutation.mutate(emailTemplateForm);
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
    
    if (communicationType === "email") {
      createEmailCampaignMutation.mutate(campaignForm);
    } else {
      createSmsCampaignMutation.mutate(campaignForm);
    }
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
      // Use single template for one-time, multiple for recurring
      templateId: automationForm.scheduleType === "once" ? automationForm.templateId : undefined,
      templateIds: automationForm.scheduleType !== "once" ? automationForm.templateIds : undefined,
      scheduledDate: automationForm.triggerType === "schedule" && automationForm.scheduledDate 
        ? new Date(automationForm.scheduledDate + "T" + (automationForm.scheduleTime || "09:00")).toISOString()
        : undefined,
    };

    createAutomationMutation.mutate(automationData);
  };

  const handlePreview = (template: any) => {
    setPreviewTemplate(template);
  };

  const getTargetGroupLabel = (targetGroup: string) => {
    switch (targetGroup) {
      case "all":
        return "All Consumers";
      case "with-balance":
        return "With Outstanding Balance";
      case "decline":
        return "Decline Status";
      case "recent-upload":
        return "Most Recent Upload";
      default:
        return targetGroup;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "sending":
        return "bg-blue-100 text-blue-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const templates = communicationType === "email" ? emailTemplates : smsTemplates;
  const campaigns = communicationType === "email" ? emailCampaigns : smsCampaigns;
  const metrics = communicationType === "email" ? emailMetrics : smsMetrics;
  const templatesLoading = communicationType === "email" ? emailTemplatesLoading : smsTemplatesLoading;
  const campaignsLoading = communicationType === "email" ? emailCampaignsLoading : smsCampaignsLoading;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Communications</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="requests">Callback Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Communication Type Selector */}
            <div className="flex items-center gap-4">
              <Button
                variant={communicationType === "email" ? "default" : "outline"}
                onClick={() => setCommunicationType("email")}
                className="flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                Email
              </Button>
              <Button
                variant={communicationType === "sms" ? "default" : "outline"}
                onClick={() => setCommunicationType("sms")}
                className="flex items-center gap-2"
              >
                <MessageSquare className="h-4 w-4" />
                SMS
              </Button>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {communicationType === "email" ? "Emails" : "Messages"} Sent
                  </CardTitle>
                  {communicationType === "email" ? 
                    <Mail className="h-4 w-4 text-muted-foreground" /> : 
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  }
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(metrics as any)?.totalSent || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {(metrics as any)?.last7Days || 0} in last 7 days
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(metrics as any)?.deliveryRate || 0}%</div>
                  <p className="text-xs text-muted-foreground">
                    {(metrics as any)?.totalDelivered || 0} delivered
                  </p>
                </CardContent>
              </Card>

              {communicationType === "email" && (
                <>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{(metrics as any)?.openRate || 0}%</div>
                      <p className="text-xs text-muted-foreground">
                        {(metrics as any)?.totalOpened || 0} opened
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
                      <MousePointer className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{(metrics as any)?.clickRate || 0}%</div>
                      <p className="text-xs text-muted-foreground">
                        {(metrics as any)?.totalClicked || 0} clicked
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}

              {communicationType === "sms" && (
                <>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{(metrics as any)?.totalErrors || 0}</div>
                      <p className="text-xs text-muted-foreground">
                        Failed deliveries
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Opt-outs</CardTitle>
                      <UserMinus className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{(metrics as any)?.totalOptOuts || 0}</div>
                      <p className="text-xs text-muted-foreground">
                        {(metrics as any)?.optOutRate || 0}% opt-out rate
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* SMS Throttle Status - Only show for SMS mode */}
            {communicationType === "sms" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">SMS Rate Limit Status</CardTitle>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {smsRateLimitStatus ? (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Used this minute:</span>
                          <span className="font-medium">{(smsRateLimitStatus as any).used}/{(smsRateLimitStatus as any).limit}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${(smsRateLimitStatus as any).used >= (smsRateLimitStatus as any).limit * 0.8 ? 'bg-red-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(((smsRateLimitStatus as any).used / (smsRateLimitStatus as any).limit) * 100, 100)}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between items-center text-xs text-gray-500">
                          <span>Next reset: {new Date((smsRateLimitStatus as any).resetTime).toLocaleTimeString()}</span>
                          <Badge variant={(smsRateLimitStatus as any).canSend ? "default" : "destructive"}>
                            {(smsRateLimitStatus as any).canSend ? "Can Send" : "Rate Limited"}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-500">Loading status...</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">SMS Queue Status</CardTitle>
                      <Settings className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {smsQueueStatus ? (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Messages in queue:</span>
                          <span className="font-medium">{(smsQueueStatus as any).queueLength}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Est. wait time:</span>
                          <span className="font-medium">{Math.ceil((smsQueueStatus as any).estimatedWaitTime / 60)} min</span>
                        </div>
                        <div className="mt-3">
                          <Label htmlFor="throttle-limit" className="text-sm font-medium">
                            SMS Per Minute Limit
                          </Label>
                          <div className="flex gap-2 mt-1">
                            <Input
                              id="throttle-limit"
                              type="number"
                              min="1"
                              max="100"
                              value={(tenantSettings as any)?.smsThrottleLimit || 10}
                              onChange={(e) => {
                                const newLimit = parseInt(e.target.value);
                                if (newLimit >= 1 && newLimit <= 100) {
                                  updateSettingsMutation.mutate({
                                    ...(tenantSettings || {}),
                                    smsThrottleLimit: newLimit,
                                  });
                                }
                              }}
                              className="w-20"
                            />
                            <span className="text-sm text-gray-500 flex items-center">
                              texts/min
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-500">Loading status...</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Recent Campaigns */}
            <Card>
              <CardHeader>
                <CardTitle>Recent {communicationType === "email" ? "Email" : "SMS"} Campaigns</CardTitle>
              </CardHeader>
              <CardContent>
                {campaignsLoading ? (
                  <div className="text-center py-4">Loading campaigns...</div>
                ) : (campaigns as any)?.length > 0 ? (
                  <div className="space-y-4">
                    {(campaigns as any).slice(0, 5).map((campaign: any) => (
                      <div key={campaign.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">{campaign.name}</h3>
                          <p className="text-sm text-gray-600">
                            Target: {getTargetGroupLabel(campaign.targetGroup)} • 
                            Template: {campaign.templateName}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(campaign.status)}>
                            {campaign.status}
                          </Badge>
                          <span className="text-sm text-gray-600">
                            {campaign.totalSent || 0} sent
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No campaigns yet. Create your first {communicationType} campaign to get started.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-semibold">
                  {communicationType === "email" ? "Email" : "SMS"} Templates
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
              <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-template">
                    <Plus className="h-4 w-4 mr-2" />
                    Create {communicationType === "email" ? "Email" : "SMS"} Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create {communicationType === "email" ? "Email" : "SMS"} Template</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      Create a new {communicationType === "email" ? "email" : "SMS"} template for your campaigns.
                    </p>
                  </DialogHeader>
                  <form onSubmit={handleTemplateSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="template-name">Template Name</Label>
                      <Input
                        id="template-name"
                        data-testid="input-template-name"
                        value={communicationType === "email" ? emailTemplateForm.name : smsTemplateForm.name}
                        onChange={(e) => {
                          if (communicationType === "email") {
                            setEmailTemplateForm({ ...emailTemplateForm, name: e.target.value });
                          } else {
                            setSmsTemplateForm({ ...smsTemplateForm, name: e.target.value });
                          }
                        }}
                        placeholder="Enter template name"
                        required
                      />
                    </div>
                    
                    {communicationType === "email" ? (
                      <>
                        <div>
                          <Label htmlFor="subject">Subject Line</Label>
                          <Input
                            id="subject"
                            data-testid="input-subject"
                            value={emailTemplateForm.subject}
                            onChange={(e) => setEmailTemplateForm({ ...emailTemplateForm, subject: e.target.value })}
                            placeholder="Enter email subject"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="html">Email Content</Label>
                          <Textarea
                            id="html"
                            data-testid="textarea-html"
                            value={emailTemplateForm.html}
                            onChange={(e) => setEmailTemplateForm({ ...emailTemplateForm, html: e.target.value })}
                            placeholder="Enter your email content (HTML supported)"
                            rows={8}
                            required
                          />
                        </div>
                      </>
                    ) : (
                      <div>
                        <Label htmlFor="message">Message Content</Label>
                        <Textarea
                          id="message"
                          data-testid="textarea-message"
                          value={smsTemplateForm.message}
                          onChange={(e) => setSmsTemplateForm({ ...smsTemplateForm, message: e.target.value })}
                          placeholder="Enter your SMS message (160 characters recommended)"
                          rows={6}
                          maxLength={1600}
                          required
                        />
                        <p className="text-sm text-gray-500 mt-1">
                          {smsTemplateForm.message.length}/1600 characters
                        </p>
                      </div>
                    )}
                    
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
                        disabled={createEmailTemplateMutation.isPending || createSmsTemplateMutation.isPending}
                        data-testid="button-save-template"
                      >
                        {(createEmailTemplateMutation.isPending || createSmsTemplateMutation.isPending) ? "Creating..." : "Create Template"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templatesLoading ? (
                <div className="col-span-full text-center py-8">Loading templates...</div>
              ) : (templates as any)?.length > 0 ? (
                (templates as any).map((template: any) => (
                  <Card key={template.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <Badge variant={template.status === "active" ? "default" : "secondary"}>
                          {template.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {communicationType === "email" ? (
                        <>
                          <p className="text-sm font-medium text-gray-600 mb-1">Subject:</p>
                          <p className="text-sm text-gray-800 mb-2">{template.subject}</p>
                          <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                            {template.html.replace(/<[^>]*>/g, '')}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                          {template.message}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreview(template)}
                          data-testid={`button-preview-${template.id}`}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Preview
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              data-testid={`button-delete-${template.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
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

          <TabsContent value="campaigns" className="space-y-6">
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

            <Card>
              <CardHeader>
                <CardTitle>All {communicationType === "email" ? "Email" : "SMS"} Campaigns</CardTitle>
              </CardHeader>
              <CardContent>
                {campaignsLoading ? (
                  <div className="text-center py-4">Loading campaigns...</div>
                ) : (campaigns as any)?.length > 0 ? (
                  <div className="space-y-4">
                    {(campaigns as any).map((campaign: any) => (
                      <div key={campaign.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium">{campaign.name}</h3>
                          <Badge className={getStatusColor(campaign.status)}>
                            {campaign.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Template:</span>
                            <div className="font-medium">{campaign.templateName}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Target:</span>
                            <div className="font-medium">{getTargetGroupLabel(campaign.targetGroup)}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Recipients:</span>
                            <div className="font-medium">{campaign.totalRecipients || 0}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Sent:</span>
                            <div className="font-medium">{campaign.totalSent || 0}</div>
                          </div>
                        </div>
                        {campaign.status === "completed" && (
                          <div className="mt-3 pt-3 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Delivered:</span>
                              <div className="font-medium text-green-600">{campaign.totalDelivered || 0}</div>
                            </div>
                            {communicationType === "email" && (
                              <>
                                <div>
                                  <span className="text-gray-600">Opened:</span>
                                  <div className="font-medium text-blue-600">{campaign.totalOpened || 0}</div>
                                </div>
                                <div>
                                  <span className="text-gray-600">Clicked:</span>
                                  <div className="font-medium text-purple-600">{campaign.totalClicked || 0}</div>
                                </div>
                              </>
                            )}
                            <div>
                              <span className="text-gray-600">
                                {communicationType === "email" ? "Errors:" : "Failed:"}
                              </span>
                              <div className="font-medium text-red-600">{campaign.totalErrors || 0}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No campaigns yet. Create your first {communicationType} campaign to get started.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Callback Requests</h2>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Consumer Callback Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(callbackRequests as any)?.length > 0 ? (
                  <div className="space-y-4">
                    {(callbackRequests as any).map((request: any) => (
                      <div key={request.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium">
                            {request.consumer?.firstName} {request.consumer?.lastName}
                          </h3>
                          <Badge variant={request.status === "pending" ? "secondary" : "default"}>
                            {request.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Phone:</span>
                            <div className="font-medium">{request.phoneNumber}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Preferred Time:</span>
                            <div className="font-medium">{request.preferredTime || "Any time"}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Requested:</span>
                            <div className="font-medium">{new Date(request.createdAt).toLocaleDateString()}</div>
                          </div>
                        </div>
                        {request.message && (
                          <div className="mt-3 pt-3 border-t">
                            <span className="text-gray-600 text-sm">Message:</span>
                            <p className="text-sm mt-1">{request.message}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No callback requests yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automation" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Communication Automation</h2>
              <Dialog open={showAutomationModal} onOpenChange={setShowAutomationModal}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-automation">
                    <Plus className="h-4 w-4 mr-2" />
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
                        {automationForm.scheduleType === "once" ? "Template *" : "Templates * (Select multiple for rotation)"}
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
                            Select multiple templates to rotate between on each execution
                          </div>
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

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Active Automations
                </CardTitle>
              </CardHeader>
              <CardContent>
                {automationsLoading ? (
                  <div className="text-center py-8">Loading automations...</div>
                ) : (automations as any[])?.length > 0 ? (
                  <div className="space-y-4">
                    {(automations as any[]).map((automation: any) => (
                      <div key={automation.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <h3 className="font-medium">{automation.name}</h3>
                            <Badge variant={automation.isActive ? "default" : "secondary"}>
                              {automation.isActive ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline">
                              {automation.type.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleAutomationMutation.mutate({ 
                                id: automation.id, 
                                isActive: !automation.isActive 
                              })}
                              data-testid={`button-toggle-automation-${automation.id}`}
                            >
                              {automation.isActive ? "Pause" : "Resume"}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" data-testid={`button-delete-automation-${automation.id}`}>
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
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                        
                        {automation.description && (
                          <p className="text-sm text-gray-600 mb-3">{automation.description}</p>
                        )}
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Trigger:</span>
                            <div className="font-medium capitalize">{automation.triggerType}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Template{automation.templateIds?.length > 1 ? 's' : ''}:</span>
                            <div className="font-medium">
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
                            <span className="text-gray-600">Target:</span>
                            <div className="font-medium capitalize">{automation.targetType}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Next Run:</span>
                            <div className="font-medium">
                              {automation.nextExecution 
                                ? new Date(automation.nextExecution).toLocaleDateString()
                                : "Not scheduled"
                              }
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No automations created yet.</p>
                    <p className="text-sm">Create your first automation to start scheduling communications.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}