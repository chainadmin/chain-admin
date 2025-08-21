import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import AccountsTable from "@/components/accounts-table";

export default function Accounts() {
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["/api/accounts"],
  });

  return (
    <AdminLayout>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage all consumer accounts
          </p>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-8">
          <AccountsTable accounts={(accounts as any) || []} isLoading={isLoading} />
        </div>
      </div>
    </AdminLayout>
  );
}
