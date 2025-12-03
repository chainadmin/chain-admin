
import { useState, useRef, useEffect, type RefObject, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { ServiceUpsellBanner } from "@/components/service-upsell-banner";
import { ServiceGate } from "@/components/service-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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

import {
  Mail,
  MessageSquare,
  Plus,
  Send,
  FileText,
  Trash2,
  Pencil,
  Eye,
  TrendingUp,
  Users,
  AlertCircle,
  MousePointer,
  UserMinus,
  UserCheck,
  Phone,
  Clock,
  Calendar,
  Settings,
  Copy,
  Sparkles,
  Megaphone,
  Zap,
  BarChart3,
  Code,
  LayoutDashboard,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough,
  List as ListIcon,
  ListOrdered,
  Eraser,
  Palette,
  Link2,
  Link2Off,
  Loader2,
  ArrowUp,
  ArrowDown,
  XCircle,
  PlayCircle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

import { POSTMARK_TEMPLATES, type PostmarkTemplateType } from "@shared/postmarkTemplates";
import { resolveConsumerPortalUrl } from "@shared/utils/consumerPortal";
import {
  createDefaultAccountDetails,
  DEFAULT_SUMMARY_ORDER,
  extractSectionOrder,
  getAccountHeading,
  normalizeSummaryOrder,
  stripSectionOrderComment,
  type SummaryBlock,
} from "./communicationsHelpers";

const ACCOUNT_SUMMARY_MARKERS = {
  start: "<!--ACCOUNT_SUMMARY_START-->",
  end: "<!--ACCOUNT_SUMMARY_END-->",
};

const ACCOUNT_SUMMARY_PLACEHOLDER_REGEX = /\{\{ACCOUNT_SUMMARY_BLOCK\}\}/gi;
const ACCOUNT_SUMMARY_META_REGEX = /<!--ACCOUNT_SUMMARY_META:([^>]*)-->/i;

type AccountSummaryOptions = {
  headingText: string;
  showHeading: boolean;
  showAccountDetails: boolean;
  includeButton: boolean;
  buttonText: string;
  buttonColor: string;
  buttonTextColor: string;
  buttonStyle: "solid" | "outline";
  buttonSize: "sm" | "md" | "lg";
  buttonAlignment: "left" | "center" | "right" | "full";
  buttonShape: "rounded" | "pill" | "square";
  tableWidth: "auto" | "600px" | "100%";
  tableFontSize: "sm" | "md" | "lg";
  tableBorderColor: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const DEFAULT_ACCOUNT_HEADING_TEXT = "Your account details:";
const DEFAULT_ACCOUNT_TABLE_HTML = `<table class="attribute-list" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td class="attribute-list-container">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td class="attribute-list-item"><strong>Account #:</strong> {{accountNumber}}</td></tr>
        <tr><td class="attribute-list-item"><strong>File #:</strong> {{filenumber}}</td></tr>
        <tr><td class="attribute-list-item"><strong>Creditor:</strong> {{creditor}}</td></tr>
        <tr><td class="attribute-list-item"><strong>Balance:</strong> {{balance}}</td></tr>
        <tr><td class="attribute-list-item"><strong>Due Date:</strong> {{dueDate}}</td></tr>
      </table>
    </td>
  </tr>
</table>`;

const BUTTON_SIZE_STYLES: Record<AccountSummaryOptions["buttonSize"], { padding: string; fontSize: string }> = {
  sm: { padding: "8px 18px", fontSize: "13px" },
  md: { padding: "12px 24px", fontSize: "15px" },
  lg: { padding: "16px 32px", fontSize: "17px" },
};

const BUTTON_SHAPE_RADIUS: Record<AccountSummaryOptions["buttonShape"], string> = {
  square: "6px",
  rounded: "10px",
  pill: "9999px",
};

const TABLE_FONT_SIZES: Record<AccountSummaryOptions["tableFontSize"], string> = {
  sm: "13px",
  md: "15px",
  lg: "17px",
};

const createDefaultAccountSummaryOptions = (): AccountSummaryOptions => ({
  headingText: DEFAULT_ACCOUNT_HEADING_TEXT,
  showHeading: true,
  showAccountDetails: true,
  includeButton: true,
  buttonText: "Make a Payment",
  buttonColor: "#22BC66",
  buttonTextColor: "#ffffff",
  buttonStyle: "solid",
  buttonSize: "md",
  buttonAlignment: "center",
  buttonShape: "rounded",
  tableWidth: "600px",
  tableFontSize: "md",
  tableBorderColor: "#e5e7eb",
});

const encodeAccountSummaryMeta = (options: AccountSummaryOptions) =>
  encodeURIComponent(JSON.stringify({ ...options, __v: 1 }));

const decodeAccountSummaryMeta = (value: string): AccountSummaryOptions | null => {
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    const { __v, ...rest } = parsed;
    return {
      ...createDefaultAccountSummaryOptions(),
      ...(rest as Partial<AccountSummaryOptions>),
    };
  } catch (error) {
    return null;
  }
};

const buildPaymentButtonHtml = (options: AccountSummaryOptions) => {
  const size = BUTTON_SIZE_STYLES[options.buttonSize];
  const borderRadius = BUTTON_SHAPE_RADIUS[options.buttonShape];
  const alignment = options.buttonAlignment === "full" ? "center" : options.buttonAlignment;
  const display = options.buttonAlignment === "full" ? "block" : "inline-block";
  const width = options.buttonAlignment === "full" ? "100%" : "auto";
  const backgroundColor = options.buttonStyle === "solid" ? options.buttonColor : "transparent";
  const textColor = options.buttonStyle === "solid" ? options.buttonTextColor : options.buttonColor;
  const border = options.buttonStyle === "solid" ? `1px solid ${options.buttonColor}` : `2px solid ${options.buttonColor}`;
  const anchorStyles = [
    `background-color:${backgroundColor}`,
    `color:${textColor}`,
    `display:${display}`,
    "font-weight:600",
    "text-decoration:none",
    `padding:${size.padding}`,
    `font-size:${size.fontSize}`,
    `border-radius:${borderRadius}`,
    "text-align:center",
    `border:${border}`,
    width === "100%" ? "width:100%" : "",
  ]
    .filter(Boolean)
    .join(";");

  const requiresFullWidth = options.buttonAlignment === "full";
  const edgeAligned = options.buttonAlignment === "left" || options.buttonAlignment === "right";
  const innerTableWidth = requiresFullWidth || edgeAligned ? ' width="100%"' : "";
  const outerTableStyle = requiresFullWidth || edgeAligned ? "margin:30px 0;width:100%;" : "margin:30px auto;width:auto;";

  return `<table class="body-action" align="center" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="${outerTableStyle}">
  <tr>
    <td align="${alignment}">
      <table border="0" cellspacing="0" cellpadding="0" role="presentation"${innerTableWidth}>
        <tr>
          <td align="${alignment}">
            <a href="{{consumerPortalLink}}" class="button" target="_blank" style="${anchorStyles}">${escapeHtml(
              options.buttonText || "Make a Payment",
            )}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
};

const buildAccountTableHtml = (options: AccountSummaryOptions) => {
  const fontSize = TABLE_FONT_SIZES[options.tableFontSize];
  const borderColor = options.tableBorderColor || "#e5e7eb";
  const tableWidth = options.tableWidth || "600px";
  
  // Handle width properly: use width attribute for percentages, CSS for pixel values
  let widthAttr = "";
  let widthStyle = "";
  
  if (tableWidth === "100%") {
    widthAttr = ' width="100%"';
  } else if (tableWidth === "600px") {
    widthStyle = "width:600px;max-width:600px;";
  } else {
    // auto
    widthStyle = "width:auto;";
  }
  
  return `<table class="attribute-list"${widthAttr} cellpadding="0" cellspacing="0" style="${widthStyle}margin:20px auto;border:1px solid ${borderColor};border-radius:8px;font-size:${fontSize};">
  <tr>
    <td class="attribute-list-container" style="padding:20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:${fontSize};">
        <tr><td class="attribute-list-item" style="padding:8px 0;border-bottom:1px solid ${borderColor};"><strong>Account #:</strong> {{accountNumber}}</td></tr>
        <tr><td class="attribute-list-item" style="padding:8px 0;border-bottom:1px solid ${borderColor};"><strong>File #:</strong> {{filenumber}}</td></tr>
        <tr><td class="attribute-list-item" style="padding:8px 0;border-bottom:1px solid ${borderColor};"><strong>Creditor:</strong> {{creditor}}</td></tr>
        <tr><td class="attribute-list-item" style="padding:8px 0;border-bottom:1px solid ${borderColor};"><strong>Balance:</strong> {{balance}}</td></tr>
        <tr><td class="attribute-list-item" style="padding:8px 0;"><strong>Due Date:</strong> {{dueDate}}</td></tr>
      </table>
    </td>
  </tr>
</table>`;
};

const buildAccountSummaryHtml = (options: AccountSummaryOptions, wrap = false) => {
  const sections: string[] = [`<!--ACCOUNT_SUMMARY_META:${encodeAccountSummaryMeta(options)}-->`];

  if (options.showHeading && options.headingText.trim()) {
    sections.push(`<p>${escapeHtml(options.headingText)}</p>`);
  }

  if (options.showAccountDetails) {
    sections.push(buildAccountTableHtml(options));
  }

  if (options.includeButton) {
    sections.push(buildPaymentButtonHtml(options));
  }

  const html = sections.join("\n");

  if (!wrap) {
    return html;
  }

  return `${ACCOUNT_SUMMARY_MARKERS.start}\n${html}\n${ACCOUNT_SUMMARY_MARKERS.end}`;
};

const DEFAULT_ACCOUNT_HEADING_HTML = `<p>${escapeHtml(DEFAULT_ACCOUNT_HEADING_TEXT)}</p>`;

const getAccountSummaryBlockRegex = () =>
  new RegExp(`${ACCOUNT_SUMMARY_MARKERS.start}[\\s\\S]*?${ACCOUNT_SUMMARY_MARKERS.end}`, "gi");

const replaceAccountSummaryBlock = (html: string, options: AccountSummaryOptions) => {
  if (!html) return html;
  const wrapped = buildAccountSummaryHtml(options, true);
  const blockRegex = getAccountSummaryBlockRegex();

  if (blockRegex.test(html)) {
    return html.replace(getAccountSummaryBlockRegex(), wrapped);
  }

  ACCOUNT_SUMMARY_PLACEHOLDER_REGEX.lastIndex = 0;
  if (ACCOUNT_SUMMARY_PLACEHOLDER_REGEX.test(html)) {
    ACCOUNT_SUMMARY_PLACEHOLDER_REGEX.lastIndex = 0;
    return html.replace(ACCOUNT_SUMMARY_PLACEHOLDER_REGEX, wrapped);
  }

  ACCOUNT_SUMMARY_PLACEHOLDER_REGEX.lastIndex = 0;
  return html;
};

const extractAccountSummaryOptionsFromHtml = (html: string): AccountSummaryOptions => {
  if (!html) {
    return createDefaultAccountSummaryOptions();
  }

  const metaMatch = ACCOUNT_SUMMARY_META_REGEX.exec(html);
  if (metaMatch) {
    const decoded = decodeAccountSummaryMeta(metaMatch[1]);
    if (decoded) {
      return decoded;
    }
  }

  const fallback = createDefaultAccountSummaryOptions();
  const blockMatch = getAccountSummaryBlockRegex().exec(html);
  const blockHtml = blockMatch ? blockMatch[0] : null;
  const contentToInspect = blockHtml || html;
  const buttonTextMatch = /<a[^>]*>([^<]+)<\/a>/i.exec(contentToInspect);
  if (buttonTextMatch) {
    fallback.buttonText = buttonTextMatch[1].trim();
  }

  if (!contentToInspect.includes(DEFAULT_ACCOUNT_TABLE_HTML)) {
    fallback.showAccountDetails = false;
  }

  if (!buttonTextMatch) {
    fallback.includeButton = false;
  }

  if (!contentToInspect.includes(DEFAULT_ACCOUNT_HEADING_TEXT)) {
    fallback.showHeading = false;
  }

  return fallback;
};

// Template-specific default content
const TEMPLATE_DEFAULTS = {
  'postmark-invoice': {
    subject: 'Account Statement - {{accountNumber}}',
    greeting: '<p>Dear {{firstName}} {{lastName}},</p>',
    message: '<p>Please find your current account statement below. Your account balance is {{balance}} for account {{accountNumber}}.</p>',
    closing: '<p>To make a payment or view your account details, please use the button below.</p>',
    signoff: '<p>Best regards,<br>{{agencyName}}</p>',
  },
  'postmark-welcome': {
    subject: 'Welcome to {{agencyName}}!',
    greeting: '<p>Welcome {{firstName}}!</p>',
    message: '<p>We\'re excited to have you here. Your account has been set up and you now have access to our online portal where you can view your account details, make payments, and manage your preferences.</p>',
    closing: '<p>To get started, click the button below to access your account portal.</p>',
    signoff: '<p>Welcome aboard,<br>The {{agencyName}} Team</p>',
  },
  'postmark-access': {
    subject: 'Your Account Portal is Ready',
    greeting: '<p>Hello {{firstName}},</p>',
    message: '<p>Your online account portal is now ready! You can view your account information, make payments, update your contact details, and more - all from one convenient location.</p>',
    closing: '<p>Click the button below to access your portal and manage your account securely.</p>',
    signoff: '<p>Best regards,<br>{{agencyName}}</p>',
  },
  'postmark-reminder': {
    subject: 'Payment Reminder - Account {{accountNumber}}',
    greeting: '<p>Hi {{firstName}},</p>',
    message: '<p>This is a friendly reminder about your account. Your current balance is {{balance}} for account {{accountNumber}}. We wanted to reach out to help you stay on top of your account.</p>',
    closing: '<p>You can make a payment quickly and securely using the button below. If you have any questions or need assistance, please don\'t hesitate to contact us.</p>',
    signoff: '<p>Thank you,<br>The {{agencyName}} Team</p>',
  },
};

const createEmptyEmailTemplateForm = () => ({
  name: "",
  subject: "",
  html: "",
  designType: "postmark-invoice" as PostmarkTemplateType,
});

export default function Communications() {
  const [activeTab, setActiveTab] = useState("overview");
  const [communicationType, setCommunicationType] = useState<"email" | "sms">("email");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showCampaignConfirmation, setShowCampaignConfirmation] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const smsTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Refs for all email template fields to enable variable insertion
  const subjectRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Track which field is currently focused for variable/snippet insertion
  const [activeField, setActiveField] = useState<"subject" | "html">("html");

  const [emailTemplateForm, setEmailTemplateForm] = useState(createEmptyEmailTemplateForm());

  const [smsTemplateForm, setSmsTemplateForm] = useState({
    name: "",
    message: "",
  });

  const [accountSummaryOptions, setAccountSummaryOptions] = useState(createDefaultAccountSummaryOptions());

  const updateAccountSummaryOption = <K extends keyof AccountSummaryOptions>(
    key: K,
    value: AccountSummaryOptions[K],
  ) => {
    setAccountSummaryOptions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };
  
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    templateId: "",
    targetGroup: "all",
    targetType: "all" as "all" | "folder" | "custom",
    targetFolderIds: [] as string[],
    phonesToSend: "1" as "1" | "2" | "3" | "all",
    customFilters: {
      balanceMin: "",
      balanceMax: "",
      status: "",
      lastContactDays: "",
    },
  });

  const [sendEmailForm, setSendEmailForm] = useState({
    to: "",
    templateId: "",
    subject: "",
    message: "",
  });

  // Parse query params on mount to pre-fill send email form
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');
    const nameParam = params.get('name');
    const tabParam = params.get('tab');
    
    if (emailParam) {
      setSendEmailForm(prev => ({
        ...prev,
        to: emailParam,
      }));
    }
    
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, []);

  // Consumer lookup for send email form
  const { data: consumerLookup, isLoading: isLookingUpConsumer } = useQuery({
    queryKey: ["/api/consumers/lookup", sendEmailForm.to],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/consumers/lookup?email=${encodeURIComponent(sendEmailForm.to)}`);
      return res.json();
    },
    enabled: !!sendEmailForm.to && sendEmailForm.to.includes("@"),
    retry: false,
  });

  const [editingAutomation, setEditingAutomation] = useState<any>(null);
  const [showEditAutomationModal, setShowEditAutomationModal] = useState(false);
  
  const [automationForm, setAutomationForm] = useState({
    name: "",
    description: "",
    type: "email" as "email" | "sms",
    templateId: "",
    scheduledDate: "",
    scheduleTime: "",
    targetFolderIds: [] as string[],
    phonesToSend: "1" as "1" | "2" | "3" | "all",
  });

  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [showSequenceModal, setShowSequenceModal] = useState(false);
  const [editingSequence, setEditingSequence] = useState<any>(null);
  const [viewingEnrollmentsSequenceId, setViewingEnrollmentsSequenceId] = useState<number | null>(null);
  const [sequenceSteps, setSequenceSteps] = useState<any[]>([]);
  const [sequenceForm, setSequenceForm] = useState({
    name: '',
    description: '',
    triggerType: 'immediate' as 'immediate' | 'scheduled' | 'event',
    triggerEvent: '' as 'account_created' | 'payment_received' | 'payment_overdue' | 'payment_failed' | '',
    triggerDelay: 0,
    targetType: 'all' as 'all' | 'folder' | 'custom',
    targetFolderIds: [] as number[],
    isActive: true,
  });

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

  const { data: documentTemplates, isLoading: documentTemplatesLoading } = useQuery({
    queryKey: ["/api/document-templates"],
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
    refetchInterval: (data) => {
      // Auto-refresh every 3 seconds if any campaign is sending
      if (!data || !Array.isArray(data)) return false;
      const hasSendingCampaign = data.some((c: any) => c.status === 'sending');
      return hasSendingCampaign ? 3000 : false;
    },
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

  const { data: sequences, isLoading: sequencesLoading } = useQuery({
    queryKey: ['/api/sequences'],
    enabled: !!userData,
  });

  const { data: sequenceEnrollments } = useQuery({
    queryKey: ['/api/sequences', viewingEnrollmentsSequenceId, 'enrollments'],
    enabled: viewingEnrollmentsSequenceId !== null,
  });

  const consumerPortalUrl = useMemo(() => {
    const tenantSlug = (userData as any)?.platformUser?.tenant?.slug;
    const portalSettings = (tenantSettings as any)?.consumerPortalSettings;
    const baseUrl = typeof window !== "undefined" ? window.location.origin : undefined;

    return resolveConsumerPortalUrl({
      tenantSlug,
      consumerPortalSettings: portalSettings,
      baseUrl,
    });
  }, [tenantSettings, userData]);

  const fallbackAgencyUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const slug = (userData as any)?.platformUser?.tenant?.slug || "your-agency";
    return `${window.location.origin}/agency/${slug}`;
  }, [userData]);

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
    { label: "SSN Last 4", value: "{{ssnLast4}}", category: "consumer" },
    { label: "Account Number", value: "{{accountNumber}}", category: "account" },
    { label: "File Number", value: "{{filenumber}}", category: "account" },
    { label: "Account ID", value: "{{accountId}}", category: "account" },
    { label: "Creditor", value: "{{creditor}}", category: "account" },
    { label: "Balance", value: "{{balance}}", category: "account" },
    { label: "Balance 50%", value: "{{balance50%}}", category: "account" },
    { label: "Balance 60%", value: "{{balance60%}}", category: "account" },
    { label: "Balance 70%", value: "{{balance70%}}", category: "account" },
    { label: "Balance 80%", value: "{{balance80%}}", category: "account" },
    { label: "Balance 90%", value: "{{balance90%}}", category: "account" },
    { label: "Balance 100%", value: "{{balance100%}}", category: "account" },
    { label: "Due Date", value: "{{dueDate}}", category: "account" },
    { label: "Due Date (ISO)", value: "{{dueDateIso}}", category: "account" },
    { label: "Today's Date", value: "{{currentDate}}", category: "dates" },
    { label: "Today (Long Format)", value: "{{currentDateLong}}", category: "dates" },
    { label: "Today (Short Format)", value: "{{currentDateShort}}", category: "dates" },
    { label: "Current Month", value: "{{currentMonth}}", category: "dates" },
    { label: "Current Year", value: "{{currentYear}}", category: "dates" },
    { label: "Payment Arrangement", value: "{{paymentArrangement}}", category: "payments" },
    { label: "Monthly Payment", value: "{{monthlyPayment}}", category: "payments" },
    { label: "Arrangement Start", value: "{{arrangementStartDate}}", category: "payments" },
    { label: "Arrangement End", value: "{{arrangementEndDate}}", category: "payments" },
    { label: "Next Payment Date", value: "{{nextPaymentDate}}", category: "payments" },
    { label: "Payment Method", value: "{{paymentMethod}}", category: "payments" },
    { label: "Total Paid", value: "{{totalPaid}}", category: "payments" },
    { label: "Remaining Balance", value: "{{remainingBalance}}", category: "payments" },
    { label: "Settlement Offer", value: "{{settlementOffer}}", category: "payments" },
    { label: "Settlement Expires", value: "{{settlementExpires}}", category: "payments" },
    { label: "Consumer Portal Link", value: "{{consumerPortalLink}}", category: "links" },
    { label: "App Download Link", value: "{{appDownloadLink}}", category: "links" },
    { label: "Payment Link", value: "{{paymentLink}}", category: "links" },
    { label: "Agency Name", value: "{{agencyName}}", category: "agency" },
    { label: "Agency Email", value: "{{agencyEmail}}", category: "agency" },
    { label: "Agency Phone", value: "{{agencyPhone}}", category: "agency" },
    { label: "Unsubscribe Link", value: "{{unsubscribeLink}}", category: "compliance" },
    { label: "Unsubscribe Button", value: "{{unsubscribeButton}}", category: "compliance" },
  ];

  const quickInsertSnippets = useMemo(
    () => [
      {
        label: "Account Summary Table",
        description: "Adds a styled table with key account merge fields",
        html: `${DEFAULT_ACCOUNT_HEADING_HTML}\n${DEFAULT_ACCOUNT_TABLE_HTML}`,
      },
      {
        label: "Payment Button",
        description: "Adds a primary button that links to the consumer portal",
        html: buildPaymentButtonHtml(accountSummaryOptions),
      },
    ],
    [accountSummaryOptions],
  );

  const formattingButtons = useMemo(
    () => [
      { Icon: BoldIcon, command: "bold", label: "Bold" },
      { Icon: ItalicIcon, command: "italic", label: "Italic" },
      { Icon: UnderlineIcon, command: "underline", label: "Underline" },
      { Icon: Strikethrough, command: "strikeThrough", label: "Strikethrough" },
      { Icon: ListIcon, command: "insertUnorderedList", label: "Bullet list" },
      { Icon: ListOrdered, command: "insertOrderedList", label: "Numbered list" },
    ],
    []
  );

  const blockOptions = useMemo(
    () => [
      { label: "Paragraph", value: "<p>" },
      { label: "Heading 1", value: "<h1>" },
      { label: "Heading 2", value: "<h2>" },
      { label: "Heading 3", value: "<h3>" },
    ],
    []
  );

  const colorOptions = useMemo(
    () => [
      { label: "Slate", value: "#1f2937" },
      { label: "Blue", value: "#2563eb" },
      { label: "Emerald", value: "#059669" },
      { label: "Rose", value: "#be123c" },
      { label: "Amber", value: "#d97706" },
    ],
    []
  );

  const syncEditorHtml = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = editor.innerHTML;
    const textContent = editor.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
    setEmailTemplateForm((prev) => ({
      ...prev,
      html: textContent ? html : "",
    }));
  };

  const insertTextAtCursor = (text: string) => {
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
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
    syncEditorHtml();
  };

  const insertHtmlSnippet = (html: string) => {
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

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    const fragment = document.createDocumentFragment();
    let node: ChildNode | null;
    while ((node = tempDiv.firstChild)) {
      fragment.appendChild(node);
    }
    range.insertNode(fragment);
    if (fragment.lastChild) {
      range.setStartAfter(fragment.lastChild);
      range.setEndAfter(fragment.lastChild);
    }
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

  const handleCreateLink = () => {
    if (typeof window === "undefined") return;
    const url = window.prompt("Enter the URL", "https://");
    if (!url) return;
    setActiveField("html");
    applyEditorCommand("createLink", url);
  };

  const handleRemoveLink = () => {
    setActiveField("html");
    applyEditorCommand("unlink");
  };

  const getPlainText = (html: string) =>
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextHtml = emailTemplateForm.html || "";
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }, [emailTemplateForm.html, showTemplateModal]);

  useEffect(() => {
    if (!showTemplateModal || communicationType !== "email") {
      return;
    }

    setEmailTemplateForm((prev) => {
      if (!prev.html) {
        return prev;
      }

      const updatedHtml = replaceAccountSummaryBlock(prev.html, accountSummaryOptions);
      if (updatedHtml === prev.html) {
        return prev;
      }

      return {
        ...prev,
        html: updatedHtml,
      };
    });
  }, [accountSummaryOptions, communicationType, showTemplateModal]);

  // Function to insert variable at cursor position (works with any field)
  const insertVariable = (variable: string) => {
    if (communicationType === "sms") {
      const textarea = smsTextareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = smsTemplateForm.message;
      const before = text.substring(0, start);
      const after = text.substring(end);
      const newText = before + variable + after;
      setSmsTemplateForm({ ...smsTemplateForm, message: newText });
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
      return;
    }

    if (activeField === "subject" && subjectRef.current) {
      const input = subjectRef.current;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const newValue =
        input.value.substring(0, start) + variable + input.value.substring(end);
      setEmailTemplateForm((prev) => ({
        ...prev,
        subject: newValue,
      }));
      setTimeout(() => {
        input.focus();
        const cursor = start + variable.length;
        input.setSelectionRange(cursor, cursor);
      }, 0);
      return;
    }

    insertTextAtCursor(variable);
  };

  const insertSnippet = (html: string) => {
    if (communicationType !== "email") {
      return;
    }
    setActiveField("html");
    insertHtmlSnippet(html);
  };

  // Function to handle design selection
  const handleDesignSelect = (designType: PostmarkTemplateType) => {
    const template = POSTMARK_TEMPLATES[designType] as any;
    const defaults = TEMPLATE_DEFAULTS[designType];
    
    // Safety guard: If defaults are missing for this template type, use generic fallback
    if (!defaults) {
      console.warn(`No default content found for template type: ${designType}`);
      toast({
        title: "Template Selection Error",
        description: "Unable to load default content for this template type.",
        variant: "destructive",
      });
      return;
    }
    
    let contentHtml = template.html || "";
    contentHtml = contentHtml.replace("{{CUSTOM_GREETING}}", defaults.greeting);
    contentHtml = contentHtml.replace("{{CUSTOM_MESSAGE}}", defaults.message);
    contentHtml = contentHtml.replace("{{CUSTOM_CLOSING_MESSAGE}}", defaults.closing);
    contentHtml = contentHtml.replace("{{CUSTOM_SIGNOFF}}", defaults.signoff);
    contentHtml = replaceAccountSummaryBlock(contentHtml, createDefaultAccountSummaryOptions());
    const fullHtml = template.styles ? `${template.styles}\n${contentHtml}` : contentHtml;

    setAccountSummaryOptions(createDefaultAccountSummaryOptions());

    setEmailTemplateForm((prev) => ({
      ...prev,
      designType,
      subject: defaults.subject,
      html: fullHtml,
    }));

    setTimeout(() => {
      const editor = editorRef.current;
      if (editor) {
        editor.innerHTML = fullHtml;
      }
    }, 0);
  };

  // Rich preview helpers
  const replacePreviewVariables = (
    template: string,
    mode: "html" | "text",
    context: {
      resolvedConsumerPortalUrl: string;
      sampleUnsubscribeUrl: string;
      agencyName: string;
      agencyEmail: string;
      agencyPhone: string;
    }
  ) => {
    if (!template) return "";
    const italic = (message: string) =>
      mode === "html"
        ? `<span style="color:#6B7280; font-style: italic;">${message}</span>`
        : `[${message}]`;

    let output = template;
    output = output.replace(/\{\{\s*firstName\s*\}\}/gi, "John");
    output = output.replace(/\{\{\s*lastName\s*\}\}/gi, "Doe");
    output = output.replace(/\{\{\s*fullName\s*\}\}/gi, "John Doe");
    output = output.replace(/\{\{\s*email\s*\}\}/gi, "john.doe@example.com");
    output = output.replace(/\{\{\s*phone\s*\}\}/gi, "(555) 123-4567");
    output = output.replace(/\{\{\s*consumerId\s*\}\}/gi, "CON-12345");
    output = output.replace(/\{\{\s*accountId\s*\}\}/gi, "ACC-67890");
    output = output.replace(/\{\{\s*accountNumber\s*\}\}/gi, italic("Account number auto-fills for each recipient"));
    output = output.replace(/\{\{\s*filenumber\s*\}\}/gi, italic("File number auto-fills for each recipient"));
    output = output.replace(/\{\{\s*creditor\s*\}\}/gi, italic("Creditor auto-fills for each recipient"));
    output = output.replace(/\{\{\s*balance\s*\}\}/gi, italic("Balance auto-fills for each recipient"));
    output = output.replace(/\{\{\s*balance50%\s*\}\}/gi, italic("50% of balance (settlement offer)"));
    output = output.replace(/\{\{\s*balance60%\s*\}\}/gi, italic("60% of balance"));
    output = output.replace(/\{\{\s*balance70%\s*\}\}/gi, italic("70% of balance"));
    output = output.replace(/\{\{\s*balance80%\s*\}\}/gi, italic("80% of balance"));
    output = output.replace(/\{\{\s*balance90%\s*\}\}/gi, italic("90% of balance"));
    output = output.replace(/\{\{\s*balance100%\s*\}\}/gi, italic("100% of balance (full amount)"));
    output = output.replace(/\{\{\s*dueDate\s*\}\}/gi, italic("Due date auto-fills for each recipient"));
    output = output.replace(/\{\{\s*dueDateIso\s*\}\}/gi, italic("Due date (ISO) auto-fills for each recipient"));
    output = output.replace(/\{\{\s*consumerPortalLink\s*\}\}/gi, context.resolvedConsumerPortalUrl);
    output = output.replace(/\{\{\s*appDownloadLink\s*\}\}/gi, "https://app.example.com/download");
    output = output.replace(/\{\{\s*agencyName\s*\}\}/gi, context.agencyName);
    output = output.replace(/\{\{\s*agencyEmail\s*\}\}/gi, context.agencyEmail);
    output = output.replace(/\{\{\s*agencyPhone\s*\}\}/gi, context.agencyPhone);
    output = output.replace(/\{\{\s*address\s*\}\}/gi, italic("Mailing address auto-fills for each recipient"));
    output = output.replace(/\{\{\s*consumerAddress\s*\}\}/gi, italic("Mailing address auto-fills for each recipient"));
    output = output.replace(/\{\{\s*city\s*\}\}/gi, italic("City auto-fills for each recipient"));
    output = output.replace(/\{\{\s*consumerCity\s*\}\}/gi, italic("City auto-fills for each recipient"));
    output = output.replace(/\{\{\s*state\s*\}\}/gi, italic("State auto-fills for each recipient"));
    output = output.replace(/\{\{\s*consumerState\s*\}\}/gi, italic("State auto-fills for each recipient"));
    output = output.replace(/\{\{\s*zip\s*\}\}/gi, italic("ZIP auto-fills for each recipient"));
    output = output.replace(/\{\{\s*zipCode\s*\}\}/gi, italic("ZIP auto-fills for each recipient"));
    output = output.replace(/\{\{\s*fullAddress\s*\}\}/gi, italic("Full address auto-fills for each recipient"));
    output = output.replace(/\{\{\s*consumerFullAddress\s*\}\}/gi, italic("Full address auto-fills for each recipient"));
    output = output.replace(/\{\{\s*ssnLast4\s*\}\}/gi, italic("Last 4 of SSN auto-fills for each recipient"));
    output = output.replace(/\{\{\s*unsubscribeLink\s*\}\}/gi, context.sampleUnsubscribeUrl);
    output = output.replace(/\{\{\s*unsubscribeUrl\s*\}\}/gi, context.sampleUnsubscribeUrl);
    return output;
  };

  const renderPreview = () => {
    if (!emailTemplateForm.html) {
      return "";
    }

    const resolvedConsumerPortalUrl =
      consumerPortalUrl || fallbackAgencyUrl || "https://your-agency.chainsoftwaregroup.com";
    const sampleUnsubscribeUrl = `${resolvedConsumerPortalUrl}/unsubscribe`;
    const agencyName = (tenantSettings as any)?.agencyName || "Your Agency";
    const agencyEmail = (tenantSettings as any)?.agencyEmail || "support@example.com";
    const agencyPhone = (tenantSettings as any)?.agencyPhone || "(555) 123-4567";

    let previewHtml = replaceAccountSummaryBlock(emailTemplateForm.html || "", accountSummaryOptions);
    previewHtml = previewHtml.replace(/<!--SECTION_ORDER:[^>]+-->/gi, "");
    previewHtml = replacePreviewVariables(previewHtml, "html", {
      resolvedConsumerPortalUrl,
      sampleUnsubscribeUrl,
      agencyName,
      agencyEmail,
      agencyPhone,
    });

    const unsubscribeButtonHtml = `<table align="center" cellpadding="0" cellspacing="0" style="margin:16px auto 0;">
  <tr>
    <td style="background-color:#6B7280;border-radius:4px;">
      <a href="${sampleUnsubscribeUrl}" style="display:inline-block;padding:10px 18px;color:#ffffff;text-decoration:none;font-weight:600;">Unsubscribe</a>
    </td>
  </tr>
</table>`;
    previewHtml = previewHtml.replace(/\{\{\s*unsubscribeButton\s*\}\}/gi, unsubscribeButtonHtml);

    const logoUrl =
      (tenantSettings as any)?.customBranding?.logoUrl || (tenantSettings as any)?.logoUrl;
    if (logoUrl) {
      const logoHtml = `<div style="text-align: center; margin-bottom: 30px;"><img src="${logoUrl}" alt="Company Logo" style="max-width: 200px; height: auto;" /></div>`;
      previewHtml = previewHtml.replace(/\{\{\s*COMPANY_LOGO\s*\}\}/gi, logoHtml);
    } else {
      previewHtml = previewHtml.replace(/\{\{\s*COMPANY_LOGO\s*\}\}/gi, "");
    }

    return previewHtml;
  };

  const renderSubjectPreview = () => {
    const resolvedConsumerPortalUrl =
      consumerPortalUrl || fallbackAgencyUrl || "https://your-agency.chainsoftwaregroup.com";
    const sampleUnsubscribeUrl = `${resolvedConsumerPortalUrl}/unsubscribe`;
    const agencyName = (tenantSettings as any)?.agencyName || "Your Agency";
    const agencyEmail = (tenantSettings as any)?.agencyEmail || "support@example.com";
    const agencyPhone = (tenantSettings as any)?.agencyPhone || "(555) 123-4567";

    const subjectPreview = replacePreviewVariables(emailTemplateForm.subject || "", "text", {
      resolvedConsumerPortalUrl,
      sampleUnsubscribeUrl,
      agencyName,
      agencyEmail,
      agencyPhone,
    });

    return subjectPreview || "No subject";
  };
  // Email Mutations
  const createEmailTemplateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/email-templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      setShowTemplateModal(false);
      setEmailTemplateForm(createEmptyEmailTemplateForm());
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
      setEmailTemplateForm(createEmptyEmailTemplateForm());
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
        phonesToSend: "1",
        customFilters: {
          balanceMin: "",
          balanceMax: "",
          status: "",
          lastContactDays: "",
        },
      });
      toast({
        title: "Success",
        description: "Email campaign created and awaiting approval",
      });
    },
  });

  const approveEmailCampaignMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/email-campaigns/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-metrics"] });
      toast({
        title: "Campaign Approved",
        description: "Email campaign is being sent.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve campaign",
        variant: "destructive",
      });
    },
  });

  const approveSmsCampaignMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sms-campaigns/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-metrics"] });
      toast({
        title: "Campaign Approved",
        description: "SMS campaign is being sent.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve campaign",
        variant: "destructive",
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
        phonesToSend: "1",
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
        description: `${variables.type === 'email' ? 'Email' : 'SMS'} campaign has been deleted.`,
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

  const cancelSmsCampaignMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sms-campaigns/${id}/cancel`),
    onSuccess: () => {
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

  const resumeSmsCampaignMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sms-campaigns/${id}/resume`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-metrics"] });
      toast({
        title: "Campaign Resumed",
        description: `Resuming campaign from message ${data.startingAt || 0}. ${data.remainingMessages || 0} messages remaining.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resume SMS campaign",
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
        scheduledDate: "",
        scheduleTime: "",
        targetFolderIds: [],
        phonesToSend: "1",
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

  const updateAutomationMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PUT", `/api/automations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] });
      setShowEditAutomationModal(false);
      setEditingAutomation(null);
      setAutomationForm({
        name: "",
        description: "",
        type: "email",
        templateId: "",
        scheduledDate: "",
        scheduleTime: "",
        targetFolderIds: [],
        phonesToSend: "1",
      });
      toast({
        title: "Success",
        description: "Automation updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update automation",
        variant: "destructive",
      });
    },
  });

  // Sequence mutations
  const createSequenceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/sequences", data);
      return res.json();
    },
    onSuccess: (newSequence) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      setShowSequenceModal(false);
      resetSequenceForm();
      toast({
        title: "Success",
        description: "Sequence created successfully",
      });
      return newSequence;
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create sequence",
        variant: "destructive",
      });
    },
  });

  const updateSequenceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/sequences/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      setShowSequenceModal(false);
      resetSequenceForm();
      toast({
        title: "Success",
        description: "Sequence updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update sequence",
        variant: "destructive",
      });
    },
  });

  const toggleSequenceMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PUT", `/api/sequences/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({
        title: "Success",
        description: "Sequence updated successfully",
      });
    },
  });

  const deleteSequenceMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/sequences/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({
        title: "Success",
        description: "Sequence deleted successfully",
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

  // Send individual email mutation
  const sendIndividualEmailMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/send-email", {
        to: data.to,
        subject: data.subject,
        message: data.message,
      });
    },
    onSuccess: () => {
      toast({
        title: "Email Sent",
        description: "Your email has been sent successfully",
      });
      setSendEmailForm({ to: "", templateId: "", subject: "", message: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send email",
        variant: "destructive",
      });
    },
  });

  // Handle template selection for send email
  const handleTemplateChange = (templateId: string) => {
    setSendEmailForm({ ...sendEmailForm, templateId });
    
    if (templateId && emailTemplates) {
      const template = (emailTemplates as any).find((t: any) => t.id === templateId);
      if (template) {
        setSendEmailForm({
          ...sendEmailForm,
          templateId,
          subject: template.subject || sendEmailForm.subject,
          message: template.html || sendEmailForm.message,
        });
      }
    }
  };

  const handleSendEmail = () => {
    if (!sendEmailForm.to || !sendEmailForm.subject || !sendEmailForm.message) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    sendIndividualEmailMutation.mutate(sendEmailForm);
  };

  const handleEditTemplate = (template: any) => {
    setEditingTemplate(template);
    if (communicationType === "email") {
      setEmailTemplateForm({
        name: template.name || "",
        subject: template.subject || "",
        html: template.html || "",
        designType: template.designType || "postmark-invoice",
      });
      setAccountSummaryOptions(extractAccountSummaryOptionsFromHtml(template.html || ""));
    } else {
      setSmsTemplateForm({
        name: template.name,
        message: template.message,
      });
    }
    setShowTemplateModal(true);
    
    // Ensure the editor is populated after the modal opens
    setTimeout(() => {
      if (communicationType === "email" && editorRef.current && template.html) {
        editorRef.current.innerHTML = template.html;
      }
    }, 100);
  };

  const handleTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (communicationType === "email") {
      const htmlContent = emailTemplateForm.html || "";
      const plainText = getPlainText(htmlContent);
      if (!emailTemplateForm.name.trim() || !emailTemplateForm.subject.trim() || !plainText) {
        toast({
          title: "Error",
          description: "Please fill in all required fields (Name, Subject, Content)",
          variant: "destructive",
        });
        return;
      }
      const dataToSend = {
        name: emailTemplateForm.name.trim(),
        subject: emailTemplateForm.subject,
        html: htmlContent,
        designType: emailTemplateForm.designType,
      };

      if (editingTemplate) {
        updateEmailTemplateMutation.mutate({
          id: editingTemplate.id,
          data: dataToSend
        });
      } else {
        createEmailTemplateMutation.mutate(dataToSend);
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

    if (campaignForm.targetType === "folder" && campaignForm.targetFolderIds.length === 0) {
      toast({
        title: "Select a folder",
        description: "Please choose a folder to target for this campaign",
        variant: "destructive",
      });
      return;
    }

    // Show confirmation dialog instead of immediately creating campaign
    setShowCampaignConfirmation(true);
  };

  const resetSequenceForm = () => {
    setSequenceForm({
      name: '',
      description: '',
      triggerType: 'immediate',
      triggerEvent: '',
      triggerDelay: 0,
      targetType: 'all',
      targetFolderIds: [],
      isActive: true,
    });
    setSequenceSteps([]);
    setEditingSequence(null);
  };

  const handleCreateSequence = async () => {
    if (!sequenceForm.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a sequence name",
        variant: "destructive",
      });
      return;
    }

    if (sequenceForm.triggerType === 'event' && !sequenceForm.triggerEvent) {
      toast({
        title: "Error",
        description: "Please select a trigger event",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingSequence) {
        await updateSequenceMutation.mutateAsync({
          id: editingSequence.id,
          data: sequenceForm,
        });
      } else {
        await createSequenceMutation.mutateAsync(sequenceForm);
      }
    } catch (error) {
      console.error('Failed to save sequence:', error);
    }
  };

  const addSequenceStep = () => {
    setSequenceSteps([...sequenceSteps, {
      stepType: 'email',
      templateId: null,
      delayDays: 0,
      delayHours: 0,
    }]);
  };

  const removeSequenceStep = (index: number) => {
    setSequenceSteps(sequenceSteps.filter((_, i) => i !== index));
  };

  const updateSequenceStep = (index: number, field: string, value: any) => {
    const updated = [...sequenceSteps];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === 'stepType') {
      updated[index].templateId = null;
    }
    
    setSequenceSteps(updated);
  };

  const moveStepUp = (index: number) => {
    if (index === 0) return;
    const updated = [...sequenceSteps];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setSequenceSteps(updated);
  };

  const moveStepDown = (index: number) => {
    if (index === sequenceSteps.length - 1) return;
    const updated = [...sequenceSteps];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setSequenceSteps(updated);
  };

  const handleCampaignConfirm = () => {
    if (communicationType === "email") {
      const payload = {
        ...campaignForm,
        targetGroup:
          campaignForm.targetType === "folder"
            ? "folder"
            : campaignForm.targetGroup,
        folderId:
          campaignForm.targetType === "folder"
            ? campaignForm.targetFolderIds[0] || null
            : null,
        targetFolderIds:
          campaignForm.targetType === "folder"
            ? campaignForm.targetFolderIds
            : [],
      };

      createEmailCampaignMutation.mutate(payload);
    } else {
      const payload = {
        ...campaignForm,
        targetGroup:
          campaignForm.targetType === "folder"
            ? "folder"
            : campaignForm.targetGroup,
        folderIds:
          campaignForm.targetType === "folder"
            ? campaignForm.targetFolderIds
            : [],
        phonesToSend: campaignForm.phonesToSend,
      };

      createSmsCampaignMutation.mutate(payload);
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

    if (!automationForm.templateId) {
      toast({
        title: "Error",
        description: "Please select a template",
        variant: "destructive",
      });
      return;
    }

    if (!automationForm.scheduledDate) {
      toast({
        title: "Error",
        description: "Please select a date",
        variant: "destructive",
      });
      return;
    }

    if (!automationForm.scheduleTime) {
      toast({
        title: "Error",
        description: "Please select a time",
        variant: "destructive",
      });
      return;
    }

    // Format the data for the API
    const automationData = {
      ...automationForm,
      scheduledDate: new Date(automationForm.scheduledDate + "T" + automationForm.scheduleTime).toISOString(),
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
      case "pending_approval":
        return "border-amber-300/40 bg-amber-500/10 text-amber-100";
      case "failed":
        return "border-rose-400/40 bg-rose-500/10 text-rose-100";
      default:
        return "border-indigo-400/40 bg-indigo-500/10 text-indigo-100";
    }
  };

  const formatCampaignStatus = (status: string) => {
    if (!status) return status;
    if (status === "pending_approval") {
      return "Pending approval";
    }
    return status.replace(/_/g, " ");
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
        <ServiceUpsellBanner service="email" />
        <ServiceGate service="email">
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
                  <span className="ml-3 text-xs font-normal text-blue-200/50">v2025-10-22-inbox-fixed</span>
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
              value="send"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-blue-100 transition data-[state=active]:bg-[#0b1733]/80 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/20"
            >
              <Mail className="h-4 w-4 mr-1.5 inline" />
              Send Email
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
              value="sequences"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-blue-100 transition data-[state=active]:bg-[#0b1733]/80 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/20"
            >
              Sequences
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
                        className="rounded-2xl border border-white/20 bg-white/10 p-4 text-blue-50 shadow-sm shadow-blue-900/10"
                      >
                        <div className="flex items-center justify-between">
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
                              {formatCampaignStatus(campaign.status)}
                            </Badge>
                            <span className="text-sm font-medium text-blue-100/70">{campaign.totalSent || 0} sent</span>
                          </div>
                        </div>
                        {/* Show compact progress for sending campaigns in overview */}
                        {campaign.status === "sending" && campaign.totalRecipients > 0 && (
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-blue-200">
                              <span className="flex items-center gap-1.5">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Sending
                              </span>
                              <span className="font-mono">{campaign.totalSent || 0}/{campaign.totalRecipients}</span>
                            </div>
                            <Progress 
                              value={((campaign.totalSent || 0) / campaign.totalRecipients) * 100} 
                              className="h-1.5 bg-blue-900/30"
                            />
                          </div>
                        )}
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

          <TabsContent value="send" className="space-y-6 text-white">
            <Card className="border-white/20 bg-white/5 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-blue-50 flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Send Individual Email
                </CardTitle>
                <p className="text-sm text-blue-100/70">Send a quick email to a specific consumer</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-blue-100">To (Email Address) *</Label>
                    <Input
                      type="email"
                      value={sendEmailForm.to}
                      onChange={(e) => setSendEmailForm({ ...sendEmailForm, to: e.target.value })}
                      placeholder="consumer@example.com"
                      className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-blue-100/50"
                      data-testid="input-send-to"
                    />
                    {isLookingUpConsumer && sendEmailForm.to.includes("@") && (
                      <p className="mt-2 text-xs text-blue-100/60 flex items-center gap-2">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"></div>
                        Looking up consumer...
                      </p>
                    )}
                    {consumerLookup && (consumerLookup as any).found && (
                      <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                            <UserCheck className="h-4 w-4" />
                            Consumer Found
                          </p>
                          <a
                            href={`/consumers?id=${(consumerLookup as any).consumer.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-300 hover:text-emerald-200 underline"
                          >
                            View Profile →
                          </a>
                        </div>
                        <div className="space-y-1 text-xs text-blue-100">
                          <p>
                            <span className="font-medium">Name:</span> {(consumerLookup as any).consumer.firstName} {(consumerLookup as any).consumer.lastName}
                          </p>
                          {(consumerLookup as any).consumer.phone && (
                            <p>
                              <span className="font-medium">Phone:</span> {(consumerLookup as any).consumer.phone}
                            </p>
                          )}
                          {(consumerLookup as any).accounts && (consumerLookup as any).accounts.length > 0 && (
                            <div className="pt-2 border-t border-emerald-500/20">
                              <p className="font-medium mb-1">Accounts ({(consumerLookup as any).accounts.length}):</p>
                              <div className="space-y-1">
                                {(consumerLookup as any).accounts.slice(0, 2).map((account: any) => (
                                  <div key={account.id} className="text-xs">
                                    <span className="font-mono">{account.accountNumber || 'N/A'}</span>
                                    {' - '}
                                    <span>{account.creditor}</span>
                                    {' - '}
                                    <span className="text-emerald-300">${(account.balanceCents / 100).toFixed(2)}</span>
                                  </div>
                                ))}
                                {(consumerLookup as any).accounts.length > 2 && (
                                  <p className="text-emerald-300">+{(consumerLookup as any).accounts.length - 2} more</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {consumerLookup && !(consumerLookup as any).found && (
                      <p className="mt-2 text-xs text-amber-400/80">
                        No consumer found with this email in your system
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-blue-100">Template (Optional)</Label>
                    <select
                      value={sendEmailForm.templateId}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                      className="mt-1 w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-white"
                      data-testid="select-template"
                    >
                      <option value="" className="bg-slate-800">No Template (Plain Email)</option>
                      {(emailTemplates as any)?.map((template: any) => (
                        <option key={template.id} value={template.id} className="bg-slate-800">
                          {template.name}
                        </option>
                      ))}
                    </select>
                    {sendEmailForm.templateId && (
                      <p className="text-xs text-blue-100/60 mt-1">Template subject and content loaded</p>
                    )}
                  </div>
                </div>
                
                <div>
                  <Label className="text-blue-100">Subject *</Label>
                  <Input
                    value={sendEmailForm.subject}
                    onChange={(e) => setSendEmailForm({ ...sendEmailForm, subject: e.target.value })}
                    placeholder="Email subject"
                    className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-blue-100/50"
                    data-testid="input-send-subject"
                  />
                </div>
                
                <div>
                  <Label className="text-blue-100">Message *</Label>
                  <Textarea
                    rows={8}
                    value={sendEmailForm.message}
                    onChange={(e) => setSendEmailForm({ ...sendEmailForm, message: e.target.value })}
                    placeholder="Type your message here..."
                    className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-blue-100/50"
                    data-testid="textarea-send-message"
                  />
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="border-white/20 text-blue-100 hover:bg-white/10"
                    onClick={() => setSendEmailForm({ to: "", templateId: "", subject: "", message: "" })}
                  >
                    Clear
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleSendEmail}
                    disabled={sendIndividualEmailMutation.isPending}
                    data-testid="button-send-email"
                  >
                    {sendIndividualEmailMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        Send Email
                      </>
                    )}
                  </Button>
                </div>
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
              <Dialog
                open={showTemplateModal}
                onOpenChange={(open) => {
                  setShowTemplateModal(open);
                  if (!open) {
                    setEditingTemplate(null);
                    setEmailTemplateForm(createEmptyEmailTemplateForm());
                    setSmsTemplateForm({ name: "", message: "" });
                    setAccountSummaryOptions(createDefaultAccountSummaryOptions());
                    setActiveField("html");
                    setTimeout(() => {
                      if (editorRef.current) {
                        editorRef.current.innerHTML = "";
                      }
                    }, 0);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    data-testid="button-create-template"
                    className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-slate-400/40 transition hover:bg-slate-800"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create {communicationType === "email" ? "email" : "SMS"} template
                  </Button>
                </DialogTrigger>
                <DialogContent className={communicationType === "email" ? "max-w-[98vw] w-full h-[95vh] rounded-3xl border border-white/20 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] text-white" : "max-w-2xl rounded-3xl border border-white/20 bg-[#0b1733]/95 backdrop-blur-md text-blue-50"}>
                  {communicationType === "email" ? (
                    <>
                      <DialogHeader className="pb-4 border-b border-white/20">
                        <DialogTitle className="flex items-center gap-2 text-white">
                          <Sparkles className="h-5 w-5 text-blue-400" />
                          {editingTemplate ? "Edit" : "Create"} Email Template
                        </DialogTitle>
                      </DialogHeader>

                      <div className="flex gap-4 h-[calc(100%-140px)] overflow-hidden">
                        {/* Main Content - Template Editor */}
                        <div className="flex-1 overflow-y-auto pr-4 space-y-4">
                          <div>
                            <Label className="text-sm font-medium mb-2 block text-blue-100">Choose Template Design</Label>
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
                                        ? "border-blue-500 bg-blue-500/20 text-white"
                                        : "border-white/20 bg-white/10 text-blue-100"
                                    )}
                                    data-testid={`button-design-${key}`}
                                  >
                                    <div className="text-2xl mb-1">{template.thumbnail}</div>
                                    <div className="font-medium text-sm">{template.name}</div>
                                    <div className="text-xs text-blue-200/70 mt-1">{template.description}</div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          
                          <div>
                            <Label className="text-sm font-medium text-blue-100">Template Name *</Label>
                            <Input
                              value={emailTemplateForm.name}
                              onChange={(e) => setEmailTemplateForm({...emailTemplateForm, name: e.target.value})}
                              placeholder="e.g., Payment Reminder"
                              className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-blue-200/50"
                              data-testid="input-template-name"
                            />
                          </div>
                          
                          <div>
                            <Label className="text-sm font-medium text-blue-100">Subject Line *</Label>
                            <Input
                              ref={subjectRef}
                              value={emailTemplateForm.subject}
                              onChange={(e) => setEmailTemplateForm({...emailTemplateForm, subject: e.target.value})}
                              onFocus={() => setActiveField('subject')}
                              placeholder="e.g., Payment Required - Account {{accountNumber}}"
                              className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-blue-200/50"
                              data-testid="input-subject"
                            />
                          </div>

                          <div className="space-y-3 rounded-xl border border-white/20 bg-white/5 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <h4 className="font-medium text-sm flex items-center gap-2 text-blue-100">
                                  ✏️ Build Your Email
                                </h4>
                                <p className="text-xs text-blue-200/70">Draft the full Outlook-style message in one editor.</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {formattingButtons.map(({ Icon, command, label }) => (
                                  <Button
                                    key={label}
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
                                    onClick={() => {
                                      setActiveField("html");
                                      applyEditorCommand(command);
                                    }}
                                    title={label}
                                  >
                                    <Icon className="h-4 w-4" />
                                  </Button>
                                ))}
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
                                  onClick={() => {
                                    setActiveField("html");
                                    applyEditorCommand("removeFormat");
                                  }}
                                  title="Clear formatting"
                                >
                                  <Eraser className="h-4 w-4" />
                                </Button>
                                <Select
                                  onValueChange={(value) => {
                                    setActiveField("html");
                                    applyEditorCommand("formatBlock", value);
                                  }}
                                >
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
                                <Select
                                  onValueChange={(value) => {
                                    setActiveField("html");
                                    applyEditorCommand("foreColor", value);
                                  }}
                                >
                                  <SelectTrigger className="flex h-8 w-[140px] items-center gap-2 border-white/20 bg-white/10 text-blue-100 text-xs">
                                    <Palette className="h-3.5 w-3.5" />
                                    <SelectValue placeholder="Text color" />
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
                                  onClick={handleCreateLink}
                                  title="Insert link"
                                >
                                  <Link2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 border-white/20 bg-white/10 text-blue-100 hover:bg-white/20"
                                  onClick={handleRemoveLink}
                                  title="Remove link"
                                >
                                  <Link2Off className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="rounded-lg border border-white/20 bg-white shadow-sm">
                              <div className="relative">
                                {!getPlainText(emailTemplateForm.html) && (
                                  <div className="pointer-events-none absolute inset-0 flex h-full w-full items-start justify-start p-5 text-sm text-blue-400">
                                    <p>
                                      Start typing your full email here. Use variables from the right to personalize content, or drop in
                                      quick layout blocks like the account table and payment button.
                                    </p>
                                  </div>
                                )}
                                <div
                                  ref={editorRef}
                                  className="min-h-[420px] w-full resize-y overflow-auto rounded-lg bg-white p-5 text-sm leading-relaxed text-slate-900 focus:outline-none"
                                  contentEditable
                                  suppressContentEditableWarning
                                  onInput={syncEditorHtml}
                                  onBlur={syncEditorHtml}
                                  onFocus={() => setActiveField("html")}
                                  spellCheck
                                  data-testid="email-html-editor"
                                />
                              </div>
                            </div>
                            <p className="text-xs text-blue-200/70">
                              Tip: Use {"{{ACCOUNT_SUMMARY_BLOCK}}"} in any design to auto-replace with your account table and payment
                              button quick inserts.
                            </p>
                          </div>

                          <div className="border border-white/20 rounded-lg p-4 bg-white/5">
                            <Label className="text-sm font-medium flex items-center gap-2 mb-3 text-blue-100">
                              <Eye className="h-4 w-4" />
                              Preview
                            </Label>
                            <div className="border border-white/20 rounded-lg overflow-auto bg-white p-4 max-h-96">
                              {emailTemplateForm.html ? (
                                <div className="bg-white">
                                  {(tenantSettings as any)?.logoUrl && (
                                    <div className="text-center mb-6 pb-6 border-b">
                                      <img
                                        src={(tenantSettings as any).logoUrl}
                                        alt="Agency Logo" 
                                        className="h-12 mx-auto"
                                      />
                                    </div>
                                  )}
                                  <div className="mb-4 pb-4 border-b">
                                    <div className="text-xs text-gray-500 mb-1">Subject:</div>
                                    <div className="font-semibold text-gray-900">{renderSubjectPreview()}</div>
                                  </div>
                                  <div
                                    className="prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: renderPreview() }}
                                  />
                                </div>
                              ) : (
                                <div className="h-full flex items-center justify-center text-gray-400 py-8">
                                  <div className="text-center">
                                    <Eye className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">Select a template design to see preview</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Fixed Sidebar - Variables */}
                        <div className="w-80 border-l border-white/20 pl-4 overflow-y-auto">
                          <div className="sticky top-0 pb-3">
                            <Label className="text-sm font-medium flex items-center gap-2 text-blue-100">
                              <Code className="h-4 w-4" />
                              Variables
                            </Label>
                            <p className="text-xs text-blue-200/70 mt-1">
                              Click to insert into any field
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {templateVariables.map((variable) => (
                              <button
                                key={variable.value}
                                type="button"
                                onClick={() => insertVariable(variable.value)}
                                className="text-xs px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition cursor-pointer font-medium shadow-sm"
                                data-testid={`var-${variable.value.replace(/[{}]/g, '')}`}
                              >
                                {variable.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-xs text-blue-200/70 mt-2">
                            💡 Tip: Variables work in ALL fields - subject lines, buttons, and more.
                          </p>

                          <div className="mt-6">
                            <Label className="text-sm font-medium flex items-center gap-2 text-blue-100">
                              <Sparkles className="h-4 w-4" />
                              Quick Inserts
                            </Label>
                            <p className="text-xs text-blue-200/70 mt-1">
                              Drop in ready-made layout blocks and adjust them in the editor.
                            </p>
                            <div className="mt-3 space-y-2">
                              {quickInsertSnippets.map((snippet) => (
                                <div key={snippet.label} className="rounded-lg border border-dashed border-white/20 bg-white/5 p-3">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="w-full justify-start gap-2 bg-blue-600 text-white hover:bg-blue-700"
                                    onClick={() => insertSnippet(snippet.html)}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    {snippet.label}
                                  </Button>
                                  <p className="mt-2 text-[11px] text-blue-200/70 leading-snug">
                                    {snippet.description}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="mt-6">
                            <Label className="text-sm font-medium flex items-center gap-2 text-blue-100">
                              <LayoutDashboard className="h-4 w-4" />
                              Account Summary Layout
                            </Label>
                            <p className="text-xs text-blue-200/70 mt-1">
                              Fine-tune the default table and payment button without editing HTML.
                            </p>
                            <div className="mt-3 space-y-3">
                              <div className="space-y-3 rounded-lg border border-white/15 bg-white/5 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-medium text-blue-100">Heading</p>
                                    <p className="text-[11px] text-blue-200/70">Toggle and rename the intro line above your table.</p>
                                  </div>
                                  <Switch
                                    checked={accountSummaryOptions.showHeading}
                                    onCheckedChange={(checked) => updateAccountSummaryOption("showHeading", checked)}
                                    aria-label="Toggle account summary heading"
                                  />
                                </div>
                                {accountSummaryOptions.showHeading && (
                                  <div>
                                    <Label className="text-[11px] uppercase tracking-wide text-blue-200/70">Heading text</Label>
                                    <Input
                                      value={accountSummaryOptions.headingText}
                                      onChange={(e) => updateAccountSummaryOption("headingText", e.target.value)}
                                      className="mt-1 h-8 bg-white/10 border-white/20 text-white placeholder:text-blue-200/50 text-xs"
                                      placeholder="e.g., Your account details"
                                    />
                                  </div>
                                )}
                              </div>

                              <div className="space-y-3 rounded-lg border border-white/15 bg-white/5 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-medium text-blue-100">Account table</p>
                                    <p className="text-[11px] text-blue-200/70">Show or hide the merge-field summary rows.</p>
                                  </div>
                                  <Switch
                                    checked={accountSummaryOptions.showAccountDetails}
                                    onCheckedChange={(checked) => updateAccountSummaryOption("showAccountDetails", checked)}
                                    aria-label="Toggle account details table"
                                  />
                                </div>
                                
                                {accountSummaryOptions.showAccountDetails && (
                                  <div className="space-y-3 pt-3 border-t border-white/10">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-[11px] uppercase tracking-wide text-blue-200/70">Table width</Label>
                                        <Select
                                          value={accountSummaryOptions.tableWidth}
                                          onValueChange={(value) =>
                                            updateAccountSummaryOption("tableWidth", value as AccountSummaryOptions["tableWidth"])
                                          }
                                        >
                                          <SelectTrigger className="mt-1 h-8 border-white/20 bg-white/10 text-xs text-blue-100">
                                            <SelectValue placeholder="Choose width" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="auto">Auto</SelectItem>
                                            <SelectItem value="600px">600px (Standard)</SelectItem>
                                            <SelectItem value="100%">Full Width</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label className="text-[11px] uppercase tracking-wide text-blue-200/70">Font size</Label>
                                        <Select
                                          value={accountSummaryOptions.tableFontSize}
                                          onValueChange={(value) =>
                                            updateAccountSummaryOption("tableFontSize", value as AccountSummaryOptions["tableFontSize"])
                                          }
                                        >
                                          <SelectTrigger className="mt-1 h-8 border-white/20 bg-white/10 text-xs text-blue-100">
                                            <SelectValue placeholder="Choose size" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="sm">Small</SelectItem>
                                            <SelectItem value="md">Medium</SelectItem>
                                            <SelectItem value="lg">Large</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                    
                                    <div>
                                      <Label className="text-[11px] uppercase tracking-wide text-blue-200/70">Border color</Label>
                                      <Input
                                        type="color"
                                        value={accountSummaryOptions.tableBorderColor}
                                        onChange={(e) => updateAccountSummaryOption("tableBorderColor", e.target.value)}
                                        className="mt-1 h-8 w-full cursor-pointer border-white/20 bg-white/10 p-1"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="space-y-3 rounded-lg border border-white/15 bg-white/5 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-medium text-blue-100">Payment button</p>
                                    <p className="text-[11px] text-blue-200/70">
                                      Adjust the label, alignment, size, and colors used for the pay-now call to action.
                                    </p>
                                  </div>
                                  <Switch
                                    checked={accountSummaryOptions.includeButton}
                                    onCheckedChange={(checked) => updateAccountSummaryOption("includeButton", checked)}
                                    aria-label="Toggle payment button"
                                  />
                                </div>

                                {accountSummaryOptions.includeButton && (
                                  <div className="space-y-3">
                                    <div>
                                      <Label className="text-[11px] uppercase tracking-wide text-blue-200/70">Button label</Label>
                                      <Input
                                        value={accountSummaryOptions.buttonText}
                                        onChange={(e) => updateAccountSummaryOption("buttonText", e.target.value)}
                                        className="mt-1 h-8 bg-white/10 border-white/20 text-white placeholder:text-blue-200/50 text-xs"
                                        placeholder="e.g., Pay balance now"
                                      />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-[11px] uppercase tracking-wide text-blue-200/70">Alignment</Label>
                                        <Select
                                          value={accountSummaryOptions.buttonAlignment}
                                          onValueChange={(value) =>
                                            updateAccountSummaryOption(
                                              "buttonAlignment",
                                              value as AccountSummaryOptions["buttonAlignment"],
                                            )
                                          }
                                        >
                                          <SelectTrigger className="mt-1 h-8 border-white/20 bg-white/10 text-xs text-blue-100">
                                            <SelectValue placeholder="Choose alignment" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="left">Left</SelectItem>
                                            <SelectItem value="center">Center</SelectItem>
                                            <SelectItem value="right">Right</SelectItem>
                                            <SelectItem value="full">Full width</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label className="text-[11px] uppercase tracking-wide text-blue-200/70">Size</Label>
                                        <Select
                                          value={accountSummaryOptions.buttonSize}
                                          onValueChange={(value) =>
                                            updateAccountSummaryOption("buttonSize", value as AccountSummaryOptions["buttonSize"])
                                          }
                                        >
                                          <SelectTrigger className="mt-1 h-8 border-white/20 bg-white/10 text-xs text-blue-100">
                                            <SelectValue placeholder="Choose size" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="sm">Compact</SelectItem>
                                            <SelectItem value="md">Comfortable</SelectItem>
                                            <SelectItem value="lg">Large</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-[11px] uppercase tracking-wide text-blue-200/70">Style</Label>
                                        <Select
                                          value={accountSummaryOptions.buttonStyle}
                                          onValueChange={(value) =>
                                            updateAccountSummaryOption(
                                              "buttonStyle",
                                              value as AccountSummaryOptions["buttonStyle"],
                                            )
                                          }
                                        >
                                          <SelectTrigger className="mt-1 h-8 border-white/20 bg-white/10 text-xs text-blue-100">
                                            <SelectValue placeholder="Choose style" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="solid">Solid</SelectItem>
                                            <SelectItem value="outline">Outline</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label className="text-[11px] uppercase tracking-wide text-blue-200/70">Shape</Label>
                                        <Select
                                          value={accountSummaryOptions.buttonShape}
                                          onValueChange={(value) =>
                                            updateAccountSummaryOption(
                                              "buttonShape",
                                              value as AccountSummaryOptions["buttonShape"],
                                            )
                                          }
                                        >
                                          <SelectTrigger className="mt-1 h-8 border-white/20 bg-white/10 text-xs text-blue-100">
                                            <SelectValue placeholder="Choose shape" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="rounded">Rounded</SelectItem>
                                            <SelectItem value="pill">Pill</SelectItem>
                                            <SelectItem value="square">Square</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-[11px] uppercase tracking-wide text-blue-200/70">Button color</Label>
                                        <Input
                                          type="color"
                                          value={accountSummaryOptions.buttonColor}
                                          onChange={(e) => updateAccountSummaryOption("buttonColor", e.target.value)}
                                          className="mt-1 h-8 w-full cursor-pointer border-white/20 bg-white/10 p-1"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-[11px] uppercase tracking-wide text-blue-200/70">Text color</Label>
                                        <Input
                                          type="color"
                                          value={accountSummaryOptions.buttonTextColor}
                                          onChange={(e) => updateAccountSummaryOption("buttonTextColor", e.target.value)}
                                          className="mt-1 h-8 w-full cursor-pointer border-white/20 bg-white/10 p-1"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-end space-x-3 pt-4 border-t border-white/20">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => setShowTemplateModal(false)}
                          className="rounded-xl border border-white/20 bg-transparent px-4 py-2 text-blue-100 transition hover:bg-white/10"
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleTemplateSubmit} 
                          disabled={createEmailTemplateMutation.isPending || updateEmailTemplateMutation.isPending}
                          className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
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
                      <DialogHeader className="pb-4 border-b border-white/20">
                        <DialogTitle className="flex items-center gap-2 text-white">
                          <Sparkles className="h-5 w-5 text-blue-400" />
                          Create SMS Template
                        </DialogTitle>
                        <p className="text-sm text-blue-100/70">
                          Create a new SMS template for your campaigns.
                        </p>
                      </DialogHeader>
                      <form onSubmit={handleTemplateSubmit} className="space-y-4">
                        <div>
                          <Label htmlFor="template-name" className="text-blue-100">Template Name</Label>
                          <Input
                            id="template-name"
                            data-testid="input-template-name"
                            value={smsTemplateForm.name}
                            onChange={(e) => setSmsTemplateForm({ ...smsTemplateForm, name: e.target.value })}
                            placeholder="Enter template name"
                            required
                            className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-blue-200/50"
                          />
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Variables Section - Scrollable */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium flex items-center gap-2 text-blue-100">
                              <Code className="h-4 w-4" />
                              Variables (30+ Available)
                            </Label>
                            <p className="text-xs text-blue-100/70">
                              Click any variable to insert it at cursor position
                            </p>
                            <div className="h-80 overflow-y-auto border border-white/20 rounded-lg p-3 bg-white/5">
                              <div className="flex flex-wrap gap-1.5">
                                {templateVariables.map((variable) => (
                                  <Button
                                    key={variable.value}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => insertVariable(variable.value)}
                                    className="text-xs h-7 px-2 bg-white/10 border-white/20 text-blue-100 hover:bg-white/20 hover:text-white hover:border-white/30 flex-shrink-0"
                                  >
                                    {variable.label}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          {/* Message Content Section - Fixed */}
                          <div className="space-y-2">
                            <Label htmlFor="message" className="text-blue-100">Message Content</Label>
                            <Textarea
                              id="message"
                              ref={smsTextareaRef}
                              data-testid="textarea-message"
                              value={smsTemplateForm.message}
                              onChange={(e) => setSmsTemplateForm({ ...smsTemplateForm, message: e.target.value })}
                              placeholder="Enter your SMS message. Click variables to insert them."
                              maxLength={1600}
                              required
                              className="font-mono text-sm h-80 resize-none bg-white/10 border-white/20 text-white placeholder:text-blue-200/50"
                            />
                            <p className="text-sm text-blue-100/70">
                              {smsTemplateForm.message.length}/1600 characters
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-4 border-t border-white/20">
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
                            className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
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
                          <div>
                            <p className="text-xs font-semibold text-blue-100/50 mb-1">Subject:</p>
                            <p className="text-sm text-blue-100 font-medium">{template.subject}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-blue-100/50 mb-1">Preview:</p>
                            <p className="text-xs text-blue-100/80 line-clamp-4">
                              {(template.html || '')
                                .replace(/<script[^>]*>.*?<\/script>/gi, '')
                                .replace(/<style[^>]*>.*?<\/style>/gi, '')
                                .replace(/<[^>]*>/g, ' ')
                                .replace(/\s+/g, ' ')
                                .trim()
                                .substring(0, 250)}
                              {template.html?.length > 250 ? '...' : ''}
                            </p>
                          </div>
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
                            <p className="text-xs font-medium text-gray-600 mb-1">Consumer Portal URL:</p>
                            <p className="text-xs text-gray-800 font-mono truncate">
                              {consumerPortalUrl || 'Configure portal URL in settings'}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-2 h-7 w-7 rounded-full bg-white/10 p-0 text-blue-100/70 hover:bg-slate-900/10"
                            onClick={() => {
                              const url = consumerPortalUrl || '';
                              if (url) {
                                navigator.clipboard.writeText(url);
                                toast({
                                  title: "URL Copied",
                                  description: "Consumer portal URL has been copied to clipboard.",
                                });
                              }
                            }}
                            disabled={!consumerPortalUrl}
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
                          const resolvedTargetGroup =
                            value === "all"
                              ? "all"
                              : value === "folder"
                                ? "folder"
                                : "custom";

                          setCampaignForm({
                            ...campaignForm,
                            targetType: value,
                            targetGroup: resolvedTargetGroup,
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
                                type="radio"
                                name="campaign-folder"
                                id={`folder-${folder.id}`}
                                checked={campaignForm.targetFolderIds[0] === folder.id}
                                onChange={() => {
                                  setCampaignForm({
                                    ...campaignForm,
                                    targetFolderIds: [folder.id],
                                  });
                                }}
                                className="rounded-full"
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

                    {communicationType === "sms" && (
                      <div className="space-y-2 border border-white/20 rounded-md p-3 bg-white/5">
                        <Label className="text-sm font-medium">Phone Numbers to Send To</Label>
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
                            {formatCampaignStatus(campaign.status)}
                          </Badge>
                          {campaign.status === "pending_approval" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border border-emerald-400/60 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                                  disabled={communicationType === "email" ? approveEmailCampaignMutation.isPending : approveSmsCampaignMutation.isPending}
                                >
                                  {(communicationType === "email" ? approveEmailCampaignMutation.isPending : approveSmsCampaignMutation.isPending) ? "Approving..." : "Approve & Send"}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Approve {communicationType === "email" ? "Email" : "SMS"} Campaign</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Approving this campaign will immediately send {campaign.totalRecipients || 0} {communicationType === "email" ? "emails" : "SMS messages"} to the selected recipients.
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                  {communicationType === "email" && consumerPortalUrl && (
                                    <div className="mt-4 rounded-lg border border-white/20 bg-white/5 p-3">
                                      <p className="text-xs font-medium text-blue-100/70 mb-1">Consumer Portal URL:</p>
                                      <p className="text-xs text-blue-100 font-mono break-all">
                                        {consumerPortalUrl}
                                      </p>
                                    </div>
                                  )}
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                    onClick={() => communicationType === "email" ? approveEmailCampaignMutation.mutate(campaign.id) : approveSmsCampaignMutation.mutate(campaign.id)}
                                    disabled={communicationType === "email" ? approveEmailCampaignMutation.isPending : approveSmsCampaignMutation.isPending}
                                  >
                                    {(communicationType === "email" ? approveEmailCampaignMutation.isPending : approveSmsCampaignMutation.isPending) ? "Approving..." : "Approve"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          {/* Stop/Cancel button for sending SMS campaigns */}
                          {communicationType === "sms" && campaign.status === "sending" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  data-testid="button-cancel-sms-campaign"
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Stop
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
                                    onClick={() => cancelSmsCampaignMutation.mutate(campaign.id)}
                                    disabled={cancelSmsCampaignMutation.isPending}
                                  >
                                    {cancelSmsCampaignMutation.isPending ? "Stopping..." : "Stop Campaign"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          {/* Resume button for cancelled/failed SMS campaigns with incomplete sends */}
                          {communicationType === "sms" && ['cancelled', 'failed'].includes(campaign.status) && (campaign.totalSent || 0) < (campaign.totalRecipients || 0) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-emerald-400/60 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                              onClick={() => resumeSmsCampaignMutation.mutate(campaign.id)}
                              disabled={resumeSmsCampaignMutation.isPending}
                              data-testid="button-resume-sms-campaign"
                            >
                              <PlayCircle className="h-4 w-4 mr-1" />
                              {resumeSmsCampaignMutation.isPending ? "Resuming..." : "Resume"}
                            </Button>
                          )}
                          {/* Delete button - ALWAYS visible for ALL campaigns */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                aria-label="Delete campaign"
                                data-testid="button-delete-campaign"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove this campaign. {campaign.status === 'sending' ? 'The campaign will be stopped first.' : ''} This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-600 hover:bg-red-700"
                                  onClick={() => {
                                    if (communicationType === "sms" && campaign.status === 'sending') {
                                      cancelSmsCampaignMutation.mutate(campaign.id);
                                      setTimeout(() => deleteCampaignMutation.mutate({ id: campaign.id, type: communicationType }), 500);
                                    } else {
                                      deleteCampaignMutation.mutate({ id: campaign.id, type: communicationType });
                                    }
                                  }}
                                  disabled={deleteCampaignMutation.isPending || cancelSmsCampaignMutation.isPending}
                                >
                                  {deleteCampaignMutation.isPending ? "Deleting..." : "Delete"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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

                        {/* Show progress bar when campaign is sending */}
                        {campaign.status === "sending" && campaign.totalRecipients > 0 && (
                          <div className="mt-4 space-y-2 rounded-lg border border-blue-400/30 bg-blue-500/10 p-3">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2 text-blue-200">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="font-semibold">Sending messages...</span>
                              </div>
                              <span className="font-mono text-blue-100">
                                {campaign.totalSent || 0} / {campaign.totalRecipients}
                              </span>
                            </div>
                            <Progress 
                              value={((campaign.totalSent || 0) / campaign.totalRecipients) * 100} 
                              className="h-2 bg-blue-900/30"
                            />
                            {communicationType === "sms" && (
                              <p className="text-xs text-blue-200/80">
                                Sending at {(tenantSettings as any)?.smsThrottleLimit || 10} messages/minute (throttle limit)
                              </p>
                            )}
                          </div>
                        )}
                        {/* Consumer Portal URL for reference */}
                        <div className="mt-4 border-t border-white/15 pt-4">
                          <span className="text-[11px] uppercase tracking-wide text-blue-100/70">Consumer Portal URL</span>
                          <span className="mt-1 block font-mono text-xs text-blue-50">
                            {consumerPortalUrl || 'Configure your portal URL in settings'}
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
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] border-white/20 text-white">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-white">Create Communication Automation</DialogTitle>
                    <p className="text-sm text-blue-100/70">
                      Set up automated messaging campaigns based on schedules or events.
                    </p>
                  </DialogHeader>
                  <form onSubmit={handleAutomationSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="automation-name">Name *</Label>
                        <Input
                          id="automation-name"
                          value={automationForm.name}
                          onChange={(e) => setAutomationForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g., Monthly Payment Reminder"
                          data-testid="input-automation-name"
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                        />
                      </div>
                      <div>
                        <Label htmlFor="automation-type">Type *</Label>
                        <Select 
                          value={automationForm.type} 
                          onValueChange={(value: "email" | "sms") => setAutomationForm(prev => ({ ...prev, type: value }))}
                        >
                          <SelectTrigger data-testid="select-automation-type" className="bg-white/10 border-white/20 text-white">
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
                      <Label htmlFor="automation-description">Description (Optional)</Label>
                      <Textarea
                        id="automation-description"
                        value={automationForm.description}
                        onChange={(e) => setAutomationForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="What is this automation for?"
                        data-testid="textarea-automation-description"
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                      />
                    </div>

                    <div>
                      <Label htmlFor="automation-template">Template *</Label>
                      <Select 
                        value={automationForm.templateId} 
                        onValueChange={(value) => setAutomationForm(prev => ({ ...prev, templateId: value }))}
                      >
                        <SelectTrigger data-testid="select-automation-template" className="bg-white/10 border-white/20 text-white">
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
                    </div>

                    {automationForm.type === "sms" && (
                      <div>
                        <Label>Phone Numbers to Send To</Label>
                        <Select
                          value={automationForm.phonesToSend}
                          onValueChange={(value: "1" | "2" | "3" | "all") => setAutomationForm(prev => ({ ...prev, phonesToSend: value }))}
                        >
                          <SelectTrigger data-testid="select-automation-phones-to-send" className="bg-white/10 border-white/20 text-white">
                            <SelectValue placeholder="Select how many phones" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 number (primary phone only)</SelectItem>
                            <SelectItem value="2">2 numbers</SelectItem>
                            <SelectItem value="3">3 numbers</SelectItem>
                            <SelectItem value="all">All available numbers</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-blue-100/60 mt-1">
                          Choose how many phone numbers to send to per consumer
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="schedule-date">Date *</Label>
                        <Input
                          id="schedule-date"
                          type="date"
                          value={automationForm.scheduledDate}
                          onChange={(e) => setAutomationForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
                          data-testid="input-schedule-date"
                          className="bg-white/10 border-white/20 text-white"
                        />
                      </div>
                      <div>
                        <Label htmlFor="schedule-time">Time *</Label>
                        <Input
                          id="schedule-time"
                          type="time"
                          value={automationForm.scheduleTime}
                          onChange={(e) => setAutomationForm(prev => ({ ...prev, scheduleTime: e.target.value }))}
                          data-testid="input-schedule-time"
                          className="bg-white/10 border-white/20 text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Target Folders (Optional)</Label>
                      <div className="border border-white/20 rounded-md p-3 space-y-2 max-h-48 overflow-y-auto bg-white/5">
                        {(folders as any[])?.map((folder: any) => (
                          <div key={folder.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`folder-${folder.id}`}
                              checked={automationForm.targetFolderIds.includes(folder.id)}
                              onCheckedChange={(checked: boolean) => {
                                if (checked) {
                                  setAutomationForm(prev => ({
                                    ...prev,
                                    targetFolderIds: [...prev.targetFolderIds, folder.id]
                                  }));
                                } else {
                                  setAutomationForm(prev => ({
                                    ...prev,
                                    targetFolderIds: prev.targetFolderIds.filter(id => id !== folder.id)
                                  }));
                                }
                              }}
                              data-testid={`checkbox-folder-${folder.id}`}
                            />
                            <label
                              htmlFor={`folder-${folder.id}`}
                              className="flex items-center gap-2 cursor-pointer text-sm text-white"
                            >
                              <span 
                                className="inline-block h-3 w-3 rounded-full" 
                                style={{ backgroundColor: folder.color }}
                              />
                              <span>{folder.name}</span>
                            </label>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-blue-100/60">
                        {automationForm.targetFolderIds.length > 0 
                          ? `${automationForm.targetFolderIds.length} folder(s) selected` 
                          : "No folders selected - will send to all accounts"}
                      </p>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/20">
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
                        className="bg-blue-600 text-white hover:bg-blue-700" 
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

            {/* Edit Automation Dialog */}
            <Dialog open={showEditAutomationModal} onOpenChange={setShowEditAutomationModal}>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] border-white/20 text-white">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-white">Edit Automation</DialogTitle>
                </DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (editingAutomation) {
                    updateAutomationMutation.mutate({
                      id: editingAutomation.id,
                      data: {
                        name: automationForm.name,
                        description: automationForm.description,
                        type: automationForm.type,
                        templateId: automationForm.templateId,
                        scheduledDate: automationForm.scheduledDate,
                        scheduleTime: automationForm.scheduleTime,
                        targetFolderIds: automationForm.targetFolderIds,
                      }
                    });
                  }
                }} className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="edit-automation-name">Automation Name *</Label>
                      <Input
                        id="edit-automation-name"
                        value={automationForm.name}
                        onChange={(e) => setAutomationForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., Monthly Payment Reminder"
                        required
                        data-testid="input-edit-automation-name"
                        className="bg-white/10 border-white/20 text-white"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="edit-automation-description">Description</Label>
                      <Textarea
                        id="edit-automation-description"
                        value={automationForm.description}
                        onChange={(e) => setAutomationForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe what this automation does..."
                        data-testid="textarea-edit-automation-description"
                        className="bg-white/10 border-white/20 text-white"
                      />
                    </div>

                    <div>
                      <Label htmlFor="edit-automation-type">Type *</Label>
                      <Select 
                        value={automationForm.type} 
                        onValueChange={(value: "email" | "sms") => setAutomationForm(prev => ({ ...prev, type: value }))}
                      >
                        <SelectTrigger data-testid="select-edit-automation-type" className="bg-white/10 border-white/20 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="edit-automation-template">Template *</Label>
                      <Select 
                        value={automationForm.templateId} 
                        onValueChange={(value) => setAutomationForm(prev => ({ ...prev, templateId: value }))}
                      >
                        <SelectTrigger data-testid="select-edit-automation-template" className="bg-white/10 border-white/20 text-white">
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
                    </div>

                    {automationForm.type === "sms" && (
                      <div>
                        <Label>Phone Numbers to Send To</Label>
                        <Select
                          value={automationForm.phonesToSend}
                          onValueChange={(value: "1" | "2" | "3" | "all") => setAutomationForm(prev => ({ ...prev, phonesToSend: value }))}
                        >
                          <SelectTrigger data-testid="select-edit-automation-phones-to-send" className="bg-white/10 border-white/20 text-white">
                            <SelectValue placeholder="Select how many phones" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 number (primary phone only)</SelectItem>
                            <SelectItem value="2">2 numbers</SelectItem>
                            <SelectItem value="3">3 numbers</SelectItem>
                            <SelectItem value="all">All available numbers</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-blue-100/60 mt-1">
                          Choose how many phone numbers to send to per consumer
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="edit-schedule-date">Date *</Label>
                        <Input
                          id="edit-schedule-date"
                          type="date"
                          value={automationForm.scheduledDate}
                          onChange={(e) => setAutomationForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
                          data-testid="input-edit-schedule-date"
                          className="bg-white/10 border-white/20 text-white"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-schedule-time">Time *</Label>
                        <Input
                          id="edit-schedule-time"
                          type="time"
                          value={automationForm.scheduleTime}
                          onChange={(e) => setAutomationForm(prev => ({ ...prev, scheduleTime: e.target.value }))}
                          data-testid="input-edit-schedule-time"
                          className="bg-white/10 border-white/20 text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Target Folders (Optional)</Label>
                      <div className="border border-white/20 rounded-md p-3 space-y-2 max-h-48 overflow-y-auto bg-white/5">
                        {(folders as any[])?.map((folder: any) => (
                          <div key={folder.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`edit-folder-${folder.id}`}
                              checked={automationForm.targetFolderIds.includes(folder.id)}
                              onCheckedChange={(checked: boolean) => {
                                if (checked) {
                                  setAutomationForm(prev => ({
                                    ...prev,
                                    targetFolderIds: [...prev.targetFolderIds, folder.id]
                                  }));
                                } else {
                                  setAutomationForm(prev => ({
                                    ...prev,
                                    targetFolderIds: prev.targetFolderIds.filter(id => id !== folder.id)
                                  }));
                                }
                              }}
                              data-testid={`checkbox-edit-folder-${folder.id}`}
                            />
                            <label
                              htmlFor={`edit-folder-${folder.id}`}
                              className="flex items-center gap-2 cursor-pointer text-sm text-white"
                            >
                              <span 
                                className="inline-block h-3 w-3 rounded-full" 
                                style={{ backgroundColor: folder.color }}
                              />
                              <span>{folder.name}</span>
                            </label>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-blue-100/60">
                        {automationForm.targetFolderIds.length > 0 
                          ? `${automationForm.targetFolderIds.length} folder(s) selected` 
                          : "No folders selected - will send to all accounts"}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-white/20">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowEditAutomationModal(false);
                        setEditingAutomation(null);
                      }}
                      data-testid="button-cancel-edit-automation"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={updateAutomationMutation.isPending}
                      data-testid="button-submit-edit-automation"
                      className="bg-blue-600 text-white hover:bg-blue-700"
                    >
                      {updateAutomationMutation.isPending ? "Updating..." : "Update Automation"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

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
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-full border border-blue-200/60 bg-blue-50/60 px-4 py-1 text-xs font-semibold text-blue-600 shadow-sm hover:bg-blue-50"
                              onClick={() => {
                                setEditingAutomation(automation);
                                setAutomationForm({
                                  name: automation.name || "",
                                  description: automation.description || "",
                                  type: automation.type || "email",
                                  templateId: automation.templateId || "",
                                  scheduledDate: automation.scheduledDate ? new Date(automation.scheduledDate).toISOString().split('T')[0] : "",
                                  scheduleTime: automation.scheduleTime || "",
                                  targetFolderIds: automation.targetFolderIds || [],
                                  phonesToSend: automation.phonesToSend || "1",
                                });
                                setShowEditAutomationModal(true);
                              }}
                              data-testid={`button-edit-automation-${automation.id}`}
                            >
                              <Pencil className="h-4 w-4" />
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
                              {automation.scheduledDate && automation.scheduleTime
                                ? `${new Date(automation.scheduledDate).toLocaleDateString()} at ${automation.scheduleTime}`
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

          <TabsContent value="sequences" className="space-y-10 text-white">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Communication Sequences</h2>
              <Dialog open={showSequenceModal} onOpenChange={setShowSequenceModal}>
                <DialogTrigger asChild>
                  <Button 
                    data-testid="button-create-sequence"
                    onClick={() => {
                      resetSequenceForm();
                      setShowSequenceModal(true);
                    }}
                    className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-slate-400/40 transition hover:bg-slate-800"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create Sequence
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-900 text-white border-white/20">
                  <DialogHeader>
                    <DialogTitle className="text-blue-50">{editingSequence ? 'Edit' : 'Create'} Communication Sequence</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-semibold text-blue-100">Sequence Name</label>
                        <Input
                          data-testid="input-sequence-name"
                          value={sequenceForm.name}
                          onChange={(e) => setSequenceForm({ ...sequenceForm, name: e.target.value })}
                          placeholder="e.g., Welcome Series"
                          className="mt-2 bg-white/10 border-white/20 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-blue-100">Description</label>
                        <Textarea
                          value={sequenceForm.description || ''}
                          onChange={(e) => setSequenceForm({ ...sequenceForm, description: e.target.value })}
                          placeholder="Describe this sequence..."
                          className="mt-2 bg-white/10 border-white/20 text-white"
                          rows={2}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-semibold text-blue-100">Trigger Type</label>
                          <Select
                            value={sequenceForm.triggerType}
                            onValueChange={(value: any) => setSequenceForm({ ...sequenceForm, triggerType: value })}
                          >
                            <SelectTrigger className="mt-2 bg-white/10 border-white/20 text-white">
                              <SelectValue placeholder="Select trigger" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="immediate">Immediate (Manual)</SelectItem>
                              <SelectItem value="scheduled">Scheduled</SelectItem>
                              <SelectItem value="event">Event-Based</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {sequenceForm.triggerType === 'event' && (
                          <div>
                            <label className="text-sm font-semibold text-blue-100">Trigger Event</label>
                            <Select
                              value={sequenceForm.triggerEvent}
                              onValueChange={(value: any) => setSequenceForm({ ...sequenceForm, triggerEvent: value })}
                            >
                              <SelectTrigger className="mt-2 bg-white/10 border-white/20 text-white">
                                <SelectValue placeholder="Select event" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="account_created">Account Created</SelectItem>
                                <SelectItem value="payment_received">Payment Received</SelectItem>
                                <SelectItem value="payment_overdue">Payment Overdue</SelectItem>
                                <SelectItem value="payment_failed">Payment Failed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {sequenceForm.triggerType !== 'event' && (
                          <div>
                            <label className="text-sm font-semibold text-blue-100">Trigger Delay (Days)</label>
                            <Input
                              type="number"
                              value={sequenceForm.triggerDelay}
                              onChange={(e) => setSequenceForm({ ...sequenceForm, triggerDelay: parseInt(e.target.value) || 0 })}
                              className="mt-2 bg-white/10 border-white/20 text-white"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="text-sm font-semibold text-blue-100">Target Audience</label>
                        <Select
                          value={sequenceForm.targetType}
                          onValueChange={(value: any) => setSequenceForm({ ...sequenceForm, targetType: value })}
                        >
                          <SelectTrigger className="mt-2 bg-white/10 border-white/20 text-white">
                            <SelectValue placeholder="Select target" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Consumers</SelectItem>
                            <SelectItem value="folder">Specific Folders</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {sequenceForm.targetType === 'folder' && (
                        <div>
                          <label className="text-sm font-semibold text-blue-100">Target Folders</label>
                          {(folders as any[] || []).length === 0 ? (
                            <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-yellow-200 text-xs">
                              No folders found. Create folders first in the Accounts section.
                            </div>
                          ) : (
                            <Select
                              value={sequenceForm.targetFolderIds[0]?.toString() || ''}
                              onValueChange={(value) => setSequenceForm({ ...sequenceForm, targetFolderIds: [parseInt(value)] })}
                            >
                              <SelectTrigger className="mt-2 bg-white/10 border-white/20 text-white">
                                <SelectValue placeholder="Select folder" />
                              </SelectTrigger>
                              <SelectContent>
                                {(folders as any[]).map((folder: any) => (
                                  <SelectItem key={folder.id} value={folder.id.toString()}>
                                    {folder.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-blue-100">Sequence Steps</h3>
                        <Button
                          type="button"
                          size="sm"
                          onClick={addSequenceStep}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add Step
                        </Button>
                      </div>

                      {sequenceSteps.map((step, index) => (
                        <div key={index} className="rounded-xl border border-white/20 bg-white/5 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-blue-100">Step {index + 1}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => moveStepUp(index)}
                                disabled={index === 0}
                                className="text-blue-400 hover:text-blue-300 disabled:opacity-30"
                                title="Move up"
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => moveStepDown(index)}
                                disabled={index === sequenceSteps.length - 1}
                                className="text-blue-400 hover:text-blue-300 disabled:opacity-30"
                                title="Move down"
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => removeSequenceStep(index)}
                                className="text-red-400 hover:text-red-300"
                                title="Remove step"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-blue-100/70">Type</label>
                              <Select
                                value={step.stepType}
                                onValueChange={(value) => updateSequenceStep(index, 'stepType', value)}
                              >
                                <SelectTrigger className="mt-1 bg-white/10 border-white/20 text-white text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="email">Email</SelectItem>
                                  <SelectItem value="sms">SMS</SelectItem>
                                  <SelectItem value="signature_request">Signature Request</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <label className="text-xs text-blue-100/70">Template</label>
                              <Select
                                value={step.templateId?.toString() || ''}
                                onValueChange={(value) => updateSequenceStep(index, 'templateId', value)}
                              >
                                <SelectTrigger className="mt-1 bg-white/10 border-white/20 text-white text-sm">
                                  <SelectValue placeholder="Select template" />
                                </SelectTrigger>
                                <SelectContent>
                                  {step.stepType === 'email'
                                    ? (emailTemplates as any[] || []).map((template: any) => (
                                        <SelectItem key={template.id} value={template.id}>
                                          {template.subject}
                                        </SelectItem>
                                      ))
                                    : step.stepType === 'sms'
                                    ? (smsTemplates as any[] || []).map((template: any) => (
                                        <SelectItem key={template.id} value={template.id}>
                                          {template.name}
                                        </SelectItem>
                                      ))
                                    : (documentTemplates as any[] || []).map((template: any) => (
                                        <SelectItem key={template.id} value={template.id}>
                                          {template.name}
                                        </SelectItem>
                                      ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <label className="text-xs text-blue-100/70">Delay (Days)</label>
                              <Input
                                type="number"
                                value={step.delayDays}
                                onChange={(e) => updateSequenceStep(index, 'delayDays', parseInt(e.target.value) || 0)}
                                className="mt-1 bg-white/10 border-white/20 text-white text-sm"
                              />
                            </div>

                            <div>
                              <label className="text-xs text-blue-100/70">Delay (Hours)</label>
                              <Input
                                type="number"
                                value={step.delayHours}
                                onChange={(e) => updateSequenceStep(index, 'delayHours', parseInt(e.target.value) || 0)}
                                className="mt-1 bg-white/10 border-white/20 text-white text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      {sequenceSteps.length === 0 && (
                        <div className="rounded-xl border border-dashed border-white/15 bg-white/5 py-8 text-center text-sm text-blue-100/60">
                          No steps added yet. Click "Add Step" to create your sequence.
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowSequenceModal(false)}
                        className="border-white/20 text-white hover:bg-white/10"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={handleCreateSequence}
                        disabled={createSequenceMutation.isPending || updateSequenceMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                        data-testid="button-save-sequence"
                      >
                        {(createSequenceMutation.isPending || updateSequenceMutation.isPending) ? (editingSequence ? "Updating..." : "Creating...") : (editingSequence ? "Update Sequence" : "Create Sequence")}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card className="border-white/20 bg-white/5 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-blue-50">Multi-step Communication Sequences</CardTitle>
                <p className="text-sm text-blue-100/70">
                  Create automated sequences that send multiple emails/SMS messages over time. Trigger them manually, on a schedule, or based on system events.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {sequencesLoading ? (
                  <div className="text-center py-8 text-blue-100/70">Loading sequences...</div>
                ) : sequences && (sequences as any[]).length > 0 ? (
                  <div className="space-y-3">
                    {(sequences as any[]).map((sequence: any) => (
                      <div key={sequence.id} className="rounded-xl border border-white/15 bg-white/5 p-6 space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <h3 className="text-lg font-semibold text-blue-50">{sequence.name}</h3>
                              <Badge variant={sequence.isActive ? "default" : "secondary"} className={sequence.isActive ? "bg-green-600" : "bg-gray-600"}>
                                {sequence.isActive ? "Active" : "Inactive"}
                              </Badge>
                              {sequence.triggerType === 'event' && (
                                <Badge variant="outline" className="border-blue-400 text-blue-300">
                                  Event: {sequence.triggerEvent?.replace('_', ' ')}
                                </Badge>
                              )}
                            </div>
                            {sequence.description && (
                              <p className="mt-2 text-sm text-blue-100/70">{sequence.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewingEnrollmentsSequenceId(sequence.id)}
                              className="border-white/20 text-white hover:bg-white/10"
                              data-testid={`button-view-enrollments-${sequence.id}`}
                            >
                              <Eye className="mr-1 h-3 w-3" />
                              View Enrollments
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingSequence(sequence);
                                setSequenceForm({
                                  name: sequence.name,
                                  description: sequence.description || '',
                                  triggerType: sequence.triggerType,
                                  triggerEvent: sequence.triggerEvent || '',
                                  triggerDelay: sequence.triggerDelay || 0,
                                  targetType: sequence.targetType,
                                  targetFolderIds: sequence.targetFolderIds || [],
                                  isActive: sequence.isActive,
                                });
                                setShowSequenceModal(true);
                              }}
                              className="border-white/20 text-white hover:bg-white/10"
                              data-testid={`button-edit-sequence-${sequence.id}`}
                            >
                              <Pencil className="mr-1 h-3 w-3" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleSequenceMutation.mutate({ id: sequence.id, isActive: !sequence.isActive })}
                              className="border-white/20 text-white hover:bg-white/10"
                            >
                              {sequence.isActive ? "Pause" : "Activate"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this sequence?')) {
                                  deleteSequenceMutation.mutate(sequence.id);
                                }
                              }}
                              className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-blue-100/70">Trigger Type:</span>
                            <span className="ml-2 font-semibold text-blue-50">{sequence.triggerType}</span>
                          </div>
                          <div>
                            <span className="text-blue-100/70">Target:</span>
                            <span className="ml-2 font-semibold text-blue-50">{sequence.targetType}</span>
                          </div>
                          <div>
                            <span className="text-blue-100/70">Created:</span>
                            <span className="ml-2 font-semibold text-blue-50">{new Date(sequence.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 py-10 text-center text-blue-100/70">
                    <Calendar className="mx-auto mb-4 h-12 w-12 text-blue-200/60" />
                    <p className="text-base font-semibold">No sequences created yet.</p>
                    <p className="text-sm text-blue-100/70">Create your first sequence to start multi-step communications.</p>
                    <div className="mt-6 space-y-2">
                      <p className="text-xs font-semibold text-blue-100/80">Sequence Examples:</p>
                      <div className="mx-auto max-w-2xl space-y-1 text-xs">
                        <p className="text-blue-100/60">• Welcome Series: Day 0 email, Day 2 SMS, Day 7 follow-up</p>
                        <p className="text-blue-100/60">• Payment Reminder: Day 0 warning, Day 3 urgent notice, Day 7 final notice</p>
                        <p className="text-blue-100/60">• Event-Based: Triggered when account created or payment overdue</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Enrollment Viewing Dialog */}
        <Dialog open={viewingEnrollmentsSequenceId !== null} onOpenChange={(open) => !open && setViewingEnrollmentsSequenceId(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 text-white border-white/20">
            <DialogHeader>
              <DialogTitle className="text-blue-50">Sequence Enrollments</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {sequenceEnrollments && (sequenceEnrollments as any[]).length > 0 ? (
                <div className="space-y-3">
                  {(sequenceEnrollments as any[]).map((enrollment: any) => (
                    <div key={enrollment.id} className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h4 className="font-semibold text-blue-50">
                              {(consumers as any[] || []).find((c: any) => c.id === enrollment.consumerId)?.firstName} {(consumers as any[] || []).find((c: any) => c.id === enrollment.consumerId)?.lastName}
                            </h4>
                            <Badge variant={
                              enrollment.status === 'active' ? 'default' :
                              enrollment.status === 'completed' ? 'secondary' :
                              enrollment.status === 'paused' ? 'outline' : 'destructive'
                            }>
                              {enrollment.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-blue-100/70">
                            Consumer ID: {enrollment.consumerId}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-blue-100/70">Enrolled:</span>
                          <div className="mt-1 font-semibold text-blue-50">
                            {new Date(enrollment.enrolledAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div>
                          <span className="text-blue-100/70">Current Step:</span>
                          <div className="mt-1 font-semibold text-blue-50">
                            Step {enrollment.currentStepOrder || 'N/A'}
                          </div>
                        </div>
                        <div>
                          <span className="text-blue-100/70">Next Message:</span>
                          <div className="mt-1 font-semibold text-blue-50">
                            {enrollment.nextMessageAt ? new Date(enrollment.nextMessageAt).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                      </div>
                      {enrollment.completedAt && (
                        <div className="text-xs text-blue-100/60">
                          Completed: {new Date(enrollment.completedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/5 py-8 text-center text-blue-100/70">
                  <Users className="mx-auto mb-3 h-10 w-10 text-blue-200/60" />
                  <p className="font-semibold">No enrollments found</p>
                  <p className="text-sm text-blue-100/60">This sequence has no active or completed enrollments yet.</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Campaign Confirmation Dialog */}
        <AlertDialog open={showCampaignConfirmation} onOpenChange={setShowCampaignConfirmation}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Campaign Creation</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to create this {communicationType} campaign?
                {communicationType === "email" && (
                  <>
                    {' '}Email campaigns will remain pending approval until you approve them from the campaign list.
                  </>
                )}
                {' '}This will target: {getTargetGroupLabel(campaignForm)}.
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
        </ServiceGate>
      </div>
    </AdminLayout>
  );
}