import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import ImportModal from "@/components/import-modal";
import AccountsTable from "@/components/accounts-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { FolderOpen, Plus, Upload, Trash2, Mail, Phone, MapPin, Calendar } from "lucide-react";

export default function Accounts() {
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showComposeEmailDialog, setShowComposeEmailDialog] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
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
  const [composeEmailForm, setComposeEmailForm] = useState({
    templateId: "",
    subject: "",
    body: "",
  });
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    accountNumber: "",
    filenumber: "",
    creditor: "",
    balance: "",
    folderId: "",
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

  const { data: emailTemplates, isLoading: emailTemplatesLoading } = useQuery({
    queryKey: ["/api/email-templates"],
    enabled: showComposeEmailDialog,
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
    mutationFn: async (data: any) => {
      if (!selectedAccount?.id) {
        return Promise.reject(new Error("No account selected"));
      }

      const balanceValue = data.balance?.toString().trim();
      const balanceCents = balanceValue
        ? Math.round(parseFloat(balanceValue) * 100)
        : undefined;

      return apiRequest("PATCH", `/api/accounts/${selectedAccount.id}`, {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        accountNumber: data.accountNumber || null,
        filenumber: data.filenumber || null,
        creditor: data.creditor,
        balanceCents,
        folderId: data.folderId || null,
        dateOfBirth: data.dateOfBirth || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zipCode: data.zipCode || null,
      });
    },
    onSuccess: (updatedAccount: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      setSelectedAccount(updatedAccount);
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
    mutationFn: async (folderId: string) => {
      try {
        return await apiRequest("DELETE", `/api/folders/${folderId}`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 405) {
          try {
            return await apiRequest("POST", `/api/folders/${folderId}/delete`);
          } catch (fallbackError) {
            if (fallbackError instanceof ApiError && fallbackError.status === 405) {
              return await apiRequest("POST", "/api/folders/delete", { folderId });
            }
            throw fallbackError;
          }
        }
        throw error;
      }
    },
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

  const sendEmailMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await apiRequest("POST", "/api/communications/send-email", payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Email sent",
        description: "Message delivered through the communications system.",
      });
      setShowComposeEmailDialog(false);
      setComposeEmailForm({ templateId: "", subject: "", body: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send email",
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
      dateOfBirth: createForm.dateOfBirth,
      address: createForm.address || null,
      city: createForm.city || null,
      state: createForm.state || null,
      zipCode: createForm.zipCode || null,
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
      filenumber: account.filenumber || "",
      creditor: account.creditor || "",
      balance: account.balanceCents ? (account.balanceCents / 100).toString() : "",
      folderId: account.folderId || account.consumer?.folderId || "",
      dateOfBirth: account.consumer?.dateOfBirth || "",
      address: account.consumer?.address || "",
      city: account.consumer?.city || "",
      state: account.consumer?.state || "",
      zipCode: account.consumer?.zipCode || "",
    });
    setShowEditModal(true);
  };

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

  const selectedAccountLocation = selectedAccount
    ? [
        selectedAccount.consumer?.city,
        selectedAccount.consumer?.state,
        selectedAccount.consumer?.zipCode,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

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

  const escapeComposeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const buildComposePreviewHtml = (content: string) => {
    if (!content) {
      return '';
    }

    if (/<[a-z][\s\S]*>/i.test(content.trim())) {
      return content;
    }

    return content
      .split(/\r?\n\r?\n/)
      .map(paragraph => `<p>${escapeComposeHtml(paragraph).replace(/\r?\n/g, '<br />')}</p>`)
      .join('');
  };

  const accountsList = Array.isArray(accounts) ? (accounts as any[]) : [];
  const folderList = Array.isArray(folders) ? (folders as any[]) : [];
  const folderFilteredAccounts =
    selectedFolderId === "all"
      ? accountsList
      : accountsList.filter((account: any) => account.consumer?.folderId === selectedFolderId);
  const selectedFolder =
    selectedFolderId === "all"
      ? null
      : folderList.find((folder: any) => folder.id === selectedFolderId) || null;

  return (
    <AdminLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 text-blue-50 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/10 p-8 shadow-2xl shadow-blue-900/30">
          <div className="pointer-events-none absolute -right-12 top-12 h-56 w-56 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-8 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-5">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100/80">
                Account operations
              </span>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                Account management command center
              </h1>
              <p className="text-sm text-blue-100/70 sm:text-base">
                Manage every consumer relationship, organize folders, and launch outreach without leaving this workspace.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-blue-100/80">
                  <p className="font-semibold text-white">Folder intelligence</p>
                  <p className="mt-1 text-xs text-blue-100/70">
                    Segment accounts by workflow or priority and toggle segments instantly.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-blue-100/80">
                  <p className="font-semibold text-white">Actionable workflows</p>
                  <p className="mt-1 text-xs text-blue-100/70">
                    Create, edit, and contact consumers with modern hero experiences.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Button
                variant="ghost"
                className="rounded-xl border border-white/15 bg-white/10 px-6 py-2 text-sm font-semibold text-blue-100 transition hover:bg-white/20"
                onClick={() => setShowImportModal(true)}
                data-testid="button-import"
              >
                <Upload className="mr-2 h-4 w-4" />
                Import accounts
              </Button>
              <Button
                className="rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80"
                onClick={() => setShowCreateModal(true)}
                data-testid="button-create-account"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create account
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-blue-900/20 backdrop-blur">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Collections folders</h2>
                <p className="text-sm text-blue-100/70">
                  Organize accounts into focused segments and switch views with a click.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-white/20"
                  onClick={() => setShowCreateFolderModal(true)}
                  data-testid="button-create-folder"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New folder
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {foldersLoading ? (
                [...Array(4)].map((_, index) => (
                  <div
                    key={index}
                    className="h-11 w-28 rounded-full border border-white/10 bg-white/10 opacity-70"
                  />
                ))
              ) : folderList.length === 0 ? (
                <p className="text-sm text-blue-100/70">
                  No custom folders yet. Create one to start organizing accounts.
                </p>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                      selectedFolderId === "all"
                        ? "border-sky-400/60 bg-sky-500/20 text-white shadow-lg shadow-sky-900/30"
                        : "border-white/10 bg-white/5 text-blue-100 hover:bg-white/10"
                    }`}
                    onClick={() => setSelectedFolderId("all")}
                    data-testid="folder-all"
                  >
                    <FolderOpen className="h-4 w-4" />
                    All accounts
                    <span className="rounded-full bg-white/10 px-2 text-xs text-blue-100/80">
                      {accountsList.length}
                    </span>
                  </Button>
                  {folderList.map((folder: any) => (
                    <div key={folder.id} className="group relative">
                      <Button
                        variant="ghost"
                        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                          selectedFolderId === folder.id
                            ? "border-sky-400/60 bg-sky-500/20 text-white shadow-lg shadow-sky-900/30"
                            : "border-white/10 bg-white/5 text-blue-100 hover:bg-white/10"
                        }`}
                        onClick={() => setSelectedFolderId(folder.id)}
                        data-testid={`folder-${folder.id}`}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: folder.color || undefined }}
                        />
                        {folder.name}
                        <span className="rounded-full bg-white/10 px-2 text-xs text-blue-100/80">
                          {accountsList.filter(
                            (account: any) => account.consumer?.folderId === folder.id
                          ).length}
                        </span>
                      </Button>
                      {!folder.isDefault && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="absolute -right-2 -top-2 h-6 w-6 rounded-full border border-white/10 bg-white/10 p-0 text-blue-100 opacity-0 transition-opacity hover:bg-white/20 group-hover:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteFolderDialog({ open: true, folder });
                          }}
                          data-testid={`delete-folder-${folder.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
            {selectedFolder?.description && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-blue-100/80">
                {selectedFolder.description}
              </div>
            )}
          </div>
        </section>

        <section>
          <AccountsTable
            accounts={folderFilteredAccounts}
            isLoading={accountsLoading}
            onView={handleView}
            onContact={handleContact}
            onEdit={handleEdit}
            showFolderColumn
            showDeleteButton
          />
        </section>
      </div>

      <ImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} />

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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  data-testid="input-date-of-birth"
                  value={createForm.dateOfBirth}
                  onChange={(e) => setCreateForm({ ...createForm, dateOfBirth: e.target.value })}
                  placeholder="Select date of birth"
                  required
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  data-testid="input-address"
                  value={createForm.address}
                  onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                  placeholder="Enter address"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  data-testid="input-city"
                  value={createForm.city}
                  onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                  placeholder="Enter city"
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  data-testid="input-state"
                  value={createForm.state}
                  onChange={(e) => setCreateForm({ ...createForm, state: e.target.value })}
                  placeholder="Enter state"
                />
              </div>
              <div>
                <Label htmlFor="zipCode">Zip Code</Label>
                <Input
                  id="zipCode"
                  data-testid="input-zip-code"
                  value={createForm.zipCode}
                  onChange={(e) => setCreateForm({ ...createForm, zipCode: e.target.value })}
                  placeholder="Enter zip code"
                />
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

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateAccountMutation.mutate(editForm);
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-firstName">First Name *</Label>
                <Input
                  id="edit-firstName"
                  data-testid="input-edit-first-name"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  placeholder="Enter first name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-lastName">Last Name *</Label>
                <Input
                  id="edit-lastName"
                  data-testid="input-edit-last-name"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  placeholder="Enter last name"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-email">Email *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  data-testid="input-edit-email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="Enter email address"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  data-testid="input-edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="Enter phone number"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-accountNumber">Account Number</Label>
                <Input
                  id="edit-accountNumber"
                  data-testid="input-edit-account-number"
                  value={editForm.accountNumber}
                  onChange={(e) => setEditForm({ ...editForm, accountNumber: e.target.value })}
                  placeholder="Enter account number"
                />
              </div>
              <div>
                <Label htmlFor="edit-filenumber">File Number *</Label>
                <Input
                  id="edit-filenumber"
                  data-testid="input-edit-filenumber"
                  value={editForm.filenumber}
                  onChange={(e) => setEditForm({ ...editForm, filenumber: e.target.value })}
                  placeholder="Enter file number"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-creditor">Creditor *</Label>
                <Input
                  id="edit-creditor"
                  data-testid="input-edit-creditor"
                  value={editForm.creditor}
                  onChange={(e) => setEditForm({ ...editForm, creditor: e.target.value })}
                  placeholder="Enter creditor name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-balance">Balance *</Label>
                <Input
                  id="edit-balance"
                  type="number"
                  step="0.01"
                  data-testid="input-edit-balance"
                  value={editForm.balance}
                  onChange={(e) => setEditForm({ ...editForm, balance: e.target.value })}
                  placeholder="Enter balance"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="edit-folder">Folder</Label>
                <Select
                  value={editForm.folderId}
                  onValueChange={(value) => setEditForm({ ...editForm, folderId: value })}
                >
                  <SelectTrigger id="edit-folder" data-testid="select-edit-folder">
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-dateOfBirth">Date of Birth *</Label>
                <Input
                  id="edit-dateOfBirth"
                  type="date"
                  data-testid="input-edit-date-of-birth"
                  value={editForm.dateOfBirth}
                  onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                  placeholder="Select date of birth"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-address">Address</Label>
                <Input
                  id="edit-address"
                  data-testid="input-edit-address"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  placeholder="Enter address"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="edit-city">City</Label>
                <Input
                  id="edit-city"
                  data-testid="input-edit-city"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  placeholder="Enter city"
                />
              </div>
              <div>
                <Label htmlFor="edit-state">State</Label>
                <Input
                  id="edit-state"
                  data-testid="input-edit-state"
                  value={editForm.state}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  placeholder="Enter state"
                />
              </div>
              <div>
                <Label htmlFor="edit-zipCode">Zip Code</Label>
                <Input
                  id="edit-zipCode"
                  data-testid="input-edit-zip-code"
                  value={editForm.zipCode}
                  onChange={(e) => setEditForm({ ...editForm, zipCode: e.target.value })}
                  placeholder="Enter zip code"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateAccountMutation.isPending} data-testid="button-submit-edit">
                {updateAccountMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="ghost"
                  className="rounded-lg border border-white/10 bg-white/5 px-4 text-blue-100 hover:bg-white/10"
                  onClick={() => {
                    setShowViewModal(false);
                    handleEdit(selectedAccount);
                  }}
                >
                  Edit account
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-lg border border-white/10 bg-white/5 px-4 text-blue-100 hover:bg-white/10"
                  onClick={() => {
                    setShowViewModal(false);
                    handleContact(selectedAccount);
                  }}
                >
                  Contact consumer
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-lg border border-white/10 bg-white/5 px-4 text-blue-100 hover:bg-white/10"
                  onClick={() => setShowViewModal(false)}
                >
                  Close
                </Button>
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
                <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center">
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
                      variant="ghost"
                      size="sm"
                      asChild
                      className="rounded-lg border border-white/10 bg-white/5 px-3 text-blue-100 hover:bg-white/10"
                    >
                      <a href={`tel:${selectedAccount.consumer.phone}`}>Call</a>
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled
                      className="rounded-lg border border-white/10 bg-white/5 px-3 text-blue-100/50"
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
                  <p className="mt-1 text-xs text-blue-900/70">
                    Account #: {selectedAccount.accountNumber}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="compose-template">Template</Label>
                <Select
                  value={composeEmailForm.templateId}
                  onValueChange={(value) => {
                    if (!value) {
                      setComposeEmailForm((prev) => ({ ...prev, templateId: "" }));
                      return;
                    }

                    const template = (emailTemplates as any[])?.find((item: any) => item.id === value);
                    setComposeEmailForm((prev) => ({
                      templateId: value,
                      subject: template?.subject || prev.subject,
                      body: template?.html || prev.body,
                    }));
                  }}
                  disabled={emailTemplatesLoading}
                >
                  <SelectTrigger id="compose-template">
                    <SelectValue placeholder={emailTemplatesLoading ? "Loading templates..." : "Choose a template (optional)"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No template (start from scratch)</SelectItem>
                    {(emailTemplates as any[])?.map((template: any) => (
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
                  placeholder="Email subject"
                />
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="compose-body">Message</Label>
                  <Textarea
                    id="compose-body"
                    value={composeEmailForm.body}
                    onChange={(event) =>
                      setComposeEmailForm((prev) => ({ ...prev, body: event.target.value }))
                    }
                    rows={8}
                    placeholder="Write your message or choose a communication template"
                  />
                </div>

                {composeEmailForm.body && (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Preview</p>
                    <div
                      className="prose prose-sm max-w-none text-gray-800"
                      dangerouslySetInnerHTML={{ __html: buildComposePreviewHtml(composeEmailForm.body) }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowComposeEmailDialog(false);
                setComposeEmailForm({ templateId: "", subject: "", body: "" });
              }}
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

      <AlertDialog
        open={deleteFolderDialog.open}
        onOpenChange={(open) =>
          setDeleteFolderDialog(prev => ({
            open,
            folder: open ? prev.folder : null,
          }))
        }
      >
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

      <Dialog open={showCreateFolderModal} onOpenChange={setShowCreateFolderModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createFolderMutation.mutate(folderForm);
            }}
            className="space-y-4"
          >
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
    </AdminLayout>
  );
}
