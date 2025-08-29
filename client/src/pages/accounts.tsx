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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen, Folder, Plus, Upload } from "lucide-react";

export default function Accounts() {
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  // Mutations
  const createAccountMutation = useMutation({
    mutationFn: (data: any) => apiRequest("/api/accounts", "POST", data),
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

  const isLoading = accountsLoading || foldersLoading;

  return (
    <AdminLayout>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage all consumer accounts organized by folders
              </p>
            </div>
            <div className="flex gap-2">
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
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-8">
          <Tabs value={selectedFolderId} onValueChange={setSelectedFolderId} className="w-full">
            <TabsList className="grid w-full grid-cols-auto gap-1 mb-6" style={{ 
              gridTemplateColumns: `repeat(${((folders as any[])?.length || 0) + 1}, minmax(0, 1fr))` 
            }}>
              <TabsTrigger 
                value="all" 
                className="flex items-center gap-2"
                data-testid="tab-all-accounts"
              >
                <FolderOpen className="h-4 w-4" />
                All Accounts ({((accounts as any[]) || []).length})
              </TabsTrigger>
              
              {((folders as any[]) || []).map((folder: any) => (
                <TabsTrigger 
                  key={folder.id} 
                  value={folder.id}
                  className="flex items-center gap-2"
                  data-testid={`tab-folder-${folder.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: folder.color }}
                    />
                    <Folder className="h-4 w-4" />
                    {folder.name} ({folderCounts[folder.id] || 0})
                  </div>
                </TabsTrigger>
              ))}
            </TabsList>

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
      </div>
    </AdminLayout>
  );
}