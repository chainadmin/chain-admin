import { useState, useEffect } from "react";
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
import chainLogo from "@/assets/chain-logo.png";

interface LoginForm {
  email: string;
  dateOfBirth: string;
}

export default function ConsumerLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState<LoginForm>({
    email: "",
    dateOfBirth: "",
  });
  const [agencyContext, setAgencyContext] = useState<any>(null);

  useEffect(() => {
    // Check if coming from an agency-specific page
    const storedContext = sessionStorage.getItem('agencyContext');
    if (storedContext) {
      try {
        const context = JSON.parse(storedContext);
        setAgencyContext(context);
      } catch (e) {
        console.error('Error parsing agency context:', e);
      }
    }
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (loginData: LoginForm) => {
      // Send email and dateOfBirth for consumer verification
      const response = await apiRequest("POST", "/api/consumer/login", {
        email: loginData.email,
        dateOfBirth: loginData.dateOfBirth
      });
      return response;
    },
    onSuccess: (data: any) => {
      if (data.multipleAgencies) {
        // Consumer has accounts with multiple agencies
        toast({
          title: "Multiple Agencies Found",
          description: data.message,
        });
        // TODO: Show agency selection UI
        // For now, auto-select the first agency
        const firstAgency = data.agencies[0];
        toast({
          title: "Selecting Agency",
          description: `Logging into ${firstAgency.name}`,
        });
        // Re-submit with specific agency
        // This would need a separate endpoint or modification
      } else if (data.needsRegistration) {
        // User found but needs to complete registration
        toast({
          title: "Complete Registration",
          description: data.message,
        });
        setLocation(`/consumer-register?email=${form.email}&tenant=${data.tenant.slug}`);
      } else {
        // Successful login
        toast({
          title: "Login Successful", 
          description: "Welcome to your account portal!",
        });
        
        // Store consumer session data and token
        localStorage.setItem("consumerSession", JSON.stringify({
          email: form.email,
          tenantSlug: data.tenant?.slug,
          consumerData: data.consumer,
        }));
        
        // Store the token for authenticated requests
        if (data.token) {
          localStorage.setItem("consumerToken", data.token);
        }
        
        // Redirect to consumer portal
        setLocation(`/consumer-dashboard`);
      }
    },
    onError: (error: any) => {
      if (error.status === 404) {
        // No account found
        toast({
          title: "No Account Found",
          description: error.data?.message || "No account found with this email. Please contact your agency for account details.",
          variant: "destructive",
        });
      } else if (error.status === 401) {
        // Invalid credentials
        toast({
          title: "Invalid Credentials",
          description: "Please check your email and date of birth.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Login Failed",
          description: error.message || "Unable to verify your information. Please check your details and try again.",
          variant: "destructive",
        });
      }
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
    
    if (!form.email || !form.dateOfBirth) {
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
          {agencyContext ? (
            <>
              <div className="mb-4">
                <img src={chainLogo} alt="Chain Software Group" className="h-12 object-contain mx-auto mb-2" />
                <h1 className="text-3xl font-bold text-gray-900">Access Your Account</h1>
                <p className="text-lg text-blue-600 font-medium mt-2">
                  {agencyContext.name}
                </p>
                <p className="text-gray-600 text-sm">
                  Sign in to view your account information
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-blue-600 rounded-full mx-auto flex items-center justify-center mb-4">
                <Building2 className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900">Consumer Portal</h1>
              <p className="text-gray-600 mt-2">
                Find and access your accounts from any agency
              </p>
            </>
          )}
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
            New to the system?{" "}
            <button
              onClick={() => setLocation("/register")}
              className="text-blue-600 hover:text-blue-800 font-medium"
              data-testid="link-register"
            >
              Create an account
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
              <h3 className="text-sm font-medium text-blue-800">How it works</h3>
              <p className="text-sm text-blue-700 mt-1">
                Simply enter your email and date of birth. We'll search across all agencies to find your accounts and help you get set up if you're new.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}