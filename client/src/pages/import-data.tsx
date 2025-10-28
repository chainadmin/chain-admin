import AdminLayout from "@/components/admin-layout";
import ImportModal from "@/components/import-modal";
import { useState } from "react";

export default function ImportData() {
  const [showImportModal, setShowImportModal] = useState(true);

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0f172a] py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <h1 className="text-2xl font-bold text-blue-50">Import Data</h1>
          <p className="mt-1 text-sm text-blue-100/70">
            Upload account data via CSV
          </p>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-8">
          <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md shadow-lg p-6">
            <h2 className="text-lg font-medium text-blue-50 mb-4">CSV Import Instructions</h2>
            <div className="prose max-w-none text-blue-100/90">
              <p>Your CSV file should include the following columns:</p>
              
              <h4 className="text-md font-semibold text-blue-50 mt-4 mb-2">Required Columns:</h4>
              <ul className="text-blue-100/80">
                <li><strong className="text-blue-50">consumer_first_name</strong> - Consumer's first name</li>
                <li><strong className="text-blue-50">consumer_last_name</strong> - Consumer's last name</li>
                <li><strong className="text-blue-50">consumer_email</strong> - Consumer's email address</li>
                <li><strong className="text-blue-50">date_of_birth</strong> - Consumer's date of birth (YYYY-MM-DD format)</li>
                <li><strong className="text-blue-50">filenumber</strong> - File number (required for SMAX integration)</li>
                <li><strong className="text-blue-50">creditor</strong> - Name of the creditor</li>
                <li><strong className="text-blue-50">balance</strong> - Outstanding balance amount</li>
              </ul>

              <h4 className="text-md font-semibold text-blue-50 mt-4 mb-2">Optional Standard Columns:</h4>
              <ul className="text-blue-100/80">
                <li><strong className="text-blue-50">account_number</strong> - Account identifier</li>
                <li><strong className="text-blue-50">consumer_phone</strong> - Consumer's phone number</li>
                <li><strong className="text-blue-50">due_date</strong> - Due date (YYYY-MM-DD format)</li>
              </ul>

              <h4 className="text-md font-semibold text-blue-50 mt-4 mb-2">Additional Custom Columns:</h4>
              <p className="text-sm text-blue-100/70 mb-2">
                You can include any additional columns with custom data fields. Examples:
              </p>
              <ul className="text-blue-100/80">
                <li><strong className="text-blue-50">ssn</strong> - Social Security Number</li>
                <li><strong className="text-blue-50">date_of_birth</strong> - Date of birth</li>
                <li><strong className="text-blue-50">employer</strong> - Current employer</li>
                <li><strong className="text-blue-50">original_creditor</strong> - Original creditor name</li>
                <li><strong className="text-blue-50">charge_off_date</strong> - Date of charge-off</li>
                <li><strong className="text-blue-50">last_payment_date</strong> - Date of last payment</li>
                <li><strong className="text-blue-50">credit_score</strong> - Current credit score</li>
                <li><strong className="text-blue-50">notes</strong> - Additional notes</li>
              </ul>
              
              <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3 mt-4">
                <p className="text-sm text-sky-100">
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
