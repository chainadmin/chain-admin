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
import { Mail, Plus, Send, FileText, Trash2, Eye, TrendingUp, Users, AlertCircle, MousePointer, UserMinus } from "lucide-react";

export default function Emails() {
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    subject: "",
    html: "",
  });
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    templateId: "",
    targetGroup: "all",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries
  const { data: emailTemplates, isLoading: templatesLoading } = useQuery({
    queryKey: ["/api/email-templates"],
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ["/api/email-campaigns"],
  });

  const { data: emailMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/email-metrics"],
  });

  const { data: consumers } = useQuery({
    queryKey: ["/api/consumers"],
  });

  // Mutations
  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/email-templates", data);
    },
    onSuccess: () => {
      toast({
        title: "Template Created",
        description: "Email template has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      setShowTemplateModal(false);
      setTemplateForm({ name: "", subject: "", html: "" });
    },
    onError: (error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/email-campaigns", data);
    },
    onSuccess: () => {
      toast({
        title: "Campaign Created",
        description: "Email campaign has been created and is being sent.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/email-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-metrics"] });
      setShowCampaignModal(false);
      setCampaignForm({ name: "", templateId: "", targetGroup: "all" });
    },
    onError: (error) => {
      toast({
        title: "Campaign Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/email-templates/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Template Deleted",
        description: "Email template has been removed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
    },
  });

  const handleCreateTemplate = () => {
    if (!templateForm.name || !templateForm.subject || !templateForm.html) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    createTemplateMutation.mutate(templateForm);
  };

  const handleCreateCampaign = () => {
    if (!campaignForm.name || !campaignForm.templateId) {
      toast({
        title: "Missing Information",
        description: "Please provide campaign name and select a template.",
        variant: "destructive",
      });
      return;
    }
    createCampaignMutation.mutate(campaignForm);
  };

  return (
    <AdminLayout>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <Mail className="h-6 w-6 mr-2" />
                Email Campaigns
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Create templates, send campaigns, and track performance
              </p>
            </div>
            <div className="flex space-x-3">
              <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <FileText className="h-4 w-4 mr-2" />
                    New Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create Email Template</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Template Name *</Label>
                      <Input
                        value={templateForm.name}
                        onChange={(e) => setTemplateForm({...templateForm, name: e.target.value})}
                        placeholder="e.g., Payment Reminder"
                        data-testid="input-template-name"
                      />
                    </div>
                    
                    <div>
                      <Label>Subject Line *</Label>
                      <Input
                        value={templateForm.subject}
                        onChange={(e) => setTemplateForm({...templateForm, subject: e.target.value})}
                        placeholder="e.g., Payment Required - Account {{accountNumber}}"
                        data-testid="input-template-subject"
                      />
                    </div>
                    
                    <div>
                      <Label>Email Content (HTML) *</Label>
                      <Textarea
                        rows={10}
                        value={templateForm.html}
                        onChange={(e) => setTemplateForm({...templateForm, html: e.target.value})}
                        placeholder="Enter your HTML email content. Use variables like {{firstName}}, {{balance}}, etc."
                        className="font-mono text-sm"
                        data-testid="input-template-html"
                      />
                    </div>
                    
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                      <h4 className="font-medium text-blue-900 text-sm mb-2">Available Variables:</h4>
                      <div className="text-xs text-blue-800 grid grid-cols-2 gap-1">
                        <div>• {"{{firstName}}"}</div>
                        <div>• {"{{lastName}}"}</div>
                        <div>• {"{{email}}"}</div>
                        <div>• {"{{accountNumber}}"}</div>
                        <div>• {"{{creditor}}"}</div>
                        <div>• {"{{balance}}"}</div>
                        <div>• {"{{dueDate}}"}</div>
                        <div>• {"{{consumerPortalLink}}"}</div>
                        <div>• {"{{appDownloadLink}}"}</div>
                        <div>• Plus any additional CSV columns</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-3 pt-4">
                    <Button variant="outline" onClick={() => setShowTemplateModal(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateTemplate} disabled={createTemplateMutation.isPending}>
                      {createTemplateMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Creating...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Template
                        </>
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={showCampaignModal} onOpenChange={setShowCampaignModal}>
                <DialogTrigger asChild>
                  <Button>
                    <Send className="h-4 w-4 mr-2" />
                    Send Campaign
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Send Email Campaign</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Campaign Name *</Label>
                      <Input
                        value={campaignForm.name}
                        onChange={(e) => setCampaignForm({...campaignForm, name: e.target.value})}
                        placeholder="e.g., January Payment Reminders"
                        data-testid="input-campaign-name"
                      />
                    </div>
                    
                    <div>
                      <Label>Email Template *</Label>
                      <Select 
                        value={campaignForm.templateId} 
                        onValueChange={(value) => setCampaignForm({...campaignForm, templateId: value})}
                      >
                        <SelectTrigger data-testid="select-email-template">
                          <SelectValue placeholder="Choose an email template" />
                        </SelectTrigger>
                        <SelectContent>
                          {(emailTemplates as any[])?.map((template: any) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Target Audience</Label>
                      <Select 
                        value={campaignForm.targetGroup} 
                        onValueChange={(value) => setCampaignForm({...campaignForm, targetGroup: value})}
                      >
                        <SelectTrigger data-testid="select-target-group">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Consumers ({(consumers as any[])?.length || 0})</SelectItem>
                          <SelectItem value="with-balance">Consumers with Balance</SelectItem>
                          <SelectItem value="decline">Decline Status</SelectItem>
                          <SelectItem value="recent-upload">Most Recent Uploaded File</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-3 pt-4">
                    <Button variant="outline" onClick={() => setShowCampaignModal(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateCampaign} disabled={createCampaignMutation.isPending}>
                      {createCampaignMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Send Campaign
                        </>
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            {/* Overview Tab - Email Metrics Dashboard */}
            <TabsContent value="overview">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                {/* Total Messages Sent */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="metric-messages-sent">
                      {metricsLoading ? "..." : (emailMetrics as any)?.totalSent || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      +{(emailMetrics as any)?.sentThisMonth || 0} this month
                    </p>
                  </CardContent>
                </Card>

                {/* Total Errors */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600" data-testid="metric-total-errors">
                      {metricsLoading ? "..." : (emailMetrics as any)?.totalErrors || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {((emailMetrics as any)?.totalErrors || 0) / Math.max((emailMetrics as any)?.totalSent || 1, 1) * 100}% error rate
                    </p>
                  </CardContent>
                </Card>

                {/* Open Rate */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
                    <Eye className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600" data-testid="metric-open-rate">
                      {metricsLoading ? "..." : `${(emailMetrics as any)?.openRate || 0}%`}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(emailMetrics as any)?.totalOpened || 0} opened emails
                    </p>
                  </CardContent>
                </Card>

                {/* Click Rate */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Clicks</CardTitle>
                    <MousePointer className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600" data-testid="metric-clicks">
                      {metricsLoading ? "..." : (emailMetrics as any)?.totalClicks || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      App downloads & signups from emails
                    </p>
                  </CardContent>
                </Card>

                {/* Opt-out Rate */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Opt-outs</CardTitle>
                    <UserMinus className="h-4 w-4 text-orange-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600" data-testid="metric-opt-outs">
                      {metricsLoading ? "..." : (emailMetrics as any)?.totalOptOuts || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {((emailMetrics as any)?.totalOptOuts || 0) / Math.max((emailMetrics as any)?.totalSent || 1, 1) * 100}% opt-out rate
                    </p>
                  </CardContent>
                </Card>

                {/* Delivery Rate */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
                    <TrendingUp className="h-4 w-4 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600" data-testid="metric-delivery-rate">
                      {metricsLoading ? "..." : `${(emailMetrics as any)?.deliveryRate || 0}%`}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(emailMetrics as any)?.totalDelivered || 0} delivered successfully
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Templates Tab */}
            <TabsContent value="templates">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Email Templates</CardTitle>
                    <Button onClick={() => setShowTemplateModal(true)} data-testid="button-create-template">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Template
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {templatesLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : !emailTemplates || (emailTemplates as any[]).length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Email Templates</h3>
                      <p className="text-gray-600 mb-4">
                        Create email templates to send personalized messages to consumers.
                      </p>
                      <Button onClick={() => setShowTemplateModal(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Your First Template
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(emailTemplates as any[]).map((template: any) => (
                        <div key={template.id} className="border rounded-lg p-4" data-testid={`template-${template.id}`}>
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <h3 className="font-medium text-gray-900">{template.name}</h3>
                                <Badge variant={template.status === 'draft' ? 'secondary' : 'default'}>
                                  {template.status || 'draft'}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">
                                <strong>Subject:</strong> {template.subject}
                              </p>
                              <div className="text-xs text-gray-500">
                                Created: {new Date(template.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <Button variant="outline" size="sm" data-testid={`button-preview-${template.id}`}>
                                <Eye className="h-4 w-4 mr-1" />
                                Preview
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" data-testid={`button-delete-${template.id}`}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Email Template</AlertDialogTitle>
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
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Campaigns Tab */}
            <TabsContent value="campaigns">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Email Campaigns</CardTitle>
                    <Button 
                      onClick={() => setShowCampaignModal(true)} 
                      disabled={!emailTemplates || (emailTemplates as any[]).length === 0}
                      data-testid="button-send-campaign"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Send Campaign
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!emailTemplates || (emailTemplates as any[]).length === 0 ? (
                    <div className="text-center py-8">
                      <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Templates Available</h3>
                      <p className="text-gray-600 mb-4">
                        Create email templates first before sending campaigns.
                      </p>
                      <Button onClick={() => setShowTemplateModal(true)}>
                        <FileText className="h-4 w-4 mr-2" />
                        Create Your First Template
                      </Button>
                    </div>
                  ) : campaignsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : !campaigns || (campaigns as any[]).length === 0 ? (
                    <div className="text-center py-8">
                      <Send className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Campaigns Yet</h3>
                      <p className="text-gray-600 mb-4">
                        Send your first email campaign to reach your consumers.
                      </p>
                      <Button onClick={() => setShowCampaignModal(true)}>
                        <Send className="h-4 w-4 mr-2" />
                        Send Your First Campaign
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(campaigns as any[]).map((campaign: any) => (
                        <div key={campaign.id} className="border rounded-lg p-4" data-testid={`campaign-${campaign.id}`}>
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <h3 className="font-medium text-gray-900">{campaign.name}</h3>
                                <Badge variant={campaign.status === 'completed' ? 'default' : campaign.status === 'sending' ? 'secondary' : 'destructive'}>
                                  {campaign.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">
                                <strong>Template:</strong> {campaign.templateName}
                              </p>
                              <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
                                <div>Sent: {campaign.totalSent || 0}</div>
                                <div>Opened: {campaign.totalOpened || 0}</div>
                                <div>Clicked: {campaign.totalClicks || 0}</div>
                                <div>Errors: {campaign.totalErrors || 0}</div>
                              </div>
                              <div className="text-xs text-gray-500 mt-2">
                                Sent: {new Date(campaign.createdAt).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Open Rate</span>
                        <span className="text-sm text-blue-600 font-medium" data-testid="analytics-open-rate">
                          {(emailMetrics as any)?.openRate || 0}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Click-through Rate</span>
                        <span className="text-sm text-green-600 font-medium" data-testid="analytics-click-rate">
                          {(emailMetrics as any)?.clickRate || 0}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Conversion Rate</span>
                        <span className="text-sm text-purple-600 font-medium" data-testid="analytics-conversion-rate">
                          {(emailMetrics as any)?.conversionRate || 0}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Opt-out Rate</span>
                        <span className="text-sm text-orange-600 font-medium" data-testid="analytics-optout-rate">
                          {(emailMetrics as any)?.optOutRate || 0}%
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {metricsLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span>Last 7 days</span>
                          <span className="font-medium">{(emailMetrics as any)?.last7Days || 0} sent</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Last 30 days</span>
                          <span className="font-medium">{(emailMetrics as any)?.last30Days || 0} sent</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Best performing template</span>
                          <span className="font-medium text-green-600">
                            {(emailMetrics as any)?.bestTemplate || "None yet"}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminLayout>
  );
}