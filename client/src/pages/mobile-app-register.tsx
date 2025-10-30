import { useState } from "react";
import { useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiCall } from "@/lib/api";
import { persistConsumerAuth } from "@/lib/consumer-auth";
import { UserPlus, ArrowLeft, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

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
    address: "",
    city: "",
    state: "",
    zipCode: "",
    agreeToTerms: false,
    agreeToSms: false,
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone || 
        !formData.dateOfBirth || !formData.address || !formData.city || !formData.state || !formData.zipCode) {
      toast({
        title: "Required Fields",
        description: "Please fill in all required fields including name, email, phone, date of birth, and complete address.",
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
        dateOfBirth: formData.dateOfBirth,
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
    <div className="flex min-h-screen flex-col bg-slate-950 text-white p-4">
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
      <div className="relative flex-1 flex items-start justify-center overflow-y-auto pb-8">
        <div className="w-full max-w-md space-y-6">
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
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-white/80 text-sm">
                    First Name *
                  </Label>
                  <Input
                    id="firstName"
                    data-testid="input-firstName"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
                    placeholder="John"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-white/80 text-sm">
                    Last Name *
                  </Label>
                  <Input
                    id="lastName"
                    data-testid="input-lastName"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
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
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
                  placeholder="john@example.com"
                  required
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-white/80 text-sm">
                  Phone Number *
                </Label>
                <Input
                  id="phone"
                  data-testid="input-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
                  placeholder="(555) 123-4567"
                  required
                />
              </div>

              {/* Date of Birth */}
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth" className="text-white/80 text-sm">
                  Date of Birth *
                </Label>
                <div className="relative">
                  <Input
                    id="dateOfBirth"
                    data-testid="input-dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
                    required
                  />
                  <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label htmlFor="address" className="text-white/80 text-sm">
                  Street Address *
                </Label>
                <Input
                  id="address"
                  data-testid="input-address"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
                  placeholder="123 Main St"
                  required
                />
              </div>

              {/* City, State, Zip */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="city" className="text-white/80 text-sm">
                    City *
                  </Label>
                  <Input
                    id="city"
                    data-testid="input-city"
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
                    placeholder="City"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state" className="text-white/80 text-sm">
                    State *
                  </Label>
                  <Select
                    value={formData.state}
                    onValueChange={(value) => handleInputChange('state', value)}
                  >
                    <SelectTrigger 
                      id="state"
                      data-testid="select-state"
                      className="bg-white/5 border-white/10 text-white focus:border-blue-400/50 focus:ring-blue-400/20"
                    >
                      <SelectValue placeholder="ST" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10">
                      {US_STATES.map((state) => (
                        <SelectItem key={state} value={state} className="text-white hover:bg-white/10">
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="zipCode" className="text-white/80 text-sm">
                  ZIP Code *
                </Label>
                <Input
                  id="zipCode"
                  data-testid="input-zipCode"
                  value={formData.zipCode}
                  onChange={(e) => handleInputChange('zipCode', e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-blue-400/20"
                  placeholder="12345"
                  maxLength={10}
                  required
                />
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
                  I agree to the Terms of Service and Privacy Policy *
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
                  I consent to receive SMS updates and notifications *
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
    </div>
  );
}
