import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Shield, Clock, CreditCard, Lock, ChevronRight, Building2 } from "lucide-react";
import chainLogo from "@/assets/chain-logo.png";
import { getAgencySlugFromRequest } from "@shared/utils/subdomain";

export default function AgencyLanding() {
  const { agencySlug: pathSlug } = useParams();
  const [, setLocation] = useLocation();
  
  // Get agency slug from URL path first (for /agency/slug routes)
  // or from subdomain if on production domain
  let agencySlug = pathSlug;
  
  if (!agencySlug) {
    // Only try subdomain extraction if we're on the production domain
    const hostname = window.location.hostname;
    if (hostname.includes('chainsoftwaregroup.com')) {
      const extractedSlug = getAgencySlugFromRequest(hostname, window.location.pathname);
      agencySlug = extractedSlug || undefined;
    }
  }
  
  const [isLoading, setIsLoading] = useState(true);

  // Debug logging
  console.log('AgencyLanding - agencySlug:', agencySlug, 'pathSlug:', pathSlug);

  // Fetch agency information
  const { data: agencyData, isLoading: agencyLoading, error } = useQuery({
    queryKey: [`/api/public/agency/${agencySlug}`],
    enabled: !!agencySlug,
    retry: 1, // Only retry once to avoid excessive requests
  });

  useEffect(() => {
    if (!agencyLoading) {
      setIsLoading(false);
    }
    
    // Store agency context for the login page
    if (agencyData) {
      const { tenant } = agencyData as any;
      sessionStorage.setItem('agencyContext', JSON.stringify({
        slug: tenant.slug,
        name: tenant.name,
        id: tenant.id,
        logoUrl: (agencyData as any).tenantSettings?.customBranding?.logoUrl
      }));
    }
  }, [agencyLoading, agencyData]);

  const handleFindBalance = () => {
    // Navigate to consumer login with agency context
    setLocation('/consumer-login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !agencyData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Agency Not Found</h1>
          <p className="text-gray-600 mb-4">
            The agency link you're trying to access is invalid or has expired.
          </p>
          <Button onClick={() => setLocation("/")} data-testid="button-go-home">
            Go to Home Page
          </Button>
        </Card>
      </div>
    );
  }

  const { tenant, tenantSettings } = agencyData as any;
  const agencyName = tenant.name;
  const logoUrl = tenantSettings?.customBranding?.logoUrl;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            {logoUrl ? (
              <img src={logoUrl} alt={agencyName} className="h-20 object-contain" />
            ) : (
              <div className="flex items-center space-x-4">
                <img src={chainLogo} alt="Chain" className="h-16 object-contain" />
                <div className="border-l pl-4">
                  <h1 className="text-2xl font-bold text-gray-900">{agencyName}</h1>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-blue-600 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Welcome to the self-service portal for {agencyName}
          </h1>
          <p className="text-xl md:text-2xl mb-10 text-blue-100">
            View balances, make payments, & more.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-10 py-7 h-auto font-semibold shadow-lg hover:shadow-xl transition-all"
              onClick={handleFindBalance}
              data-testid="button-find-balance"
            >
              Find My Balance
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-blue-600 text-lg px-10 py-7 h-auto font-semibold shadow-lg hover:shadow-xl transition-all"
              onClick={() => setLocation('/consumer-register')}
              data-testid="button-register"
            >
              Create Account
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-10">
            <div className="flex space-x-6">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
                  <Lock className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-3 text-gray-900">Secure online payments</h3>
                <p className="text-gray-600 leading-relaxed">
                  Your security is our highest priority. All payment information is fully encrypted and never shared. 
                  We've partnered with industry leaders to provide bank-level protection.
                </p>
              </div>
            </div>

            <div className="flex space-x-6">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center">
                  <Clock className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-3 text-gray-900">Flexible payment plans</h3>
                <p className="text-gray-600 leading-relaxed">
                  Payment plan options may be available for certain balances. These plans allow balances to be paid off 
                  quickly or over time with a lower monthly payment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gray-50 py-20">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-12">
            Paying bills is hard enough. Our clean and simple platform makes it easier.
          </h2>
          <div className="flex justify-center">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-3xl">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  </div>
                  <div className="text-white text-sm font-medium">Secure Portal</div>
                </div>
              </div>
              <div className="p-8 bg-gradient-to-br from-gray-50 to-white">
                <div className="space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    <div className="bg-blue-50 rounded-lg p-6 text-center">
                      <CreditCard className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                      <div className="text-sm font-medium">Easy Payments</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-6 text-center">
                      <Shield className="h-8 w-8 text-green-600 mx-auto mb-2" />
                      <div className="text-sm font-medium">Secure & Safe</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-3xl p-10 md:p-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              First time here? This is what you'll need to know.
            </h2>
            <p className="text-gray-700 mb-6 leading-relaxed text-lg">
              To locate your balance, you'll be asked for some basic pieces of personal information. 
              This might include things like your name, date of birth, or ZIP code. This allows our 
              system to quickly and securely identify you and your balances.
            </p>
            <p className="text-gray-700 leading-relaxed text-lg">
              In addition to making sure your personal and financial information is always secure and 
              private, we strive to give you the best payment experience possible. After accessing your 
              balance, you'll find several convenient ways to pay including flexible payment options.
            </p>
          </div>
        </div>
      </div>

      {/* Trust Badges */}
      <div className="bg-gray-50 py-16 border-t">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-12 text-gray-600">
            <div className="flex items-center space-x-3">
              <Shield className="h-10 w-10 text-gray-400" />
              <span className="font-medium">Bank-Level Security</span>
            </div>
            <div className="flex items-center space-x-3">
              <Lock className="h-10 w-10 text-gray-400" />
              <span className="font-medium">SSL Encrypted</span>
            </div>
            <div className="flex items-center space-x-3">
              <CreditCard className="h-10 w-10 text-gray-400" />
              <span className="font-medium">PCI Compliant</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-900 text-white py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-6 md:mb-0">
              <p className="text-gray-400">© 2025 {agencyName}. All rights reserved.</p>
              <p className="text-sm text-gray-500 mt-1">Powered by Chain Software Group</p>
            </div>
            <div className="flex flex-wrap justify-center gap-6 text-sm">
              <button 
                onClick={handleFindBalance}
                className="hover:text-blue-400 transition-colors"
                data-testid="link-account-summary"
              >
                Account Summary
              </button>
              <button 
                onClick={handleFindBalance}
                className="hover:text-blue-400 transition-colors"
                data-testid="link-contact"
              >
                Contact Us
              </button>
              <button 
                onClick={handleFindBalance}
                className="hover:text-blue-400 transition-colors"
                data-testid="link-sign-in"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}