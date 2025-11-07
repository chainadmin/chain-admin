import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, AlertCircle, FileText, Clock } from "lucide-react";
import { useRoute } from "wouter";

export default function SignDocumentPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/sign/:requestId");
  const requestId = params?.requestId;
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const initialsCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);
  const [isDrawingInitials, setIsDrawingInitials] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [hasInitials, setHasInitials] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>('');
  const [initialsDataUrl, setInitialsDataUrl] = useState<string>('');

  const { data: request, isLoading } = useQuery<any>({
    queryKey: [`/api/signature-requests/${requestId}`],
    enabled: !!requestId,
  });

  const signMutation = useMutation({
    mutationFn: async (data: { signatureData: string; initialsData: string }) => {
      const response = await fetch(`/api/signature-requests/${requestId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          signatureData: data.signatureData,
          initialsData: data.initialsData,
          legalConsent: true 
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to sign document");
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({ 
        title: "Document signed successfully!",
        description: "Your signature has been recorded."
      });
      queryClient.invalidateQueries({ queryKey: [`/api/signature-requests/${requestId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to sign document",
        variant: "destructive",
      });
    },
  });

  // Inject signatures into document HTML
  const documentUrlWithSignatures = useMemo(() => {
    if (!request?.document?.fileUrl) return null;
    if (!signatureDataUrl && !initialsDataUrl) return request.document.fileUrl;

    try {
      // Decode the data URL to get HTML content
      let htmlContent = '';
      const urlEncodedMatch = request.document.fileUrl.match(/^data:text\/html;charset=utf-8,(.+)$/);
      const base64Match = request.document.fileUrl.match(/^data:text\/html;base64,(.+)$/);
      
      if (urlEncodedMatch) {
        htmlContent = decodeURIComponent(urlEncodedMatch[1]);
      } else if (base64Match) {
        htmlContent = atob(base64Match[1]);
      } else {
        return request.document.fileUrl;
      }

      let modifiedHtml = htmlContent;

      // Replace signature line placeholders
      if (signatureDataUrl) {
        const signatureHtml = `<div style="border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 5px;"><img src="${signatureDataUrl}" alt="Signature" style="max-width: 300px; height: auto; display: block;" /></div>`;
        
        // Replace various signature line patterns
        modifiedHtml = modifiedHtml.replace(/\{\{SIGNATURE_LINE\}\}/gi, signatureHtml);
        modifiedHtml = modifiedHtml.replace(/Signature line/gi, signatureHtml);
        modifiedHtml = modifiedHtml.replace(/_+\s*\(signature\)/gi, signatureHtml);
      }

      // Replace initial placeholders
      if (initialsDataUrl) {
        const initialsHtml = `<div style="border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 5px;"><img src="${initialsDataUrl}" alt="Initials" style="max-width: 150px; height: auto; display: block;" /></div>`;
        
        // Replace various initial patterns
        modifiedHtml = modifiedHtml.replace(/\{\{INITIAL\}\}/gi, initialsHtml);
        modifiedHtml = modifiedHtml.replace(/\{\{INITIALS\}\}/gi, initialsHtml);
        modifiedHtml = modifiedHtml.replace(/Initial:/gi, initialsHtml);
        modifiedHtml = modifiedHtml.replace(/Initials:/gi, initialsHtml);
        modifiedHtml = modifiedHtml.replace(/_+\s*\(initial[s]?\)/gi, initialsHtml);
      }

      // Re-encode as data URL
      return `data:text/html;charset=utf-8,${encodeURIComponent(modifiedHtml)}`;
    } catch (error) {
      console.error('Error injecting signatures into document:', error);
      return request.document.fileUrl;
    }
  }, [request?.document?.fileUrl, signatureDataUrl, initialsDataUrl]);

  const getCoordinates = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ) => {
    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    type: 'signature' | 'initials'
  ) => {
    e.preventDefault();
    const canvas = type === 'signature' ? signatureCanvasRef.current : initialsCanvasRef.current;
    if (!canvas) return;

    const coords = getCoordinates(e, canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    
    if (type === 'signature') {
      setIsDrawingSignature(true);
    } else {
      setIsDrawingInitials(true);
    }
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    type: 'signature' | 'initials'
  ) => {
    e.preventDefault();
    const isDrawing = type === 'signature' ? isDrawingSignature : isDrawingInitials;
    if (!isDrawing) return;

    const canvas = type === 'signature' ? signatureCanvasRef.current : initialsCanvasRef.current;
    if (!canvas) return;

    const coords = getCoordinates(e, canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = "#1e3a8a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    
    if (type === 'signature') {
      setHasSignature(true);
    } else {
      setHasInitials(true);
    }
  };

  const stopDrawing = (type: 'signature' | 'initials') => {
    if (type === 'signature') {
      setIsDrawingSignature(false);
      // Update signature data URL when drawing stops
      if (signatureCanvasRef.current) {
        setSignatureDataUrl(signatureCanvasRef.current.toDataURL());
      }
    } else {
      setIsDrawingInitials(false);
      // Update initials data URL when drawing stops
      if (initialsCanvasRef.current) {
        setInitialsDataUrl(initialsCanvasRef.current.toDataURL());
      }
    }
  };

  const clearCanvas = (type: 'signature' | 'initials') => {
    const canvas = type === 'signature' ? signatureCanvasRef.current : initialsCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (type === 'signature') {
      setHasSignature(false);
      setSignatureDataUrl('');
    } else {
      setHasInitials(false);
      setInitialsDataUrl('');
    }
  };

  const handleSign = () => {
    // Validation checks
    if (!hasSignature) {
      toast({
        title: "Signature Required",
        description: "Please provide your full signature before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (!hasInitials) {
      toast({
        title: "Initials Required",
        description: "Please provide your initials before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (!consentGiven) {
      toast({
        title: "Consent Required",
        description: "Please agree to the electronic signature consent before submitting.",
        variant: "destructive",
      });
      return;
    }

    const signatureCanvas = signatureCanvasRef.current;
    const initialsCanvas = initialsCanvasRef.current;
    if (!signatureCanvas || !initialsCanvas) return;

    const signatureData = signatureCanvas.toDataURL("image/png");
    const initialsData = initialsCanvas.toDataURL("image/png");
    
    // Additional validation: check that the data URLs contain actual image data
    if (!signatureData || signatureData.length < 100) {
      toast({
        title: "Invalid Signature",
        description: "Please draw your signature before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (!initialsData || initialsData.length < 100) {
      toast({
        title: "Invalid Initials",
        description: "Please draw your initials before submitting.",
        variant: "destructive",
      });
      return;
    }

    signMutation.mutate({ signatureData, initialsData });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600" data-testid="text-loading">Loading document...</p>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md shadow-lg">
          <CardHeader className="bg-red-50 border-b border-red-100">
            <CardTitle className="flex items-center text-red-700" data-testid="heading-not-found">
              <AlertCircle className="w-6 h-6 mr-2" />
              Request Not Found
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p data-testid="text-not-found">This signature request does not exist or has been removed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (request.status === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md shadow-lg">
          <CardHeader className="bg-green-50 border-b border-green-100">
            <CardTitle className="flex items-center text-green-700" data-testid="heading-completed">
              <CheckCircle className="w-6 h-6 mr-2" />
              Already Signed
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p data-testid="text-completed">This document has already been signed.</p>
            <p className="text-sm text-gray-500 mt-2" data-testid="text-signed-at">
              Signed on {new Date(request.signedAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (request.status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md shadow-lg">
          <CardHeader className="bg-amber-50 border-b border-amber-100">
            <CardTitle className="flex items-center text-amber-700" data-testid="heading-expired">
              <AlertCircle className="w-6 h-6 mr-2" />
              Request Expired
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p data-testid="text-expired">This signature request has expired.</p>
            <p className="text-sm text-gray-500 mt-2" data-testid="text-expired-at">
              Expired on {new Date(request.expiresAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-blue-600 rounded-lg p-2">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 tracking-tight" data-testid="heading-sign-document">
                  {request.title || 'Document Signature Request'}
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Step 1 of 2: Review and Sign
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="flex items-center text-sm text-gray-600">
                <Clock className="w-4 h-4 mr-1.5" />
                <span data-testid="text-expiration">
                  Expires {new Date(request.expiresAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
          
          {request.description && (
            <div className="mt-3 p-3 bg-blue-50 border-l-4 border-blue-500 rounded">
              <p className="text-sm text-gray-700" data-testid="text-custom-message">
                {request.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Two-Panel Layout */}
      <div className="max-w-[1800px] mx-auto">
        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-100px)]">
          {/* Left Panel - Document Viewer (60-70% width) */}
          <div className="flex-1 lg:w-[65%] p-6 bg-gray-100">
            <div className="bg-white rounded-lg shadow-md border border-gray-200 h-full">
              {/* Document Header */}
              <div className="border-b border-gray-200 px-6 py-4 bg-gray-50">
                <h2 className="text-base font-semibold text-gray-900">
                  Document Preview
                </h2>
                <p className="text-xs text-gray-500 mt-1" data-testid="text-document-filename">
                  {request.document?.fileName}
                </p>
              </div>
              
              {/* Document Content */}
              <div className="p-6 h-[calc(100%-80px)] overflow-auto">
                {documentUrlWithSignatures && (
                  <div className="bg-white border border-gray-300 rounded-md shadow-sm overflow-hidden">
                    <iframe
                      key={documentUrlWithSignatures}
                      src={documentUrlWithSignatures}
                      className="w-full h-[800px]"
                      title="Document Content"
                      sandbox="allow-same-origin"
                      data-testid="iframe-document-content"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Signature Panel (30-40% width) */}
          <div className="lg:w-[35%] bg-white border-l border-gray-200 p-6 overflow-y-auto">
            <div className="max-w-md mx-auto space-y-6">
              {/* Sign Here Header */}
              <div className="text-center pb-4 border-b border-gray-200">
                <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
                  Sign Here
                </h2>
                <p className="text-sm text-gray-600 mt-2 leading-normal">
                  Complete all required fields to finish signing
                </p>
              </div>

              {/* Progress Indicator */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-blue-900">Progress</span>
                  <span className="text-xs font-medium text-blue-900">
                    {(hasSignature && hasInitials && consentGiven) ? '100%' : 
                     (hasSignature || hasInitials || consentGiven) ? '50%' : '0%'}
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(hasSignature && hasInitials && consentGiven) ? '100%' : 
                               (hasSignature || hasInitials || consentGiven) ? '50%' : '0%'}`
                    }}
                  />
                </div>
              </div>

              {/* Full Signature */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">
                  Your Signature <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Draw your full signature in the box below
                </p>
                <div className={`border-2 rounded-lg overflow-hidden transition-colors ${
                  hasSignature ? 'border-green-400' : 'border-gray-300'
                }`}>
                  <canvas
                    ref={signatureCanvasRef}
                    width={500}
                    height={150}
                    className="w-full cursor-crosshair touch-none bg-gray-50"
                    onMouseDown={(e) => startDrawing(e, 'signature')}
                    onMouseMove={(e) => draw(e, 'signature')}
                    onMouseUp={() => stopDrawing('signature')}
                    onMouseLeave={() => stopDrawing('signature')}
                    onTouchStart={(e) => startDrawing(e, 'signature')}
                    onTouchMove={(e) => draw(e, 'signature')}
                    onTouchEnd={() => stopDrawing('signature')}
                    data-testid="canvas-signature"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearCanvas('signature')}
                  className="w-full text-xs"
                  data-testid="button-clear-signature"
                >
                  Clear
                </Button>
              </div>

              {/* Initials */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-900">
                  Your Initials <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Draw your initials in the box below
                </p>
                <div className={`border-2 rounded-lg overflow-hidden transition-colors ${
                  hasInitials ? 'border-green-400' : 'border-gray-300'
                }`}>
                  <canvas
                    ref={initialsCanvasRef}
                    width={500}
                    height={120}
                    className="w-full cursor-crosshair touch-none bg-gray-50"
                    onMouseDown={(e) => startDrawing(e, 'initials')}
                    onMouseMove={(e) => draw(e, 'initials')}
                    onMouseUp={() => stopDrawing('initials')}
                    onMouseLeave={() => stopDrawing('initials')}
                    onTouchStart={(e) => startDrawing(e, 'initials')}
                    onTouchMove={(e) => draw(e, 'initials')}
                    onTouchEnd={() => stopDrawing('initials')}
                    data-testid="canvas-initials"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearCanvas('initials')}
                  className="w-full text-xs"
                  data-testid="button-clear-initials"
                >
                  Clear
                </Button>
              </div>

              {/* Legal Consent */}
              <div className="space-y-3 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">
                  Electronic Signature Consent
                </h3>
                <p className="text-xs text-gray-700 leading-relaxed" data-testid="text-consent-notice">
                  By signing this document electronically, you agree that your electronic signature
                  is the legal equivalent of your manual signature under the ESIGN Act.
                </p>
                <div className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-colors ${
                  consentGiven ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'
                }`}>
                  <Checkbox
                    id="consent"
                    checked={consentGiven}
                    onCheckedChange={(checked) => setConsentGiven(checked as boolean)}
                    data-testid="checkbox-consent"
                    className="mt-0.5"
                  />
                  <label htmlFor="consent" className="text-xs text-gray-700 cursor-pointer flex-1 leading-relaxed">
                    I consent to use electronic signatures and confirm that this document is legally binding. 
                    I have reviewed the document and my signature/initials are accurate.
                  </label>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-6">
                <Button
                  onClick={handleSign}
                  disabled={!hasSignature || !hasInitials || !consentGiven || signMutation.isPending}
                  className="w-full py-6 text-base font-semibold bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed shadow-md"
                  data-testid="button-sign-document"
                >
                  {signMutation.isPending ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Processing...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Sign Document
                    </div>
                  )}
                </Button>
                
                {(!hasSignature || !hasInitials || !consentGiven) && (
                  <p className="text-xs text-center text-gray-500 mt-3">
                    Complete all required fields to enable signing
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
