import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Phone,
  Users,
  Plus,
  Trash2,
  Star,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Settings,
  ExternalLink,
  DollarSign,
} from "lucide-react";
import { format } from "date-fns";

interface VoipPhoneNumber {
  id: string;
  tenantId: string;
  phoneNumber: string;
  areaCode: string;
  numberType: 'local' | 'toll_free';
  friendlyName: string;
  twilioPhoneSid: string | null;
  isPrimary: boolean;
  isActive: boolean;
  capabilities: { voice: boolean; sms: boolean };
  createdAt: string;
  updatedAt: string | null;
}

interface AvailablePhoneNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
}

interface VoipBillingSummary {
  voipEnabled: boolean;
  voipUserCount: number;
  localDidCount: number;
  tollFreeCount: number;
  pricing: {
    userPriceCents: number;
    localDidPriceCents: number;
    tollFreePriceCents: number;
  };
  costs: {
    usersCostCents: number;
    localDidsCostCents: number;
    tollFreeCostCents: number;
    totalCostCents: number;
  };
}

interface TeamMember {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  voipAccess: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const cardBaseClasses = "rounded-2xl border border-white/10 bg-white/5 text-blue-50 shadow-lg shadow-blue-900/20 backdrop-blur";
const inputClasses = "border-white/20 bg-white/10 text-white placeholder:text-blue-100/60 focus:border-sky-400/60 focus-visible:ring-sky-400/40";

export default function PhonesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("settings");
  const [showProvisionDialog, setShowProvisionDialog] = useState(false);
  const [provisionType, setProvisionType] = useState<'local' | 'toll_free'>('local');
  const [searchAreaCode, setSearchAreaCode] = useState("");
  const [availableNumbers, setAvailableNumbers] = useState<AvailablePhoneNumber[]>([]);
  const [searchingNumbers, setSearchingNumbers] = useState(false);

  const { data: phoneNumbers = [], isLoading: loadingNumbers } = useQuery<VoipPhoneNumber[]>({
    queryKey: ["/api/voip/phone-numbers"],
  });

  const { data: billingSummary, isLoading: loadingBilling } = useQuery<VoipBillingSummary>({
    queryKey: ["/api/voip/billing-summary"],
  });

  const { data: teamMembers = [], isLoading: loadingTeamMembers } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const enableVoipMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest('POST', '/api/voip/enable', { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/billing-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voip/phone-numbers"] });
      toast({
        title: "VoIP Updated",
        description: billingSummary?.voipEnabled ? "VoIP has been disabled" : "VoIP has been enabled. Add phone numbers from the Numbers tab.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update VoIP settings",
        variant: "destructive",
      });
    },
  });

  const provisionNumberMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      return apiRequest('POST', '/api/voip/phone-numbers/provision', { 
        phoneNumber,
        numberType: provisionType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/phone-numbers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voip/billing-summary"] });
      setShowProvisionDialog(false);
      setAvailableNumbers([]);
      setSearchAreaCode("");
      toast({
        title: "Number Provisioned",
        description: "Phone number has been added to your account",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to provision phone number",
        variant: "destructive",
      });
    },
  });

  const deleteNumberMutation = useMutation({
    mutationFn: async (numberId: string) => {
      return apiRequest('DELETE', `/api/voip/phone-numbers/${numberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/phone-numbers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voip/billing-summary"] });
      toast({
        title: "Number Deleted",
        description: "Phone number has been removed from your account",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete phone number",
        variant: "destructive",
      });
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (numberId: string) => {
      return apiRequest('PUT', `/api/voip/phone-numbers/${numberId}/primary`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/voip/phone-numbers"] });
      toast({
        title: "Primary Number Updated",
        description: "Primary caller ID has been updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set primary number",
        variant: "destructive",
      });
    },
  });

  const updateVoipAccessMutation = useMutation({
    mutationFn: async ({ memberId, voipAccess }: { memberId: string; voipAccess: boolean }) => {
      return apiRequest('PATCH', `/api/team-members/${memberId}`, { voipAccess });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voip/billing-summary"] });
      toast({
        title: "Access Updated",
        description: "VoIP access has been updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update VoIP access",
        variant: "destructive",
      });
    },
  });

  const searchAvailableNumbers = async () => {
    if (provisionType === 'local' && !searchAreaCode) {
      toast({
        title: "Area Code Required",
        description: "Please enter an area code to search for local numbers",
        variant: "destructive",
      });
      return;
    }

    setSearchingNumbers(true);
    try {
      const params = new URLSearchParams({
        type: provisionType,
        ...(provisionType === 'local' && { areaCode: searchAreaCode }),
      });
      const response = await apiRequest('GET', `/api/voip/phone-numbers/available?${params}`);
      const data = await response.json();
      setAvailableNumbers(data.numbers || []);
      if (data.numbers?.length === 0) {
        toast({
          title: "No Numbers Found",
          description: provisionType === 'local' 
            ? `No available numbers found for area code ${searchAreaCode}` 
            : "No toll-free numbers available at this time",
        });
      }
    } catch (error: any) {
      toast({
        title: "Search Failed",
        description: error.message || "Failed to search for available numbers",
        variant: "destructive",
      });
    } finally {
      setSearchingNumbers(false);
    }
  };

  const openSoftphone = () => {
    window.open('/softphone', '_blank', 'width=400,height=700,toolbar=no,menubar=no');
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">VoIP Phone System</h1>
            <p className="text-blue-100/60 mt-1">Manage phone numbers, users, and VoIP settings</p>
          </div>
          <Button 
            onClick={openSoftphone}
            className="bg-sky-500 hover:bg-sky-600 text-white"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Softphone
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-[500px]">
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" /> Settings
            </TabsTrigger>
            <TabsTrigger value="numbers" className="flex items-center gap-2">
              <Phone className="h-4 w-4" /> Numbers
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Users
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Billing
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-6">
            <Card className={cardBaseClasses}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between text-white">
                  <span>VoIP Phone System</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-normal text-blue-100/60">
                      {billingSummary?.voipEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                      checked={billingSummary?.voipEnabled || false}
                      onCheckedChange={(checked) => enableVoipMutation.mutate(checked)}
                      disabled={enableVoipMutation.isPending}
                    />
                  </div>
                </CardTitle>
                <CardDescription className="text-blue-100/70">
                  {billingSummary?.voipEnabled 
                    ? "VoIP is enabled. Add phone numbers from the Numbers tab to start making calls."
                    : "Enable VoIP to make and receive calls. $80/user/month. Phone numbers billed separately."}
                </CardDescription>
              </CardHeader>
              {enableVoipMutation.isPending && (
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-blue-100/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {billingSummary?.voipEnabled ? "Disabling VoIP..." : "Enabling VoIP..."}
                  </div>
                </CardContent>
              )}
            </Card>

            {billingSummary?.voipEnabled && (
              <Card className={`mt-6 ${cardBaseClasses}`}>
                <CardHeader>
                  <CardTitle className="text-white">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="text-3xl font-bold text-white">{billingSummary.voipUserCount}</div>
                      <div className="text-sm text-blue-100/60">Active Users</div>
                    </div>
                    <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="text-3xl font-bold text-white">{phoneNumbers.length}</div>
                      <div className="text-sm text-blue-100/60">Phone Numbers</div>
                    </div>
                    <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="text-3xl font-bold text-white">{billingSummary.localDidCount}</div>
                      <div className="text-sm text-blue-100/60">Local DIDs</div>
                    </div>
                    <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                      <div className="text-3xl font-bold text-white">{billingSummary.tollFreeCount}</div>
                      <div className="text-sm text-blue-100/60">Toll-Free</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Phone Numbers Tab */}
          <TabsContent value="numbers" className="mt-6">
            <Card className={cardBaseClasses}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white">Phone Numbers</CardTitle>
                    <CardDescription className="text-blue-100/60">
                      Manage your VoIP phone numbers
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => setShowProvisionDialog(true)}
                    disabled={!billingSummary?.voipEnabled}
                    className="bg-sky-500 hover:bg-sky-600"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Number
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingNumbers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-100/60" />
                  </div>
                ) : phoneNumbers.length === 0 ? (
                  <div className="text-center py-8 text-blue-100/60">
                    <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No phone numbers configured</p>
                    <p className="text-sm">Click "Add Number" to search and select your phone numbers</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead className="text-blue-100/60">Phone Number</TableHead>
                        <TableHead className="text-blue-100/60">Type</TableHead>
                        <TableHead className="text-blue-100/60">Name</TableHead>
                        <TableHead className="text-blue-100/60">Status</TableHead>
                        <TableHead className="text-blue-100/60">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {phoneNumbers.map((number) => (
                        <TableRow key={number.id} className="border-white/10">
                          <TableCell className="text-white font-mono">
                            {number.phoneNumber}
                            {number.isPrimary && (
                              <Badge className="ml-2 bg-amber-500/20 text-amber-300 border-amber-400/30">
                                <Star className="h-3 w-3 mr-1" />
                                Primary
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={number.numberType === 'toll_free' 
                              ? "bg-green-500/20 text-green-300 border-green-400/30"
                              : "bg-blue-500/20 text-blue-300 border-blue-400/30"
                            }>
                              {number.numberType === 'toll_free' ? 'Toll-Free' : 'Local'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-blue-100/80">{number.friendlyName || '-'}</TableCell>
                          <TableCell>
                            {number.isActive ? (
                              <Badge className="bg-green-500/20 text-green-300 border-green-400/30">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/20 text-red-300 border-red-400/30">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Inactive
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {!number.isPrimary && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setPrimaryMutation.mutate(number.id)}
                                  disabled={setPrimaryMutation.isPending}
                                  className="text-amber-300 hover:text-amber-200 hover:bg-amber-500/20"
                                >
                                  <Star className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteNumberMutation.mutate(number.id)}
                                disabled={deleteNumberMutation.isPending || number.isPrimary}
                                className="text-red-300 hover:text-red-200 hover:bg-red-500/20"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-6">
            <Card className={cardBaseClasses}>
              <CardHeader>
                <CardTitle className="text-white">VoIP User Access</CardTitle>
                <CardDescription className="text-blue-100/60">
                  Manage which team members can use the softphone. Each enabled user costs $80/month.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingTeamMembers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-100/60" />
                  </div>
                ) : teamMembers.length === 0 ? (
                  <div className="text-center py-8 text-blue-100/60">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No team members found</p>
                    <p className="text-sm">Add team members in Settings to give them VoIP access</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead className="text-blue-100/60">Name</TableHead>
                        <TableHead className="text-blue-100/60">Username</TableHead>
                        <TableHead className="text-blue-100/60">Role</TableHead>
                        <TableHead className="text-blue-100/60">Status</TableHead>
                        <TableHead className="text-blue-100/60">VoIP Access</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamMembers.map((member) => (
                        <TableRow key={member.id} className="border-white/10">
                          <TableCell className="text-white">
                            {member.firstName || member.lastName 
                              ? `${member.firstName || ''} ${member.lastName || ''}`.trim()
                              : member.email || member.username
                            }
                          </TableCell>
                          <TableCell className="text-blue-100/80">{member.username}</TableCell>
                          <TableCell>
                            <Badge className={
                              member.role === 'owner' 
                                ? "bg-purple-500/20 text-purple-300 border-purple-400/30"
                                : member.role === 'manager'
                                ? "bg-blue-500/20 text-blue-300 border-blue-400/30"
                                : "bg-gray-500/20 text-gray-300 border-gray-400/30"
                            }>
                              {member.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {member.isActive ? (
                              <Badge className="bg-green-500/20 text-green-300 border-green-400/30">Active</Badge>
                            ) : (
                              <Badge className="bg-red-500/20 text-red-300 border-red-400/30">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {member.role === 'owner' ? (
                              <Badge className="bg-green-500/20 text-green-300 border-green-400/30">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Always Enabled
                              </Badge>
                            ) : (
                              <Switch
                                checked={member.voipAccess}
                                onCheckedChange={(checked) => 
                                  updateVoipAccessMutation.mutate({ memberId: member.id, voipAccess: checked })
                                }
                                disabled={updateVoipAccessMutation.isPending || !billingSummary?.voipEnabled}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="mt-6">
            <Card className={cardBaseClasses}>
              <CardHeader>
                <CardTitle className="text-white">VoIP Billing Summary</CardTitle>
                <CardDescription className="text-blue-100/60">
                  Monthly costs for your VoIP phone system
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingBilling ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-100/60" />
                  </div>
                ) : !billingSummary?.voipEnabled ? (
                  <div className="text-center py-8 text-blue-100/60">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>VoIP is not enabled</p>
                    <p className="text-sm">Enable VoIP in Settings to see billing information</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="text-2xl font-bold text-white">{billingSummary.voipUserCount}</div>
                        <div className="text-sm text-blue-100/60">VoIP Users</div>
                        <div className="text-xs text-blue-100/40 mt-1">
                          ${(billingSummary.costs.usersCostCents / 100).toFixed(2)}/mo
                        </div>
                      </div>
                      <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="text-2xl font-bold text-white">{billingSummary.localDidCount}</div>
                        <div className="text-sm text-blue-100/60">Local DIDs</div>
                        <div className="text-xs text-blue-100/40 mt-1">
                          ${(billingSummary.costs.localDidsCostCents / 100).toFixed(2)}/mo
                        </div>
                      </div>
                      <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="text-2xl font-bold text-white">{billingSummary.tollFreeCount}</div>
                        <div className="text-sm text-blue-100/60">Toll-Free</div>
                        <div className="text-xs text-blue-100/40 mt-1">
                          ${(billingSummary.costs.tollFreeCostCents / 100).toFixed(2)}/mo
                        </div>
                      </div>
                      <div className="text-center p-4 bg-sky-500/20 rounded-lg border border-sky-400/30">
                        <div className="text-2xl font-bold text-white">
                          ${(billingSummary.costs.totalCostCents / 100).toFixed(2)}
                        </div>
                        <div className="text-sm text-blue-100/60">Total/Month</div>
                      </div>
                    </div>

                    <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                      <h4 className="text-white font-medium mb-3">Pricing</h4>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-blue-100/60">Per User:</span>
                          <span className="text-white ml-2">${(billingSummary.pricing.userPriceCents / 100).toFixed(2)}/mo</span>
                        </div>
                        <div>
                          <span className="text-blue-100/60">Local DID:</span>
                          <span className="text-white ml-2">${(billingSummary.pricing.localDidPriceCents / 100).toFixed(2)}/mo</span>
                        </div>
                        <div>
                          <span className="text-blue-100/60">Toll-Free:</span>
                          <span className="text-white ml-2">${(billingSummary.pricing.tollFreePriceCents / 100).toFixed(2)}/mo</span>
                        </div>
                      </div>
                      <p className="text-xs text-blue-100/40 mt-3">
                        Local: $5/month, Toll-Free: $10/month
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Provision Number Dialog */}
      <Dialog open={showProvisionDialog} onOpenChange={setShowProvisionDialog}>
        <DialogContent className="bg-[#0f1629] border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Phone Number</DialogTitle>
            <DialogDescription className="text-blue-100/60">
              Search for and provision a new phone number
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-4">
              <Button
                variant={provisionType === 'local' ? 'default' : 'outline'}
                onClick={() => {
                  setProvisionType('local');
                  setAvailableNumbers([]);
                }}
                className={provisionType === 'local' 
                  ? "bg-sky-500 hover:bg-sky-600" 
                  : "border-white/20 text-white hover:bg-white/10"
                }
              >
                Local Number
              </Button>
              <Button
                variant={provisionType === 'toll_free' ? 'default' : 'outline'}
                onClick={() => {
                  setProvisionType('toll_free');
                  setAvailableNumbers([]);
                }}
                className={provisionType === 'toll_free' 
                  ? "bg-sky-500 hover:bg-sky-600" 
                  : "border-white/20 text-white hover:bg-white/10"
                }
              >
                Toll-Free Number
              </Button>
            </div>

            {provisionType === 'local' && (
              <div className="space-y-2">
                <Label className="text-blue-100/80">Area Code</Label>
                <div className="flex gap-2">
                  <Input
                    value={searchAreaCode}
                    onChange={(e) => setSearchAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="e.g. 212"
                    className={inputClasses}
                    maxLength={3}
                  />
                  <Button 
                    onClick={searchAvailableNumbers}
                    disabled={searchingNumbers || searchAreaCode.length < 3}
                    className="bg-sky-500 hover:bg-sky-600"
                  >
                    {searchingNumbers ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                  </Button>
                </div>
              </div>
            )}

            {provisionType === 'toll_free' && (
              <Button 
                onClick={searchAvailableNumbers}
                disabled={searchingNumbers}
                className="bg-sky-500 hover:bg-sky-600"
              >
                {searchingNumbers ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Search Available Toll-Free Numbers
              </Button>
            )}

            {availableNumbers.length > 0 && (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                <Label className="text-blue-100/80">Available Numbers</Label>
                {availableNumbers.map((number) => (
                  <div 
                    key={number.phoneNumber}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                  >
                    <div>
                      <div className="font-mono text-white">{number.phoneNumber}</div>
                      <div className="text-xs text-blue-100/60">
                        {number.locality && `${number.locality}, `}{number.region}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => provisionNumberMutation.mutate(number.phoneNumber)}
                      disabled={provisionNumberMutation.isPending}
                      className="bg-green-500 hover:bg-green-600"
                    >
                      {provisionNumberMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowProvisionDialog(false);
                setAvailableNumbers([]);
                setSearchAreaCode("");
              }}
              className="border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
