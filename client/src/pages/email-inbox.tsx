import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Mail, MailOpen, Reply, User, Calendar, MessageSquare, Phone, Inbox, Trash2, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface EmailReply {
  id: string;
  tenantId: string;
  consumerId: string | null;
  fromEmail: string;
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  messageId: string;
  isRead: boolean;
  readAt: string | null;
  receivedAt: string;
  consumerName?: string;
  consumerEmail?: string;
}

interface SmsReply {
  id: string;
  tenantId: string;
  consumerId: string | null;
  fromPhone: string;
  toPhone: string;
  messageBody: string;
  messageSid: string;
  numMedia: number;
  mediaUrls: string[] | null;
  isRead: boolean;
  readAt: string | null;
  receivedAt: string;
  consumerName?: string;
  consumerPhone?: string;
}

export default function CommunicationsInbox() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'email' | 'sms'>('email');
  const [selectedEmail, setSelectedEmail] = useState<EmailReply | null>(null);
  const [selectedSms, setSelectedSms] = useState<SmsReply | null>(null);
  const [showEmailReplyDialog, setShowEmailReplyDialog] = useState(false);
  const [showSmsReplyDialog, setShowSmsReplyDialog] = useState(false);
  const [showConversationDialog, setShowConversationDialog] = useState(false);
  const [emailReplySubject, setEmailReplySubject] = useState('');
  const [emailReplyMessage, setEmailReplyMessage] = useState('');
  const [smsReplyMessage, setSmsReplyMessage] = useState('');

  // Fetch email replies
  const { data: emails = [], isLoading: isLoadingEmails, isError: isErrorEmails, error: emailError, refetch: refetchEmails } = useQuery<EmailReply[]>({
    queryKey: ['/api/email-replies'],
    retry: 2,
  });

  // Fetch SMS replies
  const { data: smsMessages = [], isLoading: isLoadingSms, isError: isErrorSms, error: smsError, refetch: refetchSms } = useQuery<SmsReply[]>({
    queryKey: ['/api/sms-replies'],
    retry: 2,
  });

  // Get consumer ID from selected email or SMS
  const selectedConsumerId = selectedEmail?.consumerId || selectedSms?.consumerId;

  // Fetch conversation history for selected consumer
  const { data: conversationData, isLoading: isLoadingConversation } = useQuery<{
    messages: any[];
    summary: {
      totalEmails: number;
      totalSms: number;
      emailsSent: number;
      emailsReceived: number;
      smsSent: number;
      smsReceived: number;
    };
  }>({
    queryKey: ['/api/consumers', selectedConsumerId, 'conversation'],
    enabled: showConversationDialog && !!selectedConsumerId,
  });

  // Mark email as read mutation
  const markEmailAsReadMutation = useMutation({
    mutationFn: async (emailId: string) => {
      return await apiRequest('PATCH', `/api/email-replies/${emailId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-replies'] });
    },
  });

  // Mark SMS as read mutation
  const markSmsAsReadMutation = useMutation({
    mutationFn: async (smsId: string) => {
      return await apiRequest('PATCH', `/api/sms-replies/${smsId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sms-replies'] });
    },
  });

  // Send email reply mutation
  const sendEmailReplyMutation = useMutation({
    mutationFn: async ({ emailId, subject, message }: { emailId: string; subject: string; message: string }) => {
      return await apiRequest('POST', `/api/email-replies/${emailId}/respond`, { subject, message });
    },
    onSuccess: () => {
      toast({
        title: 'Email sent',
        description: 'Your response has been sent successfully.',
      });
      setShowEmailReplyDialog(false);
      setEmailReplySubject('');
      setEmailReplyMessage('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send email',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Send SMS reply mutation
  const sendSmsReplyMutation = useMutation({
    mutationFn: async ({ smsId, message }: { smsId: string; message: string }) => {
      return await apiRequest('POST', `/api/sms-replies/${smsId}/respond`, { message });
    },
    onSuccess: () => {
      toast({
        title: 'SMS sent',
        description: 'Your response has been sent successfully.',
      });
      setShowSmsReplyDialog(false);
      setSmsReplyMessage('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send SMS',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete email mutation
  const deleteEmailMutation = useMutation({
    mutationFn: async (emailId: string) => {
      return await apiRequest('DELETE', `/api/email-replies/${emailId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-replies'] });
      setSelectedEmail(null);
      toast({
        title: 'Email deleted',
        description: 'The email has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete email',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete SMS mutation
  const deleteSmsMutation = useMutation({
    mutationFn: async (smsId: string) => {
      return await apiRequest('DELETE', `/api/sms-replies/${smsId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sms-replies'] });
      setSelectedSms(null);
      toast({
        title: 'SMS deleted',
        description: 'The SMS has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete SMS',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleEmailClick = (email: EmailReply) => {
    setSelectedEmail(email);
    setSelectedSms(null);
    if (!email.isRead) {
      markEmailAsReadMutation.mutate(email.id);
    }
  };

  const handleSmsClick = (sms: SmsReply) => {
    setSelectedSms(sms);
    setSelectedEmail(null);
    if (!sms.isRead) {
      markSmsAsReadMutation.mutate(sms.id);
    }
  };

  const handleEmailReply = () => {
    if (!selectedEmail) return;
    
    // Pre-fill subject with "Re: " prefix if not already present
    const subject = selectedEmail.subject.startsWith('Re:') 
      ? selectedEmail.subject 
      : `Re: ${selectedEmail.subject}`;
    
    setEmailReplySubject(subject);
    setShowEmailReplyDialog(true);
  };

  const handleSmsReply = () => {
    if (!selectedSms) return;
    setShowSmsReplyDialog(true);
  };

  const handleSendEmailReply = () => {
    if (!selectedEmail || !emailReplySubject.trim() || !emailReplyMessage.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please provide both subject and message.',
        variant: 'destructive',
      });
      return;
    }

    sendEmailReplyMutation.mutate({
      emailId: selectedEmail.id,
      subject: emailReplySubject,
      message: emailReplyMessage,
    });
  };

  const handleSendSmsReply = () => {
    if (!selectedSms || !smsReplyMessage.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please provide a message.',
        variant: 'destructive',
      });
      return;
    }

    sendSmsReplyMutation.mutate({
      smsId: selectedSms.id,
      message: smsReplyMessage,
    });
  };

  const unreadEmailCount = emails.filter(email => !email.isRead).length;
  const unreadSmsCount = smsMessages.filter(sms => !sms.isRead).length;
  const totalUnreadCount = unreadEmailCount + unreadSmsCount;

  const glassPanelClass = "rounded-3xl border border-white/15 bg-[#0b1733]/80 text-blue-50 shadow-xl shadow-blue-900/20 backdrop-blur";

  return (
    <AdminLayout>
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 text-blue-50 sm:px-6 lg:px-8">
        {/* Header */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-blue-500/20 via-indigo-600/20 to-purple-900/20 p-8 shadow-2xl shadow-blue-900/40 backdrop-blur">
          <div className="pointer-events-none absolute -right-10 top-10 h-64 w-64 rounded-full bg-blue-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-8 h-56 w-56 rounded-full bg-indigo-500/30 blur-3xl" />
          <div className="relative z-10 space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-100/80">
              <Inbox className="h-3.5 w-3.5" />
              Inbound Communications
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">Communications Inbox</h1>
              <p className="text-sm text-blue-100/70 sm:text-base">
                View and respond to inbound messages from your consumers
              </p>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'email' | 'sms')} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="email" className="gap-2" data-testid="tab-email">
              <Mail className="w-4 h-4" />
              Email
              {unreadEmailCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{unreadEmailCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sms" className="gap-2" data-testid="tab-sms">
              <MessageSquare className="w-4 h-4" />
              SMS
              {unreadSmsCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{unreadSmsCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Email List */}
              <Card className={cn(glassPanelClass, "lg:col-span-1")}>
                <CardHeader className="border-b border-white/20 pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-white">Email Messages</CardTitle>
                    {unreadEmailCount > 0 && (
                      <Badge variant="destructive" data-testid="badge-unread-email-count">
                        {unreadEmailCount} new
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    {emails.length} total email{emails.length !== 1 ? 's' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {isLoadingEmails ? (
                    <div className="flex justify-center items-center p-8" data-testid="text-loading-emails">
                      <div className="animate-spin rounded-full h-8 w-8 border-4 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100"></div>
                    </div>
                  ) : isErrorEmails ? (
                    <div className="p-8 text-center" data-testid="error-loading-emails">
                      <Mail className="w-12 h-12 mx-auto mb-2 text-red-500 opacity-50" />
                      <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">Failed to load emails</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                        {emailError instanceof Error ? emailError.message : 'An error occurred'}
                      </p>
                      <Button 
                        onClick={() => refetchEmails()} 
                        variant="outline"
                        size="sm"
                        data-testid="button-retry-emails"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Try Again
                      </Button>
                    </div>
                  ) : emails.length === 0 ? (
                    <div className="p-12 text-center" data-testid="text-no-emails">
                      <Mail className="w-12 h-12 mx-auto mb-3 text-slate-400 dark:text-slate-500" />
                      <p className="text-sm font-medium text-slate-900 dark:text-white">No emails yet</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Inbound emails will appear here</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                      {emails.map((email) => (
                        <button
                          key={email.id}
                          onClick={() => handleEmailClick(email)}
                          data-testid={`button-email-${email.id}`}
                          className={cn(
                            "w-full text-left p-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50",
                            selectedEmail?.id === email.id && "bg-slate-100 dark:bg-slate-800 border-l-4 border-blue-600",
                            !email.isRead && "bg-blue-50/50 dark:bg-blue-950/20"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "mt-0.5 flex-shrink-0",
                              !email.isRead ? "text-blue-600" : "text-slate-400 dark:text-slate-500"
                            )}>
                              {email.isRead ? (
                                <MailOpen className="w-5 h-5" />
                              ) : (
                                <Mail className="w-5 h-5" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className={cn(
                                  "text-sm truncate",
                                  !email.isRead ? "font-semibold text-slate-900 dark:text-white" : "font-medium text-slate-700 dark:text-slate-300"
                                )}>
                                  {email.consumerName || email.fromEmail}
                                </p>
                                {!email.isRead && (
                                  <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></span>
                                )}
                              </div>
                              <p className={cn(
                                "text-sm truncate",
                                !email.isRead ? "font-medium text-slate-600 dark:text-slate-300" : "text-slate-500 dark:text-slate-400"
                              )}>
                                {email.subject}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Email Details */}
              <Card className={cn(glassPanelClass, "lg:col-span-2")}>
                <CardHeader className="border-b border-white/20 pb-4">
                  <CardTitle className="text-lg font-semibold text-white">Email Details</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {selectedEmail ? (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div>
                          <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">From</Label>
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                              <User className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white" data-testid="text-from-email">
                                {selectedEmail.consumerName || selectedEmail.fromEmail}
                              </p>
                              {selectedEmail.consumerName && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">{selectedEmail.fromEmail}</p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Subject</Label>
                          <p className="text-sm font-medium text-slate-900 dark:text-white mt-1.5" data-testid="text-subject">
                            {selectedEmail.subject}
                          </p>
                        </div>

                        <div>
                          <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Received</Label>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            <span className="text-sm text-slate-700 dark:text-slate-300" data-testid="text-received-date">
                              {new Date(selectedEmail.receivedAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-6">
                        <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Message</Label>
                        <div 
                          className="mt-3 prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300"
                          data-testid="content-email-body"
                          dangerouslySetInnerHTML={{ 
                            __html: selectedEmail.htmlBody || selectedEmail.textBody.replace(/\n/g, '<br/>') 
                          }}
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button 
                          onClick={handleEmailReply} 
                          data-testid="button-email-reply"
                          className="gap-2"
                        >
                          <Reply className="w-4 h-4" />
                          Reply
                        </Button>
                        {selectedEmail.consumerId && (
                          <Button 
                            onClick={() => setShowConversationDialog(true)} 
                            data-testid="button-view-conversation"
                            variant="outline"
                            className="gap-2"
                          >
                            <MessageSquare className="w-4 h-4" />
                            View Conversation
                          </Button>
                        )}
                        <Button 
                          onClick={() => deleteEmailMutation.mutate(selectedEmail.id)} 
                          data-testid="button-delete-email"
                          variant="destructive"
                          className="gap-2"
                          disabled={deleteEmailMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                          {deleteEmailMutation.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16" data-testid="text-select-email">
                      <div className="inline-flex p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
                        <Mail className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Select an email</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Choose an email from the list to view its contents</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sms" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* SMS List */}
              <Card className={cn(glassPanelClass, "lg:col-span-1")}>
                <CardHeader className="border-b border-white/20 pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">SMS Messages</CardTitle>
                    {unreadSmsCount > 0 && (
                      <Badge variant="destructive" data-testid="badge-unread-sms-count">
                        {unreadSmsCount} new
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    {smsMessages.length} total message{smsMessages.length !== 1 ? 's' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {isLoadingSms ? (
                    <div className="flex justify-center items-center p-8" data-testid="text-loading-sms">
                      <div className="animate-spin rounded-full h-8 w-8 border-4 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100"></div>
                    </div>
                  ) : isErrorSms ? (
                    <div className="p-8 text-center" data-testid="error-loading-sms">
                      <MessageSquare className="w-12 h-12 mx-auto mb-2 text-red-500 opacity-50" />
                      <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">Failed to load SMS messages</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                        {smsError instanceof Error ? smsError.message : 'An error occurred'}
                      </p>
                      <Button 
                        onClick={() => refetchSms()} 
                        variant="outline"
                        size="sm"
                        data-testid="button-retry-sms"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Try Again
                      </Button>
                    </div>
                  ) : smsMessages.length === 0 ? (
                    <div className="p-12 text-center" data-testid="text-no-sms">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-400 dark:text-slate-500" />
                      <p className="text-sm font-medium text-slate-900 dark:text-white">No SMS messages yet</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Inbound SMS will appear here</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                      {smsMessages.map((sms) => (
                        <button
                          key={sms.id}
                          onClick={() => handleSmsClick(sms)}
                          data-testid={`button-sms-${sms.id}`}
                          className={cn(
                            "w-full text-left p-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50",
                            selectedSms?.id === sms.id && "bg-slate-100 dark:bg-slate-800 border-l-4 border-blue-600",
                            !sms.isRead && "bg-blue-50/50 dark:bg-blue-950/20"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "mt-0.5 flex-shrink-0",
                              !sms.isRead ? "text-blue-600" : "text-slate-400 dark:text-slate-500"
                            )}>
                              <MessageSquare className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className={cn(
                                  "text-sm truncate",
                                  !sms.isRead ? "font-semibold text-slate-900 dark:text-white" : "font-medium text-slate-700 dark:text-slate-300"
                                )}>
                                  {sms.consumerName || sms.fromPhone}
                                </p>
                                {!sms.isRead && (
                                  <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></span>
                                )}
                              </div>
                              <p className={cn(
                                "text-sm truncate",
                                !sms.isRead ? "font-medium text-slate-600 dark:text-slate-300" : "text-slate-500 dark:text-slate-400"
                              )}>
                                {sms.messageBody}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {formatDistanceToNow(new Date(sms.receivedAt), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* SMS Details */}
              <Card className={cn(glassPanelClass, "lg:col-span-2")}>
                <CardHeader className="border-b border-white/20 pb-4">
                  <CardTitle className="text-lg font-semibold text-white">SMS Details</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {selectedSms ? (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div>
                          <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">From</Label>
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                              <Phone className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white" data-testid="text-from-phone">
                                {selectedSms.consumerName || selectedSms.fromPhone}
                              </p>
                              {selectedSms.consumerName && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">{selectedSms.fromPhone}</p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Received</Label>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            <span className="text-sm text-slate-700 dark:text-slate-300" data-testid="text-sms-received-date">
                              {new Date(selectedSms.receivedAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-6">
                        <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Message</Label>
                        <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap" data-testid="content-sms-body">
                          {selectedSms.messageBody}
                        </p>
                        
                        {selectedSms.numMedia > 0 && selectedSms.mediaUrls && (
                          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                            <Label className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                              Media Attachments ({selectedSms.numMedia})
                            </Label>
                            <div className="mt-2 space-y-2">
                              {selectedSms.mediaUrls.map((url, index) => (
                                <a 
                                  key={index}
                                  href={url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="block text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                                  data-testid={`link-media-${index}`}
                                >
                                  View Media {index + 1}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button 
                          onClick={handleSmsReply} 
                          data-testid="button-sms-reply"
                          className="gap-2"
                        >
                          <Reply className="w-4 h-4" />
                          Reply
                        </Button>
                        {selectedSms.consumerId && (
                          <Button 
                            onClick={() => setShowConversationDialog(true)} 
                            data-testid="button-view-sms-conversation"
                            variant="outline"
                            className="gap-2"
                          >
                            <MessageSquare className="w-4 h-4" />
                            View Conversation
                          </Button>
                        )}
                        <Button 
                          onClick={() => deleteSmsMutation.mutate(selectedSms.id)} 
                          data-testid="button-delete-sms"
                          variant="destructive"
                          className="gap-2"
                          disabled={deleteSmsMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                          {deleteSmsMutation.isPending ? 'Deleting...' : 'Delete'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16" data-testid="text-select-sms">
                      <div className="inline-flex p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4">
                        <MessageSquare className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Select an SMS</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Choose an SMS from the list to view its contents</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Email Reply Dialog */}
      <Dialog open={showEmailReplyDialog} onOpenChange={setShowEmailReplyDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reply to Email</DialogTitle>
            <DialogDescription>
              Send a response to {selectedEmail?.fromEmail}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="email-reply-subject">Subject</Label>
              <Input
                id="email-reply-subject"
                data-testid="input-email-reply-subject"
                value={emailReplySubject}
                onChange={(e) => setEmailReplySubject(e.target.value)}
                placeholder="Subject"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="email-reply-message">Message</Label>
              <Textarea
                id="email-reply-message"
                data-testid="textarea-email-reply-message"
                value={emailReplyMessage}
                onChange={(e) => setEmailReplyMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={8}
                className="resize-none mt-1.5"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowEmailReplyDialog(false)}
                data-testid="button-cancel-email-reply"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendEmailReply}
                disabled={sendEmailReplyMutation.isPending || !emailReplySubject.trim() || !emailReplyMessage.trim()}
                data-testid="button-send-email-reply"
              >
                {sendEmailReplyMutation.isPending ? 'Sending...' : 'Send Reply'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* SMS Reply Dialog */}
      <Dialog open={showSmsReplyDialog} onOpenChange={setShowSmsReplyDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reply to SMS</DialogTitle>
            <DialogDescription>
              Send a response to {selectedSms?.fromPhone}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="sms-reply-message">Message</Label>
              <Textarea
                id="sms-reply-message"
                data-testid="textarea-sms-reply-message"
                value={smsReplyMessage}
                onChange={(e) => setSmsReplyMessage(e.target.value)}
                placeholder="Type your SMS message here..."
                rows={6}
                className="resize-none mt-1.5"
                maxLength={1600}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                {smsReplyMessage.length} / 1600 characters
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowSmsReplyDialog(false)}
                data-testid="button-cancel-sms-reply"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendSmsReply}
                disabled={sendSmsReplyMutation.isPending || !smsReplyMessage.trim()}
                data-testid="button-send-sms-reply"
              >
                {sendSmsReplyMutation.isPending ? 'Sending...' : 'Send SMS'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Conversation History Dialog */}
      <Dialog open={showConversationDialog} onOpenChange={setShowConversationDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col border border-white/10 bg-[#0f1a3c] text-blue-100">
          {(selectedEmail || selectedSms) && (
            <>
              <DialogHeader className="space-y-2 text-left pb-4 border-b border-white/10">
                <DialogTitle className="text-xl font-semibold text-white">
                  Conversation History
                </DialogTitle>
                <DialogDescription className="text-sm text-blue-100/70">
                  All communications with {selectedEmail?.consumerName || selectedSms?.consumerName || selectedEmail?.fromEmail || selectedSms?.fromPhone}
                </DialogDescription>
                {conversationData?.summary && (
                  <div className="flex gap-4 pt-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-sky-400" />
                      <span className="text-blue-100/80">
                        {conversationData.summary.totalEmails} emails 
                        ({conversationData.summary.emailsSent} sent, {conversationData.summary.emailsReceived} received)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-blue-100/80">
                        {conversationData.summary.totalSms} SMS 
                        ({conversationData.summary.smsSent} sent, {conversationData.summary.smsReceived} received)
                      </span>
                    </div>
                  </div>
                )}
              </DialogHeader>

              <div className="flex-1 overflow-y-auto py-4 space-y-3" data-testid="conversation-timeline">
                {isLoadingConversation ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-sm text-blue-100/60">Loading conversation...</div>
                  </div>
                ) : conversationData?.messages && conversationData.messages.length > 0 ? (
                  conversationData.messages.map((message: any, index: number) => {
                    const isOutbound = message.direction === 'outbound';
                    const isEmail = message.channel === 'email';
                    
                    return (
                      <div 
                        key={`${message.channel}-${message.id}-${index}`}
                        className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                        data-testid={`message-${message.channel}-${message.direction}`}
                      >
                        <div className={`max-w-[75%] rounded-xl p-4 ${
                          isOutbound 
                            ? 'bg-sky-500/20 border border-sky-400/30' 
                            : 'bg-white/10 border border-white/20'
                        }`}>
                          <div className="flex items-center gap-2 mb-2">
                            {isEmail ? (
                              <Mail className={`h-4 w-4 ${isOutbound ? 'text-sky-300' : 'text-blue-300'}`} />
                            ) : (
                              <MessageSquare className={`h-4 w-4 ${isOutbound ? 'text-emerald-300' : 'text-green-300'}`} />
                            )}
                            <span className={`text-xs font-semibold uppercase tracking-wide ${
                              isOutbound ? 'text-sky-200' : 'text-blue-200'
                            }`}>
                              {isOutbound ? 'Sent' : 'Received'} {isEmail ? 'Email' : 'SMS'}
                            </span>
                            <span className="text-xs text-blue-100/50 ml-auto">
                              {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
                            </span>
                          </div>

                          {isEmail && message.subject && (
                            <div className="text-sm font-semibold text-white mb-2">
                              {message.subject}
                            </div>
                          )}

                          {isEmail && (message.htmlBody || message.body?.includes('<')) ? (
                            <div 
                              className="text-sm text-blue-100/90 prose prose-invert prose-sm max-w-none"
                              dangerouslySetInnerHTML={{
                                __html: message.htmlBody || message.body || message.textBody || 'No content'
                              }}
                            />
                          ) : (
                            <div className="text-sm text-blue-100/90 whitespace-pre-wrap">
                              {message.body || message.message || message.messageContent || message.messageBody || message.textBody || 'No content'}
                            </div>
                          )}

                          {isEmail && (isOutbound ? message.toEmail : message.fromEmail) && (
                            <div className="text-xs text-blue-100/50 mt-2 pt-2 border-t border-white/10">
                              {isOutbound ? 'To' : 'From'}: {isOutbound ? message.toEmail : message.fromEmail}
                            </div>
                          )}

                          {!isEmail && (isOutbound ? message.toPhone : message.fromPhone) && (
                            <div className="text-xs text-blue-100/50 mt-2 pt-2 border-t border-white/10">
                              {isOutbound ? 'To' : 'From'}: {isOutbound ? message.toPhone : message.fromPhone}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <MessageSquare className="h-12 w-12 text-blue-100/30 mx-auto mb-3" />
                      <p className="text-sm text-blue-100/60">No messages yet</p>
                      <p className="text-xs text-blue-100/40 mt-1">
                        Start a conversation by replying to this message
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="pt-4 border-t border-white/10">
                <Button
                  variant="ghost"
                  className="rounded-lg border border-white/10 bg-white/5 px-4 text-blue-100 hover:bg-white/10"
                  onClick={() => setShowConversationDialog(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
