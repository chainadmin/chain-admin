import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, CheckCircle, AlertCircle } from "lucide-react";

export default function EmailTest() {
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('Test Email from Chain Platform');
  const [message, setMessage] = useState('This is a test email to verify Postmark integration is working correctly.');
  const { toast } = useToast();

  const sendTestEmail = useMutation({
    mutationFn: async (data: { to: string; subject: string; message: string }) => {
      return apiRequest('POST', '/api/test-email', data);
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({
          title: "Email Sent Successfully",
          description: `Test email sent to ${email}`,
        });
        setEmail('');
        setMessage('This is a test email to verify Postmark integration is working correctly.');
      } else {
        toast({
          title: "Email Failed",
          description: data.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send test email",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !subject || !message) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }
    sendTestEmail.mutate({ to: email, subject, message });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900" data-testid="text-email-test-title">Email Test</h1>
          <p className="text-gray-600 mt-2">Test Postmark email delivery integration</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Mail className="h-5 w-5 mr-2" />
              Send Test Email
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">To Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  data-testid="input-test-email"
                />
              </div>

              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Test email subject"
                  data-testid="input-test-subject"
                />
              </div>

              <div>
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Test message content"
                  rows={4}
                  data-testid="textarea-test-message"
                />
              </div>

              <Button 
                type="submit" 
                disabled={sendTestEmail.isPending}
                className="w-full"
                data-testid="button-send-test-email"
              >
                {sendTestEmail.isPending ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Test Email
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-start">
                <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900">Postmark Integration Ready</p>
                  <p className="text-blue-700 mt-1">
                    Your Postmark API key is configured. Test emails will be sent through Postmark's delivery network.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-start">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-900">Email Delivery Notes</p>
                  <ul className="text-yellow-700 mt-1 space-y-1">
                    <li>• Emails are sent from your agency's configured email address</li>
                    <li>• All campaign emails include tracking and metadata</li>
                    <li>• Failed deliveries are logged and reported</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}