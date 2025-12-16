import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { UserPlus, Trash2, Edit, Users, Lock, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  restrictedServices: string[] | null;
  lastLoginAt: string | null;
  createdAt: string;
}

const AVAILABLE_SERVICES = [
  { id: 'sms', label: 'SMS Campaigns', description: 'Send and manage SMS campaigns' },
  { id: 'email', label: 'Email Campaigns', description: 'Send and manage email campaigns' },
  { id: 'payments', label: 'Payment Processing', description: 'Process payments and refunds' },
  { id: 'import', label: 'Data Import', description: 'Import consumers and accounts' },
  { id: 'reports', label: 'Reports', description: 'View analytics and reports' },
  { id: 'documents', label: 'Documents', description: 'Manage document templates' },
  { id: 'automations', label: 'Automations', description: 'Create and manage automations' },
];

interface TeamMembersSectionProps {
  cardBaseClasses: string;
  inputClasses: string;
}

export default function TeamMembersSection({ cardBaseClasses, inputClasses }: TeamMembersSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    restrictedServices: [] as string[],
  });

  const { data: teamMembers = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/team-members", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setShowAddModal(false);
      resetForm();
      toast({ title: "Team member created successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create team member", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/team-members/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setShowEditModal(false);
      setSelectedMember(null);
      resetForm();
      toast({ title: "Team member updated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update team member", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/team-members/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      setShowDeleteDialog(false);
      setSelectedMember(null);
      toast({ title: "Team member deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete team member", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const resetForm = () => {
    setFormData({
      username: "",
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      restrictedServices: [],
    });
    setShowPassword(false);
  };

  const handleAddMember = () => {
    createMutation.mutate(formData);
  };

  const handleUpdateMember = () => {
    if (!selectedMember) return;
    const updateData: any = {
      email: formData.email,
      firstName: formData.firstName,
      lastName: formData.lastName,
      restrictedServices: formData.restrictedServices,
    };
    if (formData.password) {
      updateData.password = formData.password;
    }
    updateMutation.mutate({ id: selectedMember.id, data: updateData });
  };

  const handleDeleteMember = () => {
    if (!selectedMember) return;
    deleteMutation.mutate(selectedMember.id);
  };

  const handleEditClick = (member: TeamMember) => {
    setSelectedMember(member);
    setFormData({
      username: member.username,
      email: member.email,
      password: "",
      firstName: member.firstName || "",
      lastName: member.lastName || "",
      restrictedServices: member.restrictedServices || [],
    });
    setShowEditModal(true);
  };

  const handleDeleteClick = (member: TeamMember) => {
    setSelectedMember(member);
    setShowDeleteDialog(true);
  };

  const toggleService = (serviceId: string) => {
    setFormData(prev => ({
      ...prev,
      restrictedServices: prev.restrictedServices.includes(serviceId)
        ? prev.restrictedServices.filter(s => s !== serviceId)
        : [...prev.restrictedServices, serviceId],
    }));
  };

  const toggleMemberActive = async (member: TeamMember) => {
    try {
      await updateMutation.mutateAsync({
        id: member.id,
        data: { isActive: !member.isActive }
      });
    } catch (e) {
    }
  };

  const owners = teamMembers.filter(m => m.role === 'owner');
  const subUsers = teamMembers.filter(m => m.role !== 'owner');
  const canAddSubUser = subUsers.length < 1;

  return (
    <Card className={cardBaseClasses}>
      <CardHeader className="space-y-1 text-white">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl font-semibold text-white flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription className="text-blue-100/70">
              Manage access for your team. You can add 1 additional user who will have access to all features except billing.
            </CardDescription>
          </div>
          {canAddSubUser && (
            <Button
              onClick={() => {
                resetForm();
                setShowAddModal(true);
              }}
              className="bg-gradient-to-r from-sky-500/80 to-indigo-500/80 hover:from-sky-400/80 hover:to-indigo-400/80"
              data-testid="button-add-team-member"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Team Member
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="text-center py-8 text-blue-100/70">Loading team members...</div>
        ) : (
          <div className="space-y-4">
            {owners.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-blue-100/70 uppercase tracking-wider">Owner</h3>
                {owners.map(member => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5"
                    data-testid={`team-member-${member.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-white font-semibold">
                        {(member.firstName?.[0] || member.username[0]).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-white">
                          {member.firstName && member.lastName 
                            ? `${member.firstName} ${member.lastName}` 
                            : member.username}
                        </div>
                        <div className="text-sm text-blue-100/70">{member.email}</div>
                      </div>
                    </div>
                    <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/30">
                      <Lock className="h-3 w-3 mr-1" />
                      Owner
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {subUsers.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-blue-100/70 uppercase tracking-wider">Team Members</h3>
                {subUsers.map(member => (
                  <div
                    key={member.id}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-lg border border-white/10",
                      member.isActive ? "bg-white/5" : "bg-red-500/5 border-red-500/20"
                    )}
                    data-testid={`team-member-${member.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold",
                        member.isActive 
                          ? "bg-gradient-to-br from-emerald-400 to-teal-500"
                          : "bg-gray-500"
                      )}>
                        {(member.firstName?.[0] || member.username[0]).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-white flex items-center gap-2">
                          {member.firstName && member.lastName 
                            ? `${member.firstName} ${member.lastName}` 
                            : member.username}
                          {!member.isActive && (
                            <Badge variant="outline" className="text-red-300 border-red-400/30 text-xs">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-blue-100/70">{member.email}</div>
                        {member.restrictedServices && member.restrictedServices.length > 0 && (
                          <div className="text-xs text-blue-100/50 mt-1">
                            Restricted: {member.restrictedServices.filter(s => s !== 'billing').join(', ') || 'None'}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(member)}
                        className="text-blue-100 hover:text-white hover:bg-white/10"
                        data-testid={`button-edit-member-${member.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(member)}
                        className="text-red-300 hover:text-red-200 hover:bg-red-500/10"
                        data-testid={`button-delete-member-${member.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border border-dashed border-white/20 rounded-lg">
                <Users className="h-12 w-12 mx-auto text-blue-100/40 mb-3" />
                <p className="text-blue-100/70">No team members added yet</p>
                <p className="text-sm text-blue-100/50 mt-1">
                  Add a team member to give them access to your account
                </p>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-200">
            <strong>Note:</strong> Team members automatically cannot access the Billing section. 
            You can further restrict their access to other features using the toggles when adding or editing a member.
          </p>
        </div>
      </CardContent>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="border-white/10 bg-[#0f172a] text-white sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Add Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-blue-100">First Name</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="John"
                  className={inputClasses}
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-blue-100">Last Name</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Doe"
                  className={inputClasses}
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-blue-100">Username *</Label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                placeholder="johndoe"
                className={inputClasses}
                data-testid="input-username"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-blue-100">Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john@example.com"
                className={inputClasses}
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-blue-100">Password *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Minimum 6 characters"
                  className={cn(inputClasses, "pr-10")}
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-100/60 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            
            <div className="space-y-3 pt-4 border-t border-white/10">
              <Label className="text-blue-100">Feature Restrictions</Label>
              <p className="text-xs text-blue-100/60">
                Toggle off features you want to restrict for this user. Billing is always restricted.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 opacity-60">
                  <div>
                    <div className="text-sm font-medium text-white">Billing</div>
                    <div className="text-xs text-blue-100/60">Always restricted for team members</div>
                  </div>
                  <Switch checked={false} disabled />
                </div>
                {AVAILABLE_SERVICES.map(service => (
                  <div 
                    key={service.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                  >
                    <div>
                      <div className="text-sm font-medium text-white">{service.label}</div>
                      <div className="text-xs text-blue-100/60">{service.description}</div>
                    </div>
                    <Switch
                      checked={!formData.restrictedServices.includes(service.id)}
                      onCheckedChange={() => toggleService(service.id)}
                      data-testid={`switch-service-${service.id}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddModal(false)}
              className="border-white/20 text-blue-100 hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMember}
              disabled={!formData.username || !formData.email || !formData.password || createMutation.isPending}
              className="bg-gradient-to-r from-sky-500/80 to-indigo-500/80 hover:from-sky-400/80 hover:to-indigo-400/80"
              data-testid="button-submit-add-member"
            >
              {createMutation.isPending ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="border-white/10 bg-[#0f172a] text-white sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Edit Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-blue-100">First Name</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="John"
                  className={inputClasses}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-blue-100">Last Name</Label>
                <Input
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Doe"
                  className={inputClasses}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-blue-100">Username</Label>
              <Input
                value={formData.username}
                disabled
                className={cn(inputClasses, "opacity-60")}
              />
              <p className="text-xs text-blue-100/50">Username cannot be changed</p>
            </div>
            <div className="space-y-2">
              <Label className="text-blue-100">Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john@example.com"
                className={inputClasses}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-blue-100">New Password (leave blank to keep current)</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter new password"
                  className={cn(inputClasses, "pr-10")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-100/60 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
              <div>
                <div className="text-sm font-medium text-white">Account Active</div>
                <div className="text-xs text-blue-100/60">Disable to prevent login</div>
              </div>
              <Switch
                checked={selectedMember?.isActive ?? true}
                onCheckedChange={() => selectedMember && toggleMemberActive(selectedMember)}
              />
            </div>
            
            <div className="space-y-3 pt-4 border-t border-white/10">
              <Label className="text-blue-100">Feature Restrictions</Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 opacity-60">
                  <div>
                    <div className="text-sm font-medium text-white">Billing</div>
                    <div className="text-xs text-blue-100/60">Always restricted</div>
                  </div>
                  <Switch checked={false} disabled />
                </div>
                {AVAILABLE_SERVICES.map(service => (
                  <div 
                    key={service.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                  >
                    <div>
                      <div className="text-sm font-medium text-white">{service.label}</div>
                      <div className="text-xs text-blue-100/60">{service.description}</div>
                    </div>
                    <Switch
                      checked={!formData.restrictedServices.includes(service.id)}
                      onCheckedChange={() => toggleService(service.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditModal(false)}
              className="border-white/20 text-blue-100 hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateMember}
              disabled={!formData.email || updateMutation.isPending}
              className="bg-gradient-to-r from-sky-500/80 to-indigo-500/80 hover:from-sky-400/80 hover:to-indigo-400/80"
              data-testid="button-submit-edit-member"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="border-white/10 bg-[#0f172a] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team Member</AlertDialogTitle>
            <AlertDialogDescription className="text-blue-100/70">
              Are you sure you want to delete {selectedMember?.firstName || selectedMember?.username}? 
              This action cannot be undone and they will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20 text-blue-100 hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMember}
              className="bg-red-500/80 hover:bg-red-400/80 text-white"
              data-testid="button-confirm-delete-member"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
