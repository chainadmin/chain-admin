import { Switch, Route } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MobileOptimizations } from "@/components/mobile-optimizations";
import { initializeDynamicContent, checkForUpdates, mobileConfig } from "@/lib/mobileConfig";
import "@/styles/mobile.css";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useAgencyContext } from "@/hooks/useAgencyContext";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import AdminDashboard from "@/pages/admin-dashboard";
import Consumers from "@/pages/consumers";
import Accounts from "@/pages/accounts";
import Settings from "@/pages/settings";
import Communications from "@/pages/communications";
import Requests from "@/pages/requests";
import Payments from "@/pages/payments";
import Billing from "@/pages/billing";
import CompanyManagement from "@/pages/company-management";
import ConsumerPortal from "@/pages/enhanced-consumer-portal";
import ConsumerLogin from "@/pages/consumer-login";
import ConsumerDashboard from "@/pages/consumer-dashboard";
import ConsumerRegistration from "@/pages/consumer-registration";
import ConsumerMobileLanding from "@/pages/consumer-mobile-landing";
import AgencyRegistration from "@/pages/agency-registration";
import AgencyLogin from "@/pages/agency-login";
import AgencyLanding from "@/pages/agency-landing";
import PrivacyPolicy from "@/pages/privacy-policy";
import TenantSetup from "@/components/tenant-setup";
import GlobalAdmin from "@/pages/global-admin";
import EmailTest from "@/pages/email-test";
import FixDatabase from "@/pages/fix-db";

function Router() {
  const { isAuthenticated, isLoading, user, isJwtAuth } = useAuth();
  const { agencySlug, agency, isLoading: agencyLoading } = useAgencyContext();
  const { toast } = useToast();
  const isMobileApp = mobileConfig.isNativePlatform;

  // Initialize dynamic content for mobile app
  useEffect(() => {
    const initMobileFeatures = async () => {
      if (isMobileApp) {
        // Initialize dynamic content
        await initializeDynamicContent();
        
        // Check for app updates
        const updateInfo = await checkForUpdates();
        if (updateInfo.needsUpdate) {
          toast({
            title: "Update Available",
            description: `Version ${updateInfo.version} is available. Please update for the best experience.`
          });
        }
      }
    };
    
    initMobileFeatures();
  }, [toast, isMobileApp]);

  // Check if user needs tenant setup (only for web admin)
  const needsTenantSetup = !isMobileApp && isAuthenticated && !(user as any)?.platformUser?.tenantId;

  // Mobile app routes - Consumer only
  if (isMobileApp) {
    return (
      <Switch>
        {isLoading ? (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading...</p>
            </div>
          </div>
        ) : (
          <>
            <Route path="/" component={ConsumerMobileLanding} />
            <Route path="/consumer-login" component={ConsumerLogin} />
            <Route path="/consumer-dashboard" component={ConsumerDashboard} />
            <Route path="/consumer/:tenantSlug/:email" component={ConsumerPortal} />
            <Route path="/register/:tenantSlug" component={ConsumerRegistration} />
            <Route path="/consumer-register" component={ConsumerRegistration} />
            <Route path="/agency/:agencySlug" component={AgencyLanding} />
            <Route path="/privacy-policy" component={PrivacyPolicy} />
            <Route component={ConsumerMobileLanding} />
          </>
        )}
      </Switch>
    );
  }

  // Web app routes - Full admin and consumer features
  return (
    <Switch>
      {isLoading ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      ) : isJwtAuth ? (
        // JWT authenticated users - redirect to admin
        <>
          <Route path="/" component={AdminDashboard} />
          <Route path="/dashboard" component={AdminDashboard} />
          <Route path="/admin-dashboard" component={AdminDashboard} />
          <Route path="/consumers" component={Consumers} />
          <Route path="/accounts" component={Accounts} />
          <Route path="/communications" component={Communications} />
          <Route path="/requests" component={Requests} />
          <Route path="/payments" component={Payments} />
          <Route path="/billing" component={Billing} />
          <Route path="/company" component={CompanyManagement} />
          <Route path="/settings" component={Settings} />
          <Route path="/agency-login" component={AgencyLogin} />
          <Route path="/agency-register" component={AgencyRegistration} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route component={NotFound} />
        </>
      ) : agencySlug && agency ? (
        // Agency-specific routes (subdomain detected)
        <>
          <Route path="/" component={AdminDashboard} />
          <Route path="/dashboard" component={AdminDashboard} />
          <Route path="/consumers" component={Consumers} />
          <Route path="/accounts" component={Accounts} />
          <Route path="/communications" component={Communications} />
          <Route path="/requests" component={Requests} />
          <Route path="/payments" component={Payments} />
          <Route path="/billing" component={Billing} />
          <Route path="/company" component={CompanyManagement} />
          <Route path="/settings" component={Settings} />
          <Route path="/consumer/:email" component={ConsumerPortal} />
          <Route path="/consumer-login" component={ConsumerLogin} />
          <Route path="/consumer-register" component={ConsumerRegistration} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route component={NotFound} />
        </>
      ) : !isAuthenticated ? (
        // Not authenticated - show public routes
        <>
          <Route path="/" component={Landing} />
          <Route path="/consumer-login" component={ConsumerLogin} />
          <Route path="/consumer-dashboard" component={ConsumerDashboard} />
          <Route path="/consumer/:tenantSlug/:email" component={ConsumerPortal} />
          <Route path="/register/:tenantSlug" component={ConsumerRegistration} />
          <Route path="/consumer-register" component={ConsumerRegistration} />
          <Route path="/agency-register" component={AgencyRegistration} />
          <Route path="/agency-login" component={AgencyLogin} />
          <Route path="/agency/:agencySlug" component={AgencyLanding} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route path="/fix-db" component={FixDatabase} />
          <Route path="/admin" component={GlobalAdmin} />
          <Route path="/Admin" component={GlobalAdmin} />
          <Route component={NotFound} />
        </>
      ) : needsTenantSetup ? (
        // Replit authenticated but needs tenant setup
        <Route path="*" component={TenantSetup} />
      ) : (
        // Replit authenticated with tenant - show admin routes
        <>
          <Route path="/" component={AdminDashboard} />
          <Route path="/admin-dashboard" component={AdminDashboard} />
          <Route path="/consumers" component={Consumers} />
          <Route path="/accounts" component={Accounts} />
          <Route path="/communications" component={Communications} />
          <Route path="/requests" component={Requests} />
          <Route path="/payments" component={Payments} />
          <Route path="/billing" component={Billing} />
          <Route path="/company" component={CompanyManagement} />
          <Route path="/settings" component={Settings} />
          <Route path="/admin" component={GlobalAdmin} />
          <Route path="/Admin" component={GlobalAdmin} />
          <Route path="/email-test" component={EmailTest} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route component={NotFound} />
        </>
      )}
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MobileOptimizations>
          <Toaster />
          <Router />
        </MobileOptimizations>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
