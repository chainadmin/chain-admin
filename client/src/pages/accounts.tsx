import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import ImportModal from "@/components/import-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { FolderOpen, Folder, Plus, Upload, Settings, Trash2, MoreVertical, Eye, Edit, Mail, Phone, MapPin, Calendar } from "lucide-react";

export default function Accounts() {
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteFolderDialog, setDeleteFolderDialog] = useState<{ open: boolean; folder: any }>({
    open: false,
    folder: null,
  });
  const [folderForm, setFolderForm] = useState({
    name: "",
    color: "#3B82F6",
    description: "",
  });
  const [createForm, setCreateForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    accountNumber: "",
    creditor: "",
    balance: "",
    folderId: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    accountNumber: "",
    creditor: "",
    balance: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["/api/accounts"],
  });

  const { data: folders, isLoading: foldersLoading } = useQuery({
    queryKey: ["/api/folders"],
  });

  const { data: consumers } = useQuery({
    queryKey: ["/api/consumers"],
  });

  // Mutations
  const createAccountMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accounts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      setShowCreateModal(false);
      setCreateForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        accountNumber: "",
        creditor: "",
        balance: "",
        folderId: "",
        dateOfBirth: "",
        address: "",
        city: "",
        state: "",
        zipCode: "",
      });
      toast({
        title: "Success",
        description: "Account created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: (data: any) => {
      const consumerId = selectedAccount?.consumer?.id || selectedAccount?.consumerId;
      if (consumerId) {
        // Update consumer info if we have a consumerId
        return apiRequest("PATCH", `/api/consumers/${consumerId}`, {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
        });
      }
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      setShowEditModal(false);
      toast({
        title: "Success",
        description: "Account updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update account",
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (accountId: string) => apiRequest("DELETE", `/api/accounts/${accountId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      setShowDeleteDialog(false);
      setSelectedAccount(null);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      setSelectedAccounts(new Set());
      setShowBulkDeleteDialog(false);
      toast({
        title: "Success",
        description: `${selectedAccounts.size} accounts deleted successfully`,
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

  const createFolderMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/folders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setShowCreateFolderModal(false);
      setFolderForm({ name: "", color: "#3B82F6", description: "" });
      toast({
        title: "Success",
        description: "Folder created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create folder",
        variant: "destructive",
      });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => apiRequest("DELETE", `/api/folders/${folderId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setDeleteFolderDialog({ open: false, folder: null });
      toast({
        title: "Success",
        description: "Folder deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete folder",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const balanceCents = Math.round(parseFloat(createForm.balance || "0") * 100);
    
    createAccountMutation.mutate({
      firstName: createForm.firstName,
      lastName: createForm.lastName,
      email: createForm.email,
      phone: createForm.phone || null,
      accountNumber: createForm.accountNumber || "",
      creditor: createForm.creditor,
      balanceCents,
      folderId: createForm.folderId || null,
    });
  };

  const handleEdit = (account: any) => {
    setSelectedAccount(account);
    setEditForm({
      firstName: account.consumer?.firstName || "",
      lastName: account.consumer?.lastName || "",
      email: account.consumer?.email || "",
      phone: account.consumer?.phone || "",
      accountNumber: account.accountNumber || "",
      creditor: account.creditor || "",
      balance: account.balanceCents ? (account.balanceCents / 100).toString() : "",
      dateOfBirth: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
    });
    setShowEditModal(true);
  };

  const handleView = (account: any) => {
    setSelectedAccount(account);
    setShowViewModal(true);
  };

  const handleDelete = (account: any) => {
    setSelectedAccount(account);
    setShowDeleteDialog(true);
  };

  const handleBulkDelete = () => {
    if (selectedAccounts.size > 0) {
      bulkDeleteMutation.mutate(Array.from(selectedAccounts));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedAccounts(new Set(filteredAccounts.map((a: any) => a.id)));
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

  // Filtering
  const filteredAccounts = (accounts as any[])?.filter(account => {
    const matchesFolder = selectedFolderId === "all" || account.consumer?.folderId === selectedFolderId;
    const matchesStatus = statusFilter === "all" || account.status?.toLowerCase() === statusFilter.toLowerCase();
    return matchesFolder && matchesStatus;
  }) || [];

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'settled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
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

  const isLoading = accountsLoading || foldersLoading;

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Accounts Management</h1>
          <p className="text-sm text-gray-600 mt-1">Manage all consumer accounts in one place</p>
        </div>

        {/* Folder Navigation */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">FOLDERS</h2>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCreateFolderModal(true)}
                data-testid="button-create-folder"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Folder
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowImportModal(true)}
                data-testid="button-import"
              >
                <Upload className="h-4 w-4 mr-1" />
                Import CSV
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCreateModal(true)}
                data-testid="button-create-account"
              >
                <Plus className="h-4 w-4 mr-1" />
                Create Account
              </Button>
            </div>
          </div>

          {/* Folder tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <Button
              variant={selectedFolderId === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedFolderId("all")}
              className="flex items-center gap-1"
              data-testid="folder-all"
            >
              <FolderOpen className="h-4 w-4" />
              All Accounts
              <span className="ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded">
                {(accounts as any[])?.length || 0}
              </span>
            </Button>
            
            {(folders as any[])?.map((folder: any) => (
              <div key={folder.id} className="relative group">
                <Button
                  variant={selectedFolderId === folder.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFolderId(folder.id)}
                  className="flex items-center gap-1"
                  style={{
                    borderColor: selectedFolderId === folder.id ? folder.color : undefined,
                    backgroundColor: selectedFolderId === folder.id ? folder.color : undefined,
                  }}
                  data-testid={`folder-${folder.id}`}
                >
                  <Folder className="h-4 w-4" />
                  {folder.name}
                  <span className="ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded">
                    {(accounts as any[])?.filter((a: any) => a.consumer?.folderId === folder.id).length || 0}
                  </span>
                </Button>
                {!folder.isDefault && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteFolderDialog({ open: true, folder });
                    }}
                    data-testid={`delete-folder-${folder.id}`}
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Accounts Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Accounts</CardTitle>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="settled">Settled</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
                {selectedAccounts.size > 0 && (
                  <Button
                    variant="destructive"
                    onClick={() => setShowBulkDeleteDialog(true)}
                    data-testid="button-delete-selected"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete ({selectedAccounts.size})
                  </Button>
                )}
              </div>
            </div>
            {selectedAccounts.size > 0 && (
              <p className="text-sm text-gray-500 mt-2">
                {selectedAccounts.size} account{selectedAccounts.size > 1 ? 's' : ''} selected
              </p>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex space-x-4 mb-4">
                    <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No accounts found. Import data or create an account to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <Checkbox
                          checked={selectedAccounts.size === filteredAccounts.length && filteredAccounts.length > 0}
                          onCheckedChange={handleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Consumer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Account #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Creditor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Balance
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredAccounts.map((account: any) => (
                      <tr key={account.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Checkbox
                            checked={selectedAccounts.has(account.id)}
                            onCheckedChange={(checked) => handleSelectAccount(account.id, checked as boolean)}
                            data-testid={`checkbox-${account.id}`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                <span className="text-sm font-medium text-gray-700">
                                  {account.consumer?.firstName?.[0]}{account.consumer?.lastName?.[0]}
                                </span>
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {account.consumer?.firstName} {account.consumer?.lastName}
                              </div>
                              <div className="text-sm text-gray-500">
                                {account.consumer?.email}
                              </div>
                              {account.consumer?.phone && (
                                <div className="text-xs text-gray-400">
                                  {account.consumer?.phone}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {account.accountNumber || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {account.creditor}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(account.balanceCents || 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(account.status)}`}>
                            {account.status || 'Pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`button-actions-${account.id}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleView(account)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(account)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDelete(account)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Import Modal */}
        <ImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
        />

        {/* Create Account Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Account</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    data-testid="input-first-name"
                    value={createForm.firstName}
                    onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                    placeholder="Enter first name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    data-testid="input-last-name"
                    value={createForm.lastName}
                    onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                    placeholder="Enter last name"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    data-testid="input-email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="Enter email address"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    data-testid="input-phone"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="Enter phone number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    data-testid="input-account-number"
                    value={createForm.accountNumber}
                    onChange={(e) => setCreateForm({ ...createForm, accountNumber: e.target.value })}
                    placeholder="Enter account number"
                  />
                </div>
                <div>
                  <Label htmlFor="creditor">Creditor *</Label>
                  <Input
                    id="creditor"
                    data-testid="input-creditor"
                    value={createForm.creditor}
                    onChange={(e) => setCreateForm({ ...createForm, creditor: e.target.value })}
                    placeholder="Enter creditor name"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="balance">Balance *</Label>
                  <Input
                    id="balance"
                    type="number"
                    step="0.01"
                    data-testid="input-balance"
                    value={createForm.balance}
                    onChange={(e) => setCreateForm({ ...createForm, balance: e.target.value })}
                    placeholder="Enter balance"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="folder">Folder</Label>
                  <Select
                    value={createForm.folderId}
                    onValueChange={(value) => setCreateForm({ ...createForm, folderId: value })}
                  >
                    <SelectTrigger data-testid="select-folder">
                      <SelectValue placeholder="Select folder" />
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
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createAccountMutation.isPending} data-testid="button-submit-create">
                  {createAccountMutation.isPending ? "Creating..." : "Create Account"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Account Modal */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Account</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              updateAccountMutation.mutate(editForm);
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-firstName">First Name</Label>
                  <Input
                    id="edit-firstName"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-lastName">Last Name</Label>
                  <Input
                    id="edit-lastName"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateAccountMutation.isPending}>
                  {updateAccountMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* View Account Modal */}
        <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Account Details</DialogTitle>
            </DialogHeader>
            {selectedAccount && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Name</p>
                    <p className="font-medium">
                      {selectedAccount.consumer?.firstName} {selectedAccount.consumer?.lastName}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium">{selectedAccount.consumer?.email}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p className="font-medium">{selectedAccount.consumer?.phone || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Account Number</p>
                    <p className="font-medium">{selectedAccount.accountNumber || '-'}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Creditor</p>
                    <p className="font-medium">{selectedAccount.creditor}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Balance</p>
                    <p className="font-medium">{formatCurrency(selectedAccount.balanceCents || 0)}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(selectedAccount.status)}`}>
                      {selectedAccount.status || 'Pending'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Created</p>
                    <p className="font-medium">{formatDate(selectedAccount.createdAt)}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-end mt-4">
              <Button onClick={() => setShowViewModal(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Account Confirmation */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Account</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this account for {selectedAccount?.consumer?.firstName} {selectedAccount?.consumer?.lastName}? 
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedAccount && deleteAccountMutation.mutate(selectedAccount.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Confirmation */}
        <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Multiple Accounts</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {selectedAccounts.size} selected accounts? 
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete {selectedAccounts.size} Accounts
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Folder Confirmation */}
        <AlertDialog open={deleteFolderDialog.open} onOpenChange={(open) => setDeleteFolderDialog({ open, folder: null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Folder</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the folder "{deleteFolderDialog.folder?.name}"? 
                Accounts in this folder will be moved to the default folder.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteFolderDialog.folder && deleteFolderMutation.mutate(deleteFolderDialog.folder.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete Folder
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Create Folder Modal */}
        <Dialog open={showCreateFolderModal} onOpenChange={setShowCreateFolderModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Folder</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              createFolderMutation.mutate(folderForm);
            }} className="space-y-4">
              <div>
                <Label htmlFor="folder-name">Folder Name *</Label>
                <Input
                  id="folder-name"
                  value={folderForm.name}
                  onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
                  placeholder="Enter folder name"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="folder-color">Color</Label>
                <Input
                  id="folder-color"
                  type="color"
                  value={folderForm.color}
                  onChange={(e) => setFolderForm({ ...folderForm, color: e.target.value })}
                />
              </div>
              
              <div>
                <Label htmlFor="folder-description">Description</Label>
                <Input
                  id="folder-description"
                  value={folderForm.description}
                  onChange={(e) => setFolderForm({ ...folderForm, description: e.target.value })}
                  placeholder="Enter folder description"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateFolderModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createFolderMutation.isPending}>
                  {createFolderMutation.isPending ? "Creating..." : "Create Folder"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}