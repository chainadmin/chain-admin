import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, AlertCircle } from "lucide-react";
import { useRoute } from "wouter";

export default function SignDocumentPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/sign/:requestId");
  const requestId = params?.requestId;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);

  const { data: request, isLoading } = useQuery<any>({
    queryKey: [`/api/signature-requests/${requestId}`],
    enabled: !!requestId,
  });

  const signMutation = useMutation({
    mutationFn: async (signatureData: string) => {
      const response = await fetch(`/api/signature-requests/${requestId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureData }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to sign document");
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Document signed successfully!" });
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

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

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

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;

    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSign = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const signatureData = canvas.toDataURL("image/png");
    signMutation.mutate(signatureData);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p data-testid="text-loading">Loading...</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center text-red-600" data-testid="heading-not-found">
              <AlertCircle className="w-6 h-6 mr-2" />
              Request Not Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p data-testid="text-not-found">This signature request does not exist or has been removed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (request.status === "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center text-green-600" data-testid="heading-completed">
              <CheckCircle className="w-6 h-6 mr-2" />
              Already Signed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p data-testid="text-completed">This document has already been signed.</p>
            <p className="text-sm text-muted-foreground mt-2" data-testid="text-signed-at">
              Signed on {new Date(request.signedAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (request.status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center text-amber-600" data-testid="heading-expired">
              <AlertCircle className="w-6 h-6 mr-2" />
              Request Expired
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p data-testid="text-expired">This signature request has expired.</p>
            <p className="text-sm text-muted-foreground mt-2" data-testid="text-expired-at">
              Expired on {new Date(request.expiresAt).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle data-testid="heading-sign-document">Sign Document</CardTitle>
            <CardDescription>
              Please review and sign the document below
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Document Details</h3>
              <p className="text-sm" data-testid="text-document-filename">
                <span className="font-medium">File:</span> {request.document?.fileName}
              </p>
              {request.message && (
                <p className="text-sm mt-2" data-testid="text-custom-message">
                  <span className="font-medium">Message:</span> {request.message}
                </p>
              )}
              <p className="text-sm mt-2 text-muted-foreground" data-testid="text-expiration">
                Expires: {new Date(request.expiresAt).toLocaleDateString()}
              </p>
            </div>

            <div className="border-2 border-dashed rounded-lg p-4">
              <h3 className="font-semibold mb-2">Your Signature</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Draw your signature in the box below using your mouse or finger
              </p>
              <canvas
                ref={canvasRef}
                width={700}
                height={200}
                className="border-2 border-gray-300 rounded bg-white cursor-crosshair w-full touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                data-testid="canvas-signature"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={clearSignature}
                className="mt-2"
                data-testid="button-clear-signature"
              >
                Clear Signature
              </Button>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg space-y-3">
              <h3 className="font-semibold">Electronic Signature Consent</h3>
              <p className="text-sm" data-testid="text-consent-notice">
                By signing this document electronically, you agree that your electronic signature
                is the legal equivalent of your manual signature and has the same legal force and
                effect as a manual signature under the Electronic Signatures in Global and National
                Commerce Act (ESIGN Act).
              </p>
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="consent"
                  checked={consentGiven}
                  onCheckedChange={(checked) => setConsentGiven(checked as boolean)}
                  data-testid="checkbox-consent"
                />
                <label htmlFor="consent" className="text-sm cursor-pointer">
                  I consent to use electronic signatures and agree that this document will be
                  legally binding
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                onClick={handleSign}
                disabled={!hasDrawn || !consentGiven || signMutation.isPending}
                data-testid="button-sign-document"
              >
                {signMutation.isPending ? "Signing..." : "Sign Document"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
