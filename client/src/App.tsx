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
import ConsumerPortal from "@/pages/consumer-portal";
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
          <Route path="/consumer/:tenantSlug/:email" component={ConsumerPortal} />
        </>
      ) : needsTenantSetup ? (
        <Route path="*" component={TenantSetup} />
      ) : (
        <>
          <Route path="/" component={AdminDashboard} />
          <Route path="/consumers" component={Consumers} />
          <Route path="/accounts" component={Accounts} />
          <Route path="/import" component={ImportData} />
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
