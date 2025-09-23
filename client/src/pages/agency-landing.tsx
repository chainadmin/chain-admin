import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Shield, Clock, CreditCard, Lock, ChevronRight } from "lucide-react";
import chainLogo from "@/assets/chain-logo.png";
import { getAgencySlugFromRequest } from "@shared/utils/subdomain";
import { resolvePolicyContent } from "./agency-policy-utils";

interface AgencyBranding {
  agencyName: string;
  agencySlug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  contactEmail: string | null;
  contactPhone: string | null;
  hasPrivacyPolicy: boolean;
  hasTermsOfService: boolean;
  privacyPolicy: string | null;
  termsOfService: string | null;
}

export default function AgencyLanding() {
  const { agencySlug: pathSlug } = useParams();
  const [, setLocation] = useLocation();
  
  // Get agency slug from URL path (for /agency/slug routes) 
  let agencySlug = pathSlug;
  
  // If no path slug, check for subdomain on production
  if (!agencySlug) {
    const hostname = window.location.hostname;
    if (hostname.includes('chainsoftwaregroup.com')) {
      const extractedSlug = getAgencySlugFromRequest(hostname, window.location.pathname);
      agencySlug = extractedSlug || undefined;
    }
  }
  
  // If still no agency slug, default to waypoint-solutions for testing
  if (!agencySlug) {
    console.log('Warning: No agency slug found, using default waypoint-solutions');
    agencySlug = 'waypoint-solutions';
  }
  
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const [termsContent, setTermsContent] = useState("");
  const [privacyContent, setPrivacyContent] = useState("");

  const fallbackBranding = useMemo(() => {
    const resolvedSlug = agencySlug || "test-agency";
    const fallbackName = resolvedSlug === "waypoint-solutions" ? "Waypoint Solutions" : "Test Agency";

    return {
      tenant: {
        id: "fallback-id",
        name: fallbackName,
        slug: resolvedSlug,
      },
      tenantSettings: {
        contactEmail: "info@example.com",
        contactPhone: "1234567890",
        customBranding: {},
        termsOfService: "",
        privacyPolicy: "",
      },
    };
  }, [agencySlug]);

  console.log('AgencyLanding rendering with slug:', agencySlug);

  // Fetch agency information
  const { data: agencyData, isLoading: agencyLoading, error } = useQuery<AgencyBranding>({
    queryKey: [`/api/public/agency-branding?slug=${agencySlug}`],
    enabled: !!agencySlug,
    retry: 1, // Only retry once to avoid excessive requests
  });

  useEffect(() => {
    console.log('AgencyLanding data status:', {
      agencyLoading,
      error,
      hasData: !!agencyData,
      agencyData
    });

    // Store agency context for the login page
    if (agencyData) {
      sessionStorage.setItem('agencyContext', JSON.stringify({
        slug: agencyData.agencySlug,
        name: agencyData.agencyName,
        logoUrl: agencyData.logoUrl
      }));
    }
  }, [agencyLoading, agencyData, error]);

  useEffect(() => {
    const fallbackSource = {
      termsOfService: ((fallbackBranding.tenantSettings as any)?.termsOfService as string | undefined) ?? "",
      privacyPolicy: ((fallbackBranding.tenantSettings as any)?.privacyPolicy as string | undefined) ?? "",
    };

    const { termsContent: resolvedTerms, privacyContent: resolvedPrivacy } = resolvePolicyContent({
      primary: agencyData
        ? {
            termsOfService: agencyData.termsOfService,
            privacyPolicy: agencyData.privacyPolicy,
          }
        : undefined,
      fallback: fallbackSource,
    });

    setTermsContent(resolvedTerms);
    setPrivacyContent(resolvedPrivacy);
  }, [agencyData, fallbackBranding]);

  const hasTermsContent = termsContent.trim().length > 0;
  const hasPrivacyContent = privacyContent.trim().length > 0;

  useEffect(() => {
    if (!hasTermsContent && showTermsDialog) {
      setShowTermsDialog(false);
    }

    if (!hasPrivacyContent && showPrivacyDialog) {
      setShowPrivacyDialog(false);
    }
  }, [hasTermsContent, hasPrivacyContent, showTermsDialog, showPrivacyDialog]);

  const handleFindBalance = () => {
    // Navigate to consumer login with agency context
    setLocation('/consumer-login');
  };

  if (agencyLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Use fallback data if API fetch fails
  if (error || !agencyData) {
    console.log(`Using fallback data for ${agencySlug}`);
    // Always use fallback data when API fails
    const { tenant, tenantSettings } = fallbackBranding;
    const agencyName = tenant.name;
    const logoUrl = (tenantSettings?.customBranding as any)?.logoUrl;
    const contactEmail = (tenantSettings as any)?.contactEmail;
    const contactPhone = (tenantSettings as any)?.contactPhone;

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
          {/* Header */}
          <div className="bg-white border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <img src={chainLogo} alt="Chain" className="h-16 object-contain" />
                  <div className="border-l pl-4">
                    <h1 className="text-2xl font-bold text-gray-900">{agencyName}</h1>
                  </div>
                </div>
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
                  onClick={() => setLocation(`/consumer-register/${agencySlug}`)}
                  data-testid="button-register"
                >
                  Create Account
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Features Section - Coming soon */}
          
          {/* Footer */}
          <div className="bg-gray-900 text-white py-12 mt-20">
            <div className="max-w-6xl mx-auto px-4">
              <div className="flex flex-col md:flex-row justify-between items-center">
                <div className="mb-6 md:mb-0">
                  <p className="text-gray-400">© 2025 {agencyName}. All rights reserved.</p>
                  <p className="text-sm text-gray-500 mt-1">Powered by Chain Software Group</p>
                </div>
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="flex flex-wrap justify-center gap-6 text-sm">
                    <button
                      onClick={handleFindBalance}
                      className="hover:text-blue-400 transition-colors"
                      data-testid="link-account-summary"
                    >
                      Account Summary
                    </button>
                    {hasTermsContent && (
                      <button
                        onClick={() => setShowTermsDialog(true)}
                        className="hover:text-blue-400 transition-colors"
                        data-testid="link-terms"
                      >
                        Terms of Service
                      </button>
                    )}
                    {hasPrivacyContent && (
                      <button
                        onClick={() => setShowPrivacyDialog(true)}
                        className="hover:text-blue-400 transition-colors"
                        data-testid="link-privacy"
                      >
                        Privacy Policy
                      </button>
                    )}
                    {(contactEmail || contactPhone) && (
                      <button 
                        onClick={() => {
                          if (contactEmail) {
                            window.location.href = `mailto:${contactEmail}`;
                          } else if (contactPhone) {
                            window.location.href = `tel:${contactPhone}`;
                          }
                        }}
                        className="hover:text-blue-400 transition-colors"
                        data-testid="link-contact"
                      >
                        Contact Us
                      </button>
                    )}
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
        </div>
      );
  }

  // Use the flat structure from the API response
  const agencyName = agencyData.agencyName;
  const logoUrl = agencyData.logoUrl;
  const contactEmail = agencyData.contactEmail;
  const contactPhone = agencyData.contactPhone;

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
              onClick={() => setLocation(`/consumer-register/${agencySlug}`)}
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
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex flex-wrap justify-center gap-6 text-sm">
                <button 
                  onClick={handleFindBalance}
                  className="hover:text-blue-400 transition-colors"
                  data-testid="link-account-summary"
                >
                  Account Summary
                </button>
                {hasTermsContent && (
                  <button
                    onClick={() => setShowTermsDialog(true)}
                    className="hover:text-blue-400 transition-colors"
                    data-testid="link-terms"
                  >
                    Terms of Service
                  </button>
                )}
                {hasPrivacyContent && (
                  <button
                    onClick={() => setShowPrivacyDialog(true)}
                    className="hover:text-blue-400 transition-colors"
                    data-testid="link-privacy"
                  >
                    Privacy Policy
                  </button>
                )}
                {(contactEmail || contactPhone) && (
                  <button 
                    onClick={() => {
                      if (contactEmail) {
                        window.location.href = `mailto:${contactEmail}`;
                      } else if (contactPhone) {
                        window.location.href = `tel:${contactPhone}`;
                      }
                    }}
                    className="hover:text-blue-400 transition-colors"
                    data-testid="link-contact"
                  >
                    Contact Us
                  </button>
                )}
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

      {/* Terms of Service Dialog */}
      <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Terms of Service</DialogTitle>
            <DialogDescription className="mt-4 whitespace-pre-wrap">
              {termsContent}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Privacy Policy Dialog */}
      <Dialog open={showPrivacyDialog} onOpenChange={setShowPrivacyDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Privacy Policy</DialogTitle>
            <DialogDescription className="mt-4 whitespace-pre-wrap">
              {privacyContent}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}