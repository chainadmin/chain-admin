import { useQuery } from "@tanstack/react-query";
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
} from "@/components/ui/dialog";
import { Calendar, Mail, MapPin, Phone } from "lucide-react";

export default function AdminDashboard() {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);

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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <StatsCard
                title="Total Consumers"
                value={(stats as any)?.totalConsumers?.toLocaleString() || "0"}
                change="+12%"
                changeType="positive"
                icon="fas fa-users"
              />
              <StatsCard
                title="Active Accounts"
                value={(stats as any)?.activeAccounts?.toLocaleString() || "0"}
                change="+8%"
                changeType="positive"
                icon="fas fa-file-invoice-dollar"
              />
              <StatsCard
                title="Total Balance"
                value={`$${(stats as any)?.totalBalance?.toLocaleString() || "0"}`}
                change="-3%"
                changeType="negative"
                icon="fas fa-dollar-sign"
              />
              <StatsCard
                title="Collection Rate"
                value={`${(stats as any)?.collectionRate || 0}%`}
                change="+5%"
                changeType="positive"
                icon="fas fa-chart-line"
              />
            </div>
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
                  {selectedAccount.consumer?.email ? (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="border-white/20 bg-transparent text-blue-100 hover:bg-white/10"
                    >
                      <a href={`mailto:${selectedAccount.consumer.email}`}>Email</a>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="border-white/10 bg-transparent text-blue-100/50"
                    >
                      Email
                    </Button>
                  )}
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
    </AdminLayout>
  );
}
