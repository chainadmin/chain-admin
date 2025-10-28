import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, Phone, Edit, Trash2, Mail, MapPin, Calendar, UserCheck, UserX, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Consumers() {
  const [selectedConsumer, setSelectedConsumer] = useState<any>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConsumerId, setDeleteConsumerId] = useState<string | null>(null);
  const [registrationFilter, setRegistrationFilter] = useState<string>("all");
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });
  const [contactForm, setContactForm] = useState({
    method: "email",
    message: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: consumers, isLoading } = useQuery({
    queryKey: ["/api/consumers"],
  });

  // Update consumer mutation
  const updateConsumerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/consumers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      setShowEditDialog(false);
      toast({
        title: "Success",
        description: "Consumer information updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update consumer",
        variant: "destructive",
      });
    },
  });

  // Delete consumer mutation
  const deleteConsumerMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/consumers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consumers"] });
      setShowDeleteDialog(false);
      setDeleteConsumerId(null);
      toast({
        title: "Success",
        description: "Consumer deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete consumer",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (consumer: any) => {
    setSelectedConsumer(consumer);
    setEditForm({
      firstName: consumer.firstName || "",
      lastName: consumer.lastName || "",
      email: consumer.email || "",
      phone: consumer.phone || "",
      dateOfBirth: consumer.dateOfBirth || "",
      address: consumer.address || "",
      city: consumer.city || "",
      state: consumer.state || "",
      zipCode: consumer.zipCode || "",
    });
    setShowEditDialog(true);
  };

  const handleView = (consumer: any) => {
    setSelectedConsumer(consumer);
    setShowViewDialog(true);
  };

  const handleContact = (consumer: any) => {
    setSelectedConsumer(consumer);
    setContactForm({
      method: consumer.email ? "email" : "sms",
      message: "",
    });
    setShowContactDialog(true);
  };

  const handleDelete = (consumerId: string) => {
    setDeleteConsumerId(consumerId);
    setShowDeleteDialog(true);
  };

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedConsumer) {
      updateConsumerMutation.mutate({
        id: selectedConsumer.id,
        data: editForm,
      });
    }
  };

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ method, to, message }: { method: string; to: string; message: string }) => {
      if (method === "email") {
        return apiRequest("POST", "/api/test-email", {
          to,
          subject: `Message from ${(selectedConsumer?.firstName || '')} ${(selectedConsumer?.lastName || '')}`,
          message,
        });
      } else {
        return apiRequest("POST", "/api/send-test-sms", {
          to,
          message,
        });
      }
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Message Sent",
        description: `${variables.method === "email" ? "Email" : "SMS"} sent to ${selectedConsumer?.firstName} ${selectedConsumer?.lastName}`,
      });
      setShowContactDialog(false);
      setContactForm({ method: "email", message: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.message.trim()) {
      toast({
        title: "Error",
        description: "Please enter a message",
        variant: "destructive",
      });
      return;
    }
    
    const to = contactForm.method === "email" ? selectedConsumer?.email : selectedConsumer?.phone;
    if (!to) {
      toast({
        title: "Error",
        description: `Consumer has no ${contactForm.method} address`,
        variant: "destructive",
      });
      return;
    }

    sendMessageMutation.mutate({
      method: contactForm.method,
      to,
      message: contactForm.message,
    });
  };

  // Filter consumers based on registration status
  const filteredConsumers = (consumers as any[])?.filter((consumer) => {
    if (registrationFilter === "registered") return consumer.isRegistered;
    if (registrationFilter === "not_registered") return !consumer.isRegistered;
    return true; // "all"
  }) || [];

  // Calculate stats
  const totalConsumers = (consumers as any[])?.length || 0;
  const registeredCount = (consumers as any[])?.filter((c: any) => c.isRegistered).length || 0;
  const notRegisteredCount = totalConsumers - registeredCount;

  return (
    <AdminLayout>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Consumers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your consumer database
          </p>
        </div>

        {/* Registration Stats */}
        {!isLoading && totalConsumers > 0 && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Total Consumers</p>
                      <p className="text-2xl font-bold text-gray-900">{totalConsumers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <UserCheck className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Portal Registered</p>
                      <p className="text-2xl font-bold text-gray-900">{registeredCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <UserX className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Not Registered</p>
                      <p className="text-2xl font-bold text-gray-900">{notRegisteredCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 mt-8">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Consumer List</CardTitle>
                <div className="flex items-center gap-2">
                  <Label htmlFor="registration-filter" className="text-sm text-gray-600">
                    Filter:
                  </Label>
                  <Select
                    value={registrationFilter}
                    onValueChange={setRegistrationFilter}
                  >
                    <SelectTrigger id="registration-filter" className="w-[180px]" data-testid="select-registration-filter">
                      <SelectValue placeholder="All Consumers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" data-testid="option-all">All Consumers</SelectItem>
                      <SelectItem value="registered" data-testid="option-registered">Registered Only</SelectItem>
                      <SelectItem value="not_registered" data-testid="option-not-registered">Not Registered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading consumers...</div>
              ) : filteredConsumers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {totalConsumers === 0 
                    ? "No consumers found. Import account data to get started."
                    : "No consumers match the selected filter."}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredConsumers.map((consumer: any) => (
                    <div key={consumer.id} className="border-b pb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-700">
                              {consumer.firstName?.[0]}{consumer.lastName?.[0]}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900">
                                {consumer.firstName} {consumer.lastName}
                              </p>
                              <Badge 
                                variant={consumer.isRegistered ? "default" : "secondary"}
                                className={consumer.isRegistered ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-gray-100 text-gray-600 hover:bg-gray-100"}
                                data-testid={`badge-status-${consumer.id}`}
                              >
                                {consumer.isRegistered ? (
                                  <><UserCheck className="h-3 w-3 mr-1" /> Registered</>
                                ) : (
                                  <><UserX className="h-3 w-3 mr-1" /> Not Registered</>
                                )}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500">{consumer.email}</p>
                            {consumer.phone && (
                              <p className="text-sm text-gray-500">{consumer.phone}</p>
                            )}
                            {consumer.accountCount > 0 && (
                              <p className="text-xs text-gray-400 mt-1">
                                {consumer.accountCount} account{consumer.accountCount !== 1 ? 's' : ''}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleView(consumer)}
                            data-testid={`button-view-${consumer.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleContact(consumer)}
                            data-testid={`button-contact-${consumer.id}`}
                          >
                            <Phone className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(consumer)}
                            data-testid={`button-edit-${consumer.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleDelete(consumer.id)}
                            data-testid={`button-delete-${consumer.id}`}
                          >
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
        </div>
      </div>

      {/* View Consumer Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-2xl bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white">Consumer Details</DialogTitle>
          </DialogHeader>
          {selectedConsumer && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-gray-500">Name</Label>
                  <p className="font-medium">
                    {selectedConsumer.firstName} {selectedConsumer.lastName}
                  </p>
                </div>
                {selectedConsumer.email && (
                  <div>
                    <Label className="text-sm text-gray-500">Email</Label>
                    <p className="font-medium flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      {selectedConsumer.email}
                    </p>
                  </div>
                )}
                {selectedConsumer.phone && (
                  <div>
                    <Label className="text-sm text-gray-500">Phone</Label>
                    <p className="font-medium flex items-center gap-1">
                      <Phone className="h-4 w-4" />
                      {selectedConsumer.phone}
                    </p>
                  </div>
                )}
                {selectedConsumer.dateOfBirth && (
                  <div>
                    <Label className="text-sm text-gray-500">Date of Birth</Label>
                    <p className="font-medium flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {selectedConsumer.dateOfBirth}
                    </p>
                  </div>
                )}
                {(selectedConsumer.address || selectedConsumer.city || selectedConsumer.state || selectedConsumer.zipCode) && (
                  <div className="col-span-2">
                    <Label className="text-sm text-gray-500">Address</Label>
                    <p className="font-medium flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {[
                        selectedConsumer.address,
                        selectedConsumer.city,
                        selectedConsumer.state,
                        selectedConsumer.zipCode
                      ].filter(Boolean).join(", ")}
                    </p>
                  </div>
                )}
                <div className={selectedConsumer.registrationDate ? "" : "col-span-2"}>
                  <Label className="text-sm text-gray-500">Registration Status</Label>
                  <p className="font-medium flex items-center gap-1">
                    {selectedConsumer.isRegistered ? (
                      <>
                        <UserCheck className="h-4 w-4 text-green-600" />
                        <span className="text-green-600">Registered</span>
                      </>
                    ) : (
                      <>
                        <UserX className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-500">Not Registered</span>
                      </>
                    )}
                  </p>
                </div>
                {selectedConsumer.isRegistered && selectedConsumer.registrationDate && (
                  <div>
                    <Label className="text-sm text-gray-500">Registration Date</Label>
                    <p className="font-medium flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {new Date(selectedConsumer.registrationDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
                {selectedConsumer.folder && (
                  <div>
                    <Label className="text-sm text-gray-500">Folder</Label>
                    <p className="font-medium flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: selectedConsumer.folder.color }}
                      />
                      {selectedConsumer.folder.name}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Consumer Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white">Edit Consumer Information</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={editForm.dateOfBirth}
                  onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={editForm.state}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="zipCode">Zip Code</Label>
                <Input
                  id="zipCode"
                  value={editForm.zipCode}
                  onChange={(e) => setEditForm({ ...editForm, zipCode: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-white/20">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateConsumerMutation.isPending} className="bg-blue-600 text-white hover:bg-blue-700">
                {updateConsumerMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Contact Consumer Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent className="max-w-2xl bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#334155] border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white">
              Contact {selectedConsumer?.firstName} {selectedConsumer?.lastName}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleContactSubmit} className="space-y-4">
            <div>
              <Label htmlFor="contactMethod">Contact Method</Label>
              <select
                id="contactMethod"
                className="w-full p-2 border rounded"
                value={contactForm.method}
                onChange={(e) => setContactForm({ ...contactForm, method: e.target.value })}
              >
                {selectedConsumer?.email && <option value="email">Email</option>}
                {selectedConsumer?.phone && <option value="sms">SMS</option>}
              </select>
            </div>
            <div>
              <Label htmlFor="message">Message</Label>
              <textarea
                id="message"
                className="w-full p-2 border rounded min-h-[100px]"
                value={contactForm.message}
                onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                placeholder="Enter your message..."
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-white/20">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowContactDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700">
                Send Message
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Consumer Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Consumer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this consumer? This will also delete all associated accounts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConsumerId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConsumerId) {
                  deleteConsumerMutation.mutate(deleteConsumerId);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteConsumerMutation.isPending}
            >
              {deleteConsumerMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}