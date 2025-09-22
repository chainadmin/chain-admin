import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function TermsOfService() {
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
            <CardTitle className="text-2xl">Consumer Terms of Service</CardTitle>
            <p className="text-sm text-gray-600">Last updated: January 2025</p>
          </CardHeader>
          <CardContent className="prose prose-gray max-w-none">
            <div className="space-y-6 text-gray-700">
              <div>
                <p className="mb-2">
                  <strong>Company:</strong> Chain Software Group ("Chain", "we", "us")<br />
                  <strong>Website/App:</strong> chainsoftwaregroup.com<br />
                  <strong>Contact:</strong> support@chainsoftwaregroup.com | (716) 534-3086 | 1845 Cleveland Ave, Niagara Falls, NY
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">1. Acceptance</h3>
                <p>By creating an account, accessing, or using the App, you agree to these Terms and our Privacy Notice. If you do not agree, do not use the App.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">2. The Service</h3>
                <p>The App provides a communication portal where consumers can view account information provided by participating agency and receive messages/notifications. Payment options may be offered by agencies through integrated processors. Chain is a platform provider and does not itself originate or service consumer debts.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">3. Eligibility; Your Account</h3>
                <p>You must be 18+ and reside in the United States to use the App. You are responsible for maintaining the confidentiality of your login and for all activity under your account.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">4. Consumer Communications & Consent</h3>
                <p>You agree that Chain and participating agencies may send you automated and non-automated communications about your accounts by SMS/text, email, and push notifications.</p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                  <li><strong>SMS/Text:</strong> Message & data rates may apply. Message frequency varies. Reply STOP to stop, HELP for help.</li>
                  <li><strong>Email:</strong> You may unsubscribe using the link in any email.</li>
                  <li><strong>Push:</strong> You can disable push in your device or in-app settings.</li>
                </ul>
                <p className="mt-2"><strong>Consent Not Required:</strong> Your consent to automated messages is not required as a condition of any service, plan, or settlement.</p>
                <p className="mt-2"><strong>Recordkeeping:</strong> We maintain consent and opt-out logs. You can manage preferences in the App or contact support@chainsoftwaregroup.com or (716) 534-3086.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">5. Payment Features</h3>
                <p>Payments may be facilitated via third-party processors (e.g., card/ACH). You authorize the processor and the relevant agency to charge your selected payment method in accordance with any payment plan or one-time authorization you accept. Payment disputes, refunds, chargebacks, or payoff letters are handled by the agency responsible for your account.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">6. User Conduct; Prohibited Uses</h3>
                <p>You agree not to: (a) use the App for unlawful purposes; (b) attempt to access data that is not yours; (c) interfere with security or integrity; (d) reverse engineer or scrape the Service; (e) impersonate others.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">7. Privacy</h3>
                <p>Our collection and use of personal information is described in our Privacy Notice. Agencies are independent entities and may have their own privacy obligations as controllers of their consumer data.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">8. Disclaimers</h3>
                <p>THE APP IS PROVIDED "AS IS." WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not guarantee the accuracy of account data provided by agencies.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">9. Limitation of Liability</h3>
                <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHAIN AND ITS AFFILIATES ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM OR RELATING TO YOUR USE OF THE APP. OUR TOTAL LIABILITY SHALL NOT EXCEED THE GREATER OF $100 OR THE AMOUNT YOU PAID TO US IN THE 12 MONTHS BEFORE THE CLAIM.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">10. Dispute Resolution; Arbitration; Class Action Waiver</h3>
                <p>Any dispute will be resolved by binding arbitration on an individual basis. You waive any right to participate in a class action or class-wide arbitration. You may opt out of arbitration within 30 days of account creation by emailing support@chainsoftwaregroup.com with your name and the subject "Arbitration Opt-Out."</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">11. Changes</h3>
                <p>We may update these Terms by posting the revised version with a new "Last updated" date. Your continued use constitutes acceptance. Material changes will be notified within the App or by email/SMS where appropriate.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">12. Termination</h3>
                <p>We may suspend or terminate your access for any reason. Upon termination, sections intended to survive will survive.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">13. Contact</h3>
                <p>Questions? support@chainsoftwaregroup.com | 1845 Cleveland Ave, Niagara Falls, NY</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}