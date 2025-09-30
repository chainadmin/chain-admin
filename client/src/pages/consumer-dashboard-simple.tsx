import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  clearConsumerAuth,
  getStoredConsumerSession,
  getStoredConsumerToken,
} from "@/lib/consumer-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, LogOut, User, Building2, CreditCard } from "lucide-react";

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
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

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

  // Don't render until we've checked auth
  if (!mounted || !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your account information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load Dashboard</h1>
            <p className="text-gray-600 mb-4">
              We couldn't load your account information. Please try again or contact support.
            </p>
            <div className="space-y-2">
              <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
                Retry
              </Button>
              <Button onClick={handleLogout} className="w-full">
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Building2 className="h-8 w-8" />
              <div>
                <h1 className="text-xl font-semibold">
                  {tenant?.name || session.tenantSlug || "Account Portal"}
                </h1>
                <p className="text-sm opacity-90 flex items-center">
                  <User className="h-3 w-3 mr-1" />
                  {consumer?.firstName} {consumer?.lastName}
                </p>
              </div>
            </div>
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="text-white hover:bg-white/20"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-4 mt-6">
        {/* Summary Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Account Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {hasAccounts ? accounts.length : 0}
                </div>
                <div className="text-sm text-gray-500">Total Accounts</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(totalBalance)}
                </div>
                <div className="text-sm text-gray-500">Total Balance</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {consumer?.email || session.email}
                </div>
                <div className="text-sm text-gray-500">Contact Email</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Accounts List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CreditCard className="h-5 w-5 mr-2" />
              Your Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!hasAccounts ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No accounts found</p>
                <p className="text-sm text-gray-400 mt-2">
                  Contact your agency if you believe this is an error
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {accounts.map((account: any) => (
                  <div
                    key={account.id}
                    className="border rounded-lg p-4 hover:bg-gray-50"
                    data-testid={`account-card-${account.id}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {account.creditor || "Unknown Creditor"}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Account: {account.accountNumber || "N/A"}
                        </p>
                      </div>
                      <Badge variant={
                        account.status?.toLowerCase() === 'active' ? 'default' :
                        account.status?.toLowerCase() === 'overdue' ? 'destructive' :
                        'secondary'
                      }>
                        {account.status || 'Unknown'}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-lg font-bold text-gray-900">
                          {formatCurrency(account.balanceCents || 0)}
                        </div>
                        <div className="text-xs text-gray-500">Current Balance</div>
                      </div>
                      {account.dueDate && (
                        <div className="text-right">
                          <div className="text-sm text-gray-600">
                            Due: {new Date(account.dueDate).toLocaleDateString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact Info */}
        {tenant?.contactEmail && (
          <Card className="mt-6">
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-gray-600">
                Questions? Contact us at:{" "}
                <a 
                  href={`mailto:${tenant.contactEmail}`}
                  className="text-blue-600 hover:underline"
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