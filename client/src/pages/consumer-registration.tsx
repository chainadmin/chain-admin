import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, ArrowRight, Shield, MapPin, AlertTriangle, MessageCircle, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PublicHeroLayout from "@/components/public-hero-layout";
import { clearConsumerAuth } from "@/lib/consumer-auth";

export default function ConsumerRegistration() {
  const { tenantSlug } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const getQueryParams = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      email: params.get('email') || '',
      tenant: params.get('tenant') || ''
    };
  };

  const getAgencyContext = () => {
    if (tenantSlug) return tenantSlug;
    
    const queryParams = getQueryParams();
    if (queryParams.tenant) return queryParams.tenant;
    
    try {
      const context = sessionStorage.getItem('agencyContext');
      if (context) {
        const parsed = JSON.parse(context);
        return parsed.slug;
      }
    } catch (e) {
      console.error('Error reading agency context:', e);
    }
    
    return null;
  };

  const effectiveTenantSlug = getAgencyContext();
  const queryParams = getQueryParams();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: queryParams.email || "",
    phone: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    agreeToTerms: false,
    agreeToSms: false,
  });

  const registrationMutation = useMutation({
    mutationFn: async (data: any) => {
      return await (await apiRequest("POST", "/api/consumer-registration", data)).json();
    },
    onSuccess: (data: any) => {
      const tenant = data?.tenant;
      const consumer = data?.consumer;
      const tenantName = typeof tenant?.name === "string" ? tenant.name : tenant?.slug;
      const successMessage = typeof data?.message === "string"
        ? data.message
        : "Registration completed. Please log in to finish setting up your access.";

      clearConsumerAuth();

      if (tenantName) {
        toast({
          title: "Registration Successful!",
          description: `${tenantName} is ready to finish securing your account. Please log in to continue.`,
        });
      } else {
        toast({
          title: "Registration Complete",
          description: successMessage,
        });
      }

      if (tenant?.slug && consumer) {
        const params = new URLSearchParams();
        if (formData.email) {
          params.set("email", formData.email);
        }
        params.set("tenant", tenant.slug);
        navigate(`/consumer-login?${params.toString()}`);
      }
    },
    onError: (error: unknown) => {
      let errorMessage = "Unable to complete registration. Please try again.";
      let errorDetails: unknown = null;

      console.error("Registration error:", error);

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

        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMessage = "Unable to connect to the server. Please check your internet connection and try again.";
        }
      }

      toast({
        title: "Registration Failed",
        description: errorMessage,
        variant: "destructive",
      });

      if (errorDetails) {
        console.error("Registration error details:", errorDetails);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!effectiveTenantSlug) {
      toast({
        title: "Agency Required",
        description: "You must select an agency to complete registration. Please go to your agency's website to register.",
        variant: "destructive",
      });
      return;
    }
    
    if (!formData.agreeToTerms) {
      toast({
        title: "Terms Required",
        description: "Please agree to the terms of service to continue.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.agreeToSms) {
      toast({
        title: "SMS Consent Required",
        description: "Please acknowledge SMS updates to continue your registration.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.dateOfBirth || !formData.address) {
      toast({
        title: "Required Fields",
        description: "Please fill in all required fields: name, email, date of birth, and address.",
        variant: "destructive",
      });
      return;
    }

    registrationMutation.mutate({
      ...formData,
      tenantSlug: effectiveTenantSlug
    });
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <PublicHeroLayout
      badgeText="Complete your profile"
      title="Create your secure consumer account"
      description="We'll automatically match you with the right agency and unlock your full account experience."
      supportingContent={(
        <div className="grid gap-4">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
              <Shield className="h-5 w-5 text-blue-200" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Trusted security</p>
              <p className="text-sm text-blue-100/70">Identity checks and encrypted data keep your information safe end-to-end.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
              <MapPin className="h-5 w-5 text-blue-200" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Automatically routed</p>
              <p className="text-sm text-blue-100/70">We locate the right agency so you can start communicating without any guesswork.</p>
            </div>
          </div>
        </div>
      )}
      headerActions={(
        <>
          <Button
            variant="ghost"
            className="text-blue-100 hover:bg-white/10"
            onClick={() => navigate("/consumer-login")}
          >
            Back to login
          </Button>
          <Button
            className="bg-blue-500 hover:bg-blue-400"
            onClick={() => navigate("/")}
          >
            Consumer home
          </Button>
        </>
      )}
      showDefaultHeaderActions={false}
      contentClassName="p-8 sm:p-10"
    >
      contentClassName="p-8 sm:p-10"
    >
      <div className="space-y-8 text-left text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-blue-200">Registration</p>
            <h2 className="mt-2 text-2xl font-semibold">Tell us a few details</h2>
            <p className="mt-3 text-sm text-blue-100/70">
              {effectiveTenantSlug
                ? `We’ll connect you with ${effectiveTenantSlug.replace(/-/g, " ")} and send you back to login so you can secure your access.`
                : "Share your information and we’ll locate the right agency for you automatically."}
            </p>
          </div>
          <div className="hidden h-12 w-12 items-center justify-center rounded-full bg-blue-500/20 sm:flex">
            <UserPlus className="h-6 w-6 text-blue-200" />
          </div>
        </div>

        {!effectiveTenantSlug && (
          <Alert className="border-yellow-400/40 bg-yellow-500/10 text-yellow-100">
            <AlertTriangle className="h-4 w-4 text-yellow-200" />
            <AlertDescription className="text-sm">
              <strong className="text-yellow-100">Agency required:</strong> Choose your agency’s dedicated link to finish registration. If you reached this page by mistake, return to your agency’s website and follow the registration button.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-sm font-medium text-blue-100">
                First name *
              </Label>
              <Input
                id="firstName"
                data-testid="input-firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange("firstName", e.target.value)}
                className="h-11 rounded-2xl border-white/20 bg-slate-900/60 px-4 text-white placeholder:text-blue-100/50 focus-visible:ring-blue-400"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-sm font-medium text-blue-100">
                Last name *
              </Label>
              <Input
                id="lastName"
                data-testid="input-lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange("lastName", e.target.value)}
                className="h-11 rounded-2xl border-white/20 bg-slate-900/60 px-4 text-white placeholder:text-blue-100/50 focus-visible:ring-blue-400"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-blue-100">
              Email address *
            </Label>
            <Input
              id="email"
              type="email"
              data-testid="input-email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              placeholder="you@example.com"
              className="h-11 rounded-2xl border-white/20 bg-slate-900/60 px-4 text-white placeholder:text-blue-100/50 focus-visible:ring-blue-400"
              required
            />
            <p className="text-xs text-blue-100/60">We’ll use this to locate your account and send secure updates.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-medium text-blue-100">
              Phone number (optional)
            </Label>
            <Input
              id="phone"
              type="tel"
              data-testid="input-phone"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              placeholder="(555) 123-4567"
              className="h-11 rounded-2xl border-white/20 bg-slate-900/60 px-4 text-white placeholder:text-blue-100/50 focus-visible:ring-blue-400"
            />
            <p className="text-xs text-blue-100/60">Provide your phone number to receive text message updates.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateOfBirth" className="text-sm font-medium text-blue-100">
              Date of birth *
            </Label>
            <Input
              id="dateOfBirth"
              type="date"
              data-testid="input-dateOfBirth"
              value={formData.dateOfBirth}
              onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
              className="h-11 rounded-2xl border-white/20 bg-slate-900/60 px-4 text-white focus-visible:ring-blue-400"
              required
            />
            <p className="text-xs text-blue-100/60">Only used to confirm your identity with your agency.</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/20">
                <MapPin className="h-5 w-5 text-blue-200" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Address information</p>
                <p className="text-xs text-blue-100/60">Helps your agency personalize communication and confirm records.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address" className="text-sm font-medium text-blue-100">
                Street address *
              </Label>
              <Input
                id="address"
                data-testid="input-address"
                value={formData.address}
                onChange={(e) => handleInputChange("address", e.target.value)}
                placeholder="123 Main Street"
                className="h-11 rounded-2xl border-white/20 bg-slate-900/60 px-4 text-white placeholder:text-blue-100/50 focus-visible:ring-blue-400"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="city" className="text-sm font-medium text-blue-100">
                  City
                </Label>
                <Input
                  id="city"
                  data-testid="input-city"
                  value={formData.city}
                  onChange={(e) => handleInputChange("city", e.target.value)}
                  className="h-11 rounded-2xl border-white/20 bg-slate-900/60 px-4 text-white placeholder:text-blue-100/50 focus-visible:ring-blue-400"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state" className="text-sm font-medium text-blue-100">
                  State
                </Label>
                <Select value={formData.state} onValueChange={(value) => handleInputChange("state", value)}>
                  <SelectTrigger
                    data-testid="select-state"
                    className="h-11 rounded-2xl border-white/20 bg-slate-900/60 px-4 text-left text-white focus:ring-blue-400"
                  >
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900/95 text-blue-50">
                    <SelectItem value="AL">Alabama</SelectItem>
                    <SelectItem value="AK">Alaska</SelectItem>
                    <SelectItem value="AZ">Arizona</SelectItem>
                    <SelectItem value="AR">Arkansas</SelectItem>
                    <SelectItem value="CA">California</SelectItem>
                    <SelectItem value="CO">Colorado</SelectItem>
                    <SelectItem value="CT">Connecticut</SelectItem>
                    <SelectItem value="DE">Delaware</SelectItem>
                    <SelectItem value="FL">Florida</SelectItem>
                    <SelectItem value="GA">Georgia</SelectItem>
                    <SelectItem value="HI">Hawaii</SelectItem>
                    <SelectItem value="ID">Idaho</SelectItem>
                    <SelectItem value="IL">Illinois</SelectItem>
                    <SelectItem value="IN">Indiana</SelectItem>
                    <SelectItem value="IA">Iowa</SelectItem>
                    <SelectItem value="KS">Kansas</SelectItem>
                    <SelectItem value="KY">Kentucky</SelectItem>
                    <SelectItem value="LA">Louisiana</SelectItem>
                    <SelectItem value="ME">Maine</SelectItem>
                    <SelectItem value="MD">Maryland</SelectItem>
                    <SelectItem value="MA">Massachusetts</SelectItem>
                    <SelectItem value="MI">Michigan</SelectItem>
                    <SelectItem value="MN">Minnesota</SelectItem>
                    <SelectItem value="MS">Mississippi</SelectItem>
                    <SelectItem value="MO">Missouri</SelectItem>
                    <SelectItem value="MT">Montana</SelectItem>
                    <SelectItem value="NE">Nebraska</SelectItem>
                    <SelectItem value="NV">Nevada</SelectItem>
                    <SelectItem value="NH">New Hampshire</SelectItem>
                    <SelectItem value="NJ">New Jersey</SelectItem>
                    <SelectItem value="NM">New Mexico</SelectItem>
                    <SelectItem value="NY">New York</SelectItem>
                    <SelectItem value="NC">North Carolina</SelectItem>
                    <SelectItem value="ND">North Dakota</SelectItem>
                    <SelectItem value="OH">Ohio</SelectItem>
                    <SelectItem value="OK">Oklahoma</SelectItem>
                    <SelectItem value="OR">Oregon</SelectItem>
                    <SelectItem value="PA">Pennsylvania</SelectItem>
                    <SelectItem value="RI">Rhode Island</SelectItem>
                    <SelectItem value="SC">South Carolina</SelectItem>
                    <SelectItem value="SD">South Dakota</SelectItem>
                    <SelectItem value="TN">Tennessee</SelectItem>
                    <SelectItem value="TX">Texas</SelectItem>
                    <SelectItem value="UT">Utah</SelectItem>
                    <SelectItem value="VT">Vermont</SelectItem>
                    <SelectItem value="VA">Virginia</SelectItem>
                    <SelectItem value="WA">Washington</SelectItem>
                    <SelectItem value="WV">West Virginia</SelectItem>
                    <SelectItem value="WI">Wisconsin</SelectItem>
                    <SelectItem value="WY">Wyoming</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="zipCode" className="text-sm font-medium text-blue-100">
                  ZIP code
                </Label>
                <Input
                  id="zipCode"
                  data-testid="input-zipCode"
                  value={formData.zipCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    handleInputChange("zipCode", value);
                  }}
                  placeholder="12345"
                  maxLength={5}
                  className="h-11 rounded-2xl border-white/20 bg-slate-900/60 px-4 text-white placeholder:text-blue-100/50 focus-visible:ring-blue-400"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/15">
                <MessageCircle className="h-5 w-5 text-blue-200" />
              </div>
              <div className="flex-1 space-y-3 text-xs text-blue-100/80">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">Confirm SMS updates *</p>
                  <p>
                    By providing your phone number you agree to receive informational text messages from Chain Software Group. Consent is not a mandatory condition. Message frequency may vary. Msg and data rates may apply. Reply HELP for help or STOP to cancel.
                  </p>
                </div>
                <Button
                  type="submit"
                  className="h-12 w-full rounded-full bg-blue-500 text-base font-medium text-white transition hover:bg-blue-400"
                  disabled={registrationMutation.isPending}
                  data-testid="button-submit-registration"
                >
                  {registrationMutation.isPending ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                      Creating account...
                    </>
                  ) : (
                    <>
                      Complete registration
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </PublicHeroLayout>
  );
}
