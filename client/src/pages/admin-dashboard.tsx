import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import AdminLayout from "@/components/admin-layout";
import StatsCard from "@/components/stats-card";
import AccountsTable from "@/components/accounts-table";
import ImportModal from "@/components/import-modal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Mail, MapPin, Phone } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AdminDashboard() {
  const { toast } = useToast();
  const [showImportModal, setShowImportModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showComposeEmailDialog, setShowComposeEmailDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [composeEmailForm, setComposeEmailForm] = useState({
    templateId: "",
    subject: "",
    body: "",
  });

  const handleView = (account: any) => {
    setSelectedAccount(account);
    setShowViewModal(true);
  };

  const handleContact = (account: any) => {
    setSelectedAccount(account);
    setShowContactDialog(true);
  };

  const handleViewModalChange = (open: boolean) => {
    setShowViewModal(open);
    if (!open && !showContactDialog) {
      setSelectedAccount(null);
    }
  };

  const handleContactModalChange = (open: boolean) => {
    setShowContactDialog(open);
    if (!open && !showViewModal) {
      setSelectedAccount(null);
    }
  };

  const handleComposeEmail = (account: any) => {
    if (!account?.consumer?.email) {
      return;
    }

    const consumerName = [account.consumer?.firstName, account.consumer?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const defaultSubject = account.creditor
      ? `${account.creditor} account update`
      : 'Account update';

    const defaultBody = [
      consumerName ? `Hello ${consumerName},` : 'Hello,',
      '',
      'We are reaching out regarding your account and would be happy to assist with any questions you may have.',
      '',
      'Thank you,',
      'Your agency team',
    ].join('\n');

    setComposeEmailForm({
      templateId: '',
      subject: defaultSubject,
      body: defaultBody,
    });
    setSelectedAccount(account);
    setShowContactDialog(false);
    setShowComposeEmailDialog(true);
  };

  const { data: emailTemplates } = useQuery({
    queryKey: ["/api/email-templates"],
    enabled: showComposeEmailDialog,
  });

  const sendEmailMutation = useMutation({
    mutationFn: async ({ to, subject, body, templateId }: { to: string; subject: string; body: string; templateId?: string }) => {
      const response = await apiRequest("POST", "/api/communications/send-email", {
        to: [to],
        subject,
        body,
        templateId,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Email sent",
        description: "Your email has been sent successfully.",
      });
      setShowComposeEmailDialog(false);
      setComposeEmailForm({ templateId: "", subject: "", body: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send email",
        description: error.message || "An error occurred while sending the email.",
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (cents?: number | null) => {
    if (typeof cents !== "number") {
      return "$0.00";
    }
    return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) {
      return "Unknown";
    }
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusColor = (status?: string | null) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
      case "overdue":
        return "border border-rose-400/30 bg-rose-500/10 text-rose-200";
      case "settled":
        return "border border-slate-400/30 bg-slate-500/10 text-slate-200";
      default:
        return "border border-amber-400/30 bg-amber-500/10 text-amber-200";
    }
  };

  const selectedAccountLocation = selectedAccount
    ? [
        selectedAccount.consumer?.city,
        selectedAccount.consumer?.state,
        selectedAccount.consumer?.zipCode,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/stats"],
  });

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["/api/accounts"],
  });

  const { data: enabledModulesData } = useQuery<{ enabledModules: string[] }>({
    queryKey: ["/api/settings/enabled-modules"],
  });

  const enabledModules = enabledModulesData?.enabledModules || [];

  const moduleLabels: Record<string, string> = {
    billing: '💳 Billing',
    subscriptions: '🔁 Subscriptions',
    work_orders: '🧾 Work Orders',
    client_crm: '🧍 Client CRM',
    messaging_center: '💬 Messaging',
  };

  return (
    <AdminLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 text-blue-50 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/10 p-8 shadow-2xl shadow-blue-900/30">
          <div className="pointer-events-none absolute -right-10 top-10 h-56 w-56 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-6 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-5">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100/80">
                Operations pulse
              </span>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                Agency performance command center
              </h1>
              <p className="text-sm text-blue-100/70 sm:text-base">
                Monitor collections momentum, channel engagement, and cash flow in one unified view. Spot bottlenecks instantly and launch the right workflows without leaving your dashboard.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-blue-100/80">
                  <p className="font-semibold text-white">Live account health</p>
                  <p className="mt-1 text-xs text-blue-100/70">Track consumer growth, balance shifts, and collection rate trends updated in real time.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-blue-100/80">
                  <p className="font-semibold text-white">Actionable automations</p>
                  <p className="mt-1 text-xs text-blue-100/70">Trigger imports, outreach, or reviews the moment numbers move outside your target range.</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Button
                variant="ghost"
                className="rounded-xl border border-white/15 bg-white/10 px-6 py-2 text-sm font-semibold text-blue-100 transition hover:bg-white/20"
              >
                <i className="fas fa-download mr-2 text-base"></i>
                Export snapshot
              </Button>
              <Button
                onClick={() => setShowImportModal(true)}
                className="rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80"
              >
                <i className="fas fa-plus mr-2 text-base"></i>
                Import accounts
              </Button>
            </div>
          </div>
        </section>

        {/* Active Business Modules Indicator */}
        {enabledModules.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-blue-900/20 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-blue-100/70">Active Modules:</span>
              {enabledModules.map((moduleId: string) => (
                <span
                  key={moduleId}
                  className="inline-flex items-center rounded-full border border-white/20 bg-gradient-to-r from-sky-500/20 to-indigo-500/20 px-3 py-1 text-xs font-semibold text-white shadow-sm"
                  data-testid={`badge-module-${moduleId}`}
                >
                  {moduleLabels[moduleId] || moduleId}
                </span>
              ))}
            </div>
          </section>
        )}

        <section>
          {statsLoading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-full rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-blue-900/20 backdrop-blur animate-pulse">
                  <div className="h-3 w-24 rounded-full bg-white/10" />
                  <div className="mt-6 h-8 w-28 rounded-full bg-white/10" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <StatsCard
                  title="Total Consumers"
                  value={(stats as any)?.totalConsumers?.toLocaleString() || "0"}
                  icon="fas fa-users"
                  data-testid="stat-total-consumers"
                />
                <StatsCard
                  title="Active Accounts"
                  value={(stats as any)?.activeAccounts?.toLocaleString() || "0"}
                  icon="fas fa-file-invoice-dollar"
                  data-testid="stat-active-accounts"
                />
                <StatsCard
                  title="Total Balance"
                  value={`$${(stats as any)?.totalBalance?.toLocaleString() || "0"}`}
                  icon="fas fa-dollar-sign"
                  data-testid="stat-total-balance"
                />
                <StatsCard
                  title="Collection Rate"
                  value={`${(stats as any)?.collectionRate || 0}%`}
                  icon="fas fa-chart-line"
                  data-testid="stat-collection-rate"
                />
              </div>

              {/* Payment Metrics */}
              {(stats as any)?.paymentMetrics && (
                <div className="mt-8">
                  <h2 className="text-xl font-semibold text-white mb-4">Payment Metrics</h2>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
                    <StatsCard
                      title="Total Payments"
                      value={(stats as any)?.paymentMetrics?.totalPayments?.toLocaleString() || "0"}
                      icon="fas fa-credit-card"
                      data-testid="stat-total-payments"
                    />
                    <StatsCard
                      title="Successful"
                      value={(stats as any)?.paymentMetrics?.successfulPayments?.toLocaleString() || "0"}
                      icon="fas fa-check-circle"
                      data-testid="stat-successful-payments"
                    />
                    <StatsCard
                      title="Declined"
                      value={(stats as any)?.paymentMetrics?.declinedPayments?.toLocaleString() || "0"}
                      icon="fas fa-times-circle"
                      data-testid="stat-declined-payments"
                    />
                    <StatsCard
                      title="Total Collected"
                      value={`$${(stats as any)?.paymentMetrics?.totalCollected?.toLocaleString() || "0"}`}
                      icon="fas fa-dollar-sign"
                      data-testid="stat-total-collected"
                    />
                    <StatsCard
                      title="Monthly Collected"
                      value={`$${(stats as any)?.paymentMetrics?.monthlyCollected?.toLocaleString() || "0"}`}
                      icon="fas fa-calendar-check"
                      data-testid="stat-monthly-collected"
                    />
                  </div>
                </div>
              )}

              {/* Email Metrics */}
              {(stats as any)?.emailMetrics && (
                <div className="mt-8">
                  <h2 className="text-xl font-semibold text-white mb-4">Email Metrics</h2>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    <StatsCard
                      title="Total Sent"
                      value={(stats as any)?.emailMetrics?.totalSent?.toLocaleString() || "0"}
                      icon="fas fa-paper-plane"
                      data-testid="stat-emails-sent"
                    />
                    <StatsCard
                      title="Opened"
                      value={(stats as any)?.emailMetrics?.opened?.toLocaleString() || "0"}
                      icon="fas fa-envelope-open"
                      data-testid="stat-emails-opened"
                    />
                    <StatsCard
                      title="Open Rate"
                      value={`${(stats as any)?.emailMetrics?.openRate || 0}%`}
                      icon="fas fa-chart-bar"
                      data-testid="stat-email-open-rate"
                    />
                    <StatsCard
                      title="Bounced"
                      value={(stats as any)?.emailMetrics?.bounced?.toLocaleString() || "0"}
                      icon="fas fa-exclamation-triangle"
                      data-testid="stat-emails-bounced"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section>
          <AccountsTable
            accounts={(accounts as any) || []}
            isLoading={accountsLoading}
            onView={handleView}
            onContact={handleContact}
          />
        </section>
      </div>

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
      />

      <Dialog open={showViewModal} onOpenChange={handleViewModalChange}>
        <DialogContent className="max-w-3xl border border-white/10 bg-[#0f1a3c] text-blue-100">
          {selectedAccount && (
            <>
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle className="text-2xl font-semibold text-white">Account overview</DialogTitle>
                <DialogDescription className="text-sm text-blue-100/70">
                  Snapshot for {selectedAccount.consumer?.firstName} {selectedAccount.consumer?.lastName}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-100/60">Consumer</p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {selectedAccount.consumer?.firstName} {selectedAccount.consumer?.lastName}
                    </p>
                    <p className="text-sm text-blue-100/70">
                      {selectedAccount.consumer?.email || "No email on file"}
                    </p>
                    {selectedAccount.consumer?.phone && (
                      <p className="text-sm text-blue-100/60">{selectedAccount.consumer.phone}</p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#0c1630] px-5 py-4 text-right text-sm text-blue-100/80">
                    <p className="text-xs uppercase tracking-wide text-blue-100/60">Account #</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {selectedAccount.accountNumber || "N/A"}
                    </p>
                    <p className="text-xs text-blue-100/60">
                      Created {selectedAccount.createdAt ? formatDate(selectedAccount.createdAt) : "Unknown"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-blue-100/60">Creditor</p>
                    <p className="mt-2 text-base font-semibold text-white">
                      {selectedAccount.creditor || "Unknown creditor"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-blue-100/60">Balance</p>
                    <p className="mt-2 text-base font-semibold text-white">
                      {formatCurrency(
                        typeof selectedAccount.balanceCents === "number"
                          ? selectedAccount.balanceCents
                          : Number(selectedAccount.balanceCents ?? 0)
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-blue-100/60">Status</p>
                    <span
                      className={`mt-2 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(
                        selectedAccount.status
                      )}`}
                    >
                      {selectedAccount.status || "Unknown"}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-blue-100/60">Due date</p>
                    <p className="mt-2 text-base font-semibold text-white">
                      {selectedAccount.dueDate ? formatDate(selectedAccount.dueDate) : "Not scheduled"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-blue-100/60">Folder</p>
                    <p className="mt-2 text-base font-semibold text-white">
                      {selectedAccount.folder?.name || "Not assigned"}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-blue-100/60">Address</p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {selectedAccount.consumer?.address || "Not provided"}
                  </p>
                  {selectedAccountLocation && (
                    <p className="mt-1 text-sm text-blue-100/70">{selectedAccountLocation}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showContactDialog} onOpenChange={handleContactModalChange}>
        <DialogContent className="max-w-xl border border-white/10 bg-[#0f1a3c] text-blue-100">
          {selectedAccount && (
            <>
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle className="text-xl font-semibold text-white">
                  Contact {selectedAccount.consumer?.firstName} {selectedAccount.consumer?.lastName}
                </DialogTitle>
                <DialogDescription className="text-sm text-blue-100/70">
                  Reach out using the consumer's preferred channel.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <span className="rounded-xl bg-sky-500/20 p-2 text-sky-300">
                    <Mail className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-wide text-blue-100/60">Email</p>
                    <p className="text-sm font-semibold text-white">
                      {selectedAccount.consumer?.email || "Not provided"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-lg border border-white/10 bg-white/5 px-3 text-blue-100 hover:bg-white/10"
                    onClick={() => selectedAccount && handleComposeEmail(selectedAccount)}
                    disabled={!selectedAccount.consumer?.email}
                    data-testid="button-compose-email"
                  >
                    Compose Email
                  </Button>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <span className="rounded-xl bg-emerald-500/20 p-2 text-emerald-300">
                    <Phone className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-wide text-blue-100/60">Phone</p>
                    <p className="text-sm font-semibold text-white">
                      {selectedAccount.consumer?.phone || "Not provided"}
                    </p>
                  </div>
                  {selectedAccount.consumer?.phone ? (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="border-white/20 bg-transparent text-blue-100 hover:bg-white/10"
                    >
                      <a href={`tel:${selectedAccount.consumer.phone}`}>Call</a>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="border-white/10 bg-transparent text-blue-100/50"
                    >
                      Call
                    </Button>
                  )}
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <span className="rounded-xl bg-indigo-500/20 p-2 text-indigo-300">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-100/60">Address</p>
                    <p className="text-sm font-semibold text-white">
                      {selectedAccount.consumer?.address || "Not provided"}
                    </p>
                    {selectedAccountLocation && (
                      <p className="text-xs text-blue-100/70">{selectedAccountLocation}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <span className="rounded-xl bg-amber-500/20 p-2 text-amber-300">
                    <Calendar className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-wide text-blue-100/60">Next due date</p>
                    <p className="text-sm font-semibold text-white">
                      {selectedAccount.dueDate ? formatDate(selectedAccount.dueDate) : "Not scheduled"}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    className="rounded-lg border border-white/10 bg-white/5 px-4 text-blue-100 hover:bg-white/10"
                    onClick={() => setShowContactDialog(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compose Email Dialog */}
      <Dialog
        open={showComposeEmailDialog}
        onOpenChange={(open) => {
          setShowComposeEmailDialog(open);
          if (!open) {
            setComposeEmailForm({ templateId: "", subject: "", body: "" });
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Compose Email</DialogTitle>
            <DialogDescription>
              Send a message to the consumer using the integrated communications system.
            </DialogDescription>
          </DialogHeader>

          {selectedAccount && (
            <div className="space-y-5">
              <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                <p className="font-semibold">To: {selectedAccount.consumer?.email}</p>
                {selectedAccount.consumer && (
                  <p className="text-blue-900/80">
                    {[selectedAccount.consumer.firstName, selectedAccount.consumer.lastName].filter(Boolean).join(" ")}
                  </p>
                )}
                {selectedAccount.accountNumber && (
                  <p className="text-xs text-blue-800/70 mt-1">
                    Account: {selectedAccount.accountNumber}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="compose-template">Template (Optional)</Label>
                <Select
                  value={composeEmailForm.templateId}
                  onValueChange={(value) => {
                    if (!value) {
                      setComposeEmailForm((prev) => ({ ...prev, templateId: "" }));
                      return;
                    }
                    const template = emailTemplates?.find((t: any) => t.id === value);
                    if (template) {
                      setComposeEmailForm({
                        templateId: value,
                        subject: template.subject,
                        body: template.body,
                      });
                    }
                  }}
                >
                  <SelectTrigger id="compose-template">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No template</SelectItem>
                    {emailTemplates?.map((template: any) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="compose-subject">Subject</Label>
                <Input
                  id="compose-subject"
                  value={composeEmailForm.subject}
                  onChange={(event) =>
                    setComposeEmailForm((prev) => ({ ...prev, subject: event.target.value }))
                  }
                  placeholder="Enter email subject"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="compose-body">Message</Label>
                <Textarea
                  id="compose-body"
                  value={composeEmailForm.body}
                  onChange={(event) =>
                    setComposeEmailForm((prev) => ({ ...prev, body: event.target.value }))
                  }
                  placeholder="Enter your message"
                  rows={8}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowComposeEmailDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                sendEmailMutation.mutate({
                  to: selectedAccount?.consumer?.email,
                  subject: composeEmailForm.subject,
                  body: composeEmailForm.body,
                  templateId: composeEmailForm.templateId || undefined,
                })
              }
              disabled={sendEmailMutation.isPending || !composeEmailForm.subject || !composeEmailForm.body}
            >
              {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
