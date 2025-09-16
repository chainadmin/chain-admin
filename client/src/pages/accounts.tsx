import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import AccountsTable from "@/components/accounts-table";
import ImportModal from "@/components/import-modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
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
import { FolderOpen, Folder, Plus, Upload, Settings, Trash2, MoreVertical, Users, FileText, Eye, Phone, Edit, Mail, MapPin, Calendar } from "lucide-react";

export default function Accounts() {
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
  const [activeMainTab, setActiveMainTab] = useState<string>("accounts");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
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

  // Consumer-related state
  const [selectedConsumer, setSelectedConsumer] = useState<any>(null);
  const [showConsumerEditDialog, setShowConsumerEditDialog] = useState(false);
  const [showConsumerViewDialog, setShowConsumerViewDialog] = useState(false);
  const [showConsumerDeleteDialog, setShowConsumerDeleteDialog] = useState(false);
  const [deleteConsumerId, setDeleteConsumerId] = useState<string | null>(null);
  const [consumerEditForm, setConsumerEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
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

  const createFolderMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/folders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setShowCreateFolderModal(false);
      setFolderForm({
        name: "",
        color: "#3B82F6",
        description: "",
      });
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

  // Consumer mutations
  const updateConsumerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/consumers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      setShowConsumerEditDialog(false);
      toast({
        title: "Success",
        description: "Consumer information updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update consumer",
        variant: "destructive",
      });
    },
  });

  const deleteConsumerMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", "/api/consumers", { id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setShowConsumerDeleteDialog(false);
      setDeleteConsumerId(null);
      toast({
        title: "Success",
        description: "Consumer and all associated accounts deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete consumer",
        variant: "destructive",
      });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => apiRequest("DELETE", `/api/folders/${folderId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      if (selectedFolderId !== "all") {
        setSelectedFolderId("all");
      }
      toast({
        title: "Success",
        description: "Folder deleted successfully. All accounts moved to default folder.",
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

  // Filter accounts by selected folder
  const filteredAccounts = selectedFolderId === "all" 
    ? (accounts as any[]) || []
    : ((accounts as any[]) || []).filter((account: any) => account.folder?.id === selectedFolderId);

  // Group accounts by folder for display counts
  const folderCounts = ((folders as any[]) || []).reduce((acc: any, folder: any) => {
    acc[folder.id] = ((accounts as any[]) || []).filter((account: any) => account.folder?.id === folder.id).length;
    return acc;
  }, {});

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.firstName.trim() || !createForm.lastName.trim() || !createForm.email.trim() || !createForm.creditor.trim() || !createForm.balance.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const balanceCents = Math.round(parseFloat(createForm.balance) * 100);
    if (isNaN(balanceCents)) {
      toast({
        title: "Error",
        description: "Please enter a valid balance amount",
        variant: "destructive",
      });
      return;
    }

    createAccountMutation.mutate({
      firstName: createForm.firstName,
      lastName: createForm.lastName,
      email: createForm.email,
      phone: createForm.phone || undefined,
      accountNumber: createForm.accountNumber || undefined,
      creditor: createForm.creditor,
      balanceCents,
      folderId: createForm.folderId || undefined,
    });
  };

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderForm.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a folder name",
        variant: "destructive",
      });
      return;
    }

    createFolderMutation.mutate({
      name: folderForm.name,
      color: folderForm.color,
      description: folderForm.description || undefined,
    });
  };

  const isLoading = accountsLoading || foldersLoading;

  // Consumer handlers
  const handleConsumerEdit = (consumer: any) => {
    setSelectedConsumer(consumer);
    setConsumerEditForm({
      firstName: consumer.firstName || "",
      lastName: consumer.lastName || "",
      email: consumer.email || "",
      phone: consumer.phone || "",
      dateOfBirth: consumer.dateOfBirth || "",
      address: consumer.address || "",
      city: consumer.city || "",
      state: consumer.state || "",
      zipCode: consumer.zipCode || "",
    });
    setShowConsumerEditDialog(true);
  };

  const handleConsumerView = (consumer: any) => {
    setSelectedConsumer(consumer);
    setShowConsumerViewDialog(true);
  };

  const handleConsumerDelete = (consumerId: string) => {
    setDeleteConsumerId(consumerId);
    setShowConsumerDeleteDialog(true);
  };

  const handleConsumerUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedConsumer) {
      updateConsumerMutation.mutate({
        id: selectedConsumer.id,
        data: consumerEditForm,
      });
    }
  };

  return (
    <AdminLayout>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Accounts & Consumers</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage all consumer records and their associated accounts
              </p>
            </div>
            <div className="flex gap-2">
              {activeMainTab === "accounts" && (
                <>
                  <Button
                    onClick={() => setShowCreateFolderModal(true)}
                    variant="outline"
                    data-testid="button-create-folder"
                  >
                    <Folder className="h-4 w-4 mr-2" />
                    New Folder
                  </Button>
                  <Button
                    onClick={() => setShowImportModal(true)}
                    variant="outline"
                    data-testid="button-import-accounts"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import CSV
                  </Button>
                  <Button
                    onClick={() => setShowCreateModal(true)}
                    data-testid="button-create-account"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Account
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-8">
          {/* Main tabs for Accounts and Consumers */}
          <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="accounts" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Accounts ({((accounts as any[]) || []).length})
              </TabsTrigger>
              <TabsTrigger value="consumers" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Consumers ({((consumers as any[]) || []).length})
              </TabsTrigger>
            </TabsList>

            {/* Accounts Tab Content */}
            <TabsContent value="accounts" className="mt-0">
              <Tabs value={selectedFolderId} onValueChange={setSelectedFolderId} className="w-full">
                <div className="overflow-x-auto mb-6">
                  <TabsList className="inline-flex min-w-full sm:grid sm:grid-cols-auto gap-1" style={{ 
                    gridTemplateColumns: window.innerWidth >= 640 ? `repeat(${((folders as any[])?.length || 0) + 1}, minmax(0, 1fr))` : undefined
                  }}>
                    <TabsTrigger 
                      value="all" 
                      className="flex items-center gap-2 whitespace-nowrap"
                      data-testid="tab-all-accounts"
                    >
                      <FolderOpen className="h-4 w-4" />
                      All Accounts ({((accounts as any[]) || []).length})
                    </TabsTrigger>
                    
                    {((folders as any[]) || []).map((folder: any) => (
                      <TabsTrigger 
                        key={folder.id} 
                        value={folder.id}
                        className="flex items-center gap-2 group relative whitespace-nowrap"
                        data-testid={`tab-folder-${folder.name.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: folder.color }}
                          />
                          <Folder className="h-4 w-4" />
                          {folder.name} ({folderCounts[folder.id] || 0})
                          {!folder.isDefault && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 ml-1"
                                  onClick={(e) => e.stopPropagation()}
                                  data-testid={`dropdown-folder-${folder.id}`}
                                >
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem
                                  onClick={() => setDeleteFolderDialog({ open: true, folder })}
                                  className="text-red-600 focus:text-red-600"
                                  data-testid={`delete-folder-${folder.id}`}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Folder
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                <TabsContent value="all" className="mt-0">
                  <AccountsTable 
                    accounts={filteredAccounts} 
                    isLoading={isLoading} 
                    showFolderColumn={true}
                    showDeleteButton={true}
                  />
                </TabsContent>

                {((folders as any[]) || []).map((folder: any) => (
                  <TabsContent key={folder.id} value={folder.id} className="mt-0">
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: folder.color }}
                        />
                        <div>
                          <h3 className="font-medium text-gray-900">{folder.name}</h3>
                          {folder.description && (
                            <p className="text-sm text-gray-500">{folder.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <AccountsTable 
                      accounts={filteredAccounts} 
                      isLoading={isLoading}
                      showFolderColumn={false}
                      showDeleteButton={true}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </TabsContent>

            {/* Consumers Tab Content */}
            <TabsContent value="consumers" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Consumer List</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="text-center py-8">Loading consumers...</div>
                  ) : (consumers as any)?.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No consumers found. Import account data to get started.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(consumers as any)?.map((consumer: any) => (
                        <div key={consumer.id} className="border-b pb-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                <span className="text-sm font-medium text-gray-700">
                                  {consumer.firstName?.[0]}{consumer.lastName?.[0]}
                                </span>
                              </div>
                              <div className="ml-4">
                                <p className="text-sm font-medium text-gray-900">
                                  {consumer.firstName} {consumer.lastName}
                                </p>
                                <p className="text-sm text-gray-500">{consumer.email}</p>
                                {consumer.phone && (
                                  <p className="text-sm text-gray-500">{consumer.phone}</p>
                                )}
                                {consumer.accountCount > 0 && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    {consumer.accountCount} account{consumer.accountCount !== 1 ? 's' : ''}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleConsumerView(consumer)}
                                data-testid={`button-view-${consumer.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleConsumerEdit(consumer)}
                                data-testid={`button-edit-${consumer.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleConsumerDelete(consumer.id)}
                                data-testid={`button-delete-${consumer.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

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
              <p className="text-sm text-gray-500">Fill in the details below to create a new consumer account.</p>
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
                    min="0"
                    data-testid="input-balance"
                    value={createForm.balance}
                    onChange={(e) => setCreateForm({ ...createForm, balance: e.target.value })}
                    placeholder="Enter balance amount"
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
                      <SelectValue placeholder="Select a folder (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {((folders as any[]) || []).map((folder: any) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: folder.color }}
                            />
                            {folder.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  data-testid="button-cancel-create"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createAccountMutation.isPending}
                  data-testid="button-save-account"
                >
                  {createAccountMutation.isPending ? "Creating..." : "Create Account"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Create Folder Modal */}
        <Dialog open={showCreateFolderModal} onOpenChange={setShowCreateFolderModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Folder</DialogTitle>
              <p className="text-sm text-gray-500">Create a new folder to organize your accounts.</p>
            </DialogHeader>
            <form onSubmit={handleCreateFolderSubmit} className="space-y-4">
              <div>
                <Label htmlFor="folderName">Folder Name *</Label>
                <Input
                  id="folderName"
                  data-testid="input-folder-name"
                  value={folderForm.name}
                  onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
                  placeholder="Enter folder name"
                  required
                />
              </div>

              <div>
                <Label htmlFor="folderColor">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="folderColor"
                    type="color"
                    data-testid="input-folder-color"
                    value={folderForm.color}
                    onChange={(e) => setFolderForm({ ...folderForm, color: e.target.value })}
                    className="w-12 h-8 rounded border border-gray-300"
                  />
                  <span className="text-sm text-gray-500">{folderForm.color}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="folderDescription">Description</Label>
                <Input
                  id="folderDescription"
                  data-testid="input-folder-description"
                  value={folderForm.description}
                  onChange={(e) => setFolderForm({ ...folderForm, description: e.target.value })}
                  placeholder="Enter folder description (optional)"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateFolderModal(false)}
                  data-testid="button-cancel-folder"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createFolderMutation.isPending}
                  data-testid="button-save-folder"
                >
                  {createFolderMutation.isPending ? "Creating..." : "Create Folder"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Folder Dialog */}
        <AlertDialog 
          open={deleteFolderDialog.open} 
          onOpenChange={(open) => setDeleteFolderDialog({ open, folder: open ? deleteFolderDialog.folder : null })}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Folder</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the "{deleteFolderDialog.folder?.name}" folder? All accounts in this folder will be moved to the default folder. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteFolderDialog.folder) {
                    deleteFolderMutation.mutate(deleteFolderDialog.folder.id);
                    setDeleteFolderDialog({ open: false, folder: null });
                  }
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Consumer View Dialog */}
        <Dialog open={showConsumerViewDialog} onOpenChange={setShowConsumerViewDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Consumer Details</DialogTitle>
            </DialogHeader>
            {selectedConsumer && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-gray-500">Name</Label>
                    <p className="font-medium">
                      {selectedConsumer.firstName} {selectedConsumer.lastName}
                    </p>
                  </div>
                  {selectedConsumer.email && (
                    <div>
                      <Label className="text-sm text-gray-500">Email</Label>
                      <p className="font-medium flex items-center gap-1">
                        <Mail className="h-4 w-4" />
                        {selectedConsumer.email}
                      </p>
                    </div>
                  )}
                  {selectedConsumer.phone && (
                    <div>
                      <Label className="text-sm text-gray-500">Phone</Label>
                      <p className="font-medium flex items-center gap-1">
                        <Phone className="h-4 w-4" />
                        {selectedConsumer.phone}
                      </p>
                    </div>
                  )}
                  {selectedConsumer.dateOfBirth && (
                    <div>
                      <Label className="text-sm text-gray-500">Date of Birth</Label>
                      <p className="font-medium flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {selectedConsumer.dateOfBirth}
                      </p>
                    </div>
                  )}
                  {(selectedConsumer.address || selectedConsumer.city || selectedConsumer.state || selectedConsumer.zipCode) && (
                    <div className="col-span-2">
                      <Label className="text-sm text-gray-500">Address</Label>
                      <p className="font-medium flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {[
                          selectedConsumer.address,
                          selectedConsumer.city,
                          selectedConsumer.state,
                          selectedConsumer.zipCode
                        ].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  )}
                  <div>
                    <Label className="text-sm text-gray-500">Registration Status</Label>
                    <p className="font-medium">
                      {selectedConsumer.isRegistered ? (
                        <span className="text-green-600">Registered</span>
                      ) : (
                        <span className="text-gray-500">Not Registered</span>
                      )}
                    </p>
                  </div>
                  {selectedConsumer.folder && (
                    <div>
                      <Label className="text-sm text-gray-500">Folder</Label>
                      <p className="font-medium flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: selectedConsumer.folder.color }}
                        />
                        {selectedConsumer.folder.name}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Consumer Edit Dialog */}
        <Dialog open={showConsumerEditDialog} onOpenChange={setShowConsumerEditDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Consumer Information</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleConsumerUpdateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editFirstName">First Name</Label>
                  <Input
                    id="editFirstName"
                    value={consumerEditForm.firstName}
                    onChange={(e) => setConsumerEditForm({ ...consumerEditForm, firstName: e.target.value })}
                    placeholder="Enter first name"
                  />
                </div>
                <div>
                  <Label htmlFor="editLastName">Last Name</Label>
                  <Input
                    id="editLastName"
                    value={consumerEditForm.lastName}
                    onChange={(e) => setConsumerEditForm({ ...consumerEditForm, lastName: e.target.value })}
                    placeholder="Enter last name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editEmail">Email</Label>
                  <Input
                    id="editEmail"
                    type="email"
                    value={consumerEditForm.email}
                    onChange={(e) => setConsumerEditForm({ ...consumerEditForm, email: e.target.value })}
                    placeholder="Enter email"
                  />
                </div>
                <div>
                  <Label htmlFor="editPhone">Phone</Label>
                  <Input
                    id="editPhone"
                    value={consumerEditForm.phone}
                    onChange={(e) => setConsumerEditForm({ ...consumerEditForm, phone: e.target.value })}
                    placeholder="Enter phone"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editDob">Date of Birth</Label>
                  <Input
                    id="editDob"
                    type="date"
                    value={consumerEditForm.dateOfBirth}
                    onChange={(e) => setConsumerEditForm({ ...consumerEditForm, dateOfBirth: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="editAddress">Street Address</Label>
                  <Input
                    id="editAddress"
                    value={consumerEditForm.address}
                    onChange={(e) => setConsumerEditForm({ ...consumerEditForm, address: e.target.value })}
                    placeholder="Enter address"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="editCity">City</Label>
                  <Input
                    id="editCity"
                    value={consumerEditForm.city}
                    onChange={(e) => setConsumerEditForm({ ...consumerEditForm, city: e.target.value })}
                    placeholder="Enter city"
                  />
                </div>
                <div>
                  <Label htmlFor="editState">State</Label>
                  <Input
                    id="editState"
                    value={consumerEditForm.state}
                    onChange={(e) => setConsumerEditForm({ ...consumerEditForm, state: e.target.value })}
                    placeholder="Enter state"
                  />
                </div>
                <div>
                  <Label htmlFor="editZip">ZIP Code</Label>
                  <Input
                    id="editZip"
                    value={consumerEditForm.zipCode}
                    onChange={(e) => setConsumerEditForm({ ...consumerEditForm, zipCode: e.target.value })}
                    placeholder="Enter ZIP"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowConsumerEditDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateConsumerMutation.isPending}
                >
                  {updateConsumerMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Consumer Delete Dialog */}
        <AlertDialog open={showConsumerDeleteDialog} onOpenChange={setShowConsumerDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Consumer</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this consumer? This will also delete all accounts associated with this consumer. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteConsumerId) {
                    deleteConsumerMutation.mutate(deleteConsumerId);
                  }
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete Consumer & Accounts
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}