import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Mail, MailOpen, Reply, User, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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

export default function EmailInbox() {
  const { toast } = useToast();
  const [selectedEmail, setSelectedEmail] = useState<EmailReply | null>(null);
  const [showReplyDialog, setShowReplyDialog] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyMessage, setReplyMessage] = useState('');

  // Fetch email replies
  const { data: emails = [], isLoading, isError, error, refetch } = useQuery<EmailReply[]>({
    queryKey: ['/api/email-replies'],
    retry: 2,
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (emailId: string) => {
      return await apiRequest('PATCH', `/api/email-replies/${emailId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-replies'] });
    },
  });

  // Send reply mutation
  const sendReplyMutation = useMutation({
    mutationFn: async ({ emailId, subject, message }: { emailId: string; subject: string; message: string }) => {
      return await apiRequest('POST', `/api/email-replies/${emailId}/respond`, { subject, message });
    },
    onSuccess: () => {
      toast({
        title: 'Reply sent',
        description: 'Your response has been sent successfully.',
      });
      setShowReplyDialog(false);
      setReplySubject('');
      setReplyMessage('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send reply',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleEmailClick = (email: EmailReply) => {
    setSelectedEmail(email);
    if (!email.isRead) {
      markAsReadMutation.mutate(email.id);
    }
  };

  const handleReply = () => {
    if (!selectedEmail) return;
    
    // Pre-fill subject with "Re: " prefix if not already present
    const subject = selectedEmail.subject.startsWith('Re:') 
      ? selectedEmail.subject 
      : `Re: ${selectedEmail.subject}`;
    
    setReplySubject(subject);
    setShowReplyDialog(true);
  };

  const handleSendReply = () => {
    if (!selectedEmail || !replySubject.trim() || !replyMessage.trim()) {
      toast({
        title: 'Missing information',
        description: 'Please provide both subject and message.',
        variant: 'destructive',
      });
      return;
    }

    sendReplyMutation.mutate({
      emailId: selectedEmail.id,
      subject: replySubject,
      message: replyMessage,
    });
  };

  const unreadCount = emails.filter(email => !email.isRead).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Mail className="w-8 h-8" />
            Email Inbox
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            View and respond to emails from your consumers
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Email List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Messages</span>
                {unreadCount > 0 && (
                  <Badge variant="destructive" data-testid="badge-unread-count">
                    {unreadCount} new
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {emails.length} total messages
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 text-center text-slate-500" data-testid="text-loading">
                  Loading...
                </div>
              ) : isError ? (
                <div className="p-8 text-center" data-testid="error-loading-emails">
                  <Mail className="w-12 h-12 mx-auto mb-2 text-red-500 opacity-50" />
                  <p className="text-slate-700 dark:text-slate-300 mb-2">Failed to load emails</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    {error instanceof Error ? error.message : 'An error occurred'}
                  </p>
                  <Button 
                    onClick={() => refetch()} 
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
                      className={`w-full text-left p-4 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                        selectedEmail?.id === email.id ? 'bg-blue-50 dark:bg-slate-700' : ''
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
              <CardTitle>Message Details</CardTitle>
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
                      onClick={handleReply} 
                      data-testid="button-reply"
                      className="gap-2"
                    >
                      <Reply className="w-4 h-4" />
                      Reply
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500" data-testid="text-select-email">
                  <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Select an email to view its contents</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reply Dialog */}
      <Dialog open={showReplyDialog} onOpenChange={setShowReplyDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reply to Email</DialogTitle>
            <DialogDescription>
              Send a response to {selectedEmail?.fromEmail}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reply-subject">Subject</Label>
              <Input
                id="reply-subject"
                data-testid="input-reply-subject"
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
                placeholder="Subject"
              />
            </div>
            <div>
              <Label htmlFor="reply-message">Message</Label>
              <Textarea
                id="reply-message"
                data-testid="textarea-reply-message"
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={8}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowReplyDialog(false)}
                data-testid="button-cancel-reply"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendReply}
                disabled={sendReplyMutation.isPending || !replySubject.trim() || !replyMessage.trim()}
                data-testid="button-send-reply"
              >
                {sendReplyMutation.isPending ? 'Sending...' : 'Send Reply'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
