import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  clearConsumerAuth,
  getStoredConsumerSession,
  getStoredConsumerToken,
} from "@/lib/consumer-auth";
import { apiCall } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, LogOut, User, Building2, CreditCard, DollarSign, TrendingUp, Mail } from "lucide-react";
import chainLogo from "@/assets/chain-logo.png";

export default function ConsumerDashboardSimple() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [session, setSession] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [accountData, setAccountData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check authentication on mount
  useEffect(() => {
    const token = getStoredConsumerToken();
    const storedSession = getStoredConsumerSession();
    
    if (!token || !storedSession) {
      toast({
        title: "Please Sign In",
        description: "You need to sign in to view your dashboard.",
        variant: "destructive",
      });
      setLocation("/consumer-login");
      return;
    }
    
    setSession(storedSession);
    setMounted(true);
  }, [setLocation, toast]);

  // Fetch account data when mounted and authenticated
  useEffect(() => {
    if (!mounted || !session?.email) {
      return;
    }

    const fetchAccounts = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const token = getStoredConsumerToken();
        const encodedEmail = encodeURIComponent(session.email);
        const url = `/api/consumer/accounts/${encodedEmail}`;
        
        console.log('Fetching consumer accounts:', {
          url,
          token: token?.substring(0, 20) + '...',
          email: session.email
        });
        
        const response = await apiCall("GET", url, null, token);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to load accounts: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('Account data loaded:', data);
        setAccountData(data);
      } catch (err: any) {
        console.error('Error loading accounts:', err);
        setError(err.message || 'Failed to load account information');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, [mounted, session]);

  const handleLogout = () => {
    clearConsumerAuth();
    toast({
      title: "Signed Out",
      description: "You have been signed out successfully.",
    });
    setLocation("/consumer-login");
  };

  const handlePayment = (account: any) => {
    toast({
      title: "Payment Processing",
      description: "Payment functionality coming soon. Contact your agency for payment options.",
    });
  };

  // Don't render until we've checked auth
  if (!mounted || !session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-blue-100/70">Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-blue-100/70">Loading your account information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-white/10 bg-white/5 backdrop-blur">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-white mb-2">Unable to Load Dashboard</h1>
            <p className="text-blue-100/70 mb-4">
              We couldn't load your account information. Please try again or contact support.
            </p>
            <div className="space-y-2">
              <Button 
                onClick={() => window.location.reload()} 
                variant="outline" 
                className="w-full text-white border-white/20 hover:bg-white/10"
              >
                Retry
              </Button>
              <Button 
                onClick={handleLogout} 
                className="w-full bg-blue-500 hover:bg-blue-400"
              >
                Sign In Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const consumer = (accountData as any)?.consumer;
  const accounts = (accountData as any)?.accounts;
  const tenant = (accountData as any)?.tenant;
  const hasAccounts = accounts && accounts.length > 0;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  };

  const totalBalance = accounts?.reduce((sum: number, account: any) => 
    sum + (account.balanceCents || 0), 0) || 0;
    
  const getStatusStyle = (status?: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
      case "overdue":
        return "border-rose-400/30 bg-rose-500/10 text-rose-200";
      case "settled":
        return "border-slate-400/30 bg-slate-500/10 text-slate-200";
      default:
        return "border-amber-400/30 bg-amber-500/10 text-amber-200";
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Background gradients */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative border-b border-white/10 bg-slate-950/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={chainLogo} alt="Chain Software Group" className="h-10 w-auto" />
              <div>
                <p className="text-sm font-semibold text-white">
                  {tenant?.name || session.tenantSlug || "Consumer Portal"}
                </p>
                <p className="text-xs text-blue-100/70 flex items-center">
                  <User className="h-3 w-3 mr-1" />
                  {consumer?.firstName} {consumer?.lastName}
                </p>
              </div>
            </div>
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="text-white hover:bg-white/10"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/10 p-8 shadow-2xl shadow-blue-900/30">
          <div className="pointer-events-none absolute -right-10 top-10 h-56 w-56 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-6 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
          
          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100/80">
              Account Overview
            </span>
            <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
              Welcome back, {consumer?.firstName || 'Valued Customer'}
            </h1>
            <p className="mt-2 text-sm text-blue-100/70 sm:text-base">
              Review your account balances, make payments, and manage your obligations in one secure place.
            </p>

            {/* Summary Stats */}
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-blue-100/70 uppercase tracking-wider">Total Accounts</p>
                    <p className="mt-1 text-2xl font-bold text-white">{hasAccounts ? accounts.length : 0}</p>
                  </div>
                  <CreditCard className="h-8 w-8 text-blue-400/50" />
                </div>
              </div>
              
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-blue-100/70 uppercase tracking-wider">Total Balance</p>
                    <p className="mt-1 text-2xl font-bold text-white">{formatCurrency(totalBalance)}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-emerald-400/50" />
                </div>
              </div>
              
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-blue-100/70 uppercase tracking-wider">Contact Email</p>
                    <p className="mt-1 text-sm font-semibold text-white truncate">{consumer?.email || session.email}</p>
                  </div>
                  <Mail className="h-8 w-8 text-indigo-400/50" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Accounts List */}
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="flex items-center text-white">
              <CreditCard className="h-5 w-5 mr-2 text-blue-400" />
              Your Accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {!hasAccounts ? (
              <div className="text-center py-12">
                <CreditCard className="h-12 w-12 mx-auto mb-4 text-blue-400/30" />
                <p className="text-blue-100/70">No accounts found</p>
                <p className="text-sm text-blue-100/50 mt-2">
                  Contact your agency if you believe this is an error
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {accounts.map((account: any) => (
                  <div
                    key={account.id}
                    className="group rounded-xl border border-white/10 bg-white/5 p-6 hover:bg-white/10 transition-colors"
                    data-testid={`account-card-${account.id}`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-white text-lg">
                          {account.creditor || "Unknown Creditor"}
                        </h3>
                        <p className="text-sm text-blue-100/70 mt-1">
                          Account: {account.accountNumber || "N/A"}
                        </p>
                      </div>
                      <Badge 
                        className={`${getStatusStyle(account.status)} border`}
                        variant="outline"
                      >
                        {account.status || 'Unknown'}
                      </Badge>
                    </div>
                    
                    <div className="flex justify-between items-end">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-bold text-white">
                            {formatCurrency(account.balanceCents || 0)}
                          </span>
                          <span className="text-sm text-blue-100/50">Current Balance</span>
                        </div>
                        {account.dueDate && (
                          <p className="text-sm text-blue-100/70 mt-2">
                            Due: {new Date(account.dueDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      
                      <Button 
                        onClick={() => handlePayment(account)}
                        className="bg-emerald-500 hover:bg-emerald-400 text-white"
                        data-testid={`button-pay-${account.id}`}
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Pay Now
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact Info */}
        {tenant?.contactEmail && (
          <Card className="mt-6 border-white/10 bg-white/5 backdrop-blur">
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-blue-100/70">
                Questions about your account? Contact us at:{" "}
                <a 
                  href={`mailto:${tenant.contactEmail}`}
                  className="text-blue-400 hover:text-blue-300 underline"
                  data-testid="link-contact-email"
                >
                  {tenant.contactEmail}
                </a>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}