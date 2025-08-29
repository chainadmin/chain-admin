import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import AdminDashboard from "@/pages/admin-dashboard";
import Consumers from "@/pages/consumers";
import Accounts from "@/pages/accounts";
import ImportData from "@/pages/import-data";
import Settings from "@/pages/settings";
import Emails from "@/pages/emails";
import Requests from "@/pages/requests";
import Payments from "@/pages/payments";
import CompanyManagement from "@/pages/company-management";
import ConsumerPortal from "@/pages/enhanced-consumer-portal";
import ConsumerLogin from "@/pages/consumer-login";
import ConsumerDashboard from "@/pages/consumer-dashboard";
import ConsumerRegistration from "@/pages/consumer-registration";
import TenantSetup from "@/components/tenant-setup";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  // Check if user needs tenant setup
  const needsTenantSetup = isAuthenticated && !(user as any)?.platformUser?.tenantId;

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/consumer-login" component={ConsumerLogin} />
          <Route path="/consumer-dashboard" component={ConsumerDashboard} />
          <Route path="/consumer/:tenantSlug/:email" component={ConsumerPortal} />
          <Route path="/register/:tenantSlug" component={ConsumerRegistration} />
        </>
      ) : needsTenantSetup ? (
        <Route path="*" component={TenantSetup} />
      ) : (
        <>
          <Route path="/" component={AdminDashboard} />
          <Route path="/consumers" component={Consumers} />
          <Route path="/accounts" component={Accounts} />
          <Route path="/import" component={ImportData} />
          <Route path="/emails" component={Emails} />
          <Route path="/requests" component={Requests} />
          <Route path="/payments" component={Payments} />
          <Route path="/company" component={CompanyManagement} />
          <Route path="/settings" component={Settings} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
