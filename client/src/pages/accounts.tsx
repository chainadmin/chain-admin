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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { FolderOpen, Plus, Upload, Trash2, Mail, Phone, MapPin, Calendar, FileSignature, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Accounts() {
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
  const [registrationFilter, setRegistrationFilter] = useState<string>("all"); // all, registered, not_registered
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showComposeEmailDialog, setShowComposeEmailDialog] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [showSendDocumentDialog, setShowSendDocumentDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [displayLimit, setDisplayLimit] = useState(50);
  const [sendDocumentForm, setSendDocumentForm] = useState({
    templateId: "",
    accountId: "",
    expiresInDays: 7,
    message: "",
  });
  const [documentSearchOpen, setDocumentSearchOpen] = useState(false);
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
    filenumber: "",
    creditor: "",
    balance: "",
    folderId: "",
    status: "active",
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
    status: "active",
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

  const { data: documentTemplates, isLoading: documentTemplatesLoading } = useQuery({
    queryKey: ["/api/document-templates"],
    enabled: showSendDocumentDialog,
  });

  // Fetch payment methods for the selected account's consumer
  const { data: paymentMethods } = useQuery({
    queryKey: ["/api/payment-methods/consumer", selectedAccount?.consumerId],
    enabled: !!selectedAccount?.consumerId && showViewModal,
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
        filenumber: "",
        creditor: "",
        balance: "",
        folderId: "",
        status: "active",
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
        status: data.status || "active",
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

  const sendDocumentMutation = useMutation({
    mutationFn: async ({ templateId, data }: { templateId: string; data: any }) => {
      return apiRequest("POST", `/api/document-templates/${templateId}/send`, data);
    },
    onSuccess: () => {
      toast({
        title: "Document sent",
        description: "Signature request sent successfully to the consumer.",
      });
      setShowSendDocumentDialog(false);
      setSendDocumentForm({ templateId: "", accountId: "", expiresInDays: 7, message: "" });
      setSelectedAccount(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send document",
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
      filenumber: createForm.filenumber || "",
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
      folderId: account.folderId || "",
      status: account.status || "active",
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

  const handleSendDocument = (account: any) => {
    setSelectedAccount(account);
    setSendDocumentForm({
      templateId: "",
      accountId: account.id,
      expiresInDays: 7,
      message: "",
    });
    setShowSendDocumentDialog(true);
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
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'inactive':
        return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300';
      case 'paid':
      case 'closed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'overdue':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'settled':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
      default:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
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
  
  // Apply folder filter
  const folderFilteredAccounts =
    selectedFolderId === "all"
      ? accountsList
      : accountsList.filter((account: any) => account.folderId === selectedFolderId);
  
  // Calculate registration stats from the folder-filtered collection
  const registeredCount = folderFilteredAccounts.filter((account: any) => account.consumer?.isRegistered === true).length;
  const notRegisteredCount = folderFilteredAccounts.length - registeredCount;
  
  // Apply registration status filter
  const fullyFilteredAccounts = folderFilteredAccounts.filter((account: any) => {
    if (registrationFilter === "registered") {
      return account.consumer?.isRegistered === true;
    } else if (registrationFilter === "not_registered") {
      return account.consumer?.isRegistered !== true;
    }
    return true; // "all"
  });
  
  // Apply pagination
  const paginatedAccounts = fullyFilteredAccounts.slice(0, displayLimit);
  const hasMoreAccounts = fullyFilteredAccounts.length > displayLimit;
  
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
                    onClick={() => {
                      setSelectedFolderId("all");
                      setDisplayLimit(50);
                    }}
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
                        onClick={() => {
                          setSelectedFolderId(folder.id);
                          setDisplayLimit(50);
                        }}
                        data-testid={`folder-${folder.id}`}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: folder.color || undefined }}
                        />
                        {folder.name}
                        <span className="rounded-full bg-white/10 px-2 text-xs text-blue-100/80">
                          {accountsList.filter(
                            (account: any) => account.folderId === folder.id
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

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-blue-900/20 backdrop-blur">
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Registration status</h2>
              <p className="text-sm text-blue-100/70">
                Filter accounts by consumer portal registration status
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                  registrationFilter === "all"
                    ? "border-sky-400/60 bg-sky-500/20 text-white shadow-lg shadow-sky-900/30"
                    : "border-white/10 bg-white/5 text-blue-100 hover:bg-white/10"
                }`}
                onClick={() => {
                  setRegistrationFilter("all");
                  setDisplayLimit(50);
                }}
                data-testid="filter-all-registration"
              >
                All accounts
                <span className="rounded-full bg-white/10 px-2 text-xs text-blue-100/80">
                  {folderFilteredAccounts.length}
                </span>
              </Button>
              <Button
                variant="ghost"
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                  registrationFilter === "registered"
                    ? "border-green-400/60 bg-green-500/20 text-white shadow-lg shadow-green-900/30"
                    : "border-white/10 bg-white/5 text-blue-100 hover:bg-white/10"
                }`}
                onClick={() => {
                  setRegistrationFilter("registered");
                  setDisplayLimit(50);
                }}
                data-testid="filter-registered"
              >
                <div className="h-2 w-2 rounded-full bg-green-400" />
                Portal registered
                <span className="rounded-full bg-white/10 px-2 text-xs text-blue-100/80">
                  {registeredCount}
                </span>
              </Button>
              <Button
                variant="ghost"
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                  registrationFilter === "not_registered"
                    ? "border-gray-400/60 bg-gray-500/20 text-white shadow-lg shadow-gray-900/30"
                    : "border-white/10 bg-white/5 text-blue-100 hover:bg-white/10"
                }`}
                onClick={() => {
                  setRegistrationFilter("not_registered");
                  setDisplayLimit(50);
                }}
                data-testid="filter-not-registered"
              >
                <div className="h-2 w-2 rounded-full bg-gray-400" />
                Not registered
                <span className="rounded-full bg-white/10 px-2 text-xs text-blue-100/80">
                  {notRegisteredCount}
                </span>
              </Button>
            </div>
          </div>
        </section>

        <section>
          <AccountsTable
            accounts={paginatedAccounts}
            isLoading={accountsLoading}
            onView={handleView}
            onContact={handleContact}
            onEdit={handleEdit}
            onSendDocument={handleSendDocument}
            showFolderColumn
            showDeleteButton
          />
          
          {!accountsLoading && hasMoreAccounts && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                onClick={() => setDisplayLimit(prev => prev + 50)}
                className="rounded-xl border-white/10 bg-white/5 px-6 py-2 text-blue-100 hover:bg-white/10"
                data-testid="button-load-more"
              >
                Load More ({fullyFilteredAccounts.length - displayLimit} remaining)
              </Button>
            </div>
          )}
          
          {!accountsLoading && fullyFilteredAccounts.length > 0 && (
            <div className="mt-4 text-center text-sm text-blue-100/60">
              Showing {paginatedAccounts.length} of {fullyFilteredAccounts.length} accounts
            </div>
          )}
        </section>
      </div>

      <ImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} />

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white">Create New Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName" className="text-white">First Name *</Label>
                <Input
                  id="firstName"
                  data-testid="input-first-name"
                  value={createForm.firstName}
                  onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                  placeholder="Enter first name"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                  required
                />
              </div>
              <div>
                <Label htmlFor="lastName" className="text-white">Last Name *</Label>
                <Input
                  id="lastName"
                  data-testid="input-last-name"
                  value={createForm.lastName}
                  onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                  placeholder="Enter last name"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email" className="text-white">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="input-email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="Enter email address"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone" className="text-white">Phone</Label>
                <Input
                  id="phone"
                  data-testid="input-phone"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="Enter phone number"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="accountNumber" className="text-white">Account Number</Label>
                <Input
                  id="accountNumber"
                  data-testid="input-account-number"
                  value={createForm.accountNumber}
                  onChange={(e) => setCreateForm({ ...createForm, accountNumber: e.target.value })}
                  placeholder="Enter account number"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                />
              </div>
              <div>
                <Label htmlFor="filenumber" className="text-white">File Number *</Label>
                <Input
                  id="filenumber"
                  data-testid="input-filenumber"
                  value={createForm.filenumber}
                  onChange={(e) => setCreateForm({ ...createForm, filenumber: e.target.value })}
                  placeholder="Enter file number"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="creditor" className="text-white">Creditor *</Label>
                <Input
                  id="creditor"
                  data-testid="input-creditor"
                  value={createForm.creditor}
                  onChange={(e) => setCreateForm({ ...createForm, creditor: e.target.value })}
                  placeholder="Enter creditor name"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                  required
                />
              </div>
              <div>
                <Label htmlFor="balance" className="text-white">Balance *</Label>
                <Input
                  id="balance"
                  type="number"
                  step="0.01"
                  data-testid="input-balance"
                  value={createForm.balance}
                  onChange={(e) => setCreateForm({ ...createForm, balance: e.target.value })}
                  placeholder="Enter balance"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="folder" className="text-white">Folder</Label>
                <Select
                  value={createForm.folderId}
                  onValueChange={(value) => setCreateForm({ ...createForm, folderId: value })}
                >
                  <SelectTrigger data-testid="select-folder" className="text-white bg-white/10 border-white/20">
                    <SelectValue placeholder="Select folder" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-white/20 text-white">
                    {(folders as any[])?.map((folder: any) => (
                      <SelectItem key={folder.id} value={folder.id} className="text-white">
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dateOfBirth" className="text-white">Date of Birth *</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  data-testid="input-date-of-birth"
                  value={createForm.dateOfBirth}
                  onChange={(e) => setCreateForm({ ...createForm, dateOfBirth: e.target.value })}
                  placeholder="Select date of birth"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="address" className="text-white">Address</Label>
                <Input
                  id="address"
                  data-testid="input-address"
                  value={createForm.address}
                  onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                  placeholder="Enter address"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city" className="text-white">City</Label>
                <Input
                  id="city"
                  data-testid="input-city"
                  value={createForm.city}
                  onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                  placeholder="Enter city"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                />
              </div>
              <div>
                <Label htmlFor="state" className="text-white">State</Label>
                <Input
                  id="state"
                  data-testid="input-state"
                  value={createForm.state}
                  onChange={(e) => setCreateForm({ ...createForm, state: e.target.value })}
                  placeholder="Enter state"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                />
              </div>
              <div>
                <Label htmlFor="zipCode" className="text-white">Zip Code</Label>
                <Input
                  id="zipCode"
                  data-testid="input-zip-code"
                  value={createForm.zipCode}
                  onChange={(e) => setCreateForm({ ...createForm, zipCode: e.target.value })}
                  placeholder="Enter zip code"
                  className="text-white bg-white/10 border-white/20 placeholder:text-white/50"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-white/20">
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createAccountMutation.isPending} data-testid="button-submit-create" className="bg-blue-600 text-white hover:bg-blue-700">
                {createAccountMutation.isPending ? "Creating..." : "Create Account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white">Edit Account</DialogTitle>
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
                <Label htmlFor="edit-firstName" className="text-white">First Name *</Label>
                <Input
                  id="edit-firstName"
                  data-testid="input-edit-first-name"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  placeholder="Enter first name"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-lastName" className="text-white">Last Name *</Label>
                <Input
                  id="edit-lastName"
                  data-testid="input-edit-last-name"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  placeholder="Enter last name"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-email" className="text-white">Email *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  data-testid="input-edit-email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="Enter email address"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-phone" className="text-white">Phone</Label>
                <Input
                  id="edit-phone"
                  data-testid="input-edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="Enter phone number"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-accountNumber" className="text-white">Account Number</Label>
                <Input
                  id="edit-accountNumber"
                  data-testid="input-edit-account-number"
                  value={editForm.accountNumber}
                  onChange={(e) => setEditForm({ ...editForm, accountNumber: e.target.value })}
                  placeholder="Enter account number"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
              <div>
                <Label htmlFor="edit-filenumber" className="text-white">File Number *</Label>
                <Input
                  id="edit-filenumber"
                  data-testid="input-edit-filenumber"
                  value={editForm.filenumber}
                  onChange={(e) => setEditForm({ ...editForm, filenumber: e.target.value })}
                  placeholder="Enter file number"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-creditor" className="text-white">Creditor *</Label>
                <Input
                  id="edit-creditor"
                  data-testid="input-edit-creditor"
                  value={editForm.creditor}
                  onChange={(e) => setEditForm({ ...editForm, creditor: e.target.value })}
                  placeholder="Enter creditor name"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-balance" className="text-white">Balance *</Label>
                <Input
                  id="edit-balance"
                  type="number"
                  step="0.01"
                  data-testid="input-edit-balance"
                  value={editForm.balance}
                  onChange={(e) => setEditForm({ ...editForm, balance: e.target.value })}
                  placeholder="Enter balance"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-folder" className="text-white">Folder</Label>
                <Select
                  value={editForm.folderId}
                  onValueChange={(value) => setEditForm({ ...editForm, folderId: value })}
                >
                  <SelectTrigger id="edit-folder" data-testid="select-edit-folder" className="bg-white/10 border-white/20 text-white">
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
              <div>
                <Label htmlFor="edit-status" className="text-white">Account Status *</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(value) => setEditForm({ ...editForm, status: value })}
                >
                  <SelectTrigger id="edit-status" data-testid="select-edit-status" className="bg-white/10 border-white/20 text-white">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-dateOfBirth" className="text-white">Date of Birth *</Label>
                <Input
                  id="edit-dateOfBirth"
                  type="date"
                  data-testid="input-edit-date-of-birth"
                  value={editForm.dateOfBirth}
                  onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                  placeholder="Select date of birth"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-address" className="text-white">Address</Label>
                <Input
                  id="edit-address"
                  data-testid="input-edit-address"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  placeholder="Enter address"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="edit-city" className="text-white">City</Label>
                <Input
                  id="edit-city"
                  data-testid="input-edit-city"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  placeholder="Enter city"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
              <div>
                <Label htmlFor="edit-state" className="text-white">State</Label>
                <Input
                  id="edit-state"
                  data-testid="input-edit-state"
                  value={editForm.state}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  placeholder="Enter state"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
              <div>
                <Label htmlFor="edit-zipCode" className="text-white">Zip Code</Label>
                <Input
                  id="edit-zipCode"
                  data-testid="input-edit-zip-code"
                  value={editForm.zipCode}
                  onChange={(e) => setEditForm({ ...editForm, zipCode: e.target.value })}
                  placeholder="Enter zip code"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-white/20">
              <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateAccountMutation.isPending} data-testid="button-submit-edit" className="bg-blue-600 text-white hover:bg-blue-700">
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

                {/* Payment Methods Section */}
                {Array.isArray(paymentMethods) && paymentMethods.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-blue-100/60 mb-3">Saved Payment Methods</p>
                    <div className="space-y-2">
                      {(paymentMethods as any[]).map((method: any) => (
                        <div key={method.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0c1630] p-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-12 items-center justify-center rounded bg-gradient-to-r from-blue-500 to-purple-500 text-xs font-bold text-white">
                              {method.cardBrand?.toUpperCase() || 'CARD'}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">
                                {method.cardholderName || 'Cardholder'}
                              </p>
                              <p className="text-xs text-blue-100/60">
                                •••• {method.cardLast4} • Expires {method.expiryMonth}/{method.expiryYear}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-blue-100/60">Token</p>
                            <p className="font-mono text-xs text-blue-100/80">{method.paymentToken}</p>
                            {method.isDefault && (
                              <span className="mt-1 inline-flex items-center rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                                Default
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
        <DialogContent className="max-w-2xl bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white">Compose Email</DialogTitle>
            <DialogDescription className="text-blue-100/70">
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

      {/* Send Document Dialog */}
      <Dialog open={showSendDocumentDialog} onOpenChange={setShowSendDocumentDialog}>
        <DialogContent className="border-white/10 bg-[#0f172a] text-blue-50 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-white">
              Send Document for Signature
            </DialogTitle>
            <DialogDescription className="text-blue-100/70">
              Choose a document template to send to the consumer for signing.
            </DialogDescription>
          </DialogHeader>
          {selectedAccount && (
            <div className="space-y-4">
              <div className="rounded-lg bg-white/5 p-3 border border-white/10">
                <p className="text-sm text-blue-100/70">
                  Consumer: <span className="font-semibold text-white">{selectedAccount.consumer?.firstName} {selectedAccount.consumer?.lastName}</span>
                </p>
                <p className="text-xs text-blue-100/60 mt-1">Account: {selectedAccount.accountNumber}</p>
              </div>

              <div>
                <Label className="text-white">Document Template *</Label>
                <Popover open={documentSearchOpen} onOpenChange={setDocumentSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={documentSearchOpen}
                      className="w-full justify-between rounded-lg border-white/10 bg-white/5 text-blue-100 hover:bg-white/10"
                      data-testid="select-document-template"
                    >
                      {sendDocumentForm.templateId
                        ? (() => {
                            const template = (documentTemplates as any)?.find((t: any) => t.id === sendDocumentForm.templateId);
                            return template ? template.name : "Select template...";
                          })()
                        : "Select template..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0 border-white/10 bg-[#0f172a] text-blue-50">
                    <Command className="border-0">
                      <CommandInput placeholder="Search document templates..." className="border-0" />
                      <CommandList>
                        <CommandEmpty>No template found.</CommandEmpty>
                        <CommandGroup>
                          {(documentTemplates as any)?.map((template: any) => (
                            <CommandItem
                              key={template.id}
                              value={template.name}
                              onSelect={() => {
                                setSendDocumentForm({ ...sendDocumentForm, templateId: template.id });
                                setDocumentSearchOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  sendDocumentForm.templateId === template.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span>{template.name}</span>
                                {template.description && <span className="text-xs text-blue-100/60">{template.description}</span>}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label className="text-white">Expires In (Days)</Label>
                <Input
                  type="number"
                  value={sendDocumentForm.expiresInDays}
                  onChange={(e) => setSendDocumentForm({ ...sendDocumentForm, expiresInDays: parseInt(e.target.value) || 7 })}
                  className="rounded-lg border-white/10 bg-white/5 text-blue-100"
                  min="1"
                  max="90"
                  data-testid="input-expires-days"
                />
              </div>

              <div>
                <Label className="text-white">Custom Message (Optional)</Label>
                <Textarea
                  value={sendDocumentForm.message}
                  onChange={(e) => setSendDocumentForm({ ...sendDocumentForm, message: e.target.value })}
                  placeholder="Add a personal message to the consumer..."
                  className="rounded-lg border-white/10 bg-white/5 text-blue-100"
                  rows={3}
                  data-testid="textarea-custom-message"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSendDocumentDialog(false);
                    setSendDocumentForm({ templateId: "", accountId: "", expiresInDays: 7, message: "" });
                  }}
                  className="flex-1 border-white/20 bg-white/5 text-blue-50 transition hover:bg-white/10"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!sendDocumentForm.templateId) {
                      toast({ title: "Please select a document template", variant: "destructive" });
                      return;
                    }
                    sendDocumentMutation.mutate({
                      templateId: sendDocumentForm.templateId,
                      data: {
                        consumerId: selectedAccount.consumerId,
                        accountId: sendDocumentForm.accountId || undefined,
                        expiresInDays: sendDocumentForm.expiresInDays,
                        message: sendDocumentForm.message || undefined,
                      },
                    });
                  }}
                  disabled={sendDocumentMutation.isPending || !sendDocumentForm.templateId}
                  className="flex-1 rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 text-white hover:from-sky-400/80 hover:to-indigo-400/80"
                  data-testid="button-send-document"
                >
                  {sendDocumentMutation.isPending ? "Sending..." : "Send Document"}
                </Button>
              </div>
            </div>
          )}
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
