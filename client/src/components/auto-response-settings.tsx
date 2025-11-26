import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Bot, Sparkles, TestTube, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const cardBaseClasses = "border border-white/10 bg-white/5 text-blue-50 shadow-lg shadow-blue-900/20 backdrop-blur";
const inputClasses = "border-white/20 bg-white/10 text-white placeholder:text-blue-100/60 focus:border-sky-400/60 focus-visible:ring-sky-400/40";
const selectTriggerClasses = "border-white/20 bg-white/10 text-white placeholder:text-blue-100/60 focus:border-sky-400/60 focus:ring-0 focus-visible:ring-0";

interface AutoResponseConfig {
  id: string;
  tenantId: string;
  enabled: boolean;
  testMode: boolean;
  openaiApiKey: string | null;
  model: string;
  responseTone: 'professional' | 'friendly' | 'empathetic' | 'concise';
  customInstructions: string | null;
  businessResponseTemplate: string | null;
  enableEmailAutoResponse: boolean;
  enableSmsAutoResponse: boolean;
  maxResponseLength: number;
  createdAt: string;
  updatedAt: string;
}

interface UsageStats {
  responsesThisMonth: number;
  includedQuota: number;
  overageResponses: number;
  estimatedCost: number;
  resetDate: string;
}

export default function AutoResponseSettings() {
  const { toast } = useToast();
  const [hasChanges, setHasChanges] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testMessageType, setTestMessageType] = useState<'email' | 'sms'>('email');
  const [testResponse, setTestResponse] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const { data: config, isLoading } = useQuery<AutoResponseConfig | null>({
    queryKey: ['/api/auto-response/config'],
  });

  const { data: usage } = useQuery<UsageStats>({
    queryKey: ['/api/auto-response/usage'],
  });

  const [localConfig, setLocalConfig] = useState<Partial<AutoResponseConfig>>({});

  useEffect(() => {
    if (config) {
      setLocalConfig(config);
      setHasChanges(false);
    }
  }, [config]);

  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<AutoResponseConfig>) => {
      return apiRequest('PUT', '/api/auto-response/config', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auto-response/config'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auto-response/usage'] });
      toast({
        title: "Settings saved",
        description: "Auto-response configuration has been updated successfully.",
      });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update auto-response settings",
        variant: "destructive",
      });
    },
  });

  const handleUpdate = (field: keyof AutoResponseConfig, value: any) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateConfigMutation.mutate(localConfig);
  };

  const handleTest = async () => {
    if (!testMessage.trim()) {
      toast({
        title: "Error",
        description: "Please enter a test message",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    setTestResponse("");

    try {
      const startTime = Date.now();
      const res = await apiRequest('POST', '/api/auto-response/test', {
        messageType: testMessageType,
        message: testMessage,
      });
      const result = await res.json();
      const responseTime = Date.now() - startTime;

      setTestResponse(result.response);
      toast({
        title: "Test successful",
        description: `Generated response in ${responseTime}ms using ${result.tokensUsed} tokens`,
      });
    } catch (error: any) {
      toast({
        title: "Test failed",
        description: error.message || "Failed to generate test response",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className={cardBaseClasses}>
        <CardHeader className="space-y-1 text-white">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-sky-400" />
            <CardTitle className="text-xl font-semibold text-white">AI Auto-Response Configuration</CardTitle>
          </div>
          <CardDescription className="text-blue-100">
            Configure AI-powered automatic responses to consumer emails and SMS messages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm text-blue-100/80">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium text-white">Enable Auto-Response</Label>
                <p className="text-sm text-blue-100">
                  Automatically respond to incoming emails and SMS messages
                </p>
              </div>
              <Switch
                checked={localConfig.enabled || false}
                onCheckedChange={(checked) => handleUpdate('enabled', checked)}
                data-testid="switch-auto-response-enabled"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium text-white">Test Mode</Label>
                <p className="text-sm text-blue-100">
                  Generate responses without sending them or using quota
                </p>
              </div>
              <Switch
                checked={localConfig.testMode || false}
                onCheckedChange={(checked) => handleUpdate('testMode', checked)}
                data-testid="switch-test-mode"
              />
            </div>


            <div className="space-y-2">
              <Label className="text-white">Response Tone</Label>
              <Select
                value={localConfig.responseTone || 'professional'}
                onValueChange={(value) => handleUpdate('responseTone', value)}
              >
                <SelectTrigger className={selectTriggerClasses} data-testid="select-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0f172a] text-blue-50">
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="empathetic">Empathetic</SelectItem>
                  <SelectItem value="concise">Concise</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-white">Custom Instructions (Optional)</Label>
              <Textarea
                placeholder="Additional context or instructions for the AI (e.g., specific policies, common questions, escalation procedures)"
                value={localConfig.customInstructions || ""}
                onChange={(e) => handleUpdate('customInstructions', e.target.value)}
                className={cn(inputClasses, "min-h-[100px]")}
                data-testid="textarea-custom-instructions"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Business Response Templates (Optional)</Label>
              <Textarea
                placeholder="Provide sample responses and templates for the AI to reference. Example:&#10;&#10;When asked about payment plans: We offer flexible payment arrangements from 3-12 months with no setup fee. Please call us at [phone] to discuss options.&#10;&#10;When asked about balance: Your current balance is [amount] as of [date]. This includes all fees and interest."
                value={localConfig.businessResponseTemplate || ""}
                onChange={(e) => handleUpdate('businessResponseTemplate', e.target.value)}
                className={cn(inputClasses, "min-h-[150px]")}
                data-testid="textarea-business-response-template"
              />
              <p className="text-xs text-blue-100/60">
                Provide example responses or standard replies that the AI should reference when generating responses. This helps maintain consistency with your business policies and procedures.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 pt-4">
              <div>
                <Label className="text-base font-medium text-white">Email Auto-Response</Label>
                <p className="text-sm text-blue-100">
                  Respond to inbound email replies
                </p>
              </div>
              <Switch
                checked={localConfig.enableEmailAutoResponse || false}
                onCheckedChange={(checked) => handleUpdate('enableEmailAutoResponse', checked)}
                disabled={!localConfig.enabled}
                data-testid="switch-email-auto-response"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium text-white">SMS Auto-Response</Label>
                <p className="text-sm text-blue-100">
                  Respond to inbound SMS messages (requires Twilio configuration in Settings)
                </p>
              </div>
              <Switch
                checked={localConfig.enableSmsAutoResponse || false}
                onCheckedChange={(checked) => handleUpdate('enableSmsAutoResponse', checked)}
                disabled={!localConfig.enabled}
                data-testid="switch-sms-auto-response"
              />
            </div>
          </div>

          {usage && (
            <div className="rounded-lg border border-white/10 bg-white/5 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-sky-400" />
                <h4 className="font-semibold text-white">Usage This Month</h4>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-blue-100/70">Responses Generated</p>
                  <p className="text-lg font-semibold text-white">{usage.responsesThisMonth.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-blue-100/70">Included Quota</p>
                  <p className="text-lg font-semibold text-white">{usage.includedQuota.toLocaleString()}</p>
                </div>
                {usage.overageResponses > 0 && (
                  <>
                    <div>
                      <p className="text-blue-100/70">Overage Responses</p>
                      <p className="text-lg font-semibold text-amber-400">{usage.overageResponses.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-blue-100/70">Estimated Cost</p>
                      <p className="text-lg font-semibold text-amber-400">${usage.estimatedCost.toFixed(2)}</p>
                    </div>
                  </>
                )}
              </div>
              <p className="text-xs text-blue-100/60 mt-3">
                Quota resets on {new Date(usage.resetDate).toLocaleDateString()}
              </p>
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateConfigMutation.isPending}
            className={cn(
              "w-full rounded-xl bg-gradient-to-r from-sky-500/80 to-indigo-500/80 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:from-sky-400/80 hover:to-indigo-400/80",
              (!hasChanges || updateConfigMutation.isPending) &&
                "opacity-60 hover:from-sky-500/80 hover:to-indigo-500/80",
            )}
            data-testid="button-save-settings"
          >
            {updateConfigMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : hasChanges ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Save Changes
              </>
            ) : (
              "All Changes Saved"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className={cardBaseClasses}>
        <CardHeader className="space-y-1 text-white">
          <div className="flex items-center gap-2">
            <TestTube className="h-5 w-5 text-emerald-400" />
            <CardTitle className="text-xl font-semibold text-white">Test Playground</CardTitle>
          </div>
          <CardDescription className="text-blue-100/70">
            Test your AI responses without sending messages or using your quota
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-blue-100/80">
          <div className="space-y-2">
            <Label className="text-white">Message Type</Label>
            <Select value={testMessageType} onValueChange={(value: any) => setTestMessageType(value)}>
              <SelectTrigger className={selectTriggerClasses} data-testid="select-test-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0f172a] text-blue-50">
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Test Message</Label>
            <Textarea
              placeholder="Enter a sample consumer message to see how the AI would respond..."
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className={cn(inputClasses, "min-h-[120px]")}
              data-testid="textarea-test-message"
            />
          </div>

          <Button
            onClick={handleTest}
            disabled={isTesting || !testMessage.trim()}
            className="w-full bg-emerald-500/80 hover:bg-emerald-400/80"
            data-testid="button-test-response"
          >
            {isTesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <TestTube className="mr-2 h-4 w-4" />
                Generate Test Response
              </>
            )}
          </Button>

          {testResponse && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Check className="h-4 w-4 text-emerald-400" />
                <h4 className="font-semibold text-white">AI Response</h4>
              </div>
              <p className="text-blue-100/90 whitespace-pre-wrap">{testResponse}</p>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
