import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, MessageSquare, Bell, Shield, DollarSign } from "lucide-react";

export default function SmsOptInDisclosure() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => window.history.back()}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-100 rounded-lg">
              <MessageSquare className="h-6 w-6 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold">SMS/Text Messaging Opt-In Disclosure</h1>
          </div>

          <div className="space-y-6 text-gray-700">
            <section>
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-600" />
                Service Overview
              </h2>
              <p className="leading-relaxed">
                By providing your mobile phone number and opting in to receive text messages, you agree to receive 
                automated text messages from us or our authorized representatives regarding your account(s), 
                payment reminders, important updates, and other account-related communications.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Message Frequency</h2>
              <p className="leading-relaxed">
                The frequency of messages may vary based on your account activity and preferences. You may receive:
              </p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Account notifications and alerts</li>
                <li>Payment reminders and confirmations</li>
                <li>Important account updates</li>
                <li>Response messages to your inquiries</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-blue-600" />
                Message and Data Rates
              </h2>
              <p className="leading-relaxed font-semibold">
                Message and data rates may apply.
              </p>
              <p className="leading-relaxed mt-2">
                Standard messaging charges from your mobile carrier will apply to all text messages. 
                Data rates may apply if you access linked content via your mobile device. Please contact 
                your mobile service provider for details on your specific plan and any associated costs.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Supported Carriers</h2>
              <p className="leading-relaxed">
                Our SMS service is compatible with major U.S. wireless carriers including but not limited to:
                AT&T, Verizon Wireless, T-Mobile, Sprint, Boost Mobile, Cricket Wireless, MetroPCS, 
                U.S. Cellular, Virgin Mobile, and others. The service is supported on both prepaid and 
                postpaid plans.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">How to Opt-Out</h2>
              <p className="leading-relaxed">
                You may opt-out of receiving text messages at any time by:
              </p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Texting <strong>STOP</strong> to any message you receive from us</li>
                <li>Contacting our customer service team</li>
                <li>Updating your communication preferences in your account settings</li>
              </ul>
              <p className="leading-relaxed mt-2">
                After opting out, you will receive a one-time confirmation message confirming your 
                opt-out request. No additional messages will be sent unless you re-opt-in.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Help and Support</h2>
              <p className="leading-relaxed">
                For help or information about our SMS service:
              </p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Text <strong>HELP</strong> to any message you receive from us</li>
                <li>Contact our customer service team</li>
                <li>Visit our website for more information</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                Privacy and Security
              </h2>
              <p className="leading-relaxed">
                We value your privacy and are committed to protecting your personal information. 
                Your mobile phone number and any information collected through SMS communications 
                will be used solely for the purposes outlined in this disclosure and in accordance 
                with our Privacy Policy.
              </p>
              <p className="leading-relaxed mt-2">
                We will not sell, rent, or share your mobile phone number with third parties for 
                their marketing purposes without your explicit consent.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Terms and Conditions</h2>
              <p className="leading-relaxed">
                By opting in to receive text messages, you acknowledge that you are the authorized 
                user of the mobile phone number provided and that you have the authority to agree 
                to receive text messages at that number.
              </p>
              <p className="leading-relaxed mt-2">
                We reserve the right to modify or discontinue the SMS service at any time with or 
                without notice. We are not liable for any delays or failures in the delivery of 
                text messages, which may be affected by factors outside our control.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3">Consent</h2>
              <p className="leading-relaxed">
                By providing your mobile phone number and opting in, you expressly consent to receive 
                automated text messages as described above. This consent is not a condition of 
                purchasing any goods or services from us.
              </p>
            </section>

            <section className="pt-4 border-t">
              <p className="text-sm text-gray-600">
                <strong>Last Updated:</strong> {new Date().toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                If you have any questions about our SMS service or this disclosure, please contact 
                our customer service team for assistance.
              </p>
            </section>
          </div>
        </Card>
      </div>
    </div>
  );
}