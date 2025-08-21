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
      <div className="py-6">
        {/* Page header */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="md:flex md:items-center md:justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                Dashboard
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Monitor your account collections and consumer engagement
              </p>
            </div>
            <div className="mt-4 flex md:mt-0 md:ml-4">
              <Button variant="outline" className="mr-3">
                <i className="fas fa-download -ml-1 mr-2 h-5 w-5 text-gray-400"></i>
                Export
              </Button>
              <Button onClick={() => setShowImportModal(true)}>
                <i className="fas fa-plus -ml-1 mr-2 h-5 w-5"></i>
                Import Accounts
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-8">
          {statsLoading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white overflow-hidden shadow rounded-lg animate-pulse">
                  <div className="p-5">
                    <div className="h-16 bg-gray-200 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>

        {/* Recent Accounts Table */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-8">
          <AccountsTable accounts={(accounts as any) || []} isLoading={accountsLoading} />
        </div>
      </div>

      <ImportModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)} 
      />
    </AdminLayout>
  );
}
