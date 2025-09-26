import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Phone, Mail, MessageSquare, Download, Building2, CreditCard, FileText, AlertCircle, LogOut, User } from "lucide-react";
import { getArrangementSummary, getPlanTypeLabel, formatCurrencyFromCents } from "@/lib/arrangements";

type AgencyBranding = {
  agencyName: string;
  logoUrl: string | null;
  contactEmail: string | null;
};

export default function ConsumerDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [callbackForm, setCallbackForm] = useState({
    requestType: "callback",
    preferredTime: "",
    phoneNumber: "",
    emailAddress: "",
    subject: "",
    message: "",
  });

  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [consumerSession, setConsumerSession] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem("consumerToken");
    if (!token) {
      setLocation("/consumer-login");
    }
  }, [setLocation]);

  // Get consumer session data
  useEffect(() => {
    const sessionData = localStorage.getItem("consumerSession");
    if (!sessionData) {
      setLocation("/consumer-login");
      return;
    }

    try {
      const session = JSON.parse(sessionData);
      setConsumerSession(session);
      setCallbackForm(prev => ({
        ...prev,
        emailAddress: session.email,
      }));
    } catch (error) {
      toast({
        title: "Session Error",
        description: "Your session has expired. Please log in again.",
        variant: "destructive",
      });
      setLocation("/consumer-login");
    }
  }, [setLocation, toast]);

  const tenantSlug = consumerSession?.tenantSlug;
  const encodedEmail = consumerSession?.email ? encodeURIComponent(consumerSession.email) : "";
  const encodedTenantSlug = tenantSlug ? encodeURIComponent(tenantSlug) : "";

  const accountsUrl = encodedEmail && encodedTenantSlug
    ? `/api/consumer/accounts/${encodedEmail}`
    : "";

  // Fetch consumer data
  const { data, isLoading, error } = useQuery({
    queryKey: accountsUrl ? [accountsUrl] : ['consumer-accounts'],
    queryFn: async () => {
      const token = localStorage.getItem('consumerToken');
      if (!token) {
        throw new Error('No consumer token found');
      }
      const response = await fetch(accountsUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      if (!response.ok) {
        const error = await response.text();
        // If unauthorized, clear old token and force re-login
        if (response.status === 401 || response.status === 403 || response.status === 400) {
          localStorage.removeItem('consumerToken');
          localStorage.removeItem('consumerSession');
          window.location.href = '/consumer-login';
        }
        throw new Error(`Failed to fetch accounts: ${error}`);
      }
      return response.json();
    },
    enabled: !!accountsUrl,
  });

  // Fetch notifications
  const notificationsUrl = encodedEmail && encodedTenantSlug
    ? `/api/consumer-notifications/${encodedEmail}/${encodedTenantSlug}`
    : "";

  const { data: notifications } = useQuery({
    queryKey: notificationsUrl ? [notificationsUrl] : ['consumer-notifications'],
    enabled: !!notificationsUrl,
  });

  const brandingUrl = tenantSlug ? `/api/public/agency-branding?slug=${encodeURIComponent(tenantSlug)}` : "";

  const { data: branding } = useQuery<AgencyBranding>({
    queryKey: brandingUrl ? [brandingUrl] : ['consumer-agency-branding'],
    enabled: !!brandingUrl,
  });

  // Fetch documents
  const documentsUrl = encodedEmail && encodedTenantSlug
    ? `/api/consumer/documents/${encodedEmail}?tenantSlug=${encodedTenantSlug}`
    : "";

  const { data: documents } = useQuery({
    queryKey: documentsUrl ? [documentsUrl] : ['consumer-documents'],
    queryFn: async () => {
      if (!documentsUrl) {
        return null;
      }
      const response = await apiRequest("GET", documentsUrl);
      return response.json();
    },
    enabled: !!documentsUrl,
  });

  // Fetch payment arrangements
  const arrangementsUrl = encodedEmail && encodedTenantSlug
    ? `/api/consumer/arrangements/${encodedEmail}?tenantSlug=${encodedTenantSlug}`
    : "";

  const { data: arrangements } = useQuery({
    queryKey: arrangementsUrl && (data as any)?.accounts ? [
      `${arrangementsUrl}&balance=${(data as any)?.accounts?.reduce((sum: number, acc: any) => sum + (acc.balanceCents || 0), 0) || 0}`
    ] : ['consumer-arrangements'],
    queryFn: async () => {
      if (!arrangementsUrl) {
        return null;
      }
      const balance = (data as any)?.accounts?.reduce((sum: number, acc: any) => sum + (acc.balanceCents || 0), 0) || 0;
      const response = await apiRequest("GET", `${arrangementsUrl}&balance=${balance}`);
      return response.json();
    },
    enabled: !!(data as any)?.accounts && !!arrangementsUrl,
  });

  // Submit callback request mutation
  const callbackRequestMutation = useMutation({
    mutationFn: async (requestData: any) => {
      await apiRequest("POST", "/api/callback-requests", {
        ...requestData,
        tenantSlug: consumerSession?.tenantSlug,
        consumerEmail: consumerSession?.email,
      });
    },
    onSuccess: () => {
      toast({
        title: "Request Submitted",
        description: "Your callback request has been submitted successfully. We'll contact you soon.",
      });
      setShowCallbackModal(false);
      setCallbackForm(prev => ({
        ...prev,
        requestType: "callback",
        preferredTime: "",
        phoneNumber: "",
        subject: "",
        message: "",
      }));
    },
    onError: (error: any) => {
      toast({
        title: "Request Failed",
        description: error.message || "Unable to submit request. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Mark notification as read
  const markNotificationReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("PATCH", `/api/consumer-notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      if (notificationsUrl) {
        queryClient.invalidateQueries({
          queryKey: [notificationsUrl]
        });
      }
    },
  });

  const handleLogout = () => {
    localStorage.removeItem("consumerSession");
    toast({
      title: "Logged Out",
      description: "You have been logged out successfully.",
    });
    setLocation("/consumer-login");
  };

  const handleCallbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!callbackForm.requestType) {
      toast({
        title: "Request Type Required",
        description: "Please select the type of request.",
        variant: "destructive",
      });
      return;
    }

    callbackRequestMutation.mutate(callbackForm);
  };

  const handleInputChange_callback = (field: string, value: any) => {
    setCallbackForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!consumerSession) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading session...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your accounts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Access Error</h1>
            <p className="text-gray-600">
              Unable to access your account information. Please contact your agency for assistance.
            </p>
            <Button className="mt-4" onClick={handleLogout}>
              Try Logging In Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { consumer, accounts, tenant, tenantSettings } = (data as any) || {};

  const resolvedAgencyName = tenant?.name
    || branding?.agencyName
    || (tenantSlug ? tenantSlug.replace(/-/g, ' ') : undefined);

  const resolvedLogoUrl = tenantSettings?.customBranding?.logoUrl
    || branding?.logoUrl
    || null;

  const resolvedContactEmail = tenantSettings?.contactEmail
    || branding?.contactEmail
    || null;

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const formatCurrency = (cents: number) => {
    return formatCurrencyFromCents(cents);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const totalBalance = accounts?.reduce((sum: number, account: any) => sum + (account.balanceCents || 0), 0) || 0;
  const unreadNotifications = (notifications as any[])?.filter(n => !n.isRead)?.length || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Company Info */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center overflow-hidden">
                {resolvedLogoUrl ? (
                  <img
                    src={resolvedLogoUrl}
                    alt="Company Logo"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Building2 className="h-8 w-8 text-white" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">{resolvedAgencyName || "Debt Management Portal"}</h1>
                <p className="text-blue-100 text-sm flex items-center">
                  <User className="h-4 w-4 mr-1" />
                  {consumer?.firstName} {consumer?.lastName} • {consumer?.email}
                </p>
                {resolvedContactEmail && (
                  <p className="text-blue-100 text-xs flex items-center mt-1">
                    <Mail className="h-3 w-3 mr-1" />
                    {resolvedContactEmail}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {/* Notification Bell */}
              <div className="relative">
                <Bell className="h-6 w-6 text-white cursor-pointer" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadNotifications}
                  </span>
                )}
              </div>
              
              {/* Contact Agency Button */}
              <Dialog open={showCallbackModal} onOpenChange={setShowCallbackModal}>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="sm" data-testid="button-contact-agency">
                    <Phone className="h-4 w-4 mr-2" />
                    Contact Agency
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Contact {tenant?.name}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCallbackSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Request Type *</Label>
                        <Select value={callbackForm.requestType} onValueChange={(value) => handleInputChange_callback("requestType", value)}>
                          <SelectTrigger data-testid="select-request-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="callback">Phone Callback</SelectItem>
                            <SelectItem value="email">Email Response</SelectItem>
                            <SelectItem value="information">Request Information</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {callbackForm.requestType === "callback" && (
                        <div>
                          <Label>Preferred Time</Label>
                          <Select value={callbackForm.preferredTime} onValueChange={(value) => handleInputChange_callback("preferredTime", value)}>
                            <SelectTrigger data-testid="select-preferred-time">
                              <SelectValue placeholder="Select time" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="morning">Morning (9 AM - 12 PM)</SelectItem>
                              <SelectItem value="afternoon">Afternoon (12 PM - 5 PM)</SelectItem>
                              <SelectItem value="evening">Evening (5 PM - 8 PM)</SelectItem>
                              <SelectItem value="anytime">Anytime</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Phone Number</Label>
                        <Input
                          type="tel"
                          data-testid="input-phone"
                          value={callbackForm.phoneNumber}
                          onChange={(e) => handleInputChange_callback("phoneNumber", e.target.value)}
                          placeholder="(555) 123-4567"
                        />
                      </div>
                      <div>
                        <Label>Email Address</Label>
                        <Input
                          type="email"
                          data-testid="input-email"
                          value={callbackForm.emailAddress}
                          onChange={(e) => handleInputChange_callback("emailAddress", e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <Label>Subject</Label>
                      <Input
                        data-testid="input-subject"
                        value={callbackForm.subject}
                        onChange={(e) => handleInputChange_callback("subject", e.target.value)}
                        placeholder="Brief description of your inquiry"
                      />
                    </div>

                    <div>
                      <Label>Message</Label>
                      <Textarea
                        data-testid="textarea-message"
                        rows={4}
                        value={callbackForm.message}
                        onChange={(e) => handleInputChange_callback("message", e.target.value)}
                        placeholder="Please describe your inquiry or request..."
                      />
                    </div>

                    <div className="flex justify-end space-x-3">
                      <Button type="button" variant="outline" onClick={() => setShowCallbackModal(false)}>
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        data-testid="button-submit-request"
                        disabled={callbackRequestMutation.isPending}
                      >
                        {callbackRequestMutation.isPending ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Submitting...
                          </>
                        ) : (
                          <>
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Submit Request
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              {/* Logout Button */}
              <Button variant="secondary" size="sm" onClick={handleLogout} data-testid="button-logout">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Tabs defaultValue="accounts" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="accounts" className="flex items-center">
              <CreditCard className="h-4 w-4 mr-2" />
              Accounts
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center">
              <Bell className="h-4 w-4 mr-2" />
              Notifications
              {unreadNotifications > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {unreadNotifications}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center">
              <CreditCard className="h-4 w-4 mr-2" />
              Payment Plans
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center">
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="mt-6">
            {/* Account Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(totalBalance)}
                  </div>
                  <div className="text-sm text-gray-500">Total Balance</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {accounts?.length || 0}
                  </div>
                  <div className="text-sm text-gray-500">Active Accounts</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {(arrangements as any)?.length || 0}
                  </div>
                  <div className="text-sm text-gray-500">Payment Plans Available</div>
                </CardContent>
              </Card>
            </div>

            {/* Accounts List */}
            {!accounts || accounts.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Accounts Found</h3>
                  <p className="text-gray-600">
                    No account information is currently available. Please contact your agency for assistance.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {accounts.map((account: any) => (
                  <Card key={account.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{account.creditor}</h3>
                          <p className="text-sm text-gray-500">
                            {account.accountNumber ? `Account •••• ${account.accountNumber.slice(-4)}` : 'No account number'}
                          </p>
                        </div>
                        <Badge className={getStatusColor(account.status)}>
                          {account.status || 'Unknown'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div>
                          <div className="text-xl font-bold text-gray-900">
                            {formatCurrency(account.balanceCents || 0)}
                          </div>
                          <div className="text-xs text-gray-500">Current Balance</div>
                        </div>
                        <div>
                          <div className="text-lg font-medium text-gray-700">
                            {account.dueDate ? formatDate(account.dueDate) : 'No due date'}
                          </div>
                          <div className="text-xs text-gray-500">Due Date</div>
                        </div>
                        <div>
                          <div className="text-lg font-medium text-blue-600">
                            {(arrangements as any[])?.length || 0}
                          </div>
                          <div className="text-xs text-gray-500">Plans Available</div>
                        </div>
                        <div>
                          <Button size="sm" className="w-full" onClick={() => setShowCallbackModal(true)}>
                            Contact About Account
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notifications" className="mt-6">
            {!notifications || (notifications as any[]).length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Notifications</h3>
                  <p className="text-gray-600">
                    You have no notifications at this time.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {(notifications as any[]).map((notification: any) => (
                  <Card key={notification.id} className={!notification.isRead ? 'border-blue-200 bg-blue-50' : ''}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <h3 className="font-semibold text-gray-900">{notification.title}</h3>
                            {!notification.isRead && (
                              <Badge variant="default" className="ml-2">New</Badge>
                            )}
                          </div>
                          <p className="text-gray-600 mt-2">{notification.message}</p>
                          <p className="text-xs text-gray-500 mt-3">
                            {formatDate(notification.createdAt)}
                          </p>
                        </div>
                        {!notification.isRead && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => markNotificationReadMutation.mutate(notification.id)}
                            data-testid={`button-mark-read-${notification.id}`}
                          >
                            Mark as Read
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="payments" className="mt-6">
            {!arrangements || (arrangements as any).length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Payment Plans Available</h3>
                  <p className="text-gray-600">
                    Contact your agency to discuss payment arrangement options.
                  </p>
                  <Button className="mt-4" onClick={() => setShowCallbackModal(true)}>
                    Contact About Payment Plans
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {(arrangements as any).map((arrangement: any) => (
                  <Card key={arrangement.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">{arrangement.name}</h3>
                          <p className="text-gray-600 mt-2">{arrangement.description}</p>
                          {(() => {
                            const summary = getArrangementSummary(arrangement);
                            return (
                              <div className="mt-4 space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                  <Badge variant="secondary">{getPlanTypeLabel(arrangement.planType)}</Badge>
                                  <span className="font-medium text-gray-700">{summary.headline}</span>
                                </div>
                                {summary.detail && <p className="text-sm text-gray-500">{summary.detail}</p>}
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-600">Eligible Balance Range:</span>
                                  <span className="font-medium">
                                    {formatCurrencyFromCents(arrangement.minBalance)} - {formatCurrencyFromCents(arrangement.maxBalance)}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="ml-6">
                          <Button onClick={() => setShowCallbackModal(true)}>
                            Request This Plan
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            {!documents || (documents as any).length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Documents Available</h3>
                  <p className="text-gray-600">
                    No documents have been shared with you at this time.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {(documents as any).map((document: any) => (
                  <Card key={document.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <FileText className="h-8 w-8 text-blue-500" />
                          <div>
                            <h3 className="font-semibold text-gray-900">{document.title}</h3>
                            <p className="text-sm text-gray-500">{document.description}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              Uploaded: {formatDate(document.createdAt)}
                            </p>
                          </div>
                        </div>
                        <Button variant="outline" data-testid={`button-download-${document.id}`}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 px-4 py-6 mt-8">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Company Information</h3>
              <p className="text-gray-600 text-sm">{tenant?.name}</p>
              {tenantSettings?.contactEmail && (
                <p className="text-gray-600 text-sm flex items-center mt-1">
                  <Mail className="h-4 w-4 mr-1" />
                  {tenantSettings.contactEmail}
                </p>
              )}
              {tenantSettings?.contactPhone && (
                <p className="text-gray-600 text-sm flex items-center mt-1">
                  <Phone className="h-4 w-4 mr-1" />
                  {tenantSettings.contactPhone}
                </p>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Need Help?</h3>
              <p className="text-gray-600 text-sm mb-2">
                Questions about your accounts or need assistance?
              </p>
              <Button onClick={() => setShowCallbackModal(true)} size="sm">
                Contact Us Now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}