import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function TenantSetup() {
  const [agencyName, setAgencyName] = useState("");
  const [agencySlug, setAgencySlug] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const setupMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      await apiRequest("POST", "/api/setup-tenant", data);
    },
    onSuccess: () => {
      toast({
        title: "Agency Setup Complete",
        description: "Your agency has been configured successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      // Refresh the page to reload with tenant access
      window.location.reload();
    },
    onError: (error) => {
      toast({
        title: "Setup Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSetup = () => {
    if (!agencyName) {
      toast({
        title: "Missing Information",
        description: "Please enter your agency name.",
        variant: "destructive",
      });
      return;
    }

    const slug = agencySlug || agencyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    
    setupMutation.mutate({
      name: agencyName,
      slug: slug,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Setup Your Agency</CardTitle>
          <p className="text-center text-sm text-gray-600">
            Configure your agency to get started
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="agency-name">Agency Name *</Label>
            <Input
              id="agency-name"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              placeholder="ABC Collection Agency"
            />
          </div>
          
          <div>
            <Label htmlFor="agency-slug">Agency URL Slug (optional)</Label>
            <Input
              id="agency-slug"
              value={agencySlug}
              onChange={(e) => setAgencySlug(e.target.value)}
              placeholder="abc-collections"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used for consumer portal URLs. Leave blank to auto-generate.
            </p>
          </div>
          
          <Button 
            onClick={handleSetup} 
            className="w-full"
            disabled={setupMutation.isPending}
          >
            {setupMutation.isPending ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Setting up...
              </>
            ) : (
              <>
                <i className="fas fa-check mr-2"></i>
                Complete Setup
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}