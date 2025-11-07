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
    if (!hasSignature && !hasInitials) return request.document.fileUrl;

    try {
      // Decode the data URL to get HTML content
      const dataUrlMatch = request.document.fileUrl.match(/^data:text\/html;charset=utf-8,(.+)$/);
      if (!dataUrlMatch) return request.document.fileUrl;

      const htmlContent = decodeURIComponent(dataUrlMatch[1]);
      let modifiedHtml = htmlContent;

      // Replace signature line placeholders
      if (hasSignature && signatureCanvasRef.current) {
        const signatureImg = signatureCanvasRef.current.toDataURL();
        const signatureHtml = `<div style="border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 5px;"><img src="${signatureImg}" alt="Signature" style="max-width: 300px; height: auto; display: block;" /></div>`;
        
        // Replace various signature line patterns
        modifiedHtml = modifiedHtml.replace(/\{\{SIGNATURE_LINE\}\}/gi, signatureHtml);
        modifiedHtml = modifiedHtml.replace(/Signature line/gi, signatureHtml);
        modifiedHtml = modifiedHtml.replace(/_+\s*\(signature\)/gi, signatureHtml);
      }

      // Replace initial placeholders
      if (hasInitials && initialsCanvasRef.current) {
        const initialsImg = initialsCanvasRef.current.toDataURL();
        const initialsHtml = `<div style="border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 5px;"><img src="${initialsImg}" alt="Initials" style="max-width: 150px; height: auto; display: block;" /></div>`;
        
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
  }, [request, hasSignature, hasInitials]);

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
    } else {
      setIsDrawingInitials(false);
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
    } else {
      setHasInitials(false);
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
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="bg-blue-100 rounded-full p-3">
                <FileText className="w-6 h-6 text-blue-700" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900" data-testid="heading-sign-document">
                  {request.title || 'Document Signature Request'}
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Please review and sign the document below
                </p>
              </div>
            </div>
            <div className="flex items-center text-sm text-gray-500">
              <Clock className="w-4 h-4 mr-1" />
              <span data-testid="text-expiration">
                Expires {new Date(request.expiresAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {request.description && (
            <div className="mt-4 p-3 bg-blue-50 border-l-4 border-blue-400 rounded">
              <p className="text-sm text-gray-700" data-testid="text-custom-message">
                {request.description}
              </p>
            </div>
          )}
        </div>

        {/* Document Content */}
        {documentUrlWithSignatures && (
          <Card className="shadow-sm border border-gray-200">
            <CardHeader className="bg-gray-50 border-b border-gray-200">
              <CardTitle className="text-lg font-semibold text-gray-900">
                Document Content
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1" data-testid="text-document-filename">
                {request.document?.fileName}
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <div className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden">
                <iframe
                  key={documentUrlWithSignatures}
                  src={documentUrlWithSignatures}
                  className="w-full h-[500px]"
                  title="Document Content"
                  sandbox="allow-same-origin"
                  data-testid="iframe-document-content"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Signature and Initials */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Full Signature */}
          <Card className="shadow-sm border border-gray-200">
            <CardHeader className="bg-gray-50 border-b border-gray-200">
              <CardTitle className="text-lg font-semibold text-gray-900">
                Full Signature
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Sign your name as you would on paper
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <div className="bg-white border-2 border-blue-300 rounded-lg overflow-hidden">
                <canvas
                  ref={signatureCanvasRef}
                  width={500}
                  height={150}
                  className="w-full cursor-crosshair touch-none bg-white"
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
                className="mt-3 w-full"
                data-testid="button-clear-signature"
              >
                Clear Signature
              </Button>
            </CardContent>
          </Card>

          {/* Initials */}
          <Card className="shadow-sm border border-gray-200">
            <CardHeader className="bg-gray-50 border-b border-gray-200">
              <CardTitle className="text-lg font-semibold text-gray-900">
                Initials
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Provide your initials
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <div className="bg-white border-2 border-blue-300 rounded-lg overflow-hidden">
                <canvas
                  ref={initialsCanvasRef}
                  width={500}
                  height={150}
                  className="w-full cursor-crosshair touch-none bg-white"
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
                className="mt-3 w-full"
                data-testid="button-clear-initials"
              >
                Clear Initials
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Legal Consent */}
        <Card className="shadow-sm border border-gray-200">
          <CardHeader className="bg-amber-50 border-b border-amber-100">
            <CardTitle className="text-lg font-semibold text-gray-900">
              Electronic Signature Consent
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <p className="text-sm text-gray-700 mb-4" data-testid="text-consent-notice">
              By signing this document electronically, you agree that your electronic signature
              is the legal equivalent of your manual signature and has the same legal force and
              effect as a manual signature under the Electronic Signatures in Global and National
              Commerce Act (ESIGN Act).
            </p>
            <div className="flex items-start space-x-3 bg-white p-4 rounded-lg border border-gray-200">
              <Checkbox
                id="consent"
                checked={consentGiven}
                onCheckedChange={(checked) => setConsentGiven(checked as boolean)}
                data-testid="checkbox-consent"
                className="mt-1"
              />
              <label htmlFor="consent" className="text-sm text-gray-700 cursor-pointer flex-1">
                I consent to use electronic signatures and agree that this document will be
                legally binding. I have reviewed the document and my signature/initials are accurate.
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end space-x-3 pb-8">
          <Button
            onClick={handleSign}
            disabled={!hasSignature || !hasInitials || !consentGiven || signMutation.isPending}
            className="px-8 py-6 text-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300"
            data-testid="button-sign-document"
          >
            {signMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Processing...
              </>
            ) : (
              "Complete Signature"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
