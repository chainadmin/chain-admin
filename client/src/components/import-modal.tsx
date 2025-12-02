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
        // Normalize headers: lowercase, remove quotes, remove spaces and underscores for matching
        const rawHeaders = parseCSVLine(lines[0]);
        const headers = rawHeaders.map(h => h.toLowerCase().replace(/['"]/g, '').trim());
        
        // Debug: log headers to console
        console.log('CSV Headers (raw):', rawHeaders);
        console.log('CSV Headers (normalized):', headers);
        
        // Helper function to get value from row with flexible column matching
        const getColumnValue = (row: any, ...possibleNames: string[]): string => {
          // First, try exact matches
          for (const name of possibleNames) {
            if (row[name] !== undefined && row[name] !== '') return row[name];
          }
          // Then try matching against all row keys (for partial matches)
          const rowKeys = Object.keys(row);
          for (const name of possibleNames) {
            const normalizedName = name.replace(/[_\s]/g, '');
            for (const key of rowKeys) {
              const normalizedKey = key.replace(/[_\s]/g, '');
              if (normalizedKey === normalizedName && row[key] !== undefined && row[key] !== '') {
                return row[key];
              }
            }
          }
          return '';
        };
        
        // Special helper for date of birth - looks for any column containing 'birth' or 'dob'
        const getDOBValue = (row: any): string => {
          const rowKeys = Object.keys(row);
          for (const key of rowKeys) {
            const lowerKey = key.toLowerCase();
            if ((lowerKey.includes('birth') || lowerKey === 'dob' || lowerKey.includes('dateofbirth')) 
                && row[key] !== undefined && row[key] !== '') {
              return row[key];
            }
          }
          return '';
        };
        
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
          'balance', 'amount', 'amount_due', 'balancedue', 'balance_due', 'totaldue', 'total_due',
          'due_date', 'duedate',
          'status', 'statusname', 'status_name', 'accountstatus', 'account_status'
        ];
        
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const row: any = {};
          
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          // Extract consumer data using flexible column matching
          const consumerKey = getColumnValue(row, 'consumer_email', 'email', 'emailaddress', 'email_address');
          if (consumerKey && !consumers.has(consumerKey)) {
            // Extract date of birth from various possible column names
            const dobValue = getColumnValue(row, 'date_of_birth', 'dob', 'dateofbirth', 'consumer_dob', 
                           'consumer_date_of_birth', 'birthdate', 'birth_date');
            
            // Debug: log first consumer's DOB value
            if (consumers.size === 0) {
              console.log('First row data:', row);
              console.log('DOB value extracted:', dobValue);
            }
            
            // Extract phone from various possible column names (prefer primary, then cell, then others)
            const phoneValue = getColumnValue(row, 'consumer_phone', 'phone', 'primaryphone', 'primary_phone',
                             'cellphone', 'cell_phone', 'workphone', 'alternatephone');
            
            // Extract address fields
            const addressValue = getColumnValue(row, 'address', 'consumer_address', 'street', 'street_address');
            const cityValue = getColumnValue(row, 'city', 'consumer_city');
            const stateValue = getColumnValue(row, 'state', 'consumer_state');
            const zipValue = getColumnValue(row, 'zip_code', 'zipcode', 'zip', 
                           'consumer_zip', 'consumer_zip_code', 'postalcode', 'postal_code');
            
            // Extract SSN last 4 digits (from full SSN or just last 4)
            const ssnRaw = getColumnValue(row, 'socialsecuritynumber', 'ssn', 'social_security_number', 
                          'ssn_last4', 'ssnlast4');
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
            const firstName = getColumnValue(row, 'consumer_first_name', 'first_name', 'firstname', 'fname');
            const lastName = getColumnValue(row, 'consumer_last_name', 'last_name', 'lastname', 'lname');

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
          const creditorValue = getColumnValue(row, 'creditor', 'originalcreditor', 'original_creditor', 'client', 'clientname');
          const balanceValue = getColumnValue(row, 'balance', 'amount', 'amount_due', 'balancedue', 'balance_due', 'totaldue', 'total_due');
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
              accountNumber: getColumnValue(row, 'account_number', 'account', 'accountnumber'),
              filenumber: getColumnValue(row, 'filenumber', 'file_number', 'fileno'),
              creditor: creditorValue,
              balanceCents: Math.round(parseFloat(balanceValue.replace(/[^0-9.-]/g, '')) * 100),
              dueDate: getColumnValue(row, 'due_date', 'duedate'),
              status: getColumnValue(row, 'status', 'statusname', 'status_name', 'accountstatus', 'account_status'),
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
    </Dialog>
  );
}
