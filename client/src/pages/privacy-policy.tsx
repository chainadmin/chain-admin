import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function PrivacyPolicy() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <Button 
          onClick={() => window.history.back()} 
          variant="ghost" 
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Privacy Notice</CardTitle>
            <p className="text-sm text-gray-600">Last updated: January 2025</p>
          </CardHeader>
          <CardContent className="prose prose-gray max-w-none">
            <div className="space-y-6 text-gray-700">
              <div>
                <h3 className="text-lg font-semibold mb-2">Controller/Processor Roles</h3>
                <p>Chain operates the platform and generally acts as a processor/service provider for participating agencies, who are responsible for the debts and related notices. For some operations (e.g., App analytics, account creation) Chain may act as an independent controller.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">What We Collect</h3>
                <p>Identifiers (name, email, phone), account references provided by agencies, device data, app usage, communication preferences, consent logs.</p>
                <p className="mt-2">Payment details are processed by integrated processors; we store only tokens/metadata where needed (no full card or bank numbers).</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Why We Use Data</h3>
                <p>Provide and secure the Service, show account details, deliver communications (SMS/email/push), support, prevent fraud, comply with law.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Communications (SMS/Email/Push) & Consent</h3>
                <p>By opting in within the App, you agree to receive account-related messages by SMS, email, and push. Message & data rates may apply. Frequency varies. Reply STOP to SMS to opt out; use unsubscribe links for email; disable push in device/App settings. Consent is not required to obtain services. We log all consent and opt-out events.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Sharing</h3>
                <p>With the agency responsible for your account; with vendors (hosting, messaging, analytics, payment); as required by law; during a merger or acquisition with notice.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Your Choices</h3>
                <p>Manage notification preferences in the App; opt out of SMS by replying STOP; request copies or deletion of data (subject to legal retention) via support@chainsoftwaregroup.com.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Data Security & Retention</h3>
                <p>We use industry safeguards (e.g., encryption in transit, role-based access). Data is retained as long as needed for the purposes above or as required by law/agency contracts.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">Contact</h3>
                <p>
                  <strong>Email:</strong> support@chainsoftwaregroup.com<br />
                  <strong>Phone:</strong> (716) 534-3086<br />
                  <strong>Mail:</strong> 1845 Cleveland Ave, Niagara Falls, NY
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}