import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Phone, Mail, MessageSquare, Clock, CheckCircle, XCircle, AlertCircle, User, Calendar } from "lucide-react";

export default function Requests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: requests, isLoading } = useQuery({
    queryKey: ["/api/callback-requests"],
  });

  const updateRequestMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      await apiRequest("PATCH", `/api/callback-requests/${id}`, updates);
    },
    onSuccess: () => {
      toast({
        title: "Request Updated",
        description: "The callback request has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/callback-requests"] });
      setShowUpdateModal(false);
      setSelectedRequest(null);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update request.",
        variant: "destructive",
      });
    },
  });

  const handleUpdateRequest = (updates: any) => {
    if (selectedRequest) {
      updateRequestMutation.mutate({
        id: selectedRequest.id,
        updates,
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "urgent":
        return "bg-red-100 text-red-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "normal":
        return "bg-gray-100 text-gray-800";
      case "low":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getRequestTypeIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case "callback":
        return <Phone className="h-4 w-4" />;
      case "email":
        return <Mail className="h-4 w-4" />;
      case "information":
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const requestList = Array.isArray(requests) ? (requests as any[]) : [];

  const filteredRequests = requestList.filter((request: any) => {
    if (filterStatus === "all") return true;
    return request.status === filterStatus;
  });

  const statusCounts = {
    all: requestList.length,
    pending: requestList.filter((r: any) => r.status === "pending").length,
    in_progress: requestList.filter((r: any) => r.status === "in_progress").length,
    completed: requestList.filter((r: any) => r.status === "completed").length,
  };

  if (isLoading) {
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
            <h1 className="text-3xl font-bold text-gray-900">Consumer Requests</h1>
            <p className="mt-2 text-gray-600">
              Manage callback requests and inquiries from consumers
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <MessageSquare className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{statusCounts.all}</p>
                  <p className="text-xs text-gray-500">Total Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{statusCounts.pending}</p>
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <AlertCircle className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{statusCounts.in_progress}</p>
                  <p className="text-xs text-gray-500">In Progress</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900">{statusCounts.completed}</p>
                  <p className="text-xs text-gray-500">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filter Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex space-x-4">
              <div>
                <Label htmlFor="status-filter">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-48" data-testid="select-status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requests List */}
        <Card>
          <CardHeader>
            <CardTitle>Requests ({filteredRequests.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredRequests.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Requests</h3>
                <p className="text-gray-600">
                  {filterStatus === "all" 
                    ? "No callback requests have been submitted yet." 
                    : `No ${filterStatus.replace("_", " ")} requests found.`
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map((request: any) => (
                  <div key={request.id} className="border rounded-lg p-6 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          {getRequestTypeIcon(request.requestType)}
                          <h3 className="font-semibold text-gray-900">
                            {request.consumerName}
                          </h3>
                          <Badge className={getStatusColor(request.status)}>
                            {request.status?.replace("_", " ") || "Unknown"}
                          </Badge>
                          <Badge className={getPriorityColor(request.priority)}>
                            {request.priority || "normal"}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-sm text-gray-500">Request Type</p>
                            <p className="font-medium capitalize">
                              {request.requestType?.replace("_", " ")}
                            </p>
                          </div>
                          {request.preferredTime && (
                            <div>
                              <p className="text-sm text-gray-500">Preferred Time</p>
                              <p className="font-medium capitalize">{request.preferredTime}</p>
                            </div>
                          )}
                          {request.phoneNumber && (
                            <div>
                              <p className="text-sm text-gray-500">Phone Number</p>
                              <p className="font-medium">{request.phoneNumber}</p>
                            </div>
                          )}
                          {request.emailAddress && (
                            <div>
                              <p className="text-sm text-gray-500">Email Address</p>
                              <p className="font-medium">{request.emailAddress}</p>
                            </div>
                          )}
                        </div>

                        {request.subject && (
                          <div className="mb-3">
                            <p className="text-sm text-gray-500">Subject</p>
                            <p className="font-medium">{request.subject}</p>
                          </div>
                        )}

                        {request.message && (
                          <div className="mb-3">
                            <p className="text-sm text-gray-500">Message</p>
                            <p className="text-gray-700">{request.message}</p>
                          </div>
                        )}

                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            Submitted: {formatDate(request.createdAt)}
                          </div>
                          {request.assignedTo && (
                            <div className="flex items-center">
                              <User className="h-4 w-4 mr-1" />
                              Assigned to: {request.assignedTo}
                            </div>
                          )}
                          {request.resolvedAt && (
                            <div className="flex items-center">
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Resolved: {formatDate(request.resolvedAt)}
                            </div>
                          )}
                        </div>

                        {request.adminNotes && (
                          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm text-gray-500 mb-1">Admin Notes</p>
                            <p className="text-gray-700">{request.adminNotes}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="ml-6 flex flex-col space-y-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setSelectedRequest(request)}
                              data-testid={`button-update-${request.id}`}
                            >
                              Update
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Update Request - {request.consumerName}</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={(e) => {
                              e.preventDefault();
                              const formData = new FormData(e.currentTarget);
                              const updates = {
                                status: formData.get('status'),
                                priority: formData.get('priority'),
                                assignedTo: formData.get('assignedTo'),
                                adminNotes: formData.get('adminNotes'),
                              };
                              handleUpdateRequest(updates);
                            }} className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <Label>Status</Label>
                                  <Select name="status" defaultValue={request.status}>
                                    <SelectTrigger data-testid="select-update-status">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pending">Pending</SelectItem>
                                      <SelectItem value="in_progress">In Progress</SelectItem>
                                      <SelectItem value="completed">Completed</SelectItem>
                                      <SelectItem value="cancelled">Cancelled</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Priority</Label>
                                  <Select name="priority" defaultValue={request.priority || "normal"}>
                                    <SelectTrigger data-testid="select-update-priority">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="low">Low</SelectItem>
                                      <SelectItem value="normal">Normal</SelectItem>
                                      <SelectItem value="high">High</SelectItem>
                                      <SelectItem value="urgent">Urgent</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div>
                                <Label>Assigned To</Label>
                                <Input 
                                  name="assignedTo" 
                                  defaultValue={request.assignedTo || ""}
                                  placeholder="Enter admin name"
                                  data-testid="input-assigned-to"
                                />
                              </div>
                              <div>
                                <Label>Admin Notes</Label>
                                <Textarea 
                                  name="adminNotes" 
                                  defaultValue={request.adminNotes || ""}
                                  rows={4}
                                  placeholder="Add notes about this request..."
                                  data-testid="textarea-admin-notes"
                                />
                              </div>
                              <div className="flex justify-end space-x-3">
                                <Button type="button" variant="outline" onClick={() => setShowUpdateModal(false)}>
                                  Cancel
                                </Button>
                                <Button type="submit" disabled={updateRequestMutation.isPending}>
                                  {updateRequestMutation.isPending ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                      Updating...
                                    </>
                                  ) : (
                                    "Update Request"
                                  )}
                                </Button>
                              </div>
                            </form>
                          </DialogContent>
                        </Dialog>
                        
                        {request.phoneNumber && (
                          <Button size="sm" variant="outline" data-testid={`button-call-${request.id}`}>
                            <Phone className="h-4 w-4 mr-2" />
                            Call
                          </Button>
                        )}
                        {request.emailAddress && (
                          <Button size="sm" variant="outline" data-testid={`button-email-${request.id}`}>
                            <Mail className="h-4 w-4 mr-2" />
                            Email
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}