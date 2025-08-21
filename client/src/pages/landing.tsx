import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-link text-white text-xl"></i>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 ml-4">Chain</h1>
          </div>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Multi-tenant debt collection platform for agencies to manage accounts, engage consumers, and streamline collections
          </p>
          <Button 
            size="lg" 
            onClick={() => window.location.href = '/api/login'}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Sign In to Your Agency Dashboard
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <i className="fas fa-users text-blue-500 mr-3"></i>
                Consumer Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Organize and track all consumer accounts in one unified platform with detailed contact preferences and history.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <i className="fas fa-upload text-blue-500 mr-3"></i>
                Bulk Import
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Seamlessly import account data via CSV upload with validation and automated consumer profile creation.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <i className="fas fa-mobile-alt text-blue-500 mr-3"></i>
                Consumer Portal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Provide consumers with mobile-friendly access to view their accounts, make payments, and communicate securely.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-16">
          <p className="text-gray-500">
            Need consumer access? Contact your agency for your personalized portal link.
          </p>
        </div>
      </div>
    </div>
  );
}
