import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building, Lock, UserCheck } from "lucide-react";
import { z } from "zod";
import chainLogo from "../assets/chain-logo.png";
import { buildAgencyUrl, isSubdomainSupported } from "@shared/utils/subdomain";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginData = z.infer<typeof loginSchema>;

export default function AgencyLogin() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginData) => {
      const response = await apiRequest("POST", "/api/agency/login", data);
      const result = await response.json();
      
      // Store the JWT token
      if (result.token) {
        localStorage.setItem('authToken', result.token);
      }
      
      return result;
    },
    onSuccess: (data) => {
      toast({
        title: "Login Successful",
        description: `Welcome back, ${data.user.name || data.user.email}!`,
      });
      
      // Invalidate queries to refresh authentication state
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      // Redirect to agency-specific dashboard
      setTimeout(() => {
        const agencySlug = data.tenant?.slug;
        
        if (agencySlug) {
          // Build the agency-specific URL
          const dashboardUrl = buildAgencyUrl(agencySlug, "/dashboard");
          window.location.href = dashboardUrl;
        } else {
          // Fallback to regular dashboard if no agency slug
          window.location.href = "/admin-dashboard";
        }
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid username or password",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginData) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={chainLogo} alt="Chain Logo" className="h-12 w-12 object-contain" />
          </div>
          <CardTitle className="text-2xl">Agency Login</CardTitle>
          <p className="text-gray-600 mt-2">
            Sign in to access your agency dashboard
          </p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center">
                      <UserCheck className="mr-2 h-4 w-4" />
                      Username
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter your username"
                        data-testid="input-username"
                        disabled={loginMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center">
                      <Lock className="mr-2 h-4 w-4" />
                      Password
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Enter your password"
                        data-testid="input-password"
                        disabled={loginMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-gray-600">
              Don't have an account?{" "}
              <Button
                variant="link"
                onClick={() => window.location.href = "/agency-registration"}
                className="p-0 h-auto"
                data-testid="link-register"
              >
                Register your agency
              </Button>
            </p>
            
            <p className="text-sm text-gray-600">
              Looking for consumer access?{" "}
              <Button
                variant="link"
                onClick={() => window.location.href = "/consumer-login"}
                className="p-0 h-auto"
                data-testid="link-consumer"
              >
                Consumer Portal
              </Button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}