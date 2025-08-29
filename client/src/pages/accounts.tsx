import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import AccountsTable from "@/components/accounts-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderOpen, Folder } from "lucide-react";

export default function Accounts() {
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
  
  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["/api/accounts"],
  });

  const { data: folders, isLoading: foldersLoading } = useQuery({
    queryKey: ["/api/folders"],
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

  const isLoading = accountsLoading || foldersLoading;

  return (
    <AdminLayout>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage all consumer accounts organized by folders
          </p>
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
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </AdminLayout>
  );
}
