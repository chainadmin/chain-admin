import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import chainLogo from "@/assets/chain-logo.png";
import { Building2, User, CreditCard, MessageSquare, Shield, Clock } from "lucide-react";

export default function AgencyLanding() {
  const { agencySlug } = useParams();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(true);

  // Fetch agency information
  const { data: agencyData, isLoading: agencyLoading, error } = useQuery({
    queryKey: [`/api/public/agency/${agencySlug}`],
    enabled: !!agencySlug,
  });

  useEffect(() => {
    if (!agencyLoading) {
      setIsLoading(false);
    }
  }, [agencyLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading agency information...</p>
        </div>
      </div>
    );
  }

  if (error || !agencyData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Agency Not Found</h1>
            <p className="text-gray-600 mb-4">
              The agency link you're trying to access is invalid or has expired.
            </p>
            <Button onClick={() => setLocation("/")} data-testid="button-go-home">
              Go to Home Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { tenant, tenantSettings } = agencyData as any;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          {/* Agency Logo or Default */}
          <div className="flex items-center justify-center mb-6">
            {tenantSettings?.customBranding?.logoUrl ? (
              <img 
                src={tenantSettings.customBranding.logoUrl} 
                alt={tenant.name} 
                className="h-20 object-contain"
              />
            ) : (
              <div className="flex items-center">
                <img src={chainLogo} alt="Chain Software Group" className="h-16 object-contain mr-4" />
                <div className="text-left">
                  <h2 className="text-3xl font-bold text-gray-900">{tenant.name}</h2>
                  <p className="text-sm text-gray-600">Powered by Chain</p>
                </div>
              </div>
            )}
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to {tenant.name}
          </h1>
          
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Access your account information securely or create a new account to get started
          </p>

          {/* Main Action Buttons */}
          <div className="space-y-4 sm:space-y-0 sm:space-x-4 sm:flex sm:justify-center">
            <Button 
              size="lg"
              onClick={() => {
                // Store agency info in session storage for the login page
                sessionStorage.setItem('agencyContext', JSON.stringify({
                  slug: tenant.slug,
                  name: tenant.name
                }));
                setLocation('/consumer-login');
              }}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
              data-testid="button-access-account"
            >
              <User className="mr-2 h-5 w-5" />
              Access Your Account
            </Button>
            <Button 
              size="lg"
              variant="outline"
              onClick={() => {
                // Store agency info for registration
                sessionStorage.setItem('agencyContext', JSON.stringify({
                  slug: tenant.slug,
                  name: tenant.name
                }));
                setLocation('/consumer-register');
              }}
              className="border-blue-600 text-blue-600 hover:bg-blue-50 w-full sm:w-auto"
              data-testid="button-create-account"
            >
              <User className="mr-2 h-5 w-5" />
              Create New Account
            </Button>
          </div>

          {/* Contact Information */}
          {(tenantSettings?.contactEmail || tenantSettings?.contactPhone) && (
            <div className="mt-8 p-4 bg-white rounded-lg shadow-sm max-w-md mx-auto">
              <p className="text-sm text-gray-600 mb-2">Need assistance? Contact us:</p>
              <div className="space-y-1">
                {tenantSettings.contactEmail && (
                  <p className="text-sm text-gray-800">
                    Email: <a href={`mailto:${tenantSettings.contactEmail}`} className="text-blue-600 hover:underline">
                      {tenantSettings.contactEmail}
                    </a>
                  </p>
                )}
                {tenantSettings.contactPhone && (
                  <p className="text-sm text-gray-800">
                    Phone: <a href={`tel:${tenantSettings.contactPhone}`} className="text-blue-600 hover:underline">
                      {tenantSettings.contactPhone}
                    </a>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="text-blue-500 mr-3 h-5 w-5" />
                Secure Access
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Your information is protected with industry-standard security. Access your accounts safely anytime.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="text-blue-500 mr-3 h-5 w-5" />
                Easy Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Make secure online payments and set up payment plans that work for your budget.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="text-blue-500 mr-3 h-5 w-5" />
                24/7 Access
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                View your account information and make payments at your convenience, any time of day.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Privacy and Terms Links */}
        {(tenantSettings?.privacyPolicy || tenantSettings?.termsOfService) && (
          <div className="text-center mt-12 pt-8 border-t border-gray-200">
            <div className="space-x-4 text-sm">
              {tenantSettings.privacyPolicy && (
                <a href="#" className="text-gray-600 hover:text-gray-900">
                  Privacy Policy
                </a>
              )}
              {tenantSettings.termsOfService && (
                <a href="#" className="text-gray-600 hover:text-gray-900">
                  Terms of Service
                </a>
              )}
            </div>
          </div>
        )}

        {/* Small footer link back to main site */}
        <div className="text-center mt-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/")}
            className="text-gray-500 hover:text-gray-700"
            data-testid="button-main-site"
          >
            ← Back to Main Site
          </Button>
        </div>
      </div>
    </div>
  );
}