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
        return "border border-amber-400/40 bg-amber-500/20 text-amber-100";
      case "called":
        return "border border-sky-400/40 bg-sky-500/20 text-sky-100";
      case "no_answer":
        return "border border-orange-400/40 bg-orange-500/20 text-orange-100";
      case "scheduled":
        return "border border-purple-400/40 bg-purple-500/20 text-purple-100";
      case "in_progress":
        return "border border-cyan-400/40 bg-cyan-500/20 text-cyan-100";
      case "completed":
        return "border border-emerald-400/40 bg-emerald-500/20 text-emerald-100";
      case "cancelled":
        return "border border-slate-400/40 bg-slate-500/20 text-slate-200";
      default:
        return "border border-slate-400/30 bg-slate-500/10 text-slate-100";
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
        return "border border-rose-400/40 bg-rose-500/20 text-rose-100";
      case "high":
        return "border border-orange-400/40 bg-orange-500/20 text-orange-100";
      case "normal":
        return "border border-slate-400/30 bg-slate-500/10 text-slate-100";
      case "low":
        return "border border-emerald-400/40 bg-emerald-500/20 text-emerald-100";
      default:
        return "border border-slate-400/30 bg-slate-500/10 text-slate-100";
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

  const glassPanelClass = "rounded-3xl border border-white/15 bg-[#0b1733]/80 text-blue-50 shadow-xl shadow-blue-900/20 backdrop-blur";
  const frostedCardClass = "rounded-3xl border border-white/15 bg-white/10 p-6 text-blue-50 shadow-xl shadow-blue-900/30 backdrop-blur";

  return (
    <AdminLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 text-blue-50 sm:px-6 lg:px-8">
        {/* Header */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/20 via-blue-600/20 to-indigo-900/20 p-8 shadow-2xl shadow-blue-900/40 backdrop-blur">
          <div className="pointer-events-none absolute -right-10 top-10 h-64 w-64 rounded-full bg-purple-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-8 h-56 w-56 rounded-full bg-blue-500/30 blur-3xl" />
          <div className="relative z-10 space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100/80">
              <MessageSquare className="h-3.5 w-3.5" />
              Consumer communications hub
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">Consumer Requests</h1>
              <p className="text-sm text-blue-100/70 sm:text-base">
                Manage callback requests and inquiries from consumers
              </p>
            </div>
          </div>
        </section>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
            <CardContent className="flex items-center gap-4 p-6">
              <span className="rounded-2xl bg-sky-500/20 p-3 text-sky-300">
                <MessageSquare className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-100/70">Total Requests</p>
                <p className="mt-2 text-2xl font-semibold text-white">{statusCounts.all}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
            <CardContent className="flex items-center gap-4 p-6">
              <span className="rounded-2xl bg-amber-500/20 p-3 text-amber-200">
                <Clock className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-100/70">Pending</p>
                <p className="mt-2 text-2xl font-semibold text-white">{statusCounts.pending}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
            <CardContent className="flex items-center gap-4 p-6">
              <span className="rounded-2xl bg-sky-500/20 p-3 text-sky-300">
                <AlertCircle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-100/70">In Progress</p>
                <p className="mt-2 text-2xl font-semibold text-white">{statusCounts.in_progress}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-white/10 bg-[#101c3c]/70 text-blue-50 shadow-lg shadow-blue-900/20">
            <CardContent className="flex items-center gap-4 p-6">
              <span className="rounded-2xl bg-emerald-500/20 p-3 text-emerald-300">
                <CheckCircle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-100/70">Completed</p>
                <p className="mt-2 text-2xl font-semibold text-white">{statusCounts.completed}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className={glassPanelClass}>
          <CardHeader className="border-b border-white/20 pb-4">
            <CardTitle className="text-lg font-semibold text-white">Filter Requests</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div>
              <Label htmlFor="status-filter" className="text-sm font-semibold text-blue-100/80">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full max-w-xs mt-2 rounded-xl border border-white/20 bg-white/10 text-blue-50 backdrop-blur placeholder:text-blue-100/60" data-testid="select-status-filter">
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
          </CardContent>
        </Card>

        {/* Requests List */}
        <Card className={glassPanelClass}>
          <CardHeader className="border-b border-white/20 pb-4">
            <CardTitle className="text-lg font-semibold text-white">Requests ({filteredRequests.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {filteredRequests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 py-16 text-center text-blue-100/70">
                <MessageSquare className="mx-auto mb-4 h-12 w-12 text-blue-200/80" />
                <h3 className="text-lg font-semibold text-blue-50">No Requests</h3>
                <p className="mt-2 text-sm text-blue-100/70">
                  {filterStatus === "all" 
                    ? "No callback requests have been submitted yet." 
                    : `No ${filterStatus.replace("_", " ")} requests found.`
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map((request: any) => (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-white/15 bg-white/5 p-5 text-blue-50 shadow-sm shadow-blue-900/10 transition hover:-translate-y-0.5 hover:border-white/25 hover:shadow-lg"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex-1 min-w-0 space-y-4">
                        <div className="flex items-center flex-wrap gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-blue-100">
                            {getRequestTypeIcon(request.requestType)}
                          </span>
                          <div>
                            <h3 className="text-base font-semibold text-white">{request.consumerName}</h3>
                            <p className="text-sm text-blue-100/80 capitalize">{request.requestType?.replace("_", " ")}</p>
                          </div>
                          <Badge className={cn("rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide", getStatusColor(request.status))}>
                            {getStatusLabel(request.status)}
                          </Badge>
                          <Badge className={cn("rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide", getPriorityColor(request.priority))}>
                            {request.priority || "normal"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-blue-100/80">
                          {request.preferredTime && (
                            <div>
                              <span className="text-xs uppercase tracking-wide text-blue-200/80">Preferred Time</span>
                              <p className="mt-1 font-semibold text-blue-50 capitalize">{request.preferredTime}</p>
                            </div>
                          )}
                          {request.phoneNumber && (
                            <div>
                              <span className="text-xs uppercase tracking-wide text-blue-200/80">Phone Number</span>
                              <p className="mt-1 font-semibold text-blue-50">{request.phoneNumber}</p>
                            </div>
                          )}
                          {request.emailAddress && (
                            <div>
                              <span className="text-xs uppercase tracking-wide text-blue-200/80">Email Address</span>
                              <p className="mt-1 font-semibold text-blue-50">{request.emailAddress}</p>
                            </div>
                          )}
                        </div>

                        {request.subject && (
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                            <span className="text-xs uppercase tracking-wide text-blue-200/80">Subject</span>
                            <p className="mt-1 text-blue-50">{request.subject}</p>
                          </div>
                        )}

                        {request.message && (
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                            <span className="text-xs uppercase tracking-wide text-blue-200/80">Message</span>
                            <p className="mt-1 text-blue-100/90">{request.message}</p>
                          </div>
                        )}

                        <div className="flex items-center flex-wrap gap-4 text-xs text-blue-100/70">
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
                            <div className="flex items-center gap-1.5 text-emerald-300">
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span>Resolved: {formatDate(request.resolvedAt)}</span>
                            </div>
                          )}
                        </div>

                        {request.adminNotes && (
                          <div className="rounded-2xl border border-sky-400/40 bg-sky-500/10 p-4">
                            <p className="text-xs font-semibold text-sky-200 uppercase tracking-wide mb-2">Admin Notes</p>
                            <p className="text-sm text-blue-100/90">{request.adminNotes}</p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 flex-shrink-0">
                        {request.status !== "completed" && (
                          <Button 
                            onClick={() => handleConfirmRequest(request.id)}
                            className="rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 shadow-lg shadow-blue-900/20 transition hover:bg-emerald-500/30 gap-1.5"
                            data-testid={`button-confirm-${request.id}`}
                          >
                            <CheckCircle className="h-4 w-4" />
                            Confirm
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setSelectedRequest(request);
                            setShowUpdateModal(true);
                          }}
                          className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-white/20"
                          data-testid={`button-update-${request.id}`}
                        >
                          Update
                        </Button>
                        {request.phoneNumber && (
                          <Button 
                            variant="outline" 
                            onClick={() => window.location.href = `tel:${request.phoneNumber}`}
                            className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-white/20 gap-1.5"
                            data-testid={`button-call-${request.id}`}
                          >
                            <Phone className="h-4 w-4" />
                            Call
                          </Button>
                        )}
                        {request.emailAddress && (
                          <Button 
                            variant="outline" 
                            onClick={() => navigate(`/communications?email=${encodeURIComponent(request.emailAddress)}&name=${encodeURIComponent(request.consumerName)}&tab=send`)}
                            className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-white/20 gap-1.5"
                            data-testid={`button-email-${request.id}`}
                          >
                            <Mail className="h-4 w-4" />
                            Email
                          </Button>
                        )}
                        <Button 
                          onClick={() => handleDeleteRequest(request.id)}
                          className="rounded-xl border border-rose-400/40 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 shadow-lg shadow-blue-900/20 transition hover:bg-rose-500/30 gap-1.5"
                          data-testid={`button-delete-${request.id}`}
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
        <DialogContent className="max-w-2xl rounded-3xl border border-white/20 bg-[#0b1733]/95 text-blue-50">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-blue-50">Update Request - {selectedRequest?.consumerName}</DialogTitle>
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
                <Label className="text-sm font-semibold text-blue-100/80">Status</Label>
                <Select 
                  name="status" 
                  defaultValue={selectedRequest?.status}
                  onValueChange={(value) => setUpdateFormStatus(value)}
                >
                  <SelectTrigger data-testid="select-update-status" className="mt-2 rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60">
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
                <Label className="text-sm font-semibold text-blue-100/80">Priority</Label>
                <Select name="priority" defaultValue={selectedRequest?.priority || "normal"}>
                  <SelectTrigger data-testid="select-update-priority" className="mt-2 rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60">
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
              <Label className="text-sm font-semibold text-blue-100/80">Assigned To</Label>
              <Input 
                name="assignedTo" 
                defaultValue={selectedRequest?.assignedTo || ""}
                placeholder="Enter admin name"
                data-testid="input-assigned-to"
                className="mt-2 rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-blue-100/80">Admin Notes</Label>
              <Textarea 
                name="adminNotes" 
                defaultValue={selectedRequest?.adminNotes || ""}
                rows={4}
                placeholder="Add notes about this request..."
                data-testid="textarea-admin-notes"
                className="mt-2 rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60"
              />
            </div>

            {updateFormStatus === "scheduled" && (
              <div>
                <Label className="text-sm font-semibold text-blue-100/80">Scheduled For</Label>
                <Input 
                  type="datetime-local"
                  name="scheduledFor" 
                  defaultValue={selectedRequest?.scheduledFor ? new Date(selectedRequest.scheduledFor).toISOString().slice(0, 16) : ""}
                  placeholder="Select date and time"
                  data-testid="input-scheduled-for"
                  className="mt-2 rounded-xl border border-white/20 bg-white/10 text-blue-50 placeholder:text-blue-100/60"
                />
                <p className="text-xs text-blue-100/60 mt-2">Set the date and time for this callback</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowUpdateModal(false)}
                className="rounded-xl border border-white/20 bg-transparent px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateRequestMutation.isPending}
                className="rounded-xl border border-sky-400/40 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-blue-50 shadow-lg shadow-blue-900/20 transition hover:bg-sky-500/30"
              >
                {updateRequestMutation.isPending ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Updating...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
