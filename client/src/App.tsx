import { Switch, Route } from "wouter";
import { useEffect } from "react";
import type { ComponentType, JSX } from "react";
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
import EmailInbox from "@/pages/email-inbox";
import Requests from "@/pages/requests";
import Payments from "@/pages/payments";
import Billing from "@/pages/billing";
import CompanyManagement from "@/pages/company-management";
import ConsumerPortal from "@/pages/enhanced-consumer-portal";
import ConsumerLogin from "@/pages/consumer-login";
import ConsumerDashboard from "@/pages/consumer-dashboard-simple";
import ConsumerRegistration from "@/pages/consumer-registration";
import ConsumerMobileLanding from "@/pages/consumer-mobile-landing";
import MobileAppLogin from "@/pages/mobile-app-login";
import AgencyRegistration from "@/pages/agency-registration";
import AgencyLogin from "@/pages/agency-login";
import AgencyLanding from "@/pages/agency-landing";
import PrivacyPolicy from "@/pages/privacy-policy";
import TermsOfService from "@/pages/terms-of-service";
import SmsOptInDisclosure from "@/pages/sms-opt-in";
import TenantSetup from "@/components/tenant-setup";
import GlobalAdmin from "@/pages/global-admin";
import EmailTest from "@/pages/email-test";
import FixDatabase from "@/pages/fix-db";

function Router() {
  const { isAuthenticated, isLoading, user, isJwtAuth } = useAuth();
  const { agencySlug, agency, isLoading: agencyLoading } = useAgencyContext();
  const { toast } = useToast();
  const isMobileApp = mobileConfig.isNativePlatform;
  const pathname = window.location.pathname;
  const adminRoutePaths = ["/admin", "/admin/", "/Admin", "/Admin/", "/global-admin", "/global-admin/"] as const;
  const createRouteElements = (
    paths: readonly string[],
    component: ComponentType<any>,
    keyPrefix: string
  ): JSX.Element[] =>
    paths.map((path) => {
      const sanitizedKey =
        path === "/"
          ? "root"
          : path
              .replace(/[^a-zA-Z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "") || "root";

      return (
        <Route
          key={`${keyPrefix}-${sanitizedKey}`}
          path={path}
          component={component}
        />
      );
    });
  const smsOptInPaths = ["/sms-opt-in", "/sms-opt-in-disclosure"] as const;
  const isSmsOptInRoute = smsOptInPaths.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
  const getSmsOptInRoutes = (prefix: string): JSX.Element[] =>
    smsOptInPaths.map((path) => {
      const normalizedKey = path.replace(/\//g, "-").replace(/^-/, "");
      return (
        <Route
          key={`${prefix}-${normalizedKey}`}
          path={path}
          component={SmsOptInDisclosure}
        />
      );
    });
  
  // Check if we're on a public route that doesn't need auth
  const isPublicRoute = pathname === '/agency-registration' ||
                       pathname === '/agency-register' ||
                       pathname === '/consumer-login' ||
                       pathname === '/consumer-dashboard' ||
                       pathname.startsWith('/consumer-register') ||
                       pathname === '/privacy-policy' ||
                       pathname === '/terms-of-service' ||
                       isSmsOptInRoute ||
                       pathname === '/' && agencySlug; // Agency subdomain homepage
  
  // Don't block public routes with auth loading
  const shouldShowLoader = isLoading && !isPublicRoute;
  

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

  // Check if user needs tenant setup (only for web admin using Replit auth, not JWT)
  // JWT users already have tenant info in their token, so they don't need setup
  const needsTenantSetup = !isMobileApp && isAuthenticated && !isJwtAuth && !(user as any)?.platformUser?.tenantId;
  
  // Check if we're on the main domain (not an agency subdomain)
  const hostname = window.location.hostname;
  
  // Main domain is ONLY the production domain without subdomain
  // Railway, localhost, and other dev URLs should support agency routing
  const isMainDomain = hostname === 'chainsoftwaregroup.com' || 
                       hostname === 'www.chainsoftwaregroup.com';

  // Mobile app routes - Consumer only
  const LoadingScreen = () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );

  if (isMobileApp) {
    const mobileRoutes: JSX.Element[] = [];

    if (isLoading) {
      mobileRoutes.push(
        <Route key="mobile-loading" path="/:rest*" component={LoadingScreen} />
      );
    } else {
      mobileRoutes.push(
        <Route key="mobile-home" path="/" component={isMobileApp ? MobileAppLogin : ConsumerMobileLanding} />,
        <Route key="mobile-consumer-login" path="/consumer-login" component={isMobileApp ? MobileAppLogin : ConsumerLogin} />,
        <Route key="mobile-consumer-dashboard" path="/consumer-dashboard" component={ConsumerDashboard} />,
        <Route
          key="mobile-consumer-portal"
          path="/consumer/:tenantSlug/:email"
          component={ConsumerPortal}
        />,
        <Route
          key="mobile-register"
          path="/register/:tenantSlug"
          component={ConsumerRegistration}
        />,
        <Route
          key="mobile-consumer-register"
          path="/consumer-register/:tenantSlug?"
          component={ConsumerRegistration}
        />,
        <Route key="mobile-agency" path="/agency/:agencySlug" component={AgencyLanding} />,
        <Route key="mobile-privacy" path="/privacy-policy" component={PrivacyPolicy} />,
        <Route key="mobile-terms" path="/terms-of-service" component={TermsOfService} />,
        ...getSmsOptInRoutes("mobile-sms")
      );

      mobileRoutes.push(
        <Route key="mobile-fallback" path="/:rest*" component={ConsumerMobileLanding} />
      );
    }

    return <Switch>{mobileRoutes}</Switch>;
  }

  if (shouldShowLoader) {
    return (
      <Switch>
        <Route key="web-loading" path="/:rest*" component={LoadingScreen} />
      </Switch>
    );
  }

  if (agencySlug && !isMainDomain) {
    const agencySubdomainRoutes: JSX.Element[] = [
      <Route key="agency-home" path="/" component={AgencyLanding} />,
      <Route key="agency-consumer" path="/consumer" component={ConsumerLogin} />,
      <Route key="agency-consumer-login" path="/consumer-login" component={ConsumerLogin} />,
      <Route
        key="agency-consumer-register"
        path="/consumer-register/:tenantSlug?"
        component={ConsumerRegistration}
      />,
      <Route key="agency-consumer-portal" path="/consumer/:email" component={ConsumerPortal} />,
      <Route
        key="agency-consumer-dashboard"
        path="/consumer-dashboard"
        component={ConsumerDashboard}
      />,
      <Route key="agency-privacy" path="/privacy-policy" component={PrivacyPolicy} />,
      <Route key="agency-terms" path="/terms-of-service" component={TermsOfService} />,
      ...getSmsOptInRoutes("agency-sms"),
      <Route key="agency-landing" path="/agency/:agencySlug" component={AgencyLanding} />,
      <Route key="agency-login" path="/agency-login" component={AgencyLogin} />,
      <Route
        key="agency-dashboard"
        path="/dashboard"
        component={isJwtAuth ? AdminDashboard : AgencyLogin}
      />,
      <Route
        key="agency-admin-dashboard"
        path="/admin-dashboard"
        component={isJwtAuth ? AdminDashboard : AgencyLogin}
      />,
      <Route
        key="agency-register"
        path="/agency-register"
        component={AgencyRegistration}
      />,
      <Route
        key="agency-registration"
        path="/agency-registration"
        component={AgencyRegistration}
      />
    ];

    if (isJwtAuth) {
      agencySubdomainRoutes.push(
        <Route key="agency-consumers" path="/consumers" component={Consumers} />,
        <Route key="agency-accounts" path="/accounts" component={Accounts} />,
        <Route
          key="agency-communications"
          path="/communications"
          component={Communications}
        />,
        <Route key="agency-email-inbox" path="/email-inbox" component={EmailInbox} />,
        <Route key="agency-requests" path="/requests" component={Requests} />,
        <Route key="agency-payments" path="/payments" component={Payments} />,
        <Route key="agency-billing" path="/billing" component={Billing} />,
        <Route key="agency-company" path="/company" component={CompanyManagement} />,
        <Route key="agency-settings" path="/settings" component={Settings} />
      );
    }

    agencySubdomainRoutes.push(
      <Route key="agency-fallback" path="/:rest*" component={NotFound} />
    );

    return <Switch>{agencySubdomainRoutes}</Switch>;
  }

  // Path-based routing disabled - using subdomain routing only
  // Keeping /agency/:slug for public landing pages only (backward compatibility)
  if (pathname.startsWith('/agency/')) {
    const agencyPathRoutes: JSX.Element[] = [
      <Route key="path-agency" path="/agency/:agencySlug" component={AgencyLanding} />,
      <Route key="path-consumer-login" path="/consumer-login" component={ConsumerLogin} />,
      <Route key="path-consumer-register" path="/consumer-register/:tenantSlug?" component={ConsumerRegistration} />,
      <Route key="path-privacy" path="/privacy-policy" component={PrivacyPolicy} />,
      <Route key="path-terms" path="/terms-of-service" component={TermsOfService} />,
      ...getSmsOptInRoutes("path-sms"),
      <Route key="path-fallback" path="/:rest*" component={AgencyLanding} />
    ];

    return <Switch>{agencyPathRoutes}</Switch>;
  }

  // JWT-authenticated users (agency login) should skip to the regular authenticated routes
  // This block was incorrectly catching them and treating them as main domain users

  if (!isAuthenticated) {
    const publicRoutes: JSX.Element[] = [
      <Route key="public-home" path="/" component={Landing} />,
      <Route key="public-consumer-login" path="/consumer-login" component={ConsumerLogin} />,
      <Route key="public-consumer-dashboard" path="/consumer-dashboard" component={ConsumerDashboard} />,
      <Route
        key="public-consumer-portal"
        path="/consumer/:tenantSlug/:email"
        component={ConsumerPortal}
      />,
      <Route
        key="public-register"
        path="/register/:tenantSlug"
        component={ConsumerRegistration}
      />,
      <Route
        key="public-consumer-register"
        path="/consumer-register/:tenantSlug?"
        component={ConsumerRegistration}
      />,
      <Route key="public-agency-register" path="/agency-register" component={AgencyRegistration} />,
      <Route key="public-agency-registration" path="/agency-registration" component={AgencyRegistration} />,
      <Route key="public-agency-login" path="/agency-login" component={AgencyLogin} />,
      <Route key="public-agency" path="/agency/:agencySlug" component={AgencyLanding} />,
      <Route key="public-privacy" path="/privacy-policy" component={PrivacyPolicy} />,
      <Route key="public-terms" path="/terms-of-service" component={TermsOfService} />,
      ...getSmsOptInRoutes("public-sms"),
      <Route key="public-fix-db" path="/fix-db" component={FixDatabase} />,
      ...createRouteElements(adminRoutePaths, GlobalAdmin, "public-admin"),
      <Route key="public-fallback" path="/:rest*" component={NotFound} />
    ];

    return <Switch>{publicRoutes}</Switch>;
  }

  if (needsTenantSetup) {
    return (
      <Switch>
        <Route key="tenant-setup" path="/:rest*" component={TenantSetup} />
      </Switch>
    );
  }

  const authenticatedRoutes: JSX.Element[] = [
    <Route key="auth-home" path="/" component={AdminDashboard} />,
    <Route key="auth-dashboard" path="/dashboard" component={AdminDashboard} />,
    <Route key="auth-admin-dashboard" path="/admin-dashboard" component={AdminDashboard} />,
    <Route key="auth-consumers" path="/consumers" component={Consumers} />,
    <Route key="auth-accounts" path="/accounts" component={Accounts} />,
    <Route key="auth-communications" path="/communications" component={Communications} />,
    <Route key="auth-email-inbox" path="/email-inbox" component={EmailInbox} />,
    <Route key="auth-requests" path="/requests" component={Requests} />,
    <Route key="auth-payments" path="/payments" component={Payments} />,
    <Route key="auth-billing" path="/billing" component={Billing} />,
    <Route key="auth-company" path="/company" component={CompanyManagement} />,
    <Route key="auth-settings" path="/settings" component={Settings} />,
    ...createRouteElements(adminRoutePaths, GlobalAdmin, "auth-admin"),
    <Route key="auth-agency-login" path="/agency-login" component={AgencyLogin} />,
    <Route key="auth-agency-register" path="/agency-register" component={AgencyRegistration} />,
    <Route key="auth-agency-registration" path="/agency-registration" component={AgencyRegistration} />,
    <Route key="auth-email-test" path="/email-test" component={EmailTest} />,
    <Route key="auth-agency" path="/agency/:agencySlug" component={AgencyLanding} />,
    <Route key="auth-privacy" path="/privacy-policy" component={PrivacyPolicy} />,
    <Route key="auth-terms" path="/terms-of-service" component={TermsOfService} />,
    ...getSmsOptInRoutes("auth-sms"),
    <Route key="auth-fallback" path="/:rest*" component={NotFound} />
  ];

  return <Switch>{authenticatedRoutes}</Switch>;
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
