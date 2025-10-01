import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, LogOut, User, Building2, CreditCard, DollarSign, TrendingUp, Mail, Phone, Edit, FileText, MessageSquare, Calendar } from "lucide-react";
import chainLogo from "@/assets/chain-logo.png";

export default function ConsumerDashboardSimple() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [session, setSession] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [accountData, setAccountData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });

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
        
        const response = await apiCall("GET", url, null, token);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to load accounts: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        setAccountData(data);
        
        // Set edit form with current data
        const consumer = data.consumer;
        if (consumer) {
          setEditForm({
            firstName: consumer.firstName || "",
            lastName: consumer.lastName || "",
            phone: consumer.phone || "",
            address: consumer.address || "",
            city: consumer.city || "",
            state: consumer.state || "",
            zipCode: consumer.zipCode || "",
          });
        }
      } catch (err: any) {
        console.error('Error loading accounts:', err);
        setError(err.message || 'Failed to load account information');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, [mounted, session]);

  // Fetch agency branding
  const { data: agencyBranding } = useQuery({
    queryKey: [`/api/public/agency-branding?slug=${session?.tenantSlug}`],
    enabled: !!session?.tenantSlug,
    retry: 1,
  });

  // Fetch documents and communication history
  const { data: documents } = useQuery({
    queryKey: [`/api/consumer/documents/${session?.email}?tenantSlug=${session?.tenantSlug}`],
    queryFn: async () => {
      const token = getStoredConsumerToken();
      const response = await apiCall("GET", `/api/consumer/documents/${session?.email}?tenantSlug=${session?.tenantSlug}`, null, token);
      if (!response.ok) throw new Error("Failed to fetch documents");
      return response.json();
    },
    enabled: !!session?.email && !!session?.tenantSlug,
  });

  // Fetch payment arrangements
  const { data: arrangements } = useQuery({
    queryKey: [`/api/consumer/arrangements/${session?.email}?tenantSlug=${session?.tenantSlug}`],
    queryFn: async () => {
      const token = getStoredConsumerToken();
      const response = await apiCall("GET", `/api/consumer/arrangements/${session?.email}?tenantSlug=${session?.tenantSlug}`, null, token);
      if (!response.ok) throw new Error("Failed to fetch arrangements");
      return response.json();
    },
    enabled: !!session?.email && !!session?.tenantSlug,
  });

  const handleLogout = () => {
    const agencySlug = session?.tenantSlug;
    clearConsumerAuth();
    toast({
      title: "Signed Out",
      description: "You have been signed out successfully.",
    });
    // Redirect to agency branded landing page
    setLocation(agencySlug ? `/${agencySlug}` : "/consumer-login");
  };

  const handlePayment = (account: any) => {
    toast({
      title: "Payment Processing",
      description: "Payment functionality coming soon. Contact your agency for payment options.",
    });
  };

  const handleEditProfile = async () => {
    try {
      const token = getStoredConsumerToken();
      const response = await apiCall("PATCH", `/api/consumer/profile`, editForm, token);
      
      if (!response.ok) {
        throw new Error("Failed to update profile");
      }
      
      toast({
        title: "Profile Updated",
        description: "Your information has been updated successfully.",
      });
      
      setShowEditDialog(false);
      
      // Refresh account data
      window.location.reload();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update profile",
        variant: "destructive",
      });
    }
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

  // Use agency branding or fallback
  const agencyLogo = (agencyBranding as any)?.logoUrl || chainLogo;
  const agencyName = (agencyBranding as any)?.agencyName || tenant?.name || session.tenantSlug || "Consumer Portal";
  const contactEmail = (agencyBranding as any)?.contactEmail || tenant?.contactEmail;
  const contactPhone = (agencyBranding as any)?.contactPhone || tenant?.contactPhone;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Background gradients */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      {/* Header with Agency Branding */}
      <header className="relative border-b border-white/10 bg-slate-950/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={agencyLogo} alt={agencyName} className="h-10 w-auto object-contain" />
              <div>
                <p className="text-sm font-semibold text-white">
                  {agencyName}
                </p>
                <p className="text-xs text-blue-100/70 flex items-center">
                  <User className="h-3 w-3 mr-1" />
                  {consumer?.firstName} {consumer?.lastName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setShowContactDialog(true)}
                variant="outline"
                className="text-white border-white/20 hover:bg-white/10"
                data-testid="button-contact-us"
              >
                <Phone className="h-4 w-4 mr-2" />
                Contact Us
              </Button>
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
        </div>
      </header>

      {/* Main Content */}
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Welcome Section */}
        <div className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/10 p-8 shadow-2xl shadow-blue-900/30">
          <div className="pointer-events-none absolute -right-10 top-10 h-56 w-56 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-6 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100/80">
                Account Overview
              </span>
              <Button
                onClick={() => setShowEditDialog(true)}
                variant="ghost"
                size="sm"
                className="text-blue-200 hover:bg-white/10"
                data-testid="button-edit-profile"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            </div>
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

        <Tabs defaultValue="accounts" className="w-full">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="accounts" className="data-[state=active]:bg-white/20">
              <CreditCard className="h-4 w-4 mr-2" />
              Accounts
            </TabsTrigger>
            <TabsTrigger value="documents" className="data-[state=active]:bg-white/20">
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="arrangements" className="data-[state=active]:bg-white/20">
              <Calendar className="h-4 w-4 mr-2" />
              Arrangements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="mt-6">
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
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            <Card className="border-white/10 bg-white/5 backdrop-blur">
              <CardHeader className="border-b border-white/10">
                <CardTitle className="flex items-center text-white">
                  <FileText className="h-5 w-5 mr-2 text-blue-400" />
                  Documents & Communications
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {(!documents || !(documents as any)?.length) ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-blue-400/30" />
                    <p className="text-blue-100/70">No documents available</p>
                    <p className="text-sm text-blue-100/50 mt-2">
                      Documents and communications from your agency will appear here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(documents as any[]).map((doc: any) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-blue-400" />
                          <div>
                            <p className="text-white font-medium">{doc.name || doc.fileName}</p>
                            <p className="text-sm text-blue-100/70">
                              {new Date(doc.uploadedAt || doc.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-white border-white/20 hover:bg-white/10"
                          onClick={() => window.open(doc.fileUrl, '_blank')}
                        >
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="arrangements" className="mt-6">
            <Card className="border-white/10 bg-white/5 backdrop-blur">
              <CardHeader className="border-b border-white/10">
                <CardTitle className="flex items-center text-white">
                  <Calendar className="h-5 w-5 mr-2 text-blue-400" />
                  Payment Arrangements
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {(!arrangements || !(arrangements as any)?.length) ? (
                  <div className="text-center py-12">
                    <Calendar className="h-12 w-12 mx-auto mb-4 text-blue-400/30" />
                    <p className="text-blue-100/70">No payment arrangements</p>
                    <p className="text-sm text-blue-100/50 mt-2">
                      Contact your agency to set up a payment plan
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(arrangements as any[]).map((arrangement: any) => (
                      <div
                        key={arrangement.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-white font-medium">{arrangement.description || 'Payment Plan'}</p>
                            <p className="text-sm text-blue-100/70 mt-1">
                              {arrangement.installments} payments of {formatCurrency(arrangement.installmentAmount)}
                            </p>
                          </div>
                          <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200 border">
                            Active
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Contact Us Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Contact {agencyName}</DialogTitle>
            <DialogDescription>
              Get in touch with us for questions about your account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {contactPhone && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
                <Phone className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Phone</p>
                  <a href={`tel:${contactPhone}`} className="text-sm text-blue-600 hover:underline">
                    {contactPhone}
                  </a>
                </div>
              </div>
            )}
            {contactEmail && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
                <Mail className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <a href={`mailto:${contactEmail}`} className="text-sm text-blue-600 hover:underline">
                    {contactEmail}
                  </a>
                </div>
              </div>
            )}
            {!contactPhone && !contactEmail && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Contact information not available. Please check your account statements or documents.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Your Profile</DialogTitle>
            <DialogDescription>
              Update your contact information and address
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  data-testid="input-first-name"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                data-testid="input-phone"
              />
            </div>
            <div>
              <Label htmlFor="address">Street Address</Label>
              <Input
                id="address"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                data-testid="input-address"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  data-testid="input-city"
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={editForm.state}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  maxLength={2}
                  data-testid="input-state"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                value={editForm.zipCode}
                onChange={(e) => setEditForm({ ...editForm, zipCode: e.target.value })}
                data-testid="input-zip"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditProfile}
              className="bg-blue-500 hover:bg-blue-400"
              data-testid="button-save-profile"
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
