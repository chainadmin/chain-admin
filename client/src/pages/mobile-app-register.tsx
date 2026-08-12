import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiCall } from "@/lib/api";
import { persistConsumerAuth, rememberAgencySlug } from "@/lib/consumer-auth";
import { UserPlus, ArrowLeft, Calendar } from "lucide-react";

export default function MobileAppRegister() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Get tenant slug from URL params
  const getTenantSlug = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tenant') || '';
  };

  const getPrefilledEmail = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('email') || '';
  };

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: getPrefilledEmail(),
    phone: "",
    dateOfBirth: "",
    fileNumber: "",
    agreeToTerms: false,
    agreeToSms: false,
  });

  // Remember the agency as soon as the register screen opens with a tenant param
  // so the branded logo persists after the app is closed and reopened.
  useEffect(() => {
    const tenantSlug = getTenantSlug();
    if (tenantSlug) {
      rememberAgencySlug(tenantSlug);
    }
  }, []);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast({
        title: "Required Fields",
        description: "Please fill in your name and email.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.dateOfBirth && !formData.fileNumber) {
      toast({
        title: "Verification Required",
        description: "Please provide either your date of birth or your file number so we can match your account.",
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

    const tenantSlug = getTenantSlug();
    if (!tenantSlug) {
      toast({
        title: "Agency Required",
        description: "Missing agency information. Please try again from your agency's website.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Submit registration
      const response = await apiCall("POST", "/api/consumer-registration", {
        ...formData,
        phone: formData.phone.trim() || null,
        tenantSlug
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorMessage = "Registration failed";
        
        if (contentType && contentType.includes("application/json")) {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();

      toast({
        title: "Registration Successful!",
        description: "Signing you in...",
      });

      // Auto-login after successful registration
      const loginResponse = await apiCall("POST", "/api/mobile/auth/verify", {
        email: formData.email,
        ...(formData.dateOfBirth ? { dateOfBirth: formData.dateOfBirth } : {}),
        ...(formData.fileNumber ? { fileNumber: formData.fileNumber } : {}),
      });

      if (loginResponse.ok) {
        const loginData = await loginResponse.json();
        
        if (loginData.token && loginData.tenant) {
          persistConsumerAuth({
            session: {
              email: formData.email,
              tenantSlug: loginData.tenant.slug,
              consumerData: loginData.consumer,
            },
            token: loginData.token,
          });
          rememberAgencySlug(loginData.tenant.slug);

          toast({
            title: "Welcome!",
            description: "Your account has been created successfully.",
          });

          setLocation("/consumer-dashboard");
        }
      } else {
        // Registration succeeded but auto-login failed, redirect to login
        toast({
          title: "Registration Complete",
          description: "Please log in to continue.",
        });
        setLocation("/mobile-login");
      }
    } catch (error: any) {
      toast({
        title: "Registration Failed",
        description: error.message || "Unable to complete registration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-950 text-white p-4">
      {/* Background gradients */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-blue-500/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-8 pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/mobile-login")}
          className="text-white/70 hover:text-white hover:bg-white/10"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Login
        </Button>
      </div>

      {/* Registration Form */}
      <div className="relative z-10 flex flex-1 items-start justify-center pb-8">
        <div className="w-full max-w-md min-w-0 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20 backdrop-blur-xl border border-white/10">
                <UserPlus className="h-8 w-8 text-blue-400" />
              </div>
            </div>
            <h1 className="text-3xl font-bold">Create Account</h1>
            <p className="text-white/60">Complete your profile to get started</p>
          </div>

          {/* Form Card */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 space-y-4">
              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="firstName" className="text-white/80 text-sm">
                    First Name *
                  </Label>
                  <Input
                    id="firstName"
                    data-testid="input-firstName"
                    style={{ colorScheme: "dark", WebkitTextFillColor: "white" }}
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    className="bg-slate-800 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
                    placeholder="John"
                    required
                  />
                </div>
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="lastName" className="text-white/80 text-sm">
                    Last Name *
                  </Label>
                  <Input
                    id="lastName"
                    data-testid="input-lastName"
                    style={{ colorScheme: "dark", WebkitTextFillColor: "white" }}
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    className="bg-slate-800 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/80 text-sm">
                  Email Address *
                </Label>
                <Input
                  id="email"
                  data-testid="input-email"
                  type="email"
                  style={{ colorScheme: "dark", WebkitTextFillColor: "white" }}
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="bg-slate-800 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
                  placeholder="john@example.com"
                  required
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-white/80 text-sm">
                  Phone Number (Optional)
                </Label>
                <Input
                  id="phone"
                  data-testid="input-phone"
                  type="tel"
                  style={{ colorScheme: "dark", WebkitTextFillColor: "white" }}
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="bg-slate-800 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
                  placeholder="(555) 123-4567"
                />
              </div>

              {/* Verification: DOB or File Number */}
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-sm font-medium text-white/80">Verify your identity *</p>
                <p className="text-xs text-white/50">
                  Provide either your date of birth or your file number. Your file number is on your letter — or contact us to receive it.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth" className="text-white/80 text-sm">
                    Date of Birth
                  </Label>
                  <div className="relative">
                    <Input
                      id="dateOfBirth"
                      data-testid="input-dateOfBirth"
                      type="date"
                      style={{ colorScheme: "dark", WebkitTextFillColor: "white" }}
                      value={formData.dateOfBirth}
                      onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                      className="bg-slate-800 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20 mobile-date-input"
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-white/40">
                  <span className="h-px flex-1 bg-white/10" />
                  or
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fileNumber" className="text-white/80 text-sm">
                    File Number
                  </Label>
                  <Input
                    id="fileNumber"
                    data-testid="input-fileNumber"
                    style={{ colorScheme: "dark", WebkitTextFillColor: "white" }}
                    value={formData.fileNumber}
                    onChange={(e) => handleInputChange('fileNumber', e.target.value)}
                    className="bg-slate-800 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
                    placeholder="Your file number"
                  />
                </div>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-4">
              <div className="flex items-start space-x-3 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4">
                <Checkbox
                  id="agreeToTerms"
                  data-testid="checkbox-terms"
                  checked={formData.agreeToTerms}
                  onCheckedChange={(checked) => handleInputChange('agreeToTerms', checked)}
                  className="border-white/20 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500 mt-0.5"
                />
                <Label
                  htmlFor="agreeToTerms"
                  className="text-sm text-white/70 leading-relaxed cursor-pointer"
                >
                  I agree to the {" "}
                  <a href="/terms-of-service" target="_blank" rel="noreferrer" className="text-blue-300 underline hover:text-blue-200">
                    Terms of Service
                  </a>{" "}
                  and {" "}
                  <a href="/privacy-policy" target="_blank" rel="noreferrer" className="text-blue-300 underline hover:text-blue-200">
                    Privacy Policy
                  </a>{" "}
                  *
                </Label>
              </div>

              <div className="flex items-start space-x-3 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4">
                <Checkbox
                  id="agreeToSms"
                  data-testid="checkbox-sms"
                  checked={formData.agreeToSms}
                  onCheckedChange={(checked) => handleInputChange('agreeToSms', checked)}
                  className="border-white/20 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500 mt-0.5"
                />
                <Label
                  htmlFor="agreeToSms"
                  className="text-sm text-white/70 leading-relaxed cursor-pointer"
                >
                  I optionally consent to receive informational SMS updates. Consent is not a condition of registration or service. Message and data rates may apply. Reply STOP to opt out or HELP for help.
                </Label>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              data-testid="button-register"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
        </div>
      </div>

      <footer className="relative z-10 mt-auto border-t border-white/10 pt-4 text-xs text-blue-100/60">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a href="/terms-of-service" className="transition hover:text-white hover:underline">
            Terms of Service
          </a>
          <span>•</span>
          <a href="/privacy-policy" className="transition hover:text-white hover:underline">
            Privacy Policy
          </a>
        </div>
      </footer>
    </div>
  );
}
