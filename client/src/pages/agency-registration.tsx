import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { agencyTrialRegistrationSchema, type AgencyTrialRegistration } from "@shared/schema";
import { CheckCircle, Building, User, Phone, Mail, Calendar, CreditCard, Lock, UserCheck } from "lucide-react";
import { z } from "zod";

// Extend the schema to include username and password
const registrationWithCredentialsSchema = agencyTrialRegistrationSchema.extend({
  username: z.string().min(3, "Username must be at least 3 characters").max(50),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
  confirmPassword: z.string(),
  smsOptIn: z.boolean().default(false),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegistrationWithCredentials = z.infer<typeof registrationWithCredentialsSchema>;

export default function AgencyRegistration() {
  const { toast } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);

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
      smsOptIn: false,
    },
  });

  const registrationMutation = useMutation({
    mutationFn: async (data: RegistrationWithCredentials) => {
      // Remove confirmPassword before sending to API
      const { confirmPassword, smsOptIn, ...registrationData } = data;
      return apiRequest("POST", "/api/agencies/register", registrationData);
    },
    onSuccess: (data: any) => {
      setIsSubmitted(true);
      
      // Store the JWT token if provided
      if (data.token) {
        localStorage.setItem('authToken', data.token);
      }
      
      toast({
        title: "Registration Successful",
        description: "Your trial account has been created. Redirecting to your dashboard...",
      });
      
      // Redirect to admin dashboard after successful registration
      setTimeout(() => {
        window.location.href = "/admin-dashboard";
      }, 1500);
    },
    onError: async (error: any) => {
      // Try to parse error response
      let errorMessage = "Please try again later.";
      let errorDetails = null;
      
      if (error instanceof Response) {
        try {
          const errorData = await error.json();
          if (errorData.errorDetails) {
            errorDetails = errorData.errorDetails;
            errorMessage = `${errorData.errorDetails.message}\n\nHint: ${errorData.errorDetails.hint}`;
          } else {
            errorMessage = errorData.message || errorMessage;
          }
        } catch (e) {
          // Could not parse error
        }
      }
      
      toast({
        title: "Registration Failed", 
        description: errorMessage,
        variant: "destructive",
      });
      
      // Log error details to console for debugging
      if (errorDetails) {
        console.error("Agency registration error details:", errorDetails);
      }
    },
  });

  const onSubmit = (data: RegistrationWithCredentials) => {
    // Format the data before sending
    const formattedData = {
      ...data,
      // Ensure date is in YYYY-MM-DD format
      ownerDateOfBirth: data.ownerDateOfBirth,
      // Remove any non-digit characters from SSN
      ownerSSN: data.ownerSSN.replace(/\D/g, ''),
      // Remove any non-digit characters from phone number
      phoneNumber: data.phoneNumber.replace(/\D/g, ''),
    };
    
    registrationMutation.mutate(formattedData);
  };

  if (isSubmitted) {
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
            <p className="text-gray-600">
              Your trial account has been successfully created. Our team has been notified and will contact you within 24 hours to discuss your needs and set up the perfect plan for your agency.
            </p>
            <p className="text-sm text-gray-500">
              You can now log in to explore the platform with limited access.
            </p>
            <Button 
              onClick={() => window.location.href = '/agency-login'}
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
                            placeholder="ABC Service Group"
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

              <FormField
                control={form.control}
                name="smsOptIn"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3 rounded-lg border border-gray-200/60 bg-white p-4 shadow-sm">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                        className="mt-1"
                      />
                    </FormControl>
                    <div className="space-y-1 text-left">
                      <FormLabel className="text-sm font-semibold text-gray-900">
                        Opt in to receive text message updates
                      </FormLabel>
                      <FormDescription className="text-xs text-gray-600">
                        By selecting this box, you consent to receive autodialed and manual SMS updates about your account at
                        the phone number provided. Message frequency varies. Message and data rates may apply. Reply STOP to
                        cancel, HELP for help. Your consent is not a condition of service, and you can update your preference
                        at any time by contacting support.
                      </FormDescription>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-gray-500">
              <a href="/terms-of-service" className="transition hover:text-gray-700 hover:underline">
                Terms of Service
              </a>
              <span>•</span>
              <a href="/privacy-policy" className="transition hover:text-gray-700 hover:underline">
                Privacy Policy
              </a>
              <span>•</span>
              <a href="/sms-opt-in-disclosure" className="transition hover:text-gray-700 hover:underline">
                SMS Opt-In Disclosure
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}