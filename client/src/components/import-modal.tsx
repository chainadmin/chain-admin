import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [clearExistingPhones, setClearExistingPhones] = useState<boolean>(false);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState("#3B82F6");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch folders for dropdown
  const { data: folders } = useQuery({
    queryKey: ["/api/folders"],
    enabled: isOpen, // Only fetch when modal is open
  });

  // Fetch tenant settings to check if SMAX is enabled
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/settings"],
    enabled: isOpen, // Only fetch when modal is open
  });

  const importMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/import/csv", {
        ...data,
        folderId: selectedFolderId || undefined,
        clearExistingPhones: clearExistingPhones,
      });
      return response.json();
    },
    onSuccess: (result: any) => {
      // Handle missing or malformed response gracefully
      const consumersCreated = result?.consumersCreated ?? 0;
      const accountsCreated = result?.accountsCreated ?? 0;
      const totalSkipped = result?.totalSkipped ?? 0;
      
      // Build description with summary
      let description = `Imported ${consumersCreated} consumer(s) and ${accountsCreated} account(s).`;
      if (totalSkipped > 0) {
        description += ` ${totalSkipped} row(s) were skipped due to missing/invalid data.`;
      }
      
      toast({
        title: totalSkipped > 0 ? "Import Completed with Warnings" : "Import Successful",
        description,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error?.message || "An unexpected error occurred during import.",
        variant: "destructive",
      });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      const response = await apiRequest("POST", "/api/folders", data);
      return response.json();
    },
    onSuccess: (newFolder: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setSelectedFolderId(newFolder.id);
      setShowCreateFolderDialog(false);
      setNewFolderName("");
      setNewFolderColor("#3B82F6");
      toast({
        title: "Folder Created",
        description: `Folder "${newFolder.name}" has been created and selected.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Folder",
        description: error?.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    },
  });

  const handleFolderSelect = (value: string) => {
    if (value === "__create_new__") {
      setShowCreateFolderDialog(true);
    } else {
      setSelectedFolderId(value);
    }
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolderMutation.mutate({ name: newFolderName.trim(), color: newFolderColor });
    }
  };

  const resetForm = () => {
    setFile(null);
    setParsedData(null);
    setValidationResults(null);
    setSelectedFolderId("");
    setClearExistingPhones(false);
  };

  // Helper function to properly parse CSV lines with quoted fields
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
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
        // Normalize headers: lowercase, remove quotes
        const rawHeaders = parseCSVLine(lines[0]);
        const headers = rawHeaders.map(h => h.toLowerCase().replace(/['"]/g, '').trim());
        
        // Debug: log headers to console
        console.log('CSV Headers (raw):', rawHeaders);
        console.log('CSV Headers (normalized):', headers);
        
        const consumers = new Map();
        const accounts = [];

        // Define standard column mappings (including alternate names from various systems)
        const standardConsumerFields = [
          'consumer_first_name', 'first_name', 'firstname', 'fname',
          'consumer_last_name', 'last_name', 'lastname', 'lname', 'fullname',
          'consumer_email', 'email', 'emailaddress', 'email_address',
          'consumer_phone', 'phone', 'primaryphone', 'primary_phone', 'cellphone', 'cell_phone', 'workphone', 'alternatephone',
          'date_of_birth', 'dob', 'dateofbirth', 'consumer_dob', 'consumer_date_of_birth', 'birthdate', 'birth_date',
          'address', 'consumer_address', 'street', 'street_address',
          'city', 'consumer_city',
          'state', 'consumer_state',
          'zip_code', 'zipcode', 'zip', 'consumer_zip', 'consumer_zip_code', 'postalcode', 'postal_code',
          'socialsecuritynumber', 'ssn', 'social_security_number', 'ssn_last4', 'ssnlast4'
        ];
        const standardAccountFields = [
          'account_number', 'account', 'accountnumber', 
          'filenumber', 'file_number', 'fileno',
          'creditor', 'originalcreditor', 'original_creditor', 'client', 'clientname',
          'balance', 'currentbalance', 'current_balance', 'amount', 'amount_due', 'balancedue', 'balance_due', 'totaldue', 'total_due',
          'due_date', 'duedate',
          'status', 'statusname', 'status_name', 'accountstatus', 'account_status'
        ];
        
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const row: any = {};
          
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          // Extract consumer data
          const consumerKey = row.consumer_email || row.email || row.emailaddress || row.email_address || '';
          if (consumerKey && !consumers.has(consumerKey)) {
            // Extract date of birth from various possible column names (including birthdate)
            const dobValue = row.date_of_birth || row.dob || row.dateofbirth || 
                           row.consumer_dob || row.consumer_date_of_birth || 
                           row.birthdate || row.birth_date || '';
            
            // Extract phone from various possible column names
            const phoneValue = row.consumer_phone || row.phone || row.primaryphone || row.primary_phone ||
                             row.cellphone || row.cell_phone || row.workphone || row.alternatephone || '';
            
            // Extract address fields
            const addressValue = row.address || row.consumer_address || row.street || row.street_address || '';
            const cityValue = row.city || row.consumer_city || '';
            const stateValue = row.state || row.consumer_state || '';
            const zipValue = row.zip_code || row.zipcode || row.zip || 
                           row.consumer_zip || row.consumer_zip_code || row.postalcode || row.postal_code || '';
            
            // Extract SSN last 4 digits (from full SSN or just last 4)
            const ssnRaw = row.socialsecuritynumber || row.ssn || row.social_security_number || 
                          row.ssn_last4 || row.ssnlast4 || '';
            const ssnLast4 = ssnRaw ? ssnRaw.replace(/\D/g, '').slice(-4) : '';
            
            // Extract additional consumer data (any non-standard columns)
            const additionalConsumerData: any = {};
            headers.forEach(header => {
              if (!standardConsumerFields.includes(header) && 
                  !standardAccountFields.includes(header) && 
                  row[header] && row[header] !== '') {
                additionalConsumerData[header] = row[header];
              }
            });

            // Extract first and last name
            const firstName = row.consumer_first_name || row.first_name || row.firstname || row.fname || '';
            const lastName = row.consumer_last_name || row.last_name || row.lastname || row.lname || '';

            consumers.set(consumerKey, {
              firstName,
              lastName,
              email: consumerKey,
              phone: phoneValue,
              dateOfBirth: dobValue,
              address: addressValue,
              city: cityValue,
              state: stateValue,
              zipCode: zipValue,
              ssnLast4: ssnLast4,
              additionalData: additionalConsumerData,
            });
          }

          // Extract account data - only if we have a valid consumer email, creditor, and balance
          // Filenumber is optional unless SMAX is enabled
          const creditorValue = row.creditor || row.originalcreditor || row.original_creditor || row.client || row.clientname || '';
          const balanceValue = row.balance || row.currentbalance || row.current_balance || row.amount || row.amount_due || row.balancedue || row.balance_due || row.totaldue || row.total_due || '';
          if (consumerKey && creditorValue && balanceValue) {
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
              accountNumber: row.account_number || row.account || row.accountnumber || '',
              filenumber: row.filenumber || row.file_number || row.fileno || '',
              creditor: creditorValue,
              balanceCents: Math.round(parseFloat(balanceValue.replace(/[^0-9.-]/g, '')) * 100),
              dueDate: row.due_date || row.duedate || '',
              status: row.status || row.statusname || row.status_name || row.accountstatus || row.account_status || '',
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
        
        // Validate that all consumers have required fields
        const missingDOBConsumers = data.consumers.filter((c: any) => !c.dateOfBirth);
        const missingNameConsumers = data.consumers.filter((c: any) => !c.firstName || !c.lastName);
        const missingFilenumberAccounts = data.accounts.filter((a: any) => !a.filenumber);
        
        // Check if SMAX is enabled
        const smaxEnabled = (settings as any)?.smaxEnabled ?? false;
        
        const validationErrors = [];
        const validationWarnings = [];
        
        // DOB is now a warning, not a blocking error
        if (missingDOBConsumers.length > 0) {
          validationWarnings.push(`${missingDOBConsumers.length} consumer(s) missing date of birth (mobile login may not work for these consumers)`);
        }
        if (missingNameConsumers.length > 0) {
          validationErrors.push(`${missingNameConsumers.length} consumer(s) missing first or last name`);
        }
        // Only require filenumber if SMAX is enabled
        if (smaxEnabled && missingFilenumberAccounts.length > 0) {
          validationErrors.push(`${missingFilenumberAccounts.length} account(s) missing filenumber (required for SMAX integration)`);
        }
        
        setValidationResults({
          consumersCount: data.consumers.length,
          accountsCount: data.accounts.length,
          additionalColumns: additionalColumns,
          missingDOBCount: missingDOBConsumers.length,
          missingNameCount: missingNameConsumers.length,
          missingFilenumberCount: missingFilenumberAccounts.length,
          validationErrors: validationErrors,
          validationWarnings: validationWarnings,
          isValid: data.consumers.length > 0 && data.accounts.length > 0 && validationErrors.length === 0,
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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/20 bg-[#0b1733]/95 backdrop-blur-md text-blue-50">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center text-lg font-semibold text-blue-50">
            <i className="fas fa-upload text-sky-400 mr-2"></i>
            Import Account Data
          </DialogTitle>
          <p className="text-xs text-blue-100/70">
            Upload a CSV file containing account information to import multiple accounts at once.
          </p>
        </DialogHeader>
        
        <div className="space-y-2">
          {/* Compact CSV info - collapsible */}
          <details className="rounded-lg border border-sky-400/30 bg-sky-500/10">
            <summary className="p-2 cursor-pointer text-xs font-medium text-sky-100 hover:bg-sky-500/20">
              <i className="fas fa-info-circle mr-1.5"></i>
              View Required CSV Columns
            </summary>
            <div className="px-2 pb-2 text-xs text-sky-50/90 space-y-1">
              <p><strong>Consumer:</strong> first_name, last_name, email, phone (opt), dob (opt)</p>
              <p><strong>Account:</strong> creditor, balance, filenumber (SMAX), account_number (opt)</p>
              <p className="text-sky-100/70">Additional columns are saved as custom data. Balance in dollars (e.g., 1250.50).</p>
            </div>
          </details>

          {/* Folder Selection + Import Options in a row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="folder-select" className="text-xs text-blue-100">Destination Folder</Label>
              <Select value={selectedFolderId} onValueChange={handleFolderSelect}>
                <SelectTrigger data-testid="select-folder" className="h-8 text-xs border-white/20 bg-white/5 text-blue-50">
                  <SelectValue placeholder="Select folder (optional)" />
                </SelectTrigger>
                <SelectContent className="border-white/20 bg-[#0f1a3c] text-blue-100">
                  <SelectItem value="__create_new__" className="text-sky-300 font-medium">
                    <div className="flex items-center">
                      <i className="fas fa-plus-circle mr-1.5 text-sky-400"></i>
                      Create New Folder...
                    </div>
                  </SelectItem>
                  {(folders as any[])?.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      <div className="flex items-center">
                        <div 
                          className="w-2.5 h-2.5 rounded-full mr-1.5" 
                          style={{ backgroundColor: folder.color }}
                        />
                        {folder.name}
                        {folder.isDefault && (
                          <span className="ml-1.5 text-[10px] text-blue-100/60">(Default)</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Clear existing phones option */}
            <div className="flex items-center space-x-2 pt-5">
              <Checkbox
                id="clear-phones"
                checked={clearExistingPhones}
                onCheckedChange={(checked) => setClearExistingPhones(checked === true)}
                data-testid="checkbox-clear-phones"
              />
              <Label htmlFor="clear-phones" className="text-xs text-blue-100 cursor-pointer">
                Clear existing phone numbers before import
              </Label>
            </div>
          </div>
          
          {clearExistingPhones && (
            <p className="text-xs text-yellow-400/80 bg-yellow-500/10 p-1.5 rounded border border-yellow-500/20">
              <i className="fas fa-exclamation-triangle mr-1"></i>
              Old phone numbers in additional data will be replaced with new ones from this CSV.
            </p>
          )}
          
          {/* File Upload Area */}
          <div className="mt-1">
            {settingsLoading ? (
              <div className="flex justify-center px-4 py-3 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-0.5 text-center text-gray-500">
                  <i className="fas fa-spinner fa-spin text-gray-400 text-xl"></i>
                  <p className="text-xs">Loading settings...</p>
                </div>
              </div>
            ) : (
              <div className="flex justify-center px-4 py-3 border-2 border-gray-300 border-dashed rounded-md hover:border-gray-400 transition-colors">
                <div className="space-y-0.5 text-center">
                  <i className="fas fa-cloud-upload-alt text-gray-400 text-2xl"></i>
                  <div className="flex text-xs text-gray-600">
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
            )}
          </div>

          {/* File Preview */}
          {file && (
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <i className="fas fa-file-csv text-green-500 text-sm"></i>
                  <div className="ml-2">
                    <p className="text-xs font-medium text-gray-900">{file.name}</p>
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
                  className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                >
                  <i className="fas fa-times text-xs"></i>
                </Button>
              </div>
            </div>
          )}

          {/* Validation Results */}
          {validationResults && (
            <>
              {/* Errors (blocking) */}
              {validationResults.validationErrors?.length > 0 && (
                <div className="border rounded-md p-2 bg-red-50 border-red-200">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <i className="fas fa-exclamation-circle text-red-400 text-sm"></i>
                    </div>
                    <div className="ml-2">
                      <h3 className="text-xs font-medium text-red-800">Validation errors found:</h3>
                      <ul className="mt-0.5 text-xs text-red-700 list-disc list-inside space-y-0.5">
                        {validationResults.validationErrors.map((error: string, index: number) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs text-red-600">
                        Please fix these errors before importing.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Warnings (non-blocking) */}
              {validationResults.validationWarnings?.length > 0 && (
                <div className="border rounded-md p-2 bg-yellow-50 border-yellow-200">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <i className="fas fa-exclamation-triangle text-yellow-500 text-sm"></i>
                    </div>
                    <div className="ml-2">
                      <h3 className="text-xs font-medium text-yellow-800">Warnings:</h3>
                      <ul className="mt-0.5 text-xs text-yellow-700 list-disc list-inside space-y-0.5">
                        {validationResults.validationWarnings.map((warning: string, index: number) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs text-yellow-600">
                        You can still import, but some features may be limited.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Success state */}
              {validationResults.isValid && (
                <div className="border rounded-md p-2 bg-green-50 border-green-200">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <i className="fas fa-check-circle text-green-400 text-sm"></i>
                    </div>
                    <div className="ml-2">
                      <h3 className="text-xs font-medium text-green-800">File validated successfully</h3>
                      <div className="mt-1 text-xs text-green-700 leading-snug">
                        <p>
                          Ready to import {validationResults.accountsCount} accounts for {validationResults.consumersCount} consumers
                        </p>
                        {validationResults.additionalColumns && validationResults.additionalColumns.length > 0 && (
                          <p className="mt-0.5">
                            Additional fields: {validationResults.additionalColumns.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Accounts Preview with scrolling */}
              {parsedData && parsedData.accounts.length > 0 && (
                <div className="border rounded-md border-white/20 bg-white/5 p-2">
                  <h4 className="text-xs font-medium text-blue-100 mb-1.5">
                    Preview ({Math.min(parsedData.accounts.length, 5)} of {parsedData.accounts.length} accounts)
                  </h4>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#0b1733]">
                        <tr className="text-left text-blue-200/70 border-b border-white/10">
                          <th className="pb-1 pr-2">Consumer</th>
                          <th className="pb-1 pr-2">Creditor</th>
                          <th className="pb-1 pr-2">Balance</th>
                          <th className="pb-1">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-blue-100/90">
                        {parsedData.accounts.slice(0, 5).map((account: any, index: number) => {
                          const consumer = parsedData.consumers.find((c: any) => c.email === account.consumerEmail);
                          return (
                            <tr key={index} className="border-b border-white/5">
                              <td className="py-1 pr-2 truncate max-w-[120px]">
                                {consumer ? `${consumer.firstName} ${consumer.lastName}` : account.consumerEmail}
                              </td>
                              <td className="py-1 pr-2 truncate max-w-[100px]">{account.creditor}</td>
                              <td className="py-1 pr-2">${(account.balanceCents / 100).toFixed(2)}</td>
                              <td className="py-1 truncate max-w-[80px]">{account.status || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <Button variant="outline" onClick={handleClose} className="h-8 text-xs">
            Cancel
          </Button>
          <Button 
            onClick={handleImport}
            disabled={!validationResults?.isValid || importMutation.isPending}
            className="h-8 text-xs"
          >
            {importMutation.isPending ? (
              <>
                <i className="fas fa-spinner fa-spin mr-1.5"></i>
                Importing...
              </>
            ) : (
              <>
                <i className="fas fa-upload mr-1.5"></i>
                Import Accounts
              </>
            )}
          </Button>
        </div>
      </DialogContent>

      {/* Create New Folder Dialog */}
      <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog}>
        <DialogContent className="max-w-sm rounded-2xl border border-white/20 bg-[#0b1733]/95 backdrop-blur-md text-blue-50">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-white">Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-folder-name" className="text-xs text-blue-100">Folder Name</Label>
              <Input
                id="new-folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Enter folder name"
                className="h-9 border-white/20 bg-white/5 text-white placeholder:text-blue-100/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-folder-color" className="text-xs text-blue-100">Folder Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="new-folder-color"
                  value={newFolderColor}
                  onChange={(e) => setNewFolderColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-white/20 bg-transparent"
                />
                <div 
                  className="h-6 w-6 rounded-full border border-white/20" 
                  style={{ backgroundColor: newFolderColor }}
                />
                <span className="text-xs text-blue-100/70">{newFolderColor}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setShowCreateFolderDialog(false)}
              className="h-8 text-xs border-white/20 text-blue-100 hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              className="h-8 text-xs"
            >
              {createFolderMutation.isPending ? "Creating..." : "Create Folder"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
