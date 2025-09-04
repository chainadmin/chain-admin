import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Shield, Phone, Mail, Lock } from "lucide-react";
import { Link } from "wouter";
import { useDynamicContent } from "@/hooks/useDynamicContent";

export default function ConsumerMobileLanding() {
  const { content: branding } = useDynamicContent('branding', {
    fallback: {
      primaryColor: '#2563eb',
      logo: null,
      name: 'Chain'
    }
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-4 py-6">
          <div className="flex justify-center">
            {branding?.logo ? (
              <img 
                src={branding.logo} 
                alt={branding.name} 
                className="h-12 object-contain"
              />
            ) : (
              <h1 className="text-2xl font-bold text-blue-600">Chain</h1>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-8">
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-center">
            Manage Your Account
          </h2>
          <p className="text-gray-600 text-center mb-6">
            Access your account information, make payments, and communicate with your agency.
          </p>
          
          <div className="space-y-3">
            <Link href="/consumer-login">
              <Button 
                className="w-full h-12 text-base" 
                size="lg"
              >
                Sign In to Your Account
              </Button>
            </Link>
            
            <div className="text-center text-sm text-gray-500">
              Don't have an account?
            </div>
            
            <Link href="/consumer-register">
              <Button 
                variant="outline" 
                className="w-full h-12 text-base"
                size="lg"
              >
                Register New Account
              </Button>
            </Link>
          </div>
        </Card>

        {/* Features */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="p-4 text-center">
            <Lock className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <h3 className="font-medium text-sm">Secure Access</h3>
            <p className="text-xs text-gray-600 mt-1">
              Your data is protected
            </p>
          </Card>
          
          <Card className="p-4 text-center">
            <Phone className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <h3 className="font-medium text-sm">24/7 Access</h3>
            <p className="text-xs text-gray-600 mt-1">
              Manage anytime
            </p>
          </Card>
          
          <Card className="p-4 text-center">
            <Mail className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <h3 className="font-medium text-sm">Direct Contact</h3>
            <p className="text-xs text-gray-600 mt-1">
              Message your agency
            </p>
          </Card>
          
          <Card className="p-4 text-center">
            <Shield className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <h3 className="font-medium text-sm">Privacy First</h3>
            <p className="text-xs text-gray-600 mt-1">
              Your info stays safe
            </p>
          </Card>
        </div>

        {/* Footer Links */}
        <div className="text-center space-y-2">
          <Link href="/privacy-policy">
            <a className="text-sm text-gray-600 underline">
              Privacy Policy
            </a>
          </Link>
        </div>
      </div>

      {/* Bottom Safe Area */}
      <div className="h-8" />
    </div>
  );
}