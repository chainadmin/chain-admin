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
import { Trash2, FileSignature } from "lucide-react";

interface AccountsTableProps {
  accounts: any[];
  isLoading: boolean;
  showFolderColumn?: boolean;
  showDeleteButton?: boolean;
  onView?: (account: any) => void;
  onContact?: (account: any) => void;
  onEdit?: (account: any) => void;
  onSendDocument?: (account: any) => void;
}

export default function AccountsTable({
  accounts,
  isLoading,
  showFolderColumn = false,
  showDeleteButton = false,
  onView,
  onContact,
  onEdit,
  onSendDocument,
}: AccountsTableProps) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
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

  const ACCOUNTS_PER_PAGE = 10;
  const totalPages = Math.ceil(filteredAccounts.length / ACCOUNTS_PER_PAGE);
  const startIndex = (currentPage - 1) * ACCOUNTS_PER_PAGE;
  const endIndex = startIndex + ACCOUNTS_PER_PAGE;
  const visibleAccounts = filteredAccounts.slice(startIndex, endIndex);
  
  // Reset to page 1 when filter changes
  const handleFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedAccounts(new Set(visibleAccounts.map(a => a.id)));
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
              : totalPages > 1
                ? `Page ${currentPage} of ${totalPages} (${filteredAccounts.length} total accounts)`
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
          <Select value={statusFilter} onValueChange={handleFilterChange}>
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
            <table className="w-full divide-y divide-white/10 text-left table-fixed">
              <thead className="bg-white/5">
                <tr className="text-[10px] font-semibold uppercase tracking-wide text-blue-100/70">
                  {showDeleteButton && (
                    <th className="px-2 py-2 w-10">
                      <Checkbox
                        checked={selectedAccounts.size === visibleAccounts.length && visibleAccounts.length > 0}
                        onCheckedChange={handleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                  )}
                  <th className="px-2 py-2 w-[180px]">Consumer</th>
                  <th className="px-2 py-2 w-[90px]">Account</th>
                  <th className="px-2 py-2 w-[100px]">Creditor</th>
                  <th className="px-2 py-2 w-[80px]">Balance</th>
                  <th className="px-2 py-2 w-[80px]">Due</th>
                  <th className="px-2 py-2 w-[70px]">Status</th>
                  {showFolderColumn && <th className="px-2 py-2 w-[80px]">Folder</th>}
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-xs text-blue-100/80">
                {visibleAccounts.map((account) => (
                  <tr key={account.id} className="transition hover:bg-white/10">
                    {showDeleteButton && (
                      <td className="px-2 py-2 align-middle">
                        <Checkbox
                          checked={selectedAccounts.has(account.id)}
                          onCheckedChange={(checked) => handleSelectAccount(account.id, checked as boolean)}
                          data-testid={`checkbox-account-${account.id}`}
                        />
                      </td>
                    )}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[10px] font-semibold text-blue-100">
                          {getInitials(account.consumer?.firstName, account.consumer?.lastName)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white text-xs truncate">
                            {account.consumer?.firstName} {account.consumer?.lastName}
                          </p>
                          <p className="text-[10px] text-blue-100/70 truncate">{account.consumer?.email}</p>
                          {account.activeArrangement && (
                            <p className="text-[10px] text-emerald-400/90 font-medium truncate">
                              📅 ${((account.activeArrangement.amountCents || 0) / 100).toFixed(0)}/
                              {account.activeArrangement.frequency === 'monthly' ? 'mo' : account.activeArrangement.frequency === 'weekly' ? 'wk' : 'bi-wk'}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 font-medium text-white text-xs truncate">{account.accountNumber || 'N/A'}</td>
                    <td className="px-2 py-2 truncate">{account.creditor}</td>
                    <td className="px-2 py-2 font-semibold text-white">{formatCurrency(account.balanceCents || 0)}</td>
                    <td className="px-2 py-2 text-[10px]">{account.dueDate ? formatDate(account.dueDate) : 'N/A'}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${getStatusColor(account.status)}`}>
                        {account.status || '?'}
                      </span>
                    </td>
                    {showFolderColumn && (
                      <td className="px-2 py-2">
                        {account.folder ? (
                          <div className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: account.folder.color }} />
                            <span className="truncate text-[10px]">{account.folder.name}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-blue-100/60">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 rounded border border-white/10 bg-white/10 px-2 text-[10px] font-semibold text-blue-100 hover:bg-white/20"
                          data-testid={`button-view-account-${account.id}`}
                          onClick={() => onView?.(account)}
                        >
                          View
                        </Button>
                        {onEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 rounded border border-sky-400/40 bg-sky-500/20 px-2 text-[10px] font-semibold text-white hover:bg-sky-500/30"
                            data-testid={`button-edit-account-${account.id}`}
                            onClick={() => onEdit(account)}
                          >
                            Edit
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 rounded border border-white/10 bg-white/10 px-2 text-[10px] font-semibold text-blue-100 hover:bg-white/20"
                          data-testid={`button-contact-account-${account.id}`}
                          onClick={() => onContact?.(account)}
                        >
                          Contact
                        </Button>
                        {onSendDocument && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 rounded border border-indigo-400/40 bg-indigo-500/20 px-2 text-[10px] font-semibold text-white hover:bg-indigo-500/30"
                            data-testid={`button-send-document-${account.id}`}
                            onClick={() => onSendDocument(account)}
                          >
                            <FileSignature className="h-3 w-3 mr-0.5" />
                            Doc
                          </Button>
                        )}
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
                Showing <span className="font-semibold text-white">{startIndex + 1}-{Math.min(endIndex, filteredAccounts.length)}</span>
                {` of `}
                <span className="font-semibold text-white">{filteredAccounts.length}</span> results
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="rounded-full border border-white/10 bg-white/10 px-3 text-blue-100 hover:bg-white/20 disabled:opacity-50" 
                    data-testid="button-prev-page"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <i className="fas fa-chevron-left"></i>
                  </Button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Button 
                        key={pageNum}
                        variant="ghost" 
                        size="sm" 
                        className={`rounded-full px-3 ${currentPage === pageNum 
                          ? 'border border-sky-400/40 bg-sky-500/20 font-semibold text-white hover:bg-sky-500/30' 
                          : 'border border-white/10 bg-white/10 text-blue-100 hover:bg-white/20'}`}
                        data-testid={`button-page-${pageNum}`}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="rounded-full border border-white/10 bg-white/10 px-3 text-blue-100 hover:bg-white/20 disabled:opacity-50" 
                    data-testid="button-next-page"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <i className="fas fa-chevron-right"></i>
                  </Button>
                </div>
              )}
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