import AdminLayout from "@/components/admin-layout";
import ImportModal from "@/components/import-modal";
import { useState } from "react";

export default function ImportData() {
  const [showImportModal, setShowImportModal] = useState(true);

  return (
    <AdminLayout>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Import Data</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload account data via CSV
          </p>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-8">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">CSV Import Instructions</h2>
            <div className="prose max-w-none">
              <p>Your CSV file should include the following columns:</p>
              
              <h4 className="text-md font-semibold text-gray-800 mt-4 mb-2">Required Columns:</h4>
              <ul>
                <li><strong>consumer_first_name</strong> - Consumer's first name</li>
                <li><strong>consumer_last_name</strong> - Consumer's last name</li>
                <li><strong>consumer_email</strong> - Consumer's email address</li>
                <li><strong>account_number</strong> - Account identifier</li>
                <li><strong>creditor</strong> - Name of the creditor</li>
                <li><strong>balance</strong> - Outstanding balance amount</li>
              </ul>

              <h4 className="text-md font-semibold text-gray-800 mt-4 mb-2">Optional Standard Columns:</h4>
              <ul>
                <li><strong>consumer_phone</strong> - Consumer's phone number</li>
                <li><strong>due_date</strong> - Due date (YYYY-MM-DD format)</li>
              </ul>

              <h4 className="text-md font-semibold text-gray-800 mt-4 mb-2">Additional Custom Columns:</h4>
              <p className="text-sm text-gray-600 mb-2">
                You can include any additional columns with custom data fields. Examples:
              </p>
              <ul>
                <li><strong>ssn_last4</strong> - Last four digits of the Social Security Number</li>
                <li><strong>date_of_birth</strong> - Date of birth</li>
                <li><strong>employer</strong> - Current employer</li>
                <li><strong>original_creditor</strong> - Original creditor name</li>
                <li><strong>charge_off_date</strong> - Date of charge-off</li>
                <li><strong>last_payment_date</strong> - Date of last payment</li>
                <li><strong>credit_score</strong> - Current credit score</li>
                <li><strong>notes</strong> - Additional notes</li>
              </ul>
              
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mt-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 Tip:</strong> All additional columns will be stored and available for use in email templates, 
                  consumer portal displays, and reporting. Use clear, descriptive column names.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ImportModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)} 
      />
    </AdminLayout>
  );
}
