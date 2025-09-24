import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Trash2 } from "lucide-react";

interface AccountsTableProps {
  accounts: any[];
  isLoading: boolean;
  showFolderColumn?: boolean;
  showDeleteButton?: boolean;
  onView?: (account: any) => void;
  onContact?: (account: any) => void;
  onEdit?: (account: any) => void;
}

export default function AccountsTable({
  accounts,
  isLoading,
  showFolderColumn = false,
  showDeleteButton = false,
  onView,
  onContact,
  onEdit,
}: AccountsTableProps) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteAccountMutation = useMutation({
    mutationFn: (accountId: string) => apiRequest("DELETE", `/api/accounts/${accountId}`),
    onSuccess: (_data, accountId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      if (accountId) {
        setSelectedAccounts((prev) => {
          const updated = new Set(prev);
          updated.delete(accountId);
          return updated;
        });
      }
      toast({
        title: "Success",
        description: "Account deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete account",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (accountIds: string[]) => apiRequest("DELETE", "/api/accounts/bulk-delete", { ids: accountIds }),
    onSuccess: (_data, accountIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      setSelectedAccounts(new Set());
      setShowBulkDeleteDialog(false);
      toast({
        title: "Success",
        description: `${Array.isArray(accountIds) ? accountIds.length : 0} accounts deleted successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete accounts",
        variant: "destructive",
      });
    },
  });

  const filteredAccounts = accounts.filter(account => {
    if (statusFilter === "all") return true;
    return account.status?.toLowerCase() === statusFilter.toLowerCase();
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedAccounts(new Set(filteredAccounts.map(a => a.id)));
    } else {
      setSelectedAccounts(new Set());
    }
  };

  const handleSelectAccount = (accountId: string, checked: boolean) => {
    const newSelected = new Set(selectedAccounts);
    if (checked) {
      newSelected.add(accountId);
    } else {
      newSelected.delete(accountId);
    }
    setSelectedAccounts(newSelected);
  };

  const handleBulkDelete = () => {
    if (selectedAccounts.size > 0) {
      bulkDeleteMutation.mutate(Array.from(selectedAccounts));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
      case 'overdue':
        return 'border border-rose-400/30 bg-rose-500/10 text-rose-200';
      case 'settled':
        return 'border border-slate-400/30 bg-slate-500/10 text-slate-200';
      default:
        return 'border border-amber-400/30 bg-amber-500/10 text-amber-200';
    }
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-blue-900/20 backdrop-blur">
        <div className="animate-pulse space-y-6">
          <div className="h-6 w-48 rounded-full bg-white/10" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-full bg-white/10" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded-full bg-white/10" />
                  <div className="h-3 w-1/3 rounded-full bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/10 shadow-lg shadow-blue-900/20 backdrop-blur">
      <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Recent accounts</h3>
          <p className="mt-1 text-sm text-blue-100/70">
            {selectedAccounts.size > 0
              ? `${selectedAccounts.size} account${selectedAccounts.size > 1 ? 's' : ''} selected`
              : 'Latest imported and updated accounts from your team'}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {selectedAccounts.size > 0 && (
            <Button
              variant="destructive"
              onClick={() => setShowBulkDeleteDialog(true)}
              data-testid="button-delete-selected"
              className="order-2 rounded-xl border border-rose-400/30 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30 sm:order-1"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete selected ({selectedAccounts.size})
            </Button>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              className="order-1 w-44 rounded-xl border border-white/15 bg-white/10 text-left text-blue-50 focus:border-sky-400/60 focus:ring-0 sm:order-2"
              data-testid="select-status-filter"
            >
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent className="border border-white/10 bg-[#0f1a3c] text-blue-100">
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="settled">Settled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredAccounts.length === 0 ? (
        <div className="px-6 py-16 text-center text-blue-100/80">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10">
            <i className="fas fa-inbox text-2xl"></i>
          </div>
          <h3 className="text-lg font-semibold text-white">No accounts found</h3>
          <p className="mt-2 text-sm text-blue-100/70">
            {accounts.length === 0
              ? "Import account data to get started."
              : "No accounts match the selected filter right now."}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left">
              <thead className="bg-white/5">
                <tr className="text-xs font-semibold uppercase tracking-wide text-blue-100/70">
                  {showDeleteButton && (
                    <th className="px-6 py-3">
                      <Checkbox
                        checked={selectedAccounts.size === filteredAccounts.length && filteredAccounts.length > 0}
                        onCheckedChange={handleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3">Consumer</th>
                  <th className="px-6 py-3">Account</th>
                  <th className="px-6 py-3">Creditor</th>
                  <th className="px-6 py-3">Balance</th>
                  <th className="px-6 py-3">Due date</th>
                  <th className="px-6 py-3">Status</th>
                  {showFolderColumn && <th className="px-6 py-3">Folder</th>}
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-sm text-blue-100/80">
                {filteredAccounts.map((account) => (
                  <tr key={account.id} className="transition hover:bg-white/10">
                    {showDeleteButton && (
                      <td className="px-6 py-4 align-middle">
                        <Checkbox
                          checked={selectedAccounts.has(account.id)}
                          onCheckedChange={(checked) => handleSelectAccount(account.id, checked as boolean)}
                          data-testid={`checkbox-account-${account.id}`}
                        />
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold text-blue-100">
                          {getInitials(account.consumer?.firstName, account.consumer?.lastName)}
                        </div>
                        <div>
                          <p className="font-semibold text-white">
                            {account.consumer?.firstName} {account.consumer?.lastName}
                          </p>
                          <p className="text-xs text-blue-100/70">{account.consumer?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-white">{account.accountNumber || 'N/A'}</td>
                    <td className="px-6 py-4">{account.creditor}</td>
                    <td className="px-6 py-4 font-semibold text-white">{formatCurrency(account.balanceCents || 0)}</td>
                    <td className="px-6 py-4">{account.dueDate ? formatDate(account.dueDate) : 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusColor(account.status)}`}>
                        {account.status || 'Unknown'}
                      </span>
                    </td>
                    {showFolderColumn && (
                      <td className="px-6 py-4">
                        {account.folder ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: account.folder.color }} />
                            <span>{account.folder.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-blue-100/60">No folder</span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg border border-white/10 bg-white/10 px-3 text-xs font-semibold text-blue-100 hover:bg-white/20"
                          data-testid={`button-view-account-${account.id}`}
                          onClick={() => onView?.(account)}
                        >
                          View
                        </Button>
                        {onEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg border border-sky-400/40 bg-sky-500/20 px-3 text-xs font-semibold text-white hover:bg-sky-500/30"
                            data-testid={`button-edit-account-${account.id}`}
                            onClick={() => onEdit(account)}
                          >
                            Edit
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg border border-white/10 bg-white/10 px-3 text-xs font-semibold text-blue-100 hover:bg-white/20"
                          data-testid={`button-contact-account-${account.id}`}
                          onClick={() => onContact?.(account)}
                        >
                          Contact
                        </Button>
                        {showDeleteButton && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                                data-testid={`button-delete-account-${account.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="border border-white/10 bg-[#0f1a3c] text-blue-100">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-white">Delete account</AlertDialogTitle>
                                <AlertDialogDescription className="text-blue-100/70">
                                  Are you sure you want to delete this account for {account.consumer?.firstName} {account.consumer?.lastName}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-lg border border-white/10 bg-white/10 text-blue-100 hover:bg-white/20" data-testid={`button-cancel-delete-${account.id}`}>
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteAccountMutation.mutate(account.id)}
                                  className="rounded-lg border border-rose-400/40 bg-rose-500/30 text-rose-100 hover:bg-rose-500/40"
                                  data-testid={`button-confirm-delete-${account.id}`}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-white/10 px-6 py-4">
            <div className="flex flex-col gap-4 text-sm text-blue-100/70 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing <span className="font-semibold text-white">1</span> to <span className="font-semibold text-white">{Math.min(10, filteredAccounts.length)}</span> of <span className="font-semibold text-white">{filteredAccounts.length}</span> results
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="rounded-full border border-white/10 bg-white/10 px-3 text-blue-100 hover:bg-white/20" data-testid="button-prev-desktop">
                  <i className="fas fa-chevron-left"></i>
                </Button>
                <Button variant="ghost" size="sm" className="rounded-full border border-sky-400/40 bg-sky-500/20 px-3 font-semibold text-white hover:bg-sky-500/30" data-testid="button-page-1">
                  1
                </Button>
                <Button variant="ghost" size="sm" className="rounded-full border border-white/10 bg-white/10 px-3 text-blue-100 hover:bg-white/20" data-testid="button-next-desktop">
                  <i className="fas fa-chevron-right"></i>
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent className="border border-white/10 bg-[#0f1a3c] text-blue-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete selected accounts</AlertDialogTitle>
            <AlertDialogDescription className="text-blue-100/70">
              Are you sure you want to delete {selectedAccounts.size} selected account{selectedAccounts.size > 1 ? 's' : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border border-white/10 bg-white/10 text-blue-100 hover:bg-white/20" data-testid="button-cancel-bulk-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="rounded-lg border border-rose-400/40 bg-rose-500/30 text-rose-100 hover:bg-rose-500/40"
              data-testid="button-confirm-bulk-delete"
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedAccounts.size} Account${selectedAccounts.size > 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}