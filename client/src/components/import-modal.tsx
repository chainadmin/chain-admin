import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [validationResults, setValidationResults] = useState<any>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch folders for dropdown
  const { data: folders } = useQuery({
    queryKey: ["/api/folders"],
    enabled: isOpen, // Only fetch when modal is open
  });

  const importMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("/api/import/csv", "POST", {
        ...data,
        folderId: selectedFolderId || undefined
      });
    },
    onSuccess: () => {
      toast({
        title: "Import Successful",
        description: "Account data has been imported successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      onClose();
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFile(null);
    setParsedData(null);
    setValidationResults(null);
    setSelectedFolderId("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    
    // Parse CSV file
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target?.result as string;
        const lines = csv.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        const consumers = new Map();
        const accounts = [];

        // Define standard column mappings
        const standardConsumerFields = ['consumer_first_name', 'first_name', 'consumer_last_name', 'last_name', 'consumer_email', 'email', 'consumer_phone', 'phone'];
        const standardAccountFields = ['account_number', 'account', 'creditor', 'balance', 'due_date'];
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const row: any = {};
          
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          // Extract consumer data
          const consumerKey = row.consumer_email || row.email;
          if (consumerKey && !consumers.has(consumerKey)) {
            // Extract additional consumer data (any non-standard columns)
            const additionalConsumerData: any = {};
            headers.forEach(header => {
              if (!standardConsumerFields.includes(header) && 
                  !standardAccountFields.includes(header) && 
                  row[header] && row[header] !== '') {
                additionalConsumerData[header] = row[header];
              }
            });

            consumers.set(consumerKey, {
              firstName: row.consumer_first_name || row.first_name || '',
              lastName: row.consumer_last_name || row.last_name || '',
              email: consumerKey,
              phone: row.consumer_phone || row.phone || '',
              additionalData: additionalConsumerData,
            });
          }

          // Extract account data
          if (row.creditor && row.balance) {
            // Extract additional account data (any non-standard columns)
            const additionalAccountData: any = {};
            headers.forEach(header => {
              if (!standardConsumerFields.includes(header) && 
                  !standardAccountFields.includes(header) && 
                  row[header] && row[header] !== '') {
                additionalAccountData[header] = row[header];
              }
            });

            accounts.push({
              accountNumber: row.account_number || row.account || '',
              creditor: row.creditor,
              balanceCents: Math.round(parseFloat(row.balance.replace(/[^0-9.-]/g, '')) * 100),
              dueDate: row.due_date || '',
              consumerEmail: consumerKey,
              additionalData: additionalAccountData,
            });
          }
        }

        const data = {
          consumers: Array.from(consumers.values()),
          accounts,
        };

        setParsedData(data);
        
        // Count additional columns
        const additionalColumns = headers.filter(h => 
          !standardConsumerFields.includes(h) && !standardAccountFields.includes(h)
        );
        
        setValidationResults({
          consumersCount: data.consumers.length,
          accountsCount: data.accounts.length,
          additionalColumns: additionalColumns,
          isValid: data.consumers.length > 0 && data.accounts.length > 0,
        });
      } catch (error) {
        toast({
          title: "Parse Error",
          description: "Failed to parse CSV file. Please check the format.",
          variant: "destructive",
        });
      }
    };
    
    reader.readAsText(selectedFile);
  };

  const handleImport = () => {
    if (parsedData && validationResults?.isValid) {
      importMutation.mutate(parsedData);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <i className="fas fa-upload text-blue-600 mr-3"></i>
            Import Account Data
          </DialogTitle>
          <p className="text-sm text-gray-500">
            Upload a CSV file containing account information to import multiple accounts at once.
          </p>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Required CSV Columns</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h5 className="font-medium text-blue-800 mb-1">Consumer Information</h5>
                <ul className="text-blue-700 space-y-1">
                  <li className="break-words">• <code className="bg-blue-100 px-1 rounded text-xs">consumer_first_name</code> or <code className="bg-blue-100 px-1 rounded text-xs">first_name</code></li>
                  <li className="break-words">• <code className="bg-blue-100 px-1 rounded text-xs">consumer_last_name</code> or <code className="bg-blue-100 px-1 rounded text-xs">last_name</code></li>
                  <li className="break-words">• <code className="bg-blue-100 px-1 rounded text-xs">consumer_email</code> or <code className="bg-blue-100 px-1 rounded text-xs">email</code></li>
                  <li className="break-words">• <code className="bg-blue-100 px-1 rounded text-xs">consumer_phone</code> or <code className="bg-blue-100 px-1 rounded text-xs">phone</code> (optional)</li>
                </ul>
              </div>
              <div>
                <h5 className="font-medium text-blue-800 mb-1">Account Information</h5>
                <ul className="text-blue-700 space-y-1">
                  <li className="break-words">• <code className="bg-blue-100 px-1 rounded text-xs">creditor</code> (required)</li>
                  <li className="break-words">• <code className="bg-blue-100 px-1 rounded text-xs">balance</code> (required, in dollars)</li>
                  <li className="break-words">• <code className="bg-blue-100 px-1 rounded text-xs">account_number</code> or <code className="bg-blue-100 px-1 rounded text-xs">account</code> (optional)</li>
                  <li className="break-words">• <code className="bg-blue-100 px-1 rounded text-xs">due_date</code> (optional)</li>
                </ul>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-blue-200">
              <p className="text-xs text-blue-600">
                <strong>Note:</strong> Any additional columns in your CSV will be automatically captured as custom data. 
                The balance should be in dollar format (e.g., 1250.50, not cents).
              </p>
            </div>
          </div>
          
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <h5 className="font-medium text-gray-800 mb-2">Example CSV Format</h5>
            <pre className="text-xs text-gray-600 bg-white p-2 rounded border overflow-x-auto">
consumer_first_name,consumer_last_name,consumer_email,creditor,balance,account_number
John,Doe,john.doe@email.com,Credit Card Co,1250.50,ACC123456
Jane,Smith,jane.smith@email.com,Medical Services,875.25,MED789012
            </pre>
          </div>

          {/* Folder Selection */}
          <div className="space-y-2">
            <Label htmlFor="folder-select">Destination Folder</Label>
            <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
              <SelectTrigger data-testid="select-folder">
                <SelectValue placeholder="Select a folder (optional)" />
              </SelectTrigger>
              <SelectContent>
                {(folders as any[])?.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    <div className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded-full mr-2" 
                        style={{ backgroundColor: folder.color }}
                      />
                      {folder.name}
                      {folder.isDefault && (
                        <span className="ml-2 text-xs text-gray-500">(Default)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Choose which folder to organize these accounts in. If no folder is selected, accounts will be placed in the default folder.
            </p>
          </div>
          
          {/* File Upload Area */}
          <div className="mt-4">
            <div className="flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-gray-400 transition-colors">
              <div className="space-y-1 text-center">
                <i className="fas fa-cloud-upload-alt text-gray-400 text-3xl"></i>
                <div className="flex text-sm text-gray-600">
                  <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                    <span>Upload a file</span>
                    <Input
                      id="file-upload"
                      name="file-upload"
                      type="file"
                      className="sr-only"
                      accept=".csv"
                      onChange={handleFileChange}
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">CSV files up to 10MB</p>
              </div>
            </div>
          </div>

          {/* File Preview */}
          {file && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <i className="fas fa-file-csv text-green-500 text-lg"></i>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB
                      {validationResults && ` • ${validationResults.accountsCount} records detected`}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => resetForm()}
                  className="text-red-500 hover:text-red-700"
                >
                  <i className="fas fa-times"></i>
                </Button>
              </div>
            </div>
          )}

          {/* Validation Results */}
          {validationResults && (
            <div className={`border rounded-md p-4 ${
              validationResults.isValid 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex">
                <div className="flex-shrink-0">
                  <i className={`fas ${
                    validationResults.isValid ? 'fa-check-circle text-green-400' : 'fa-exclamation-circle text-red-400'
                  }`}></i>
                </div>
                <div className="ml-3">
                  <h3 className={`text-sm font-medium ${
                    validationResults.isValid ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {validationResults.isValid ? 'File validated successfully' : 'Validation failed'}
                  </h3>
                  <div className={`mt-2 text-sm ${
                    validationResults.isValid ? 'text-green-700' : 'text-red-700'
                  }`}>
                    <p>
                      Ready to import {validationResults.accountsCount} accounts for {validationResults.consumersCount} consumers
                    </p>
                    {validationResults.additionalColumns && validationResults.additionalColumns.length > 0 && (
                      <p className="mt-1">
                        Additional fields detected: {validationResults.additionalColumns.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleImport}
            disabled={!validationResults?.isValid || importMutation.isPending}
          >
            {importMutation.isPending ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Importing...
              </>
            ) : (
              <>
                <i className="fas fa-upload mr-2"></i>
                Import Accounts
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
