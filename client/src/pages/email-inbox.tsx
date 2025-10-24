import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          <Inbox className="w-8 h-8" />
          Email & SMS Inbox
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
          View and respond to inbound messages from your consumers
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'email' | 'sms')} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="email" className="gap-2" data-testid="tab-email">
              <Mail className="w-4 h-4" />
              Email
              {unreadEmailCount > 0 && (
                <Badge variant="destructive" className="ml-1">{unreadEmailCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sms" className="gap-2" data-testid="tab-sms">
              <MessageSquare className="w-4 h-4" />
              SMS
              {unreadSmsCount > 0 && (
                <Badge variant="destructive" className="ml-1">{unreadSmsCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Email List */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Email Messages</span>
                    {unreadEmailCount > 0 && (
                      <Badge variant="destructive" data-testid="badge-unread-email-count">
                        {unreadEmailCount} new
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {emails.length} total emails
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
                      <p className="text-slate-700 dark:text-slate-300 mb-2">Failed to load emails</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                        {emailError instanceof Error ? emailError.message : 'An error occurred'}
                      </p>
                      <Button 
                        onClick={() => refetchEmails()} 
                        variant="outline"
                        data-testid="button-retry-emails"
                      >
                        Try Again
                      </Button>
                    </div>
                  ) : emails.length === 0 ? (
                    <div className="p-8 text-center text-slate-500" data-testid="text-no-emails">
                      <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No emails yet</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {emails.map((email) => (
                        <button
                          key={email.id}
                          onClick={() => handleEmailClick(email)}
                          data-testid={`button-email-${email.id}`}
                          className={`w-full text-left p-4 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors ${
                            selectedEmail?.id === email.id ? 'bg-blue-50 dark:bg-slate-700/50' : ''
                          } ${!email.isRead ? 'font-semibold' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-1 ${!email.isRead ? 'text-blue-600' : 'text-slate-400'}`}>
                              {email.isRead ? (
                                <MailOpen className="w-5 h-5" />
                              ) : (
                                <Mail className="w-5 h-5" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm text-slate-900 dark:text-white truncate">
                                  {email.consumerName || email.fromEmail}
                                </p>
                                {!email.isRead && (
                                  <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></span>
                                )}
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
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
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Email Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedEmail ? (
                    <div>
                      <div className="space-y-4 mb-6">
                        <div>
                          <Label className="text-xs text-slate-500 dark:text-slate-400">From</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <User className="w-4 h-4 text-slate-400" />
                            <span className="font-medium" data-testid="text-from-email">
                              {selectedEmail.consumerName || selectedEmail.fromEmail}
                            </span>
                            {selectedEmail.consumerName && (
                              <span className="text-sm text-slate-500">({selectedEmail.fromEmail})</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs text-slate-500 dark:text-slate-400">Subject</Label>
                          <p className="font-medium mt-1" data-testid="text-subject">
                            {selectedEmail.subject}
                          </p>
                        </div>

                        <div>
                          <Label className="text-xs text-slate-500 dark:text-slate-400">Received</Label>
                          <div className="flex items-center gap-2 mt-1 text-sm text-slate-600 dark:text-slate-300">
                            <Calendar className="w-4 h-4" />
                            <span data-testid="text-received-date">
                              {new Date(selectedEmail.receivedAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-6">
                        <Label className="text-xs text-slate-500 dark:text-slate-400">Message</Label>
                        <div 
                          className="mt-2 prose dark:prose-invert max-w-none"
                          data-testid="content-email-body"
                          dangerouslySetInnerHTML={{ 
                            __html: selectedEmail.htmlBody || selectedEmail.textBody.replace(/\n/g, '<br/>') 
                          }}
                        />
                      </div>

                      <div className="mt-6 flex gap-2">
                        <Button 
                          onClick={handleEmailReply} 
                          data-testid="button-email-reply"
                          className="gap-2"
                        >
                          <Reply className="w-4 h-4" />
                          Reply
                        </Button>
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
                    <div className="text-center py-12" data-testid="text-select-email">
                      <Mail className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-4" />
                      <p className="text-sm text-slate-600 dark:text-slate-300">Select an email to view its contents</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sms">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* SMS List */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>SMS Messages</span>
                    {unreadSmsCount > 0 && (
                      <Badge variant="destructive" data-testid="badge-unread-sms-count">
                        {unreadSmsCount} new
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {smsMessages.length} total messages
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
                      <p className="text-slate-700 dark:text-slate-300 mb-2">Failed to load SMS messages</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                        {smsError instanceof Error ? smsError.message : 'An error occurred'}
                      </p>
                      <Button 
                        onClick={() => refetchSms()} 
                        variant="outline"
                        data-testid="button-retry-sms"
                      >
                        Try Again
                      </Button>
                    </div>
                  ) : smsMessages.length === 0 ? (
                    <div className="p-8 text-center text-slate-500" data-testid="text-no-sms">
                      <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No SMS messages yet</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {smsMessages.map((sms) => (
                        <button
                          key={sms.id}
                          onClick={() => handleSmsClick(sms)}
                          data-testid={`button-sms-${sms.id}`}
                          className={`w-full text-left p-4 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors ${
                            selectedSms?.id === sms.id ? 'bg-blue-50 dark:bg-slate-700/50' : ''
                          } ${!sms.isRead ? 'font-semibold' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-1 ${!sms.isRead ? 'text-blue-600' : 'text-slate-400'}`}>
                              <MessageSquare className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm text-slate-900 dark:text-white truncate">
                                  {sms.consumerName || sms.fromPhone}
                                </p>
                                {!sms.isRead && (
                                  <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></span>
                                )}
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
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
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>SMS Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedSms ? (
                    <div>
                      <div className="space-y-4 mb-6">
                        <div>
                          <Label className="text-xs text-slate-500 dark:text-slate-400">From</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <Phone className="w-4 h-4 text-slate-400" />
                            <span className="font-medium" data-testid="text-from-phone">
                              {selectedSms.consumerName || selectedSms.fromPhone}
                            </span>
                            {selectedSms.consumerName && (
                              <span className="text-sm text-slate-500">({selectedSms.fromPhone})</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs text-slate-500 dark:text-slate-400">Received</Label>
                          <div className="flex items-center gap-2 mt-1 text-sm text-slate-600 dark:text-slate-300">
                            <Calendar className="w-4 h-4" />
                            <span data-testid="text-sms-received-date">
                              {new Date(selectedSms.receivedAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t pt-6">
                        <Label className="text-xs text-slate-500 dark:text-slate-400">Message</Label>
                        <p className="mt-2 whitespace-pre-wrap" data-testid="content-sms-body">
                          {selectedSms.messageBody}
                        </p>
                        
                        {selectedSms.numMedia > 0 && selectedSms.mediaUrls && (
                          <div className="mt-4">
                            <Label className="text-xs text-slate-500 dark:text-slate-400">Media Attachments ({selectedSms.numMedia})</Label>
                            <div className="mt-2 space-y-2">
                              {selectedSms.mediaUrls.map((url, index) => (
                                <a 
                                  key={index}
                                  href={url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="block text-blue-600 hover:underline"
                                  data-testid={`link-media-${index}`}
                                >
                                  View Media {index + 1}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-6 flex gap-2">
                        <Button 
                          onClick={handleSmsReply} 
                          data-testid="button-sms-reply"
                          className="gap-2"
                        >
                          <Reply className="w-4 h-4" />
                          Reply
                        </Button>
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
                    <div className="text-center py-12" data-testid="text-select-sms">
                      <MessageSquare className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-4" />
                      <p className="text-sm text-slate-600 dark:text-slate-300">Select an SMS to view its contents</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

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
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
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
                className="resize-none"
                maxLength={1600}
              />
              <p className="text-xs text-slate-500 mt-1">
                {smsReplyMessage.length} / 1600 characters
              </p>
            </div>
            <div className="flex justify-end gap-2">
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
    </AdminLayout>
  );
}
