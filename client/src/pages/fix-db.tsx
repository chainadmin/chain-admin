import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export default function FixDatabase() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState("");
  const [fixes, setFixes] = useState<string[]>([]);

  const fixDatabase = async () => {
    setStatus('loading');
    setMessage("");
    setFixes([]);

    try {
      const response = await fetch('/api/fix-production-db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage(data.message);
        setFixes(data.fixes || []);
      } else {
        setStatus('error');
        setMessage(data.error || data.message);
      }
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to fix database');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Fix Production Database</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            This will add missing columns to the production database tables.
          </p>
          
          {status === 'idle' && (
            <Button 
              onClick={fixDatabase} 
              className="w-full"
              data-testid="button-fix-db"
            >
              Fix Database Schema
            </Button>
          )}

          {status === 'loading' && (
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Fixing database...</span>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-semibold">Success!</span>
              </div>
              <p className="text-sm">{message}</p>
              {fixes.length > 0 && (
                <ul className="text-sm space-y-1">
                  {fixes.map((fix, index) => (
                    <li key={index} className="flex items-start">
                      <span className="mr-2">•</span>
                      <span>{fix}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Button 
                onClick={() => window.location.href = '/agency-registration'} 
                className="w-full"
                data-testid="button-go-register"
              >
                Go to Registration
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <span className="font-semibold">Error</span>
              </div>
              <p className="text-sm text-red-600">{message}</p>
              <Button 
                onClick={fixDatabase} 
                variant="outline" 
                className="w-full"
                data-testid="button-retry"
              >
                Try Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}