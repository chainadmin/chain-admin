import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { agencyTrialRegistrationSchema } from "@shared/schema";
import { CheckCircle, Building, User, Phone, Mail, Calendar, CreditCard, Lock, UserCheck } from "lucide-react";
import { z } from "zod";

// Extend the schema to include username and password
const registrationWithCredentialsSchema = agencyTrialRegistrationSchema.extend({
  username: z.string().min(3, "Username must be at least 3 characters").max(50),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegistrationWithCredentials = z.infer<typeof registrationWithCredentialsSchema>;

type RegistrationSuccessResponse = {
  message: string;
  tenantId: string;
  slug: string;
  redirectUrl?: string;
};

type RegistrationMutationResult = {
  registration: RegistrationSuccessResponse;
  credentials: {
    username: string;
    password: string;
  };
};

export default function AgencyRegistration() {
  const { toast } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [successInfo, setSuccessInfo] = useState<RegistrationSuccessResponse | null>(null);

  const form = useForm<RegistrationWithCredentials>({
    resolver: zodResolver(registrationWithCredentialsSchema),
    defaultValues: {
      ownerFirstName: "",
      ownerLastName: "",
      ownerDateOfBirth: "",
      ownerSSN: "",
      businessName: "",
      phoneNumber: "",
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
    },
  });

  const registrationMutation = useMutation<
    RegistrationMutationResult,
    ApiError | Error,
    RegistrationWithCredentials
  >({
    mutationFn: async (data: RegistrationWithCredentials) => {
      const { confirmPassword, ...registrationData } = data;
      const response = await apiRequest("POST", "/api/agencies/register", registrationData);
      const registration = (await response.json()) as RegistrationSuccessResponse;

      return {
        registration,
        credentials: {
          username: registrationData.username,
          password: registrationData.password,
        },
      } satisfies RegistrationMutationResult;
    },
    onSuccess: async ({ registration, credentials }) => {
      setIsSubmitted(true);
      setSuccessInfo(registration);

      try {
        const loginResponse = await apiRequest("POST", "/api/agency/login", credentials);
        const loginData = await loginResponse.json();

        if (loginData?.token) {
          localStorage.setItem("authToken", loginData.token);
        }

        toast({
          title: "Registration Successful",
          description: "Your trial account has been created. Redirecting to your dashboard...",
        });

        setTimeout(() => {
          window.location.href = "/admin-dashboard";
        }, 1500);
      } catch (error: unknown) {
        let description =
          registration?.message ||
          "Your trial account has been created. Please log in with your new username and password.";

        if (error instanceof ApiError) {
          console.error("Automatic agency login failed", error);

          if (
            typeof error.data === "object" &&
            error.data !== null &&
            "message" in (error.data as Record<string, unknown>)
          ) {
            description = `${registration?.message ?? "Registration successful."} ${String(
              (error.data as Record<string, unknown>).message
            )}`;
          }
        } else if (error instanceof Error) {
          console.error("Automatic agency login failed", error);
        }

        toast({
          title: "Registration Successful",
          description: description,
        });
      }
    },
    onError: (error: ApiError | Error) => {
      let errorMessage = "Please try again later.";
      let errorDetails: unknown = null;

      if (error instanceof ApiError) {
        if (typeof error.data === "object" && error.data !== null) {
          const data = error.data as Record<string, unknown>;

          if (data.errorDetails) {
            errorDetails = data.errorDetails;
            const details = data.errorDetails as { message?: string; hint?: string };
            const hint = details?.hint ? `\n\nHint: ${details.hint}` : "";
            errorMessage = `${details?.message ?? error.message}${hint}`;
          } else if (data.message) {
            errorMessage = String(data.message);
          } else {
            errorMessage = error.message;
          }
        } else if (typeof error.data === "string") {
          errorMessage = error.data;
        } else {
          errorMessage = error.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      toast({
        title: "Registration Failed",
        description: errorMessage,
        variant: "destructive",
      });

      if (errorDetails) {
        console.error("Agency registration error details:", errorDetails);
      }
    },
  });

  const onSubmit = (data: RegistrationWithCredentials) => {
    const formattedData = {
      ...data,
      ownerDateOfBirth: data.ownerDateOfBirth,
      ownerSSN: data.ownerSSN.replace(/\D/g, ''),
      phoneNumber: data.phoneNumber.replace(/\D/g, ''),
    };

    setSuccessInfo(null);
    setIsSubmitted(false);
    registrationMutation.mutate(formattedData);
  };

  if (isSubmitted) {
    const redirectTarget = successInfo?.redirectUrl ?? "/agency-login";
    const successMessage =
      successInfo?.message ??
      "Your trial account has been successfully created. Our team has been notified and will contact you within 24 hours to discuss your needs and set up the perfect plan for your agency.";

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-600">Registration Complete!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">{successMessage}</p>
            <p className="text-sm text-gray-500">
              You can now log in to explore the platform with limited access.
            </p>
            {successInfo?.slug ? (
              <p className="text-sm text-gray-500">
                Your agency dashboard URL: <span className="font-semibold">{successInfo.slug}.chainsoftwaregroup.com</span>
              </p>
            ) : null}
            <Button
              onClick={() => (window.location.href = redirectTarget)}
              className="w-full"
              data-testid="button-login"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Start Your Free Trial</h1>
          <p className="text-lg text-gray-600">
            Register your agency to explore our platform with full dashboard access. 
            Our team will contact you to set up your custom plan.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building className="mr-2 h-5 w-5" />
              Agency Registration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Owner Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <User className="mr-2 h-5 w-5" />
                    Owner Information
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="ownerFirstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="John"
                              data-testid="input-first-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="ownerLastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Smith"
                              data-testid="input-last-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="ownerDateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center">
                          <Calendar className="mr-2 h-4 w-4" />
                          Date of Birth
                        </FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="date"
                            data-testid="input-date-of-birth"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ownerSSN"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center">
                          <CreditCard className="mr-2 h-4 w-4" />
                          Social Security Number
                        </FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="123456789"
                            maxLength={9}
                            data-testid="input-ssn"
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-gray-500 mt-1">Enter 9 digits without dashes</p>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Business Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Building className="mr-2 h-5 w-5" />
                    Business Information
                  </h3>

                  <FormField
                    control={form.control}
                    name="businessName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Name</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="ABC Collections Agency"
                            data-testid="input-business-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center">
                            <Phone className="mr-2 h-4 w-4" />
                            Phone Number
                          </FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="5551234567"
                              maxLength={10}
                              data-testid="input-phone-number"
                            />
                          </FormControl>
                          <FormMessage />
                          <p className="text-xs text-gray-500 mt-1">10 digits without dashes or spaces</p>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center">
                            <Mail className="mr-2 h-4 w-4" />
                            Email Address
                          </FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="email"
                              placeholder="contact@agency.com"
                              data-testid="input-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Login Credentials */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Lock className="mr-2 h-5 w-5" />
                    Login Credentials
                  </h3>
                  <p className="text-sm text-gray-600">
                    Create a username and password to access your agency dashboard
                  </p>

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
                            placeholder="agency_username"
                            data-testid="input-username"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                              placeholder="••••••••"
                              data-testid="input-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center">
                            <Lock className="mr-2 h-4 w-4" />
                            Confirm Password
                          </FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="password"
                              placeholder="••••••••"
                              data-testid="input-confirm-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">What happens next?</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• You'll get instant access to explore the platform</li>
                    <li>• Our team will contact you within 24 hours</li>
                    <li>• We'll discuss your needs and recommend the best plan</li>
                    <li>• Features will be unlocked once you choose a plan</li>
                  </ul>
                </div>

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={registrationMutation.isPending}
                  data-testid="button-submit"
                >
                  {registrationMutation.isPending ? "Creating Account..." : "Start Free Trial"}
                </Button>
              </form>
            </Form>

            <div className="text-center mt-6 pt-6 border-t">
              <p className="text-sm text-gray-600">
                Already have an account?{" "}
                <Button 
                  variant="link" 
                  onClick={() => window.location.href = '/agency-login'}
                  className="p-0 h-auto"
                  data-testid="link-login"
                >
                  Sign in here
                </Button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}