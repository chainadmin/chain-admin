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
              <ul>
                <li><strong>consumer_first_name</strong> - Consumer's first name</li>
                <li><strong>consumer_last_name</strong> - Consumer's last name</li>
                <li><strong>consumer_email</strong> - Consumer's email address</li>
                <li><strong>consumer_phone</strong> - Consumer's phone number (optional)</li>
                <li><strong>account_number</strong> - Account identifier</li>
                <li><strong>creditor</strong> - Name of the creditor</li>
                <li><strong>balance</strong> - Outstanding balance amount</li>
                <li><strong>due_date</strong> - Due date (YYYY-MM-DD format, optional)</li>
              </ul>
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
