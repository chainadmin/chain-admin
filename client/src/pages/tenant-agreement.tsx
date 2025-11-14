import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, FileText, Clock, Eye, AlertCircle } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';
import { replaceGlobalDocumentVariables } from '@shared/globalDocumentHelpers';

export default function TenantAgreement() {
  const [, params] = useRoute('/tenant-agreement/:id');
  const agreementId = params?.id;
  
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [hasAgreed, setHasAgreed] = useState(false);
  const [hasDeclined, setHasDeclined] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(true);

  const { data: agreement, isLoading } = useQuery({
    queryKey: ['/api/tenant-agreement', agreementId],
    queryFn: async () => {
      const response = await fetch(`/api/tenant-agreement/${agreementId}`);
      if (!response.ok) throw new Error('Failed to fetch agreement');
      return response.json();
    },
    enabled: !!agreementId,
  });

  const markViewedMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/tenant-agreement/${agreementId}/mark-viewed`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to mark as viewed');
      return response.json();
    },
  });

  const agreeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/tenant-agreement/${agreementId}/agree`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to accept agreement');
      }
      return response.json();
    },
    onMutate: () => {
      setIsSubmitting(true);
    },
    onSuccess: () => {
      setHasAgreed(true);
      queryClient.invalidateQueries({ queryKey: ['/api/tenant-agreement', agreementId] });
    },
    onError: () => {
      setIsSubmitting(false);
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (reason: string) => {
      const response = await fetch(`/api/tenant-agreement/${agreementId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to decline agreement');
      }
      return response.json();
    },
    onMutate: () => {
      setIsSubmitting(true);
    },
    onSuccess: () => {
      setHasDeclined(true);
      setShowDeclineForm(false);
      queryClient.invalidateQueries({ queryKey: ['/api/tenant-agreement', agreementId] });
    },
    onError: () => {
      setIsSubmitting(false);
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  useEffect(() => {
    if (agreement && agreement.status === 'pending' && !markViewedMutation.isPending) {
      markViewedMutation.mutate();
    }
  }, [agreement]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Agreement Not Found</h1>
          <p className="text-gray-600">This agreement link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  const isPlainObject = (val: any): val is Record<string, any> => 
    typeof val === 'object' && val !== null && !Array.isArray(val) && Object.getPrototypeOf(val) === Object.prototype;

  const renderedContent = replaceGlobalDocumentVariables(
    agreement.content, 
    isPlainObject(agreement.metadata) ? agreement.metadata : {}
  );

  const canTakeAction = (agreement.status === 'pending' || agreement.status === 'viewed') && 
                        !agreeMutation.isPending && 
                        !declineMutation.isPending &&
                        !isSubmitting;

  if (hasAgreed || agreement.status === 'agreed') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <CheckCircle2 className="h-20 w-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Agreement Accepted!</h1>
          <p className="text-lg text-gray-600 mb-6">
            Thank you for accepting the {agreement.title}.
          </p>
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <p className="text-sm text-green-800">
              <strong>{agreement.tenantName}</strong> has been notified of your acceptance.
              You'll receive further instructions via email shortly.
            </p>
            {agreement.agreedAt && (
              <p className="text-xs text-green-600 mt-2">
                Accepted on {new Date(agreement.agreedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (hasDeclined || agreement.status === 'declined') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <XCircle className="h-20 w-20 text-red-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Agreement Declined</h1>
          <p className="text-lg text-gray-600 mb-6">
            You have declined the {agreement.title}.
          </p>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-sm text-red-800">
              <strong>{agreement.tenantName}</strong> has been notified.
              {agreement.declineReason && (
                <span className="block mt-2">
                  <strong>Reason:</strong> {agreement.declineReason}
                </span>
              )}
            </p>
            {agreement.declinedAt && (
              <p className="text-xs text-red-600 mt-2">
                Declined on {new Date(agreement.declinedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-8 text-white">
            <div className="flex items-center space-x-3 mb-2">
              <FileText className="h-8 w-8" />
              <h1 className="text-3xl font-bold">{agreement.title}</h1>
            </div>
            <p className="text-blue-100">{agreement.description}</p>
            <div className="mt-4 flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-1">
                <Eye className="h-4 w-4" />
                <span>From: {agreement.tenantName}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Clock className="h-4 w-4" />
                <span>Sent: {new Date(agreement.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Agreement Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div 
            className="prose max-w-none prose-headings:text-gray-900 prose-p:text-gray-700"
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        </div>

        {/* Actions */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {!showDeclineForm ? (
            <div className="space-y-4">
              {!canTakeAction ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-yellow-800 text-sm">
                    This agreement has already been {agreement.status}. No further action can be taken.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-4">
                  <Button
                    onClick={() => {
                      if (!isSubmitting && canTakeAction) {
                        setIsSubmitting(true);
                        agreeMutation.mutate();
                      }
                    }}
                    disabled={!canTakeAction || agreeMutation.isPending || isSubmitting}
                    className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="button-agree"
                  >
                    {agreeMutation.isPending ? (
                      <>
                        <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-5 w-5 mr-2" />
                        I Agree
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={() => {
                      if (!isSubmitting && canTakeAction) {
                        setShowDeclineForm(true);
                      }
                    }}
                    disabled={!canTakeAction || isSubmitting}
                    variant="outline"
                    className="border-red-300 text-red-700 hover:bg-red-50 px-8 py-6 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="button-show-decline"
                  >
                    <XCircle className="h-5 w-5 mr-2" />
                    Decline
                  </Button>
                </div>
              )}

              {agreeMutation.isError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <p className="text-red-800 text-sm">
                    {agreeMutation.error?.message || 'Failed to process agreement. Please try again.'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Decline Agreement</h3>
              <p className="text-sm text-gray-600">
                Please provide a reason for declining this agreement:
              </p>
              
              <Textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Enter your reason for declining..."
                className="min-h-[120px]"
                data-testid="input-decline-reason"
              />

              <div className="flex items-center justify-end space-x-3">
                <Button
                  onClick={() => {
                    setShowDeclineForm(false);
                    setDeclineReason('');
                  }}
                  variant="outline"
                  data-testid="button-cancel-decline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!isSubmitting && declineReason.trim()) {
                      setIsSubmitting(true);
                      declineMutation.mutate(declineReason);
                    }
                  }}
                  disabled={!declineReason.trim() || declineMutation.isPending || isSubmitting}
                  variant="destructive"
                  data-testid="button-confirm-decline"
                >
                  {declineMutation.isPending ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Submit Decline
                    </>
                  )}
                </Button>
              </div>

              {declineMutation.isError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 text-sm">
                    {declineMutation.error?.message || 'Failed to decline agreement. Please try again.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
