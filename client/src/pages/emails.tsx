import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Mail,
  Plus,
  Send,
  FileText,
  Trash2,
  Eye,
  TrendingUp,
  Users,
  AlertCircle,
  MousePointer,
  UserMinus,
  Code,
  Sparkles,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough,
  List as ListIcon,
  ListOrdered,
  Eraser,
  Palette,
} from "lucide-react";
import { resolveConsumerPortalUrl } from "@shared/utils/consumerPortal";

export default function Emails() {
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    subject: "",
    html: "",
  });
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    templateId: "",
    targetGroup: "all",
    folderId: "",
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

  const { data: folders } = useQuery({
    queryKey: ["/api/folders"],
  });

  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
  });

  const { data: userData } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  const consumerPortalUrl = useMemo(() => {
    const tenantSlug = (userData as any)?.platformUser?.tenant?.slug;
    const portalSettings = (settings as any)?.consumerPortalSettings;
    const baseUrl = typeof window !== "undefined" ? window.location.origin : undefined;

    return resolveConsumerPortalUrl({
      tenantSlug,
      consumerPortalSettings: portalSettings,
      baseUrl,
    });
  }, [settings, userData]);

  const fallbackAgencyUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const slug = (userData as any)?.platformUser?.tenant?.slug || "your-agency";
    return `${window.location.origin}/agency/${slug}`;
  }, [userData]);

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

  // Template variables available for insertion
  const templateVariables = [
    { label: "First Name", value: "{{firstName}}", category: "consumer" },
    { label: "Last Name", value: "{{lastName}}", category: "consumer" },
    { label: "Full Name", value: "{{fullName}}", category: "consumer" },
    { label: "Email", value: "{{email}}", category: "consumer" },
    { label: "Phone", value: "{{phone}}", category: "consumer" },
    { label: "Consumer ID", value: "{{consumerId}}", category: "consumer" },
    { label: "Address", value: "{{address}}", category: "consumer" },
    { label: "City", value: "{{city}}", category: "consumer" },
    { label: "State", value: "{{state}}", category: "consumer" },
    { label: "Zip Code", value: "{{zipCode}}", category: "consumer" },
    { label: "Full Address", value: "{{fullAddress}}", category: "consumer" },
    { label: "Account Number", value: "{{accountNumber}}", category: "account" },
    { label: "File Number", value: "{{filenumber}}", category: "account" },
    { label: "Account ID", value: "{{accountId}}", category: "account" },
    { label: "Creditor", value: "{{creditor}}", category: "account" },
    { label: "Balance", value: "{{balance}}", category: "account" },
    { label: "Due Date", value: "{{dueDate}}", category: "account" },
    { label: "Consumer Portal Link", value: "{{consumerPortalLink}}", category: "links" },
    { label: "App Download Link", value: "{{appDownloadLink}}", category: "links" },
    { label: "Agency Name", value: "{{agencyName}}", category: "agency" },
    { label: "Agency Email", value: "{{agencyEmail}}", category: "agency" },
    { label: "Agency Phone", value: "{{agencyPhone}}", category: "agency" },
    { label: "Unsubscribe Link", value: "{{unsubscribeLink}}", category: "compliance" },
    { label: "Unsubscribe Button", value: "{{unsubscribeButton}}", category: "compliance" },
  ];

  // Function to insert variable at cursor position
  const syncEditorHtml = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.innerHTML;
    const textContent = editor.textContent?.trim() ?? "";
    setTemplateForm((prev) => ({
      ...prev,
      html: textContent ? html : "",
    }));
  };

  const insertVariable = (variable: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;

    if (selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(variable);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
    syncEditorHtml();
  };

  const applyEditorCommand = (command: string, value?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (command === "foreColor") {
      document.execCommand("styleWithCSS", false, "true");
    }
    document.execCommand(command, false, value);
    setTimeout(syncEditorHtml, 0);
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const currentHtml = editor.innerHTML;
    if ((templateForm.html || "") !== currentHtml) {
      editor.innerHTML = templateForm.html || "";
    }
  }, [templateForm.html, showTemplateModal]);

  // Function to render preview with actual data
  const renderPreview = () => {
    let preview = templateForm.html;
    
    // Replace variables with sample data
    preview = preview.replace(/\{\{firstName\}\}/g, "John");
    preview = preview.replace(/\{\{lastName\}\}/g, "Doe");
    preview = preview.replace(/\{\{fullName\}\}/g, "John Doe");
    preview = preview.replace(/\{\{email\}\}/g, "john.doe@example.com");
    preview = preview.replace(/\{\{phone\}\}/g, "(555) 123-4567");
    preview = preview.replace(/\{\{consumerId\}\}/g, "CON-12345");
    preview = preview.replace(/\{\{accountId\}\}/g, "ACC-67890");
    preview = preview.replace(/\{\{filenumber\}\}/gi, "FILE-54321");
    preview = preview.replace(/\{\{accountNumber\}\}/g, "ACC-12345");
    preview = preview.replace(/\{\{creditor\}\}/g, "Sample Creditor");
    preview = preview.replace(/\{\{balance\}\}/g, "$1,234.56");
    preview = preview.replace(/\{\{dueDate\}\}/g, "12/31/2024");
    preview = preview.replace(/\{\{address\}\}/g, "123 Main St");
    preview = preview.replace(/\{\{consumerAddress\}\}/g, "123 Main St");
    preview = preview.replace(/\{\{city\}\}/g, "Buffalo");
    preview = preview.replace(/\{\{consumerCity\}\}/g, "Buffalo");
    preview = preview.replace(/\{\{state\}\}/g, "NY");
    preview = preview.replace(/\{\{consumerState\}\}/g, "NY");
    preview = preview.replace(/\{\{zip\}\}/g, "14201");
    preview = preview.replace(/\{\{zipCode\}\}/g, "14201");
    preview = preview.replace(/\{\{fullAddress\}\}/g, "123 Main St, Buffalo, NY 14201");
    preview = preview.replace(/\{\{consumerFullAddress\}\}/g, "123 Main St, Buffalo, NY 14201");
    const resolvedConsumerPortalUrl =
      consumerPortalUrl || fallbackAgencyUrl || "https://your-agency.chainsoftwaregroup.com";
    preview = preview.replace(/\{\{consumerPortalLink\}\}/g, resolvedConsumerPortalUrl);
    preview = preview.replace(/\{\{appDownloadLink\}\}/g, "#");
    preview = preview.replace(/\{\{agencyName\}\}/g, (settings as any)?.agencyName || "Your Agency");
    preview = preview.replace(/\{\{agencyEmail\}\}/g, (settings as any)?.agencyEmail || "info@agency.com");
    preview = preview.replace(/\{\{agencyPhone\}\}/g, (settings as any)?.agencyPhone || "(555) 000-0000");
    const sampleUnsubscribeUrl = `${resolvedConsumerPortalUrl}/unsubscribe`;
    const sampleUnsubscribeButton = `<table align="center" cellpadding="0" cellspacing="0" style="margin:12px auto 0;">
  <tr>
    <td style="background-color:#6B7280;border-radius:4px;">
      <a href="${sampleUnsubscribeUrl}" style="display:inline-block;padding:10px 18px;color:#ffffff;text-decoration:none;font-weight:600;">Unsubscribe</a>
    </td>
  </tr>
</table>`;
    preview = preview.replace(/\{\{unsubscribeLink\}\}/g, sampleUnsubscribeUrl);
    preview = preview.replace(/\{\{unsubscribeUrl\}\}/g, sampleUnsubscribeUrl);
    preview = preview.replace(/\{\{unsubscribeButton\}\}/g, sampleUnsubscribeButton);

    return preview;
  };

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
      setCampaignForm({ name: "", templateId: "", targetGroup: "all", folderId: "" });
    },
    onError: (error) => {
      toast({
        title: "Campaign Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/email-campaigns/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Campaign Deleted",
        description: "Pending email campaign has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/email-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-metrics"] });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete campaign.",
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
    const editorContent = editorRef.current?.textContent?.trim() ?? "";
    if (!templateForm.name || !templateForm.subject || !editorContent) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    createTemplateMutation.mutate({
      ...templateForm,
      html: templateForm.html || editorRef.current?.innerHTML || "",
    });
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
    if (campaignForm.targetGroup === "folder" && !campaignForm.folderId) {
      toast({
        title: "Missing Folder",
        description: "Please select a folder for your campaign.",
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
                <DialogContent className="max-w-[95vw] w-full h-[90vh] max-h-[900px] bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] border-white/20 text-white">
                  <DialogHeader className="pb-4 border-b border-white/20">
                    <div className="flex items-center justify-between">
                      <DialogTitle className="flex items-center gap-2 text-white">
                        <Sparkles className="h-5 w-5 text-blue-400" />
                        Create Email Template
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
                        <Label className="text-sm font-medium text-blue-100">Template Name *</Label>
                        <Input
                          value={templateForm.name}
                          onChange={(e) => setTemplateForm({...templateForm, name: e.target.value})}
                          placeholder="e.g., Payment Reminder"
                          className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-blue-200/50"
                          data-testid="input-template-name"
                        />
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium text-blue-100">Subject Line *</Label>
                        <Input
                          value={templateForm.subject}
                          onChange={(e) => setTemplateForm({...templateForm, subject: e.target.value})}
                          placeholder="e.g., Payment Required - Account {{accountNumber}}"
                          className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-blue-200/50"
                          data-testid="input-template-subject"
                        />
                      </div>

                      <div>
                        <Label className="text-sm font-medium mb-2 block text-blue-100">Insert Variables</Label>
                        <div className="flex flex-wrap gap-1.5 p-3 bg-white/5 rounded-lg border border-white/20 mb-2">
                          {templateVariables.map((variable) => (
                            <Button
                              key={variable.value}
                              variant="outline"
                              size="sm"
                              onClick={() => insertVariable(variable.value)}
                              className="text-xs h-7 px-2 bg-white/10 border-white/20 text-blue-100 hover:bg-white/20 hover:text-white hover:border-white/30"
                              data-testid={`button-var-${variable.value.replace(/[{}]/g, '')}`}
                            >
                              {variable.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex-1">
                        <Label className="text-sm font-medium text-blue-100">Email Content *</Label>
                        <div className="mt-2 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => applyEditorCommand("bold")}
                              className="h-8 bg-white/10 border-white/20 text-blue-100 hover:bg-white/20"
                            >
                              <BoldIcon className="mr-1 h-3.5 w-3.5" />
                              Bold
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => applyEditorCommand("italic")}
                              className="h-8 bg-white/10 border-white/20 text-blue-100 hover:bg-white/20"
                            >
                              <ItalicIcon className="mr-1 h-3.5 w-3.5" />
                              Italic
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => applyEditorCommand("underline")}
                              className="h-8 bg-white/10 border-white/20 text-blue-100 hover:bg-white/20"
                            >
                              <UnderlineIcon className="mr-1 h-3.5 w-3.5" />
                              Underline
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => applyEditorCommand("strikeThrough")}
                              className="h-8 bg-white/10 border-white/20 text-blue-100 hover:bg-white/20"
                            >
                              <Strikethrough className="mr-1 h-3.5 w-3.5" />
                              Strike
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => applyEditorCommand("insertUnorderedList")}
                              className="h-8 bg-white/10 border-white/20 text-blue-100 hover:bg-white/20"
                            >
                              <ListIcon className="mr-1 h-3.5 w-3.5" />
                              Bullets
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => applyEditorCommand("insertOrderedList")}
                              className="h-8 bg-white/10 border-white/20 text-blue-100 hover:bg-white/20"
                            >
                              <ListOrdered className="mr-1 h-3.5 w-3.5" />
                              Numbered
                            </Button>
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center gap-1 text-xs text-blue-100">
                                <Palette className="h-3.5 w-3.5" />
                                Color
                              </span>
                              <input
                                type="color"
                                className="h-8 w-8 cursor-pointer rounded border border-white/20"
                                onChange={(event) => applyEditorCommand("foreColor", event.target.value)}
                                aria-label="Text color"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => applyEditorCommand("removeFormat")}
                              className="h-8 bg-white/10 border-white/20 text-blue-100 hover:bg-white/20"
                            >
                              <Eraser className="mr-1 h-3.5 w-3.5" />
                              Clear
                            </Button>
                          </div>

                          <div className="relative">
                            {!templateForm.html && (
                              <div className="pointer-events-none absolute left-3 top-3 text-sm text-blue-200/50">
                                Write your email content or paste existing HTML here.
                              </div>
                            )}
                            <div
                              ref={editorRef}
                              className="min-h-[280px] w-full rounded-md border border-white/20 bg-white/10 p-3 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              contentEditable
                              role="textbox"
                              aria-multiline="true"
                              suppressContentEditableWarning
                              onInput={syncEditorHtml}
                              onBlur={syncEditorHtml}
                              data-testid="input-template-html"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Panel - Preview */}
                    <div className="flex flex-col border-l border-white/20 pl-4 overflow-hidden">
                      <div className="mb-3">
                        <Label className="text-sm font-medium flex items-center gap-2 text-blue-100">
                          <Eye className="h-4 w-4" />
                          Email Preview
                        </Label>
                        <p className="text-xs text-blue-200/70 mt-1">
                          Preview with sample data
                        </p>
                      </div>
                      
                      <div className="flex-1 border border-white/20 rounded-lg overflow-auto bg-white/5 p-4">
                        {showPreview && templateForm.html ? (
                          <div className="bg-white rounded shadow-sm p-6 mx-auto max-w-2xl">
                            {/* Logo if available */}
                            {(settings as any)?.logoUrl && (
                              <div className="text-center mb-6 pb-6 border-b">
                                <img 
                                  src={(settings as any).logoUrl} 
                                  alt="Agency Logo" 
                                  className="h-12 mx-auto"
                                />
                              </div>
                            )}
                            {/* Subject */}
                            <div className="mb-4 pb-4 border-b">
                              <div className="text-xs text-gray-500 mb-1">Subject:</div>
                              <div className="font-semibold text-gray-900">
                                {templateForm.subject.replace(/\{\{accountNumber\}\}/g, "ACC-12345").replace(/\{\{firstName\}\}/g, "John") || "No subject"}
                              </div>
                            </div>
                            {/* Rendered HTML */}
                            <div 
                              className="prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: renderPreview() }}
                            />
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center text-blue-200/50">
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
                  
                  <div className="flex justify-end space-x-3 pt-4 border-t border-white/20">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowTemplateModal(false)}
                      className="rounded-xl border border-white/20 bg-transparent px-4 py-2 text-blue-100 transition hover:bg-white/10"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleCreateTemplate} 
                      disabled={createTemplateMutation.isPending}
                      className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
                    >
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
                        onValueChange={(value) => setCampaignForm({...campaignForm, targetGroup: value, folderId: ""})}
                      >
                        <SelectTrigger data-testid="select-target-group">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Consumers ({(consumers as any[])?.length || 0})</SelectItem>
                          <SelectItem value="with-balance">Consumers with Balance</SelectItem>
                          <SelectItem value="decline">Decline Status</SelectItem>
                          <SelectItem value="recent-upload">Most Recent Uploaded File</SelectItem>
                          <SelectItem value="folder">Specific Folder</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {campaignForm.targetGroup === "folder" && (
                      <div>
                        <Label>Select Folder *</Label>
                        <Select 
                          value={campaignForm.folderId} 
                          onValueChange={(value) => setCampaignForm({...campaignForm, folderId: value})}
                        >
                          <SelectTrigger data-testid="select-folder">
                            <SelectValue placeholder="Choose a folder" />
                          </SelectTrigger>
                          <SelectContent>
                            {(folders as any[])?.map((folder: any) => (
                              <SelectItem key={folder.id} value={folder.id}>
                                {folder.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
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
                      {(campaigns as any[]).map((campaign: any) => {
                        const getTargetGroupLabel = (targetGroup: string, folderId: string) => {
                          if (targetGroup === 'folder' && folderId) {
                            const folder = (folders as any[])?.find(f => f.id === folderId);
                            return `Folder: ${folder?.name || 'Unknown'}`;
                          }
                          if (targetGroup === 'all') return 'All Consumers';
                          if (targetGroup === 'with-balance') return 'Consumers with Balance';
                          if (targetGroup === 'decline') return 'Decline Status';
                          if (targetGroup === 'recent-upload') return 'Recent Upload';
                          return targetGroup;
                        };
                        
                        return (
                        <div key={campaign.id} className="border rounded-lg p-4" data-testid={`campaign-${campaign.id}`}>
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <h3 className="font-medium text-gray-900">{campaign.name}</h3>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">
                                <strong>Template:</strong> {campaign.templateName}
                              </p>
                              <p className="text-sm text-gray-600 mb-2">
                                <strong>Target:</strong> {getTargetGroupLabel(campaign.targetGroup, campaign.folderId)} ({campaign.totalRecipients || 0} recipients)
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
                            <div className="flex items-center gap-2">
                              <Badge variant={campaign.status === 'completed' ? 'default' : campaign.status === 'sending' ? 'secondary' : 'destructive'}>
                                {campaign.status}
                              </Badge>
                              {campaign.status === 'pending' && (
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
                                        This will remove the pending campaign and it will no longer be sent to consumers. This action cannot be undone.
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
                              )}
                            </div>
                          </div>
                        </div>
                        );
                      })}
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