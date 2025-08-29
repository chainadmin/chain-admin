import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Mail, Lock, ArrowRight, UserCheck } from "lucide-react";

interface LoginForm {
  email: string;
  tenantSlug: string;
  dateOfBirth: string;
}

export default function ConsumerLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<LoginForm>({
    email: "",
    tenantSlug: "",
    dateOfBirth: "",
  });

  const loginMutation = useMutation({
    mutationFn: async (loginData: LoginForm) => {
      const response = await apiRequest("POST", "/api/consumer/login", loginData);
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Login Successful",
        description: "Welcome to your account portal!",
      });
      
      // Store consumer session data
      localStorage.setItem("consumerSession", JSON.stringify({
        email: form.email,
        tenantSlug: form.tenantSlug,
        consumerData: data.consumer,
      }));
      
      // Redirect to consumer portal
      setLocation(`/consumer-dashboard`);
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Unable to verify your information. Please check your details and try again.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof LoginForm, value: string) => {
    setForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.email || !form.tenantSlug || !form.dateOfBirth) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    loginMutation.mutate(form);
  };

  // Common agency slugs for quick selection
  const commonAgencies = [
    { slug: "agency-pro", name: "Agency Pro" },
    { slug: "collections-plus", name: "Collections Plus" },
    { slug: "debt-solutions", name: "Debt Solutions" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-full mx-auto flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Consumer Portal</h1>
          <p className="text-gray-600 mt-2">
            Access your account information securely
          </p>
        </div>

        {/* Login Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <UserCheck className="h-5 w-5 mr-2 text-blue-600" />
              Sign In to Your Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="your@email.com"
                    className="pl-10"
                    data-testid="input-consumer-email"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="agency">Your Collection Agency *</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-gray-400 z-10" />
                  <Select value={form.tenantSlug} onValueChange={(value) => handleInputChange("tenantSlug", value)}>
                    <SelectTrigger className="pl-10" data-testid="select-agency">
                      <SelectValue placeholder="Select your agency" />
                    </SelectTrigger>
                    <SelectContent>
                      {commonAgencies.map((agency) => (
                        <SelectItem key={agency.slug} value={agency.slug}>
                          {agency.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Don't see your agency? Contact them for the correct portal link.
                </p>
              </div>

              <div>
                <Label htmlFor="dob">Date of Birth *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="dob"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
                    className="pl-10"
                    data-testid="input-date-of-birth"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Used for identity verification and security
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={loginMutation.isPending}
                data-testid="button-consumer-login"
              >
                {loginMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Verifying...
                  </>
                ) : (
                  <>
                    Sign In to Your Account
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Registration Link */}
        <div className="text-center">
          <p className="text-gray-600 text-sm">
            Don't have an account?{" "}
            <button
              onClick={() => {
                if (form.tenantSlug) {
                  setLocation(`/register/${form.tenantSlug}`);
                } else {
                  toast({
                    title: "Agency Required",
                    description: "Please select your collection agency first.",
                    variant: "destructive",
                  });
                }
              }}
              className="text-blue-600 hover:text-blue-800 font-medium"
              data-testid="link-register"
            >
              Register here
            </button>
          </p>
        </div>

        {/* Help */}
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Need Help?</h3>
              <p className="text-sm text-blue-700 mt-1">
                Contact your collection agency directly if you're having trouble accessing your account or need assistance with your payment arrangements.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}