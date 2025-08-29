import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, UserCheck, UserX, Shield, Mail, Phone, Calendar, Building2, Plus, Edit, Trash2 } from "lucide-react";

export default function CompanyManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);

  const [newAdminForm, setNewAdminForm] = useState({
    email: "",
    role: "admin",
    firstName: "",
    lastName: "",
  });

  // Fetch all consumers
  const { data: consumersData, isLoading: consumersLoading } = useQuery({
    queryKey: ["/api/company/consumers"],
  });

  // Fetch all admins
  const { data: adminsData, isLoading: adminsLoading } = useQuery({
    queryKey: ["/api/company/admins"],
  });

  // Add new admin mutation
  const addAdminMutation = useMutation({
    mutationFn: async (adminData: any) => {
      await apiRequest("POST", "/api/company/admins", adminData);
    },
    onSuccess: () => {
      toast({
        title: "Admin Added",
        description: "New admin has been added successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/company/admins"] });
      setShowAddAdminModal(false);
      setNewAdminForm({ email: "", role: "admin", firstName: "", lastName: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Admin",
        description: error.message || "Unable to add admin.",
        variant: "destructive",
      });
    },
  });

  // Update consumer status mutation
  const updateConsumerMutation = useMutation({
    mutationFn: async ({ consumerId, updates }: { consumerId: string; updates: any }) => {
      await apiRequest("PATCH", `/api/company/consumers/${consumerId}`, updates);
    },
    onSuccess: () => {
      toast({
        title: "Consumer Updated",
        description: "Consumer status has been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/company/consumers"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update consumer.",
        variant: "destructive",
      });
    },
  });

  const handleAddAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newAdminForm.email || !newAdminForm.firstName || !newAdminForm.lastName) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    addAdminMutation.mutate(newAdminForm);
  };

  const handleInputChange = (field: string, value: string) => {
    setNewAdminForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (isRegistered: boolean, isActive: boolean = true) => {
    if (!isActive) return "bg-gray-100 text-gray-800";
    if (isRegistered) return "bg-green-100 text-green-800";
    return "bg-yellow-100 text-yellow-800";
  };

  const getStatusText = (isRegistered: boolean, isActive: boolean = true) => {
    if (!isActive) return "Inactive";
    if (isRegistered) return "Registered";
    return "Pending";
  };

  // Filter consumers based on status and search
  const filteredConsumers = (consumersData as any[])?.filter((consumer: any) => {
    const statusMatch = filterStatus === "all" || 
      (filterStatus === "registered" && consumer.isRegistered) ||
      (filterStatus === "pending" && !consumer.isRegistered);
    
    const searchMatch = !searchTerm || 
      `${consumer.firstName} ${consumer.lastName} ${consumer.email}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    return statusMatch && searchMatch;
  }) || [];

  const consumerStats = {
    total: (consumersData as any[])?.length || 0,
    registered: (consumersData as any[])?.filter((c: any) => c.isRegistered)?.length || 0,
    pending: (consumersData as any[])?.filter((c: any) => !c.isRegistered)?.length || 0,
  };

  const adminStats = {
    total: (adminsData as any[])?.length || 0,
    active: (adminsData as any[])?.filter((a: any) => a.isActive !== false)?.length || 0,
  };

  if (consumersLoading || adminsLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Company Management</h1>
            <p className="mt-2 text-gray-600">
              Manage all consumers and admin users for your organization
            </p>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{consumerStats.total}</p>
                  <p className="text-xs text-gray-500">Total Consumers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <UserCheck className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{consumerStats.registered}</p>
                  <p className="text-xs text-gray-500">Registered</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <UserX className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{consumerStats.pending}</p>
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Shield className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{adminStats.total}</p>
                  <p className="text-xs text-gray-500">Admin Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="consumers" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="consumers" className="flex items-center">
              <Users className="h-4 w-4 mr-2" />
              Consumers ({consumerStats.total})
            </TabsTrigger>
            <TabsTrigger value="admins" className="flex items-center">
              <Shield className="h-4 w-4 mr-2" />
              Admin Users ({adminStats.total})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="consumers" className="mt-6">
            {/* Consumers Filters */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Filter Consumers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
                  <div className="flex-1">
                    <Label htmlFor="search">Search Consumers</Label>
                    <Input
                      id="search"
                      placeholder="Search by name or email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      data-testid="input-search-consumers"
                    />
                  </div>
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="w-48" data-testid="select-consumer-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="registered">Registered</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Consumers List */}
            <Card>
              <CardHeader>
                <CardTitle>Consumers ({filteredConsumers.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredConsumers.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Consumers</h3>
                    <p className="text-gray-600">
                      {searchTerm ? "No consumers match your search criteria." : "No consumers have been added yet."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredConsumers.map((consumer: any) => (
                      <div key={consumer.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="font-semibold text-gray-900">
                                {consumer.firstName} {consumer.lastName}
                              </h3>
                              <Badge className={getStatusColor(consumer.isRegistered)}>
                                {getStatusText(consumer.isRegistered)}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                              <div className="flex items-center text-sm text-gray-600">
                                <Mail className="h-4 w-4 mr-2" />
                                {consumer.email}
                              </div>
                              {consumer.phone && (
                                <div className="flex items-center text-sm text-gray-600">
                                  <Phone className="h-4 w-4 mr-2" />
                                  {consumer.phone}
                                </div>
                              )}
                              <div className="flex items-center text-sm text-gray-600">
                                <Calendar className="h-4 w-4 mr-2" />
                                Registered: {formatDate(consumer.createdAt)}
                              </div>
                            </div>

                            {consumer.address && (
                              <div className="text-sm text-gray-600 mb-3">
                                <Building2 className="h-4 w-4 mr-2 inline" />
                                {consumer.address}, {consumer.city}, {consumer.state} {consumer.zipCode}
                              </div>
                            )}

                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                              <span>Accounts: {consumer.accountCount || 0}</span>
                              <span>Total Balance: ${((consumer.totalBalanceCents || 0) / 100).toFixed(2)}</span>
                              {consumer.lastLoginAt && (
                                <span>Last Login: {formatDate(consumer.lastLoginAt)}</span>
                              )}
                            </div>
                          </div>
                          
                          <div className="ml-6 flex flex-col space-y-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => updateConsumerMutation.mutate({
                                consumerId: consumer.id,
                                updates: { isRegistered: !consumer.isRegistered }
                              })}
                              data-testid={`button-toggle-${consumer.id}`}
                            >
                              {consumer.isRegistered ? (
                                <>
                                  <UserX className="h-4 w-4 mr-2" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-4 w-4 mr-2" />
                                  Activate
                                </>
                              )}
                            </Button>
                            
                            <Button 
                              size="sm"
                              onClick={() => window.open(`/consumer-dashboard?email=${consumer.email}&tenantSlug=${consumer.tenantSlug}`, '_blank')}
                              data-testid={`button-view-portal-${consumer.id}`}
                            >
                              View Portal
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="admins" className="mt-6">
            {/* Add Admin */}
            <Card className="mb-6">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Admin Users</CardTitle>
                  <Dialog open={showAddAdminModal} onOpenChange={setShowAddAdminModal}>
                    <DialogTrigger asChild>
                      <Button data-testid="button-add-admin">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Admin
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Admin User</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={handleAddAdmin} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>First Name *</Label>
                            <Input
                              value={newAdminForm.firstName}
                              onChange={(e) => handleInputChange("firstName", e.target.value)}
                              placeholder="John"
                              data-testid="input-admin-first-name"
                              required
                            />
                          </div>
                          <div>
                            <Label>Last Name *</Label>
                            <Input
                              value={newAdminForm.lastName}
                              onChange={(e) => handleInputChange("lastName", e.target.value)}
                              placeholder="Doe"
                              data-testid="input-admin-last-name"
                              required
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Email Address *</Label>
                          <Input
                            type="email"
                            value={newAdminForm.email}
                            onChange={(e) => handleInputChange("email", e.target.value)}
                            placeholder="admin@company.com"
                            data-testid="input-admin-email"
                            required
                          />
                        </div>
                        <div>
                          <Label>Role</Label>
                          <Select value={newAdminForm.role} onValueChange={(value) => handleInputChange("role", value)}>
                            <SelectTrigger data-testid="select-admin-role">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrator</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="agent">Agent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end space-x-3">
                          <Button type="button" variant="outline" onClick={() => setShowAddAdminModal(false)}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={addAdminMutation.isPending}>
                            {addAdminMutation.isPending ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                Adding...
                              </>
                            ) : (
                              "Add Admin"
                            )}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {(adminsData as any[])?.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Admin Users</h3>
                    <p className="text-gray-600">
                      Add admin users to manage your debt collection operations.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(adminsData as any[])?.map((admin: any) => (
                      <div key={admin.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="font-semibold text-gray-900">
                                {admin.firstName} {admin.lastName}
                              </h3>
                              <Badge variant="outline" className="capitalize">
                                {admin.role || "admin"}
                              </Badge>
                              {admin.isActive !== false && (
                                <Badge className="bg-green-100 text-green-800">
                                  Active
                                </Badge>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                              <div className="flex items-center text-sm text-gray-600">
                                <Mail className="h-4 w-4 mr-2" />
                                {admin.email}
                              </div>
                              <div className="flex items-center text-sm text-gray-600">
                                <Calendar className="h-4 w-4 mr-2" />
                                Added: {formatDate(admin.createdAt)}
                              </div>
                            </div>

                            {admin.lastLoginAt && (
                              <div className="text-sm text-gray-500">
                                Last Login: {formatDate(admin.lastLoginAt)}
                              </div>
                            )}
                          </div>
                          
                          <div className="ml-6 flex space-x-2">
                            <Button variant="outline" size="sm" data-testid={`button-edit-admin-${admin.id}`}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="destructive" size="sm" data-testid={`button-remove-admin-${admin.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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
    </AdminLayout>
  );
}