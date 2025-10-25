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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Mail, MessageSquare, Clock, CheckCircle, XCircle, AlertCircle, User, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

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
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "called":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "no_answer":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "scheduled":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "in_progress":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400";
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "cancelled":
        return "bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300";
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
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      case "high":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "normal":
        return "bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300";
      case "low":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300";
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
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Consumer Requests</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Manage callback requests and inquiries from consumers
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="shadow-sm border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">{statusCounts.all}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">{statusCounts.pending}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">{statusCounts.in_progress}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">In Progress</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">{statusCounts.completed}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="shadow-sm border">
          <CardHeader>
            <CardTitle className="text-base">Filter Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex space-x-4">
              <div>
                <Label htmlFor="status-filter" className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-48 mt-1.5" data-testid="select-status-filter">
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
        <Card className="shadow-sm border">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Requests ({filteredRequests.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filteredRequests.length === 0 ? (
              <div className="text-center py-16 px-6">
                <div className="inline-flex p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
                  <MessageSquare className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">No Requests</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {filterStatus === "all" 
                    ? "No callback requests have been submitted yet." 
                    : `No ${filterStatus.replace("_", " ")} requests found.`
                  }
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredRequests.map((request: any) => (
                  <div key={request.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-md text-slate-600 dark:text-slate-400">
                            {getRequestTypeIcon(request.requestType)}
                          </div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                            {request.consumerName}
                          </h3>
                          <Badge className={cn(getStatusColor(request.status), "text-xs font-medium")}>
                            {getStatusLabel(request.status)}
                          </Badge>
                          <Badge className={cn(getPriorityColor(request.priority), "text-xs font-medium")}>
                            {request.priority || "normal"}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 mb-4">
                          <div>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Request Type</p>
                            <p className="text-sm font-medium text-slate-900 dark:text-white capitalize mt-0.5">
                              {request.requestType?.replace("_", " ")}
                            </p>
                          </div>
                          {request.preferredTime && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Preferred Time</p>
                              <p className="text-sm font-medium text-slate-900 dark:text-white capitalize mt-0.5">{request.preferredTime}</p>
                            </div>
                          )}
                          {request.phoneNumber && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Phone Number</p>
                              <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">{request.phoneNumber}</p>
                            </div>
                          )}
                          {request.emailAddress && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Email Address</p>
                              <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">{request.emailAddress}</p>
                            </div>
                          )}
                        </div>

                        {request.subject && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Subject</p>
                            <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">{request.subject}</p>
                          </div>
                        )}

                        {request.message && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Message</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{request.message}</p>
                          </div>
                        )}

                        <div className="flex items-center flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400 mt-4">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>Submitted: {formatDate(request.createdAt)}</span>
                          </div>
                          {request.assignedTo && (
                            <div className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" />
                              <span>Assigned to: {request.assignedTo}</span>
                            </div>
                          )}
                          {request.resolvedAt && (
                            <div className="flex items-center gap-1.5">
                              <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                              <span>Resolved: {formatDate(request.resolvedAt)}</span>
                            </div>
                          )}
                        </div>

                        {request.adminNotes && (
                          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50">
                            <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 uppercase tracking-wide mb-1">Admin Notes</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{request.adminNotes}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        {request.status !== "completed" && (
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => handleConfirmRequest(request.id)}
                            className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 gap-1.5"
                            data-testid={`button-confirm-${request.id}`}
                          >
                            <CheckCircle className="h-4 w-4" />
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
                        
                        {request.phoneNumber && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => window.location.href = `tel:${request.phoneNumber}`}
                            data-testid={`button-call-${request.id}`}
                            className="gap-1.5"
                          >
                            <Phone className="h-4 w-4" />
                            Call
                          </Button>
                        )}
                        {request.emailAddress && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => navigate(`/communications?email=${encodeURIComponent(request.emailAddress)}&name=${encodeURIComponent(request.consumerName)}&tab=send`)}
                            data-testid={`button-email-${request.id}`}
                            className="gap-1.5"
                          >
                            <Mail className="h-4 w-4" />
                            Email
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleDeleteRequest(request.id)}
                          data-testid={`button-delete-${request.id}`}
                          className="gap-1.5"
                        >
                          <XCircle className="h-4 w-4" />
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

      {/* Update Request Dialog */}
      <Dialog open={showUpdateModal} onOpenChange={(open) => {
        if (!open) {
          setShowUpdateModal(false);
          setSelectedRequest(null);
          setUpdateFormStatus("");
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Update Request - {selectedRequest?.consumerName}</DialogTitle>
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
                <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</Label>
                <Select 
                  name="status" 
                  defaultValue={selectedRequest?.status}
                  onValueChange={(value) => setUpdateFormStatus(value)}
                >
                  <SelectTrigger data-testid="select-update-status" className="mt-1.5">
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
                <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Priority</Label>
                <Select name="priority" defaultValue={selectedRequest?.priority || "normal"}>
                  <SelectTrigger data-testid="select-update-priority" className="mt-1.5">
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
              <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Assigned To</Label>
              <Input 
                name="assignedTo" 
                defaultValue={selectedRequest?.assignedTo || ""}
                placeholder="Enter admin name"
                data-testid="input-assigned-to"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Admin Notes</Label>
              <Textarea 
                name="adminNotes" 
                defaultValue={selectedRequest?.adminNotes || ""}
                rows={4}
                placeholder="Add notes about this request..."
                data-testid="textarea-admin-notes"
                className="mt-1.5"
              />
            </div>
            
            {updateFormStatus === "scheduled" && (
              <div>
                <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Scheduled For</Label>
                <Input 
                  type="datetime-local"
                  name="scheduledFor" 
                  defaultValue={selectedRequest?.scheduledFor ? new Date(selectedRequest.scheduledFor).toISOString().slice(0, 16) : ""}
                  placeholder="Select date and time"
                  data-testid="input-scheduled-for"
                  className="mt-1.5"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">Set the date and time for this callback</p>
              </div>
            )}
            
            <div className="flex justify-end gap-2 pt-2">
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
    </AdminLayout>
  );
}
