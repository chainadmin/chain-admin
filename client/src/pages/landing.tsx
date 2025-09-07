import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import chainLogo from "@/assets/chain-logo.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <img src={chainLogo} alt="Chain Software Group" className="h-16 object-contain" />
          </div>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Find your account to get started
          </p>
          <div className="space-x-4">
            <Button 
              size="lg"
              onClick={() => window.location.href = '/consumer-login'}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-consumer-login"
            >
              <i className="fas fa-user mr-2"></i>
              Access Your Account
            </Button>
            <Button 
              size="lg"
              variant="outline"
              onClick={() => window.location.href = '/consumer-register'}
              className="border-blue-600 text-blue-600 hover:bg-blue-50"
              data-testid="button-consumer-register"
            >
              <i className="fas fa-user-plus mr-2"></i>
              Create Account
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <i className="fas fa-eye text-blue-500 mr-3"></i>
                View Your Accounts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Access all your account information in one place. View balances, payment history, and important details.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <i className="fas fa-credit-card text-blue-500 mr-3"></i>
                Make Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Securely make payments online at your convenience. Set up payment plans and track your progress.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <i className="fas fa-comments text-blue-500 mr-3"></i>
                Stay Connected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Receive important updates about your accounts and communicate securely with your service provider.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Agency Portal Access - Discrete bottom link */}
        <div className="text-center mt-16 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500 mb-4">
            Are you an agency looking to use our platform?
          </p>
          <div className="space-x-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => window.location.href = '/agency-register'}
              data-testid="button-agency-register"
            >
              Start Free Trial
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                // In development, redirect to admin panel directly
                if (window.location.hostname === 'localhost' || window.location.hostname.includes('replit.dev')) {
                  window.location.href = '/admin';
                } else {
                  window.location.href = '/agency-login';
                }
              }}
              data-testid="button-agency-login"
            >
              Agency Login
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
