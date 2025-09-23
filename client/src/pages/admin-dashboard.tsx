import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import StatsCard from "@/components/stats-card";
import AccountsTable from "@/components/accounts-table";
import ImportModal from "@/components/import-modal";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function AdminDashboard() {
  const [showImportModal, setShowImportModal] = useState(false);

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
          <AccountsTable accounts={(accounts as any) || []} isLoading={accountsLoading} />
        </section>
      </div>

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
      />
    </AdminLayout>
  );
}
