import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTerminology } from "@/hooks/use-terminology";
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
  const terminology = useTerminology();
  const [, navigate] = useLocation();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [updateFormStatus, setUpdateFormStatus] = useState<string>("");

  // Sync updateFormStatus when selectedRequest changes or modal opens
  useEffect(() => {
    if (selectedRequest && showUpdateModal) {
      setUpdateFormStatus(selectedRequest.status || "");
    } else if (!showUpdateModal) {
      setUpdateFormStatus("");
    }
  }, [selectedRequest, showUpdateModal]);

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
      setUpdateFormStatus("");
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update request.",
        variant: "destructive",
      });
    },
  });

  const deleteRequestMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/callback-requests/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Request Deleted",
        description: "The callback request has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/callback-requests"] });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete request.",
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

  const handleConfirmRequest = (id: string) => {
    updateRequestMutation.mutate({
      id,
      updates: { status: "completed" },
    });
  };

  const handleDeleteRequest = (id: string) => {
    if (confirm("Are you sure you want to delete this request?")) {
      deleteRequestMutation.mutate(id);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "called":
        return "bg-blue-100 text-blue-800";
      case "no_answer":
        return "bg-orange-100 text-orange-800";
      case "scheduled":
        return "bg-purple-100 text-purple-800";
      case "in_progress":
        return "bg-cyan-100 text-cyan-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status?.toLowerCase()) {
      case "pending":
        return "Pending";
      case "called":
        return terminology.statusCalled;
      case "no_answer":
        return terminology.statusNoAnswer;
      case "scheduled":
        return terminology.statusScheduled;
      case "in_progress":
        return terminology.statusInProgress;
      case "completed":
        return terminology.statusCompleted;
      case "cancelled":
        return "Cancelled";
      default:
        return status;
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
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100"></div>
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
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Consumer Requests</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
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
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">{statusCounts.all}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Requests</p>
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
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">{statusCounts.pending}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pending</p>
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
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">{statusCounts.in_progress}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">In Progress</p>
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
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">{statusCounts.completed}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Completed</p>
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
                    <SelectItem value="called">{terminology.statusCalled}</SelectItem>
                    <SelectItem value="no_answer">{terminology.statusNoAnswer}</SelectItem>
                    <SelectItem value="scheduled">{terminology.statusScheduled}</SelectItem>
                    <SelectItem value="in_progress">{terminology.statusInProgress}</SelectItem>
                    <SelectItem value="completed">{terminology.statusCompleted}</SelectItem>
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
              <div className="text-center py-12">
                <MessageSquare className="h-12 w-12 text-slate-400 dark:text-slate-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No Requests</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {filterStatus === "all" 
                    ? "No callback requests have been submitted yet." 
                    : `No ${filterStatus.replace("_", " ")} requests found.`
                  }
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredRequests.map((request: any) => (
                  <div key={request.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-3">
                          <div className="text-slate-600 dark:text-slate-400">
                            {getRequestTypeIcon(request.requestType)}
                          </div>
                          <h3 className="font-semibold text-slate-900 dark:text-white">
                            {request.consumerName}
                          </h3>
                          <Badge className={getStatusColor(request.status)}>
                            {getStatusLabel(request.status)}
                          </Badge>
                          <Badge className={getPriorityColor(request.priority)}>
                            {request.priority || "normal"}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Request Type</p>
                            <p className="text-sm font-medium text-slate-900 dark:text-white capitalize">
                              {request.requestType?.replace("_", " ")}
                            </p>
                          </div>
                          {request.preferredTime && (
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Preferred Time</p>
                              <p className="text-sm font-medium text-slate-900 dark:text-white capitalize">{request.preferredTime}</p>
                            </div>
                          )}
                          {request.phoneNumber && (
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Phone Number</p>
                              <p className="text-sm font-medium text-slate-900 dark:text-white">{request.phoneNumber}</p>
                            </div>
                          )}
                          {request.emailAddress && (
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Email Address</p>
                              <p className="text-sm font-medium text-slate-900 dark:text-white">{request.emailAddress}</p>
                            </div>
                          )}
                        </div>

                        {request.subject && (
                          <div className="mb-3">
                            <p className="text-xs text-slate-500 dark:text-slate-400">Subject</p>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{request.subject}</p>
                          </div>
                        )}

                        {request.message && (
                          <div className="mb-3">
                            <p className="text-xs text-slate-500 dark:text-slate-400">Message</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{request.message}</p>
                          </div>
                        )}

                        <div className="flex items-center flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>Submitted: {formatDate(request.createdAt)}</span>
                          </div>
                          {request.assignedTo && (
                            <div className="flex items-center gap-1">
                              <User className="h-3.5 w-3.5" />
                              <span>Assigned to: {request.assignedTo}</span>
                            </div>
                          )}
                          {request.resolvedAt && (
                            <div className="flex items-center gap-1">
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span>Resolved: {formatDate(request.resolvedAt)}</span>
                            </div>
                          )}
                        </div>

                        {request.adminNotes && (
                          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Admin Notes</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{request.adminNotes}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="ml-6 flex flex-col space-y-2">
                        {request.status !== "completed" && (
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => handleConfirmRequest(request.id)}
                            className="bg-green-600 hover:bg-green-700"
                            data-testid={`button-confirm-${request.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Confirm
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(request);
                            setShowUpdateModal(true);
                          }}
                          data-testid={`button-update-${request.id}`}
                        >
                          Update
                        </Button>
                        
                        <Dialog open={showUpdateModal && selectedRequest?.id === request.id} onOpenChange={(open) => {
                          if (!open) {
                            setShowUpdateModal(false);
                            setSelectedRequest(null);
                            setUpdateFormStatus("");
                          }
                        }}>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Update Request - {request.consumerName}</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={(e) => {
                              e.preventDefault();
                              const formData = new FormData(e.currentTarget);
                              const updates: any = {
                                status: formData.get('status'),
                                priority: formData.get('priority'),
                                assignedTo: formData.get('assignedTo'),
                                adminNotes: formData.get('adminNotes'),
                              };
                              
                              // Include scheduledFor if status is "scheduled"
                              if (updates.status === 'scheduled') {
                                const scheduledFor = formData.get('scheduledFor');
                                if (scheduledFor) {
                                  updates.scheduledFor = new Date(scheduledFor as string).toISOString();
                                }
                              }
                              
                              handleUpdateRequest(updates);
                            }} className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <Label>Status</Label>
                                  <Select 
                                    name="status" 
                                    defaultValue={request.status}
                                    onValueChange={(value) => setUpdateFormStatus(value)}
                                  >
                                    <SelectTrigger data-testid="select-update-status">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pending">Pending</SelectItem>
                                      <SelectItem value="called">{terminology.statusCalled}</SelectItem>
                                      <SelectItem value="no_answer">{terminology.statusNoAnswer}</SelectItem>
                                      <SelectItem value="scheduled">{terminology.statusScheduled}</SelectItem>
                                      <SelectItem value="in_progress">{terminology.statusInProgress}</SelectItem>
                                      <SelectItem value="completed">{terminology.statusCompleted}</SelectItem>
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
                              
                              {updateFormStatus === "scheduled" && (
                                <div>
                                  <Label>Scheduled For</Label>
                                  <Input 
                                    type="datetime-local"
                                    name="scheduledFor" 
                                    defaultValue={request.scheduledFor ? new Date(request.scheduledFor).toISOString().slice(0, 16) : ""}
                                    placeholder="Select date and time"
                                    data-testid="input-scheduled-for"
                                  />
                                  <p className="text-sm text-gray-500 mt-1">Set the date and time for this callback</p>
                                </div>
                              )}
                              
                              <div className="flex justify-end space-x-3">
                                <Button 
                                  type="button" 
                                  variant="outline" 
                                  onClick={() => setShowUpdateModal(false)}
                                >
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
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => window.location.href = `tel:${request.phoneNumber}`}
                            data-testid={`button-call-${request.id}`}
                          >
                            <Phone className="h-4 w-4 mr-2" />
                            Call
                          </Button>
                        )}
                        {request.emailAddress && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => navigate(`/communications?email=${encodeURIComponent(request.emailAddress)}&name=${encodeURIComponent(request.consumerName)}&tab=send`)}
                            data-testid={`button-email-${request.id}`}
                          >
                            <Mail className="h-4 w-4 mr-2" />
                            Email
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleDeleteRequest(request.id)}
                          data-testid={`button-delete-${request.id}`}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
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