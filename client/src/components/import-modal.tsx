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

  // Fetch tenant settings to check if SMAX is enabled
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/settings"],
    enabled: isOpen, // Only fetch when modal is open
  });

  const importMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/import/csv", {
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
        const standardConsumerFields = [
          'consumer_first_name', 'first_name', 'firstname',
          'consumer_last_name', 'last_name', 'lastname',
          'consumer_email', 'email', 'emailaddress',
          'consumer_phone', 'phone', 'primaryphone',
          'date_of_birth', 'dob', 'dateofbirth', 'consumer_dob', 'consumer_date_of_birth', 'birthdate',
          'address', 'consumer_address',
          'city', 'consumer_city',
          'state', 'consumer_state',
          'zip_code', 'zipcode', 'zip', 'consumer_zip', 'consumer_zip_code',
          'socialsecuritynumber', 'ssn', 'social_security_number', 'ssn_last4', 'ssnlast4'
        ];
        const standardAccountFields = ['account_number', 'account', 'accountnumber', 'filenumber', 'file_number', 'creditor', 'originalcreditor', 'balance', 'due_date', 'status', 'statusname'];
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const row: any = {};
          
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          // Extract consumer data
          const consumerKey = row.consumer_email || row.email || row.emailaddress;
          if (consumerKey && !consumers.has(consumerKey)) {
            // Extract date of birth from various possible column names
            const dobValue = row.date_of_birth || row.dob || row.dateofbirth || 
                           row.consumer_dob || row.consumer_date_of_birth || row.birthdate || '';
            
            // Extract address fields
            const addressValue = row.address || row.consumer_address || '';
            const cityValue = row.city || row.consumer_city || '';
            const stateValue = row.state || row.consumer_state || '';
            const zipValue = row.zip_code || row.zipcode || row.zip || 
                           row.consumer_zip || row.consumer_zip_code || '';
            
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

            consumers.set(consumerKey, {
              firstName: row.consumer_first_name || row.first_name || row.firstname || '',
              lastName: row.consumer_last_name || row.last_name || row.lastname || '',
              email: consumerKey,
              phone: row.consumer_phone || row.phone || row.primaryphone || '',
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
          const creditorValue = row.creditor || row.originalcreditor || '';
          const balanceValue = row.balance || '';
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
              filenumber: row.filenumber || row.file_number || '',
              creditor: creditorValue,
              balanceCents: Math.round(parseFloat(balanceValue.replace(/[^0-9.-]/g, '')) * 100),
              dueDate: row.due_date || '',
              status: row.status || row.statusname || '',
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
        
        // Validate that all consumers have required fields including dateOfBirth
        const missingDOBConsumers = data.consumers.filter((c: any) => !c.dateOfBirth);
        const missingNameConsumers = data.consumers.filter((c: any) => !c.firstName || !c.lastName);
        const missingFilenumberAccounts = data.accounts.filter((a: any) => !a.filenumber);
        
        // Check if SMAX is enabled
        const smaxEnabled = (settings as any)?.smaxEnabled ?? false;
        
        const validationErrors = [];
        if (missingDOBConsumers.length > 0) {
          validationErrors.push(`${missingDOBConsumers.length} consumer(s) missing date of birth (required for account linking)`);
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
          <div className="rounded-lg border border-sky-400/30 bg-sky-500/10 p-2.5">
            <h4 className="text-sm font-medium text-sky-100 mb-1.5">Required CSV Columns</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <h5 className="text-xs font-medium text-sky-100 mb-0.5">Consumer Information</h5>
                <ul className="text-sky-50/90 space-y-0.5 leading-snug">
                  <li className="break-words">• <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">consumer_first_name</code> or <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">first_name</code></li>
                  <li className="break-words">• <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">consumer_last_name</code> or <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">last_name</code></li>
                  <li className="break-words">• <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">consumer_email</code> or <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">email</code></li>
                  <li className="break-words">• <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">consumer_phone</code> or <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">phone</code> (optional)</li>
                  <li className="break-words">• <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">date_of_birth</code> or <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">dob</code> (optional)</li>
                  <li className="break-words">• <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">address</code>, <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">city</code>, <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">state</code>, <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">zip_code</code> (optional)</li>
                </ul>
              </div>
              <div>
                <h5 className="text-xs font-medium text-sky-100 mb-0.5">Account Information</h5>
                <ul className="text-sky-50/90 space-y-0.5 leading-snug">
                  <li className="break-words">• <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">filenumber</code> or <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">file_number</code> (required for SMAX)</li>
                  <li className="break-words">• <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">creditor</code> (required)</li>
                  <li className="break-words">• <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">balance</code> (required, in dollars)</li>
                  <li className="break-words">• <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">account_number</code> or <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">account</code> (optional)</li>
                  <li className="break-words">• <code className="bg-white/10 px-0.5 rounded text-xs text-sky-100">due_date</code> (optional)</li>
                </ul>
              </div>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-sky-400/20">
              <p className="text-xs text-sky-100/90 leading-snug">
                <strong>Note:</strong> Any additional columns in your CSV will be automatically captured as custom data. 
                The balance should be in dollar format (e.g., 1250.50, not cents).
              </p>
            </div>
          </div>
          
          <div className="rounded-lg border border-white/20 bg-white/5 p-2">
            <h5 className="text-xs font-medium text-blue-100 mb-1">Example CSV Format</h5>
            <pre className="text-xs text-blue-100/80 bg-white/5 p-1.5 rounded border border-white/10 overflow-x-auto leading-snug">
consumer_first_name,consumer_last_name,consumer_email,date_of_birth,filenumber,creditor,balance,account_number
John,Doe,john.doe@email.com,1985-05-15,FILE123456,Credit Card Co,1250.50,ACC123456
Jane,Smith,jane.smith@email.com,1990-08-22,FILE789012,Medical Services,875.25,MED789012
            </pre>
          </div>

          {/* Folder Selection */}
          <div className="space-y-1">
            <Label htmlFor="folder-select" className="text-xs">Destination Folder</Label>
            <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
              <SelectTrigger data-testid="select-folder" className="h-8 text-xs">
                <SelectValue placeholder="Select a folder (optional)" />
              </SelectTrigger>
              <SelectContent>
                {(folders as any[])?.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    <div className="flex items-center">
                      <div 
                        className="w-2.5 h-2.5 rounded-full mr-1.5" 
                        style={{ backgroundColor: folder.color }}
                      />
                      {folder.name}
                      {folder.isDefault && (
                        <span className="ml-1.5 text-[10px] text-gray-500">(Default)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 leading-snug">
              Choose which folder to organize these accounts in.
            </p>
          </div>
          
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
            <div className={`border rounded-md p-2 ${
              validationResults.isValid 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex">
                <div className="flex-shrink-0">
                  <i className={`fas text-sm ${
                    validationResults.isValid ? 'fa-check-circle text-green-400' : 'fa-exclamation-circle text-red-400'
                  }`}></i>
                </div>
                <div className="ml-2">
                  <h3 className={`text-xs font-medium ${
                    validationResults.isValid ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {validationResults.isValid ? 'File validated successfully' : 'Validation failed'}
                  </h3>
                  <div className={`mt-1 text-xs leading-snug ${
                    validationResults.isValid ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {validationResults.isValid ? (
                      <>
                        <p>
                          Ready to import {validationResults.accountsCount} accounts for {validationResults.consumersCount} consumers
                        </p>
                        {validationResults.additionalColumns && validationResults.additionalColumns.length > 0 && (
                          <p className="mt-0.5">
                            Additional fields: {validationResults.additionalColumns.join(', ')}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-medium">Validation errors found:</p>
                        <ul className="mt-0.5 list-disc list-inside space-y-0.5">
                          {validationResults.validationErrors?.map((error: string, index: number) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                        <p className="mt-1 text-xs">
                          Please ensure your CSV includes: first_name, last_name, email, date_of_birth (YYYY-MM-DD format), filenumber
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
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
    </Dialog>
  );
}
