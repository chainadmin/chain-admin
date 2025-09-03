import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <div className="mb-8">
            <Link href="/">
              <Button variant="outline" className="mb-4">
                ← Back to Home
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
            <p className="text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
          </div>

          <div className="prose max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Information We Collect</h2>
              <p className="text-gray-700 mb-4">
                Our communications platform collects and processes the following types of information:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Account Information:</strong> Name, email address, organization details</li>
                <li><strong>Consumer Data:</strong> Contact information, account details, communication preferences</li>
                <li><strong>Communication Data:</strong> Email and SMS templates, campaign data, delivery tracking</li>
                <li><strong>Usage Data:</strong> Platform activity, feature usage, system logs</li>
                <li><strong>Technical Data:</strong> IP addresses, browser information, device identifiers</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. How We Use Your Information</h2>
              <p className="text-gray-700 mb-4">We use collected information for:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Providing and maintaining our communication services</li>
                <li>Processing and delivering email and SMS campaigns</li>
                <li>Managing user accounts and platform access</li>
                <li>Analyzing platform usage and improving our services</li>
                <li>Ensuring platform security and preventing fraud</li>
                <li>Complying with legal obligations and industry regulations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Information Sharing</h2>
              <p className="text-gray-700 mb-4">
                We do not sell, trade, or rent your personal information. We may share information in the following circumstances:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Service Providers:</strong> Third-party services that help us operate our platform (email/SMS providers, hosting services)</li>
                <li><strong>Legal Requirements:</strong> When required by law, regulation, or legal process</li>
                <li><strong>Business Transfers:</strong> In connection with mergers, acquisitions, or asset sales</li>
                <li><strong>Consent:</strong> When you explicitly authorize information sharing</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Data Security</h2>
              <p className="text-gray-700 mb-4">
                We implement industry-standard security measures to protect your information:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Encryption of data in transit and at rest</li>
                <li>Secure authentication and access controls</li>
                <li>Regular security audits and monitoring</li>
                <li>Limited access to personal information on a need-to-know basis</li>
                <li>Secure hosting infrastructure with backup and recovery systems</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Your Rights</h2>
              <p className="text-gray-700 mb-4">You have the following rights regarding your personal information:</p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Access:</strong> Request access to your personal information</li>
                <li><strong>Correction:</strong> Request correction of inaccurate information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                <li><strong>Portability:</strong> Request transfer of your data in a structured format</li>
                <li><strong>Objection:</strong> Object to processing of your personal information</li>
                <li><strong>Restriction:</strong> Request restriction of processing activities</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Data Retention</h2>
              <p className="text-gray-700 mb-4">
                We retain personal information for as long as necessary to provide our services and comply with legal obligations. 
                Specific retention periods vary based on data type and applicable regulations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Cookies and Tracking</h2>
              <p className="text-gray-700 mb-4">
                Our platform uses cookies and similar technologies to enhance user experience, analyze usage patterns, 
                and maintain secure sessions. You can control cookie preferences through your browser settings.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Third-Party Services</h2>
              <p className="text-gray-700 mb-4">
                Our platform integrates with third-party services for email delivery, SMS messaging, and analytics. 
                These services have their own privacy policies and data handling practices.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. International Data Transfers</h2>
              <p className="text-gray-700 mb-4">
                Your information may be processed and stored in countries other than your own. We ensure appropriate 
                safeguards are in place for international data transfers in compliance with applicable laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Changes to This Policy</h2>
              <p className="text-gray-700 mb-4">
                We may update this privacy policy periodically. Material changes will be communicated through our platform 
                or via email. Continued use of our services constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Contact Information</h2>
              <p className="text-gray-700 mb-4">
                For questions about this privacy policy or to exercise your rights, please contact us:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-700">
                  <strong>Email:</strong> privacy@yourcompany.com<br />
                  <strong>Address:</strong> [Your Company Address]<br />
                  <strong>Phone:</strong> [Your Phone Number]
                </p>
              </div>
            </section>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center">
              This privacy policy is effective as of {new Date().toLocaleDateString()} and applies to all users of our communications platform.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}