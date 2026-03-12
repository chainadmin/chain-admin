import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, FileText, Clock, Eye, AlertCircle, CreditCard, Building } from 'lucide-react';
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

  // Payment method step state
  const [paymentMethodType, setPaymentMethodType] = useState<'card' | 'ach' | null>(null);
  const [paymentMethodData, setPaymentMethodData] = useState<Record<string, string>>({});
  const [paymentMethodErrors, setPaymentMethodErrors] = useState<Record<string, string>>({});
  const [showPaymentStep, setShowPaymentStep] = useState(true);

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
      const paymentFields = paymentMethodType
        ? { paymentMethodType, ...paymentMethodData }
        : {};
      const allFields = { ...formData, ...paymentFields };
      const body = (agreement?.interactiveFields || isPaymentAuthAgreement)
        ? { interactiveFieldValues: allFields }
        : {};
      const response = await fetch(`/api/tenant-agreement/${agreementId}/agree`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  // Detect if this is a payment authorization agreement
  const isPaymentAuthAgreement =
    agreement.title?.toLowerCase().includes('payment auth') ||
    agreement.title?.toLowerCase().includes('payment authorization') ||
    agreement.templateSlug?.toLowerCase().includes('payment_auth') ||
    agreement.templateSlug?.toLowerCase().includes('payment-auth');

  // Check if agreement has interactive fields that need to be filled
  const hasInteractiveFields = agreement.interactiveFields && Array.isArray(agreement.interactiveFields) && agreement.interactiveFields.length > 0;
  const needsFormCompletion = hasInteractiveFields && showForm;

  // Payment step: for payment auth agreements show payment method step first
  const needsPaymentStep = isPaymentAuthAgreement && showPaymentStep;

  // Merge form data with metadata for rendering
  const mergedMetadata = isPlainObject(agreement.metadata) 
    ? { ...agreement.metadata, ...formData } 
    : formData;

  const renderedContent = replaceGlobalDocumentVariables(
    agreement.content, 
    mergedMetadata
  );

  const canTakeAction = (agreement.status === 'pending' || agreement.status === 'viewed') && 
                        !agreeMutation.isPending && 
                        !declineMutation.isPending &&
                        !isSubmitting;

  // Handle interactive form submission
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const errors: Record<string, string> = {};
    const fields = agreement.interactiveFields as Array<{ name: string; type: string; required?: boolean; label?: string }>;
    
    fields.forEach((field) => {
      if (field.required && !formData[field.name]) {
        errors[field.name] = `${field.label || field.name} is required`;
      }
    });

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setShowForm(false);
  };

  // Handle payment method step submission
  const handlePaymentMethodSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!paymentMethodType) {
      errors.paymentMethodType = 'Please select a payment method';
    } else if (paymentMethodType === 'card') {
      if (!paymentMethodData.cardNumber?.trim()) errors.cardNumber = 'Card number is required';
      if (!paymentMethodData.cardExpiry?.trim()) errors.cardExpiry = 'Expiration date is required';
      if (!paymentMethodData.cardCvv?.trim()) errors.cardCvv = 'CVV is required';
      if (!paymentMethodData.cardName?.trim()) errors.cardName = 'Name on card is required';
    } else if (paymentMethodType === 'ach') {
      if (!paymentMethodData.bankName?.trim()) errors.bankName = 'Bank name is required';
      if (!paymentMethodData.routingNumber?.trim()) errors.routingNumber = 'Routing number is required';
      if (!paymentMethodData.accountNumber?.trim()) errors.accountNumber = 'Account number is required';
      if (!paymentMethodData.accountType) errors.accountType = 'Account type is required';
    }

    if (Object.keys(errors).length > 0) {
      setPaymentMethodErrors(errors);
      return;
    }

    setPaymentMethodErrors({});
    setShowPaymentStep(false);
  };

  const handleFieldChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handlePaymentFieldChange = (name: string, value: string) => {
    setPaymentMethodData(prev => ({ ...prev, [name]: value }));
    if (paymentMethodErrors[name]) {
      setPaymentMethodErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

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
              <strong>Chain Software Group</strong> has been notified of your acceptance.
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
              <strong>Chain Software Group</strong> has been notified.
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
                <span>From: Chain Software Group</span>
              </div>
              <div className="flex items-center space-x-1">
                <Clock className="h-4 w-4" />
                <span>Sent: {new Date(agreement.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Step 1: Payment Method (for payment authorization agreements) */}
        {needsPaymentStep && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
            <div className="mb-6">
              <CreditCard className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Payment Method</h2>
              <p className="text-gray-600 text-center">Please enter your payment details before reviewing the agreement.</p>
            </div>

            <form onSubmit={handlePaymentMethodSubmit} className="space-y-6">
              {/* Payment Type Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-gray-800">Payment Type <span className="text-red-500">*</span></Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => { setPaymentMethodType('card'); setPaymentMethodErrors({}); }}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition-all ${
                      paymentMethodType === 'card'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <CreditCard className="h-5 w-5" />
                    Credit / Debit Card
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPaymentMethodType('ach'); setPaymentMethodErrors({}); }}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition-all ${
                      paymentMethodType === 'ach'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Building className="h-5 w-5" />
                    ACH / Bank Account
                  </button>
                </div>
                {paymentMethodErrors.paymentMethodType && (
                  <p className="text-red-500 text-sm">{paymentMethodErrors.paymentMethodType}</p>
                )}
              </div>

              {/* Card Fields */}
              {paymentMethodType === 'card' && (
                <div className="space-y-4 rounded-xl bg-gray-50 p-6">
                  <div className="space-y-2">
                    <Label htmlFor="cardName" className="text-sm font-medium">Name on Card <span className="text-red-500">*</span></Label>
                    <Input
                      id="cardName"
                      type="text"
                      placeholder="John Smith"
                      value={paymentMethodData.cardName || ''}
                      onChange={(e) => handlePaymentFieldChange('cardName', e.target.value)}
                      data-testid="input-card-name"
                    />
                    {paymentMethodErrors.cardName && <p className="text-red-500 text-sm">{paymentMethodErrors.cardName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cardNumber" className="text-sm font-medium">Card Number <span className="text-red-500">*</span></Label>
                    <Input
                      id="cardNumber"
                      type="text"
                      placeholder="1234 5678 9012 3456"
                      maxLength={19}
                      value={paymentMethodData.cardNumber || ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                        const formatted = val.replace(/(.{4})/g, '$1 ').trim();
                        handlePaymentFieldChange('cardNumber', formatted);
                      }}
                      data-testid="input-card-number"
                    />
                    {paymentMethodErrors.cardNumber && <p className="text-red-500 text-sm">{paymentMethodErrors.cardNumber}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cardExpiry" className="text-sm font-medium">Expiration (MM/YY) <span className="text-red-500">*</span></Label>
                      <Input
                        id="cardExpiry"
                        type="text"
                        placeholder="MM/YY"
                        maxLength={5}
                        value={paymentMethodData.cardExpiry || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                          const formatted = val.length >= 3 ? `${val.slice(0, 2)}/${val.slice(2)}` : val;
                          handlePaymentFieldChange('cardExpiry', formatted);
                        }}
                        data-testid="input-card-expiry"
                      />
                      {paymentMethodErrors.cardExpiry && <p className="text-red-500 text-sm">{paymentMethodErrors.cardExpiry}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cardCvv" className="text-sm font-medium">CVV <span className="text-red-500">*</span></Label>
                      <Input
                        id="cardCvv"
                        type="text"
                        placeholder="123"
                        maxLength={4}
                        value={paymentMethodData.cardCvv || ''}
                        onChange={(e) => handlePaymentFieldChange('cardCvv', e.target.value.replace(/\D/g, '').slice(0, 4))}
                        data-testid="input-card-cvv"
                      />
                      {paymentMethodErrors.cardCvv && <p className="text-red-500 text-sm">{paymentMethodErrors.cardCvv}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* ACH Fields */}
              {paymentMethodType === 'ach' && (
                <div className="space-y-4 rounded-xl bg-gray-50 p-6">
                  <div className="space-y-2">
                    <Label htmlFor="bankName" className="text-sm font-medium">Bank Name <span className="text-red-500">*</span></Label>
                    <Input
                      id="bankName"
                      type="text"
                      placeholder="First National Bank"
                      value={paymentMethodData.bankName || ''}
                      onChange={(e) => handlePaymentFieldChange('bankName', e.target.value)}
                      data-testid="input-bank-name"
                    />
                    {paymentMethodErrors.bankName && <p className="text-red-500 text-sm">{paymentMethodErrors.bankName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="routingNumber" className="text-sm font-medium">Routing Number <span className="text-red-500">*</span></Label>
                    <Input
                      id="routingNumber"
                      type="text"
                      placeholder="021000021"
                      maxLength={9}
                      value={paymentMethodData.routingNumber || ''}
                      onChange={(e) => handlePaymentFieldChange('routingNumber', e.target.value.replace(/\D/g, '').slice(0, 9))}
                      data-testid="input-routing-number"
                    />
                    {paymentMethodErrors.routingNumber && <p className="text-red-500 text-sm">{paymentMethodErrors.routingNumber}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountNumber" className="text-sm font-medium">Account Number <span className="text-red-500">*</span></Label>
                    <Input
                      id="accountNumber"
                      type="text"
                      placeholder="123456789"
                      value={paymentMethodData.accountNumber || ''}
                      onChange={(e) => handlePaymentFieldChange('accountNumber', e.target.value.replace(/\D/g, ''))}
                      data-testid="input-account-number"
                    />
                    {paymentMethodErrors.accountNumber && <p className="text-red-500 text-sm">{paymentMethodErrors.accountNumber}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Account Type <span className="text-red-500">*</span></Label>
                    <Select
                      value={paymentMethodData.accountType || ''}
                      onValueChange={(v) => handlePaymentFieldChange('accountType', v)}
                    >
                      <SelectTrigger data-testid="input-account-type">
                        <SelectValue placeholder="Select account type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                    {paymentMethodErrors.accountType && <p className="text-red-500 text-sm">{paymentMethodErrors.accountType}</p>}
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg font-semibold"
                data-testid="button-continue-to-agreement"
              >
                Continue to Agreement
              </Button>
            </form>
          </div>
        )}

        {/* Step 2: Interactive Form (if needed and not payment step) */}
        {!needsPaymentStep && needsFormCompletion && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
            <div className="mb-6">
              <AlertCircle className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Complete Payment Authorization</h2>
              <p className="text-gray-600 text-center">Please fill out the form below to customize your payment authorization.</p>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-6">
              {agreement.interactiveFields.map((field: any) => (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name} className="text-sm font-medium">
                    {field.label || field.name}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  
                  {field.type === 'select' ? (
                    <Select
                      value={formData[field.name] || ''}
                      onValueChange={(value) => handleFieldChange(field.name, value)}
                    >
                      <SelectTrigger id={field.name} className="w-full" data-testid={`input-${field.name}`}>
                        <SelectValue placeholder={field.placeholder || `Select ${field.label || field.name}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map((option: string) => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === 'number' ? (
                    <Input
                      id={field.name}
                      type="number"
                      min={field.min}
                      value={formData[field.name] || ''}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      placeholder={field.placeholder || ''}
                      className="w-full"
                      data-testid={`input-${field.name}`}
                    />
                  ) : (
                    <Input
                      id={field.name}
                      type="text"
                      value={formData[field.name] || ''}
                      onChange={(e) => handleFieldChange(field.name, e.target.value)}
                      placeholder={field.placeholder || ''}
                      className="w-full"
                      data-testid={`input-${field.name}`}
                    />
                  )}

                  {formErrors[field.name] && (
                    <p className="text-red-500 text-sm">{formErrors[field.name]}</p>
                  )}
                </div>
              ))}

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg font-semibold"
                data-testid="button-submit-form"
              >
                Continue to Review
              </Button>
            </form>
          </div>
        )}

        {/* Agreement Content */}
        {!needsPaymentStep && !needsFormCompletion && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
            <div 
              className="prose max-w-none prose-headings:text-gray-900 prose-p:text-gray-700"
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          </div>
        )}

        {/* Actions */}
        {!needsPaymentStep && !needsFormCompletion && (
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
                      if (!isSubmitting && canTakeAction && !needsFormCompletion) {
                        setIsSubmitting(true);
                        agreeMutation.mutate();
                      }
                    }}
                    disabled={!canTakeAction || agreeMutation.isPending || isSubmitting || needsFormCompletion}
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
        )}
      </div>
    </div>
  );
}
