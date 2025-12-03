import { useState, useEffect, useRef } from "react";
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
import { MessageSquare, Plus, Send, FileText, Trash2, Eye, TrendingUp, Users, AlertCircle, UserMinus, Check, XCircle } from "lucide-react";

export default function SMS() {
  // VERSION CHECK - Should see this in console
  console.log('🔵 SMS PAGE VERSION: 2025-10-22-FINAL - Variables, Approval, Folders ALL FIXED');
  
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    message: "",
  });
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    templateId: "",
    targetGroup: "all",
    folderIds: [] as string[],
    phonesToSend: "1" as "1" | "2" | "3" | "all",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries
  const { data: smsTemplates, isLoading: templatesLoading } = useQuery({
    queryKey: ["/api/sms-templates"],
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["/api/sms-campaigns"],
    refetchInterval: 3000, // Refresh every 3 seconds to catch status changes
  });

  const { data: smsMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/sms-metrics"],
  });

  const { data: folders } = useQuery({
    queryKey: ["/api/folders"],
  });

  const { data: consumers } = useQuery({
    queryKey: ["/api/consumers"],
  });

  // Mutations
  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/sms-templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-templates"] });
      setShowTemplateModal(false);
      setTemplateForm({ name: "", message: "" });
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

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sms-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-templates"] });
      toast({
        title: "Success",
        description: "SMS template deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete SMS template",
        variant: "destructive",
      });
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/sms-campaigns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
      setShowCampaignModal(false);
      setCampaignForm({ name: "", templateId: "", targetGroup: "all", folderIds: [], phonesToSend: "1" });
      toast({
        title: "Success",
        description: "SMS campaign created and scheduled",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create SMS campaign",
        variant: "destructive",
      });
    },
  });

  const approveCampaignMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sms-campaigns/${id}/approve`),
    onSuccess: (data: any, campaignId: string) => {
      // Start polling for this campaign's progress
      startPollingCampaign(campaignId);
      queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-metrics"] });
      toast({
        title: "Success",
        description: "SMS campaign approved and sending",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve SMS campaign",
        variant: "destructive",
      });
    },
  });

  const cancelCampaignMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sms-campaigns/${id}/cancel`),
    onSuccess: (data: any, campaignId: string) => {
      // Stop polling for this campaign
      stopPollingCampaign(campaignId);
      queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-metrics"] });
      toast({
        title: "Campaign Cancelled",
        description: "SMS campaign has been cancelled. Any remaining messages will not be sent.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel SMS campaign",
        variant: "destructive",
      });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/sms-campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-metrics"] });
      toast({
        title: "Success",
        description: "Pending SMS campaign deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete SMS campaign",
        variant: "destructive",
      });
    },
  });

  // Polling logic for tracking campaign progress in real-time
  const pollingIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const startPollingCampaign = (campaignId: string) => {
    // Clear existing interval if any
    if (pollingIntervals.current.has(campaignId)) {
      clearInterval(pollingIntervals.current.get(campaignId)!);
    }

    console.log(`🔄 Starting to poll campaign ${campaignId} for live progress`);

    // Poll every 2 seconds for live progress
    const intervalId = setInterval(async () => {
      try {
        const status: any = await apiRequest("GET", `/api/sms-campaigns/${campaignId}/status`);
        
        // Update the campaigns list with the latest progress
        queryClient.setQueryData(["/api/sms-campaigns"], (oldCampaigns: any) => {
          if (!Array.isArray(oldCampaigns)) return oldCampaigns;
          
          return oldCampaigns.map((campaign: any) => {
            if (campaign.id === campaignId) {
              return {
                ...campaign,
                status: status.status,
                totalSent: status.totalSent,
                totalDelivered: status.totalDelivered,
                totalErrors: status.totalErrors,
                totalOptOuts: status.totalOptOuts,
                completedAt: status.completedAt,
              };
            }
            return campaign;
          });
        });

        // Stop polling if campaign is complete, failed, or cancelled
        if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
          console.log(`✅ Campaign ${campaignId} finished with status: ${status.status}`);
          stopPollingCampaign(campaignId);
          
          // Show appropriate toast message
          if (status.status === 'completed') {
            toast({
              title: "Campaign Completed",
              description: `Successfully sent ${status.totalSent || 0} of ${status.totalRecipients || 0} messages`,
            });
          } else if (status.status === 'failed') {
            toast({
              title: "Campaign Failed",
              description: `Campaign failed after sending ${status.totalSent || 0} of ${status.totalRecipients || 0} messages`,
              variant: "destructive",
            });
          }
          
          // Final refresh of all data
          queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
          queryClient.invalidateQueries({ queryKey: ["/api/sms-metrics"] });
        }
      } catch (error) {
        console.error(`Error polling campaign ${campaignId}:`, error);
      }
    }, 2000);

    pollingIntervals.current.set(campaignId, intervalId);
  };

  const stopPollingCampaign = (campaignId: string) => {
    if (pollingIntervals.current.has(campaignId)) {
      clearInterval(pollingIntervals.current.get(campaignId)!);
      pollingIntervals.current.delete(campaignId);
      console.log(`⏹️ Stopped polling campaign ${campaignId}`);
    }
  };

  // Auto-start polling for any campaigns that are currently sending
  useEffect(() => {
    if (campaigns && Array.isArray(campaigns)) {
      campaigns.forEach((campaign: any) => {
        const status = (campaign.status || '').toLowerCase();
        if (status === 'sending' && !pollingIntervals.current.has(campaign.id)) {
          console.log(`🔄 Starting polling for sending campaign: ${campaign.id}`);
          startPollingCampaign(campaign.id);
        }
      });
    }

    // Cleanup all polling intervals on unmount
    return () => {
      pollingIntervals.current.forEach((intervalId) => clearInterval(intervalId));
      pollingIntervals.current.clear();
    };
  }, [campaigns]);

  const handleTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateForm.name.trim() || !templateForm.message.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    createTemplateMutation.mutate(templateForm);
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
    console.log('🚀 Creating campaign with data:', campaignForm);
    createCampaignMutation.mutate(campaignForm);
  };

  const handlePreview = (template: any) => {
    setPreviewTemplate(template);
  };

  const getTargetGroupLabel = (targetGroup: string, campaign?: any) => {
    switch (targetGroup) {
      case "all":
        return "All Consumers";
      case "with-balance":
        return "With Outstanding Balance";
      case "decline":
        return "Decline Status";
      case "recent-upload":
        return "Most Recent Upload";
      case "folder":
        if (campaign?.folderIds && Array.isArray(campaign.folderIds) && campaign.folderIds.length > 0) {
          const folderNames = campaign.folderIds
            .map((id: string) => (folders as any)?.find((f: any) => f.id === id)?.name)
            .filter(Boolean)
            .join(", ");
          return folderNames || "Specific Folders";
        }
        return "Specific Folders";
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
      case "pending_approval":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "cancelled":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">SMS Communications</h1>
            <p className="text-xs text-gray-500 mt-1">Build: Oct-22-2025-v4-FINAL</p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
                  <Send className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(smsMetrics as any)?.totalSent || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {(smsMetrics as any)?.last7Days || 0} in last 7 days
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(smsMetrics as any)?.deliveryRate || 0}%</div>
                  <p className="text-xs text-muted-foreground">
                    {(smsMetrics as any)?.totalDelivered || 0} delivered
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(smsMetrics as any)?.totalErrors || 0}</div>
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
                  <div className="text-2xl font-bold">{(smsMetrics as any)?.totalOptOuts || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {(smsMetrics as any)?.optOutRate || 0}% opt-out rate
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Campaigns */}
            <Card>
              <CardHeader>
                <CardTitle>Recent SMS Campaigns</CardTitle>
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
                            Target: {getTargetGroupLabel(campaign.targetGroup, campaign)} • 
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
                    No campaigns yet. Create your first SMS campaign to get started.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">SMS Templates</h2>
              <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-template">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl rounded-3xl border border-white/20 bg-[#0b1733]/95 backdrop-blur-md text-blue-50">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-semibold text-blue-50">Create SMS Template</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleTemplateSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="template-name" className="text-blue-100/80">Template Name</Label>
                      <Input
                        id="template-name"
                        data-testid="input-template-name"
                        value={templateForm.name}
                        onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                        placeholder="Enter template name"
                        className="bg-white/5 border-white/20 text-blue-50 placeholder:text-blue-100/40"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="message" className="text-blue-100/80">Message Content</Label>
                      <Textarea
                        id="message"
                        data-testid="textarea-message"
                        value={templateForm.message}
                        onChange={(e) => setTemplateForm({ ...templateForm, message: e.target.value })}
                        placeholder="Enter your SMS message. Use {{firstName}} or {balance} to personalize."
                        rows={6}
                        maxLength={1600}
                        className="bg-white/5 border-white/20 text-blue-50 placeholder:text-blue-100/40"
                        required
                      />
                      <p className="text-sm text-blue-100/60 mt-1">
                        {templateForm.message.length}/1600 characters
                      </p>
                      <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 max-h-[500px] overflow-y-auto">
                        <h4 className="font-medium text-amber-100 text-sm mb-2 flex items-center gap-2">
                          📝 Available Variables (30+)
                          <span className="text-xs font-normal text-amber-200/80">(scroll to see all)</span>
                        </h4>
                        <p className="text-xs text-amber-100/90 mb-3">
                          Use <code className="font-mono bg-white/10 px-1 rounded text-amber-100">{"{{variable}}"}</code> or <code className="font-mono bg-white/10 px-1 rounded text-amber-100">{"{variable}"}</code> syntax to insert data.
                        </p>
                        
                        <div className="space-y-3 pb-2">
                          <div>
                            <h5 className="font-semibold text-amber-100 text-xs mb-1">Consumer Info</h5>
                            <div className="text-xs text-amber-50 grid grid-cols-2 gap-x-4 gap-y-0.5">
                              <div>• {"{{firstName}}"}</div>
                              <div>• {"{{lastName}}"}</div>
                              <div>• {"{{fullName}}"}</div>
                              <div>• {"{{consumerName}}"}</div>
                              <div>• {"{{email}}"}</div>
                              <div>• {"{{phone}}"}</div>
                              <div>• {"{{address}}"}</div>
                              <div>• {"{{city}}"}</div>
                              <div>• {"{{state}}"}</div>
                              <div>• {"{{zipCode}}"} or {"{{zip}}"}</div>
                              <div>• {"{{fullAddress}}"}</div>
                              <div>• {"{{consumerId}}"}</div>
                            </div>
                          </div>

                          <div>
                            <h5 className="font-semibold text-amber-100 text-xs mb-1">Account Info</h5>
                            <div className="text-xs text-amber-50 grid grid-cols-2 gap-x-4 gap-y-0.5">
                              <div>• {"{{accountNumber}}"}</div>
                              <div>• {"{{accountId}}"}</div>
                              <div>• {"{{filenumber}}"} or {"{{fileNumber}}"}</div>
                              <div>• {"{{creditor}}"}</div>
                              <div>• {"{{balance}}"} (formatted)</div>
                              <div>• {"{{balanceCents}}"} (raw cents)</div>
                              <div>• {"{{dueDate}}"} (formatted)</div>
                              <div>• {"{{dueDateIso}}"} (ISO format)</div>
                            </div>
                          </div>

                          <div>
                            <h5 className="font-semibold text-amber-100 text-xs mb-1">Settlement Offers</h5>
                            <div className="text-xs text-amber-50 grid grid-cols-2 gap-x-4 gap-y-0.5">
                              <div>• {"{{balance50%}}"} (50% off)</div>
                              <div>• {"{{balance60%}}"} (40% off)</div>
                              <div>• {"{{balance70%}}"} (30% off)</div>
                              <div>• {"{{balance80%}}"} (20% off)</div>
                              <div>• {"{{balance90%}}"} (10% off)</div>
                              <div>• {"{{balance100%}}"} (full balance)</div>
                            </div>
                          </div>

                          <div>
                            <h5 className="font-semibold text-amber-100 text-xs mb-1">Agency Info</h5>
                            <div className="text-xs text-amber-50 grid grid-cols-2 gap-x-4 gap-y-0.5">
                              <div>• {"{{agencyName}}"}</div>
                              <div>• {"{{agencyEmail}}"}</div>
                              <div>• {"{{agencyPhone}}"}</div>
                            </div>
                          </div>

                          <div>
                            <h5 className="font-semibold text-amber-100 text-xs mb-1">Links & Opt-Out</h5>
                            <div className="text-xs text-amber-50 grid grid-cols-1 gap-y-0.5">
                              <div>• {"{{consumerPortalLink}}"} - Portal login URL</div>
                              <div>• {"{{appDownloadLink}}"} - Mobile app download</div>
                              <div>• {"{{unsubscribeLink}}"} - SMS/email opt-out</div>
                              <div>• {"{{unsubscribeUrl}}"} - Same as unsubscribeLink</div>
                            </div>
                          </div>

                          <div>
                            <h5 className="font-semibold text-amber-100 text-xs mb-1">Other</h5>
                            <div className="text-xs text-amber-50">
                              <div>• {"{{todays date}}"} - Current date</div>
                              <div>• Plus any custom CSV columns</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowTemplateModal(false)}
                        data-testid="button-cancel-template"
                        className="rounded-xl border border-white/20 bg-transparent px-4 py-2 text-blue-100 transition hover:bg-white/10"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createTemplateMutation.isPending}
                        data-testid="button-save-template"
                        className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {createTemplateMutation.isPending ? "Creating..." : "Create Template"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templatesLoading ? (
                <div className="col-span-full text-center py-8">Loading templates...</div>
              ) : (smsTemplates as any)?.length > 0 ? (
                (smsTemplates as any).map((template: any) => (
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
                      <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                        {template.message}
                      </p>
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
                                onClick={() => deleteTemplateMutation.mutate(template.id)}
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
                  No templates yet. Create your first SMS template to get started.
                </div>
              )}
            </div>

            {/* Template Preview Modal */}
            <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>SMS Template Preview: {previewTemplate?.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="text-sm font-medium text-gray-600 mb-2">Raw Template:</div>
                    <div className="whitespace-pre-wrap text-sm text-gray-500">
                      {previewTemplate?.message}
                    </div>
                  </div>
                  <div className="border rounded-lg p-4 bg-blue-50">
                    <div className="text-sm font-medium text-blue-900 mb-2">Sample Output (with variables replaced):</div>
                    <div className="whitespace-pre-wrap text-sm text-blue-900">
                      {previewTemplate?.message
                        ?.replace(/\{\{firstName\}\}|\{firstName\}/gi, "John")
                        ?.replace(/\{\{lastName\}\}|\{lastName\}/gi, "Smith")
                        ?.replace(/\{\{fullName\}\}|\{fullName\}|\{\{consumerName\}\}|\{consumerName\}/gi, "John Smith")
                        ?.replace(/\{\{email\}\}|\{email\}/gi, "john.smith@example.com")
                        ?.replace(/\{\{phone\}\}|\{phone\}/gi, "(555) 123-4567")
                        ?.replace(/\{\{address\}\}|\{address\}/gi, "123 Main St")
                        ?.replace(/\{\{city\}\}|\{city\}/gi, "Springfield")
                        ?.replace(/\{\{state\}\}|\{state\}/gi, "IL")
                        ?.replace(/\{\{zipCode\}\}|\{zipCode\}|\{\{zip\}\}|\{zip\}/gi, "62701")
                        ?.replace(/\{\{fullAddress\}\}|\{fullAddress\}/gi, "123 Main St, Springfield, IL 62701")
                        ?.replace(/\{\{accountNumber\}\}|\{accountNumber\}/gi, "ACC-12345")
                        ?.replace(/\{\{filenumber\}\}|\{filenumber\}|\{\{fileNumber\}\}|\{fileNumber\}/gi, "FILE-67890")
                        ?.replace(/\{\{creditor\}\}|\{creditor\}/gi, "ABC Company")
                        ?.replace(/\{\{balance\}\}|\{balance\}/gi, "$1,234.56")
                        ?.replace(/\{\{balanceCents\}\}|\{balanceCents\}/gi, "123456")
                        ?.replace(/\{\{dueDate\}\}|\{dueDate\}/gi, "12/31/2025")
                        ?.replace(/\{\{balance50%\}\}|\{balance50%\}/gi, "$617.28")
                        ?.replace(/\{\{balance60%\}\}|\{balance60%\}/gi, "$740.74")
                        ?.replace(/\{\{balance70%\}\}|\{balance70%\}/gi, "$864.19")
                        ?.replace(/\{\{balance80%\}\}|\{balance80%\}/gi, "$987.65")
                        ?.replace(/\{\{balance90%\}\}|\{balance90%\}/gi, "$1,111.10")
                        ?.replace(/\{\{balance100%\}\}|\{balance100%\}/gi, "$1,234.56")
                        ?.replace(/\{\{agencyName\}\}|\{agencyName\}/gi, "Your Agency")
                        ?.replace(/\{\{agencyEmail\}\}|\{agencyEmail\}/gi, "contact@agency.com")
                        ?.replace(/\{\{agencyPhone\}\}|\{agencyPhone\}/gi, "(555) 987-6543")
                        ?.replace(/\{\{consumerPortalLink\}\}|\{consumerPortalLink\}/gi, "https://portal.example.com/consumer-login")
                        ?.replace(/\{\{appDownloadLink\}\}|\{appDownloadLink\}/gi, "https://example.com/download")
                        ?.replace(/\{\{unsubscribeLink\}\}|\{unsubscribeLink\}|\{\{unsubscribeUrl\}\}|\{unsubscribeUrl\}/gi, "https://example.com/unsubscribe")
                        ?.replace(/\{\{todays date\}\}|\{todays date\}/gi, new Date().toLocaleDateString())
                      }
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Message Length: {previewTemplate?.message?.length || 0} characters</span>
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
              <h2 className="text-xl font-semibold">SMS Campaigns</h2>
              <Dialog open={showCampaignModal} onOpenChange={setShowCampaignModal}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-campaign">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Campaign
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create SMS Campaign</DialogTitle>
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
                      <Label htmlFor="template">SMS Template</Label>
                      <Select
                        value={campaignForm.templateId}
                        onValueChange={(value) => setCampaignForm({ ...campaignForm, templateId: value })}
                      >
                        <SelectTrigger data-testid="select-template">
                          <SelectValue placeholder="Select a template" />
                        </SelectTrigger>
                        <SelectContent>
                          {(smsTemplates as any)?.map((template: any) => (
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
                        onValueChange={(value) => setCampaignForm({ ...campaignForm, targetGroup: value, folderIds: [] })}
                      >
                        <SelectTrigger data-testid="select-target-group">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Consumers</SelectItem>
                          <SelectItem value="with-balance">With Outstanding Balance</SelectItem>
                          <SelectItem value="decline">Decline Status</SelectItem>
                          <SelectItem value="recent-upload">Most Recent Upload</SelectItem>
                          <SelectItem value="folder">Specific Folder(s)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {campaignForm.targetGroup === "folder" && (
                      <div>
                        <Label htmlFor="folder-selection">Select Folders</Label>
                        <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                          {(folders as any)?.map((folder: any) => (
                            <div key={folder.id} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`folder-${folder.id}`}
                                checked={campaignForm.folderIds.includes(folder.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setCampaignForm({
                                      ...campaignForm,
                                      folderIds: [...campaignForm.folderIds, folder.id]
                                    });
                                  } else {
                                    setCampaignForm({
                                      ...campaignForm,
                                      folderIds: campaignForm.folderIds.filter(id => id !== folder.id)
                                    });
                                  }
                                }}
                                className="rounded border-gray-300"
                                data-testid={`checkbox-folder-${folder.id}`}
                              />
                              <label htmlFor={`folder-${folder.id}`} className="text-sm cursor-pointer">
                                {folder.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Phone Numbers to Send To</label>
                      <Select
                        value={campaignForm.phonesToSend}
                        onValueChange={(value: "1" | "2" | "3" | "all") => setCampaignForm({ ...campaignForm, phonesToSend: value })}
                      >
                        <SelectTrigger data-testid="select-phones-to-send">
                          <SelectValue placeholder="Select how many phones" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 number (primary phone only)</SelectItem>
                          <SelectItem value="2">2 numbers</SelectItem>
                          <SelectItem value="3">3 numbers</SelectItem>
                          <SelectItem value="all">All available numbers</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Choose how many phone numbers to send to per consumer (uses primary phone + additional phones from CSV imports in order)
                      </p>
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
                        disabled={createCampaignMutation.isPending}
                        data-testid="button-save-campaign"
                      >
                        {createCampaignMutation.isPending ? "Creating..." : "Create Campaign"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>All Campaigns</CardTitle>
              </CardHeader>
              <CardContent>
                {campaignsLoading ? (
                  <div className="text-center py-4">Loading campaigns...</div>
                ) : (campaigns as any)?.length > 0 ? (
                  <div className="space-y-4">
                    {/* Debug: Log all campaign statuses */}
                    {console.log('📊 Campaign statuses:', (campaigns as any).map((c: any) => ({ id: c.id, name: c.name, status: c.status })))}
                    {(campaigns as any).map((campaign: any) => (
                      <div key={campaign.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <h3 className="font-medium">{campaign.name}</h3>
                          <div className="flex items-center gap-2">
                            {/* Debug: Show raw status for troubleshooting */}
                            <span className="text-xs text-gray-400">[{campaign.status}]</span>
                            <Badge className={getStatusColor(campaign.status)}>
                              {campaign.status}
                            </Badge>
                            {((campaign.status || '').toLowerCase() === "pending" || (campaign.status || '').toLowerCase() === "pending_approval") && (
                              <>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-green-600 hover:bg-green-700"
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      Approve
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Approve SMS Campaign</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will send {campaign.totalRecipients || 0} SMS messages to targeted consumers. This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-green-600 hover:bg-green-700"
                                        onClick={() => approveCampaignMutation.mutate(campaign.id)}
                                        disabled={approveCampaignMutation.isPending}
                                      >
                                        {approveCampaignMutation.isPending ? "Approving..." : "Approve & Send"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
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
                                        This will cancel the pending SMS campaign before any messages are sent. This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-red-600 hover:bg-red-700"
                                        onClick={() => deleteCampaignMutation.mutate(campaign.id)}
                                        disabled={deleteCampaignMutation.isPending}
                                      >
                                        {deleteCampaignMutation.isPending ? "Deleting..." : "Delete"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                            {(campaign.status || '').toLowerCase() === "sending" && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    data-testid="button-cancel-campaign"
                                  >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Stop Sending
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Stop SMS Campaign</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will immediately stop sending messages. {campaign.totalSent || 0} of {campaign.totalRecipients || 0} messages have been sent. Remaining messages will NOT be sent.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Keep Sending</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 hover:bg-red-700"
                                      onClick={() => cancelCampaignMutation.mutate(campaign.id)}
                                      disabled={cancelCampaignMutation.isPending}
                                    >
                                      {cancelCampaignMutation.isPending ? "Stopping..." : "Stop Campaign"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                            {/* Delete button for any campaign status */}
                            {!((campaign.status || '').toLowerCase() === "pending" || (campaign.status || '').toLowerCase() === "pending_approval") && (
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
                                      This will remove this campaign from your list. If the campaign is still sending, it will be cancelled first. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 hover:bg-red-700"
                                      onClick={() => {
                                        // If sending, cancel first then delete
                                        if ((campaign.status || '').toLowerCase() === "sending") {
                                          cancelCampaignMutation.mutate(campaign.id);
                                        }
                                        deleteCampaignMutation.mutate(campaign.id);
                                      }}
                                      disabled={deleteCampaignMutation.isPending || cancelCampaignMutation.isPending}
                                    >
                                      {deleteCampaignMutation.isPending ? "Deleting..." : "Delete"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Template:</span>
                            <div className="font-medium">{campaign.templateName}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Target:</span>
                            <div className="font-medium">{getTargetGroupLabel(campaign.targetGroup, campaign)}</div>
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
                          <div className="mt-3 pt-3 border-t grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Delivered:</span>
                              <div className="font-medium text-green-600">{campaign.totalDelivered || 0}</div>
                            </div>
                            <div>
                              <span className="text-gray-600">Errors:</span>
                              <div className="font-medium text-red-600">{campaign.totalErrors || 0}</div>
                            </div>
                            <div>
                              <span className="text-gray-600">Opt-outs:</span>
                              <div className="font-medium text-orange-600">{campaign.totalOptOuts || 0}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No campaigns yet. Create your first SMS campaign to get started.
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